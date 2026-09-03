import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionViewService } from '../auctions/auction-view.service';
import { JwtPayload } from '../common/types/auth.types';
import {
  LifecycleEnvelope,
  WsEventEnvelope,
  WS_EVENT,
  AUCTION_LIFECYCLE_EVENT,
  NOTIFICATION_CREATED_EVENT,
  NotificationCreatedPayload,
} from '../auctions/engine/engine.types';

const teamRoom = (auctionId: string) => `auction:${auctionId}:team`;
const vendorRoom = (auctionId: string, vendorId: string) => `auction:${auctionId}:vendor:${vendorId}`;
// One personal room per principal, joined on every connection regardless of
// which (if any) auction page they're viewing — this is what lets the
// topbar notification bell update live app-wide, not just on a live-console page.
const personalRoom = (kind: 'team' | 'vendor', id: string) => `user:${kind}:${id}`;

/**
 * One room per auction (per spec §8/§10), split further into a team room
 * and a per-vendor room so each recipient only ever receives the
 * role-scoped snapshot AuctionViewService builds for them — never a raw
 * relay of a domain event's payload (§6.1, §12).
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly seatReleaseTimeoutMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly view: AuctionViewService,
  ) {
    this.seatReleaseTimeoutMs = Number(this.config.get('SEAT_RELEASE_TIMEOUT_SEC', '60')) * 1000;
  }

  handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.query?.token as string);
      const payload = this.jwt.verify<JwtPayload>(token, { secret: this.config.get('JWT_SECRET') });
      socket.data.user = { id: payload.sub, kind: payload.kind, email: payload.email };
      socket.join(personalRoom(payload.kind, payload.sub));
    } catch {
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const user = socket.data.user as { id: string; kind: 'team' | 'vendor' } | undefined;
    if (!user || user.kind !== 'vendor') return;

    const seats = await this.prisma.auctionSeat.findMany({
      where: { vendorId: user.id, joinedByUserId: socket.id },
    });
    for (const seat of seats) {
      await this.prisma.auctionSeat.update({
        where: { auctionId_vendorId: { auctionId: seat.auctionId, vendorId: user.id } },
        data: { disconnectedAt: new Date() },
      });
      setTimeout(() => this.releaseIfStillDisconnected(seat.auctionId, user.id, socket.id), this.seatReleaseTimeoutMs);
    }
  }

  private async releaseIfStillDisconnected(auctionId: string, vendorId: string, socketId: string) {
    const fresh = await this.prisma.auctionSeat.findUnique({
      where: { auctionId_vendorId: { auctionId, vendorId } },
    });
    if (fresh?.joinedByUserId === socketId && fresh.disconnectedAt) {
      await this.prisma.auctionSeat.update({
        where: { auctionId_vendorId: { auctionId, vendorId } },
        data: { joinedByUserId: null, disconnectedAt: null },
      });
      this.logger.log(`Seat released for vendor ${vendorId} on auction ${auctionId} after disconnect timeout`);
    }
  }

  @SubscribeMessage('join_auction')
  async onJoinAuction(@ConnectedSocket() socket: Socket, @MessageBody() body: { auctionId: string }) {
    const user = socket.data.user as { id: string; kind: 'team' | 'vendor' } | undefined;
    if (!user) return;
    const { auctionId } = body;

    if (user.kind === 'team') {
      socket.join(teamRoom(auctionId));
      const snapshot = await this.view.getTeamSnapshot(auctionId);
      socket.emit('state_snapshot', { serverNow: new Date(), ...snapshot });
      return;
    }

    socket.join(vendorRoom(auctionId, user.id));
    const isController = await this.claimOrShareSeat(auctionId, user.id, socket.id);
    const snapshot = await this.view.getVendorSnapshot(auctionId, user.id);
    socket.emit('state_snapshot', { serverNow: new Date(), seatControl: { isController }, ...snapshot });
  }

  /**
   * §3 seat model — first live-console session for a company claims the
   * seat; any other concurrent session from the same vendor account sees a
   * read-only flag (enforced client-side; the bid/respond validation
   * itself doesn't depend on this — it's UI-confusion prevention between
   * two tabs of the same legitimate vendor, not a security boundary).
   */
  private async claimOrShareSeat(auctionId: string, vendorId: string, socketId: string): Promise<boolean> {
    const seat = await this.prisma.auctionSeat.findUnique({ where: { auctionId_vendorId: { auctionId, vendorId } } });
    if (!seat) return false; // auction not live yet, or not invited
    if (!seat.joinedByUserId || seat.disconnectedAt) {
      await this.prisma.auctionSeat.update({
        where: { auctionId_vendorId: { auctionId, vendorId } },
        data: { joinedByUserId: socketId, disconnectedAt: null },
      });
      return true;
    }
    return seat.joinedByUserId === socketId;
  }

  @OnEvent(WS_EVENT)
  async onWsEvent(envelope: WsEventEnvelope) {
    await this.broadcastSnapshots(envelope.auctionId, envelope.event);
  }

  @OnEvent(AUCTION_LIFECYCLE_EVENT)
  async onLifecycleEvent(envelope: LifecycleEnvelope) {
    if (envelope.event === 'cancelled') {
      await this.broadcastSnapshots(envelope.auctionId, 'auction_cancelled');
    }
    // 'went_live' / 'closed' / 'closed_no_bids' / 'single_bidder_alert' are
    // consumed by NotificationsService; the realtime side for closes is
    // already covered by the engines' own WS_EVENT('auction_closed') emit.
  }

  @OnEvent(NOTIFICATION_CREATED_EVENT)
  onNotificationCreated(payload: NotificationCreatedPayload) {
    // Notification.recipientType uses 'auction_team' | 'vendor' (the DB
    // enum); the socket's personal room was joined using the JWT's
    // 'team' | 'vendor' kind — normalize here or the room names silently
    // never match and team notifications never arrive live.
    const kind = payload.recipientType === 'auction_team' ? 'team' : 'vendor';
    this.server.to(personalRoom(kind, payload.recipientId)).emit('notification', payload.notification);
  }

  private async broadcastSnapshots(auctionId: string, eventName: string) {
    try {
      const teamSnapshot = await this.view.getTeamSnapshot(auctionId);
      this.server.to(teamRoom(auctionId)).emit(eventName, teamSnapshot);

      const invitees = await this.prisma.auctionInvitee.findMany({ where: { auctionId } });
      for (const inv of invitees) {
        const vendorSnapshot = await this.view.getVendorSnapshot(auctionId, inv.vendorId);
        this.server.to(vendorRoom(auctionId, inv.vendorId)).emit(eventName, vendorSnapshot);
      }
    } catch (err) {
      this.logger.error(`Failed to broadcast ${eventName} for auction ${auctionId}`, err as Error);
    }
  }
}
