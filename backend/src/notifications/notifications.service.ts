import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionViewService } from '../auctions/auction-view.service';
import { EmailAdapter, SmsAdapter } from './adapters/adapter.interfaces';
import { ConsoleEmailAdapter, ConsoleSmsAdapter } from './adapters/console.adapters';
import { ResendEmailAdapter } from './adapters/resend-email.adapter';
import { Msg91SmsAdapter } from './adapters/msg91-sms.adapter';
import {
  AUCTION_LIFECYCLE_EVENT,
  AUCTION_OUTBID_EVENT,
  LifecycleEnvelope,
  NOTIFICATION_CREATED_EVENT,
  OutbidPayload,
} from '../auctions/engine/engine.types';

export const EMAIL_ADAPTER = 'EMAIL_ADAPTER';
export const SMS_ADAPTER = 'SMS_ADAPTER';

/**
 * §13 — SMS + email + an in-portal Notification row for every vendor-facing
 * event. There is no TC-side notification in v1 (no external system exists
 * yet to receive one) — sending the result just flips the thread's status
 * (handled in AuctionsService.sendResult), nothing more.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly view: AuctionViewService,
    private readonly config: ConfigService,
    private readonly emitter: EventEmitter2,
    @Inject(EMAIL_ADAPTER) private readonly email: EmailAdapter,
    @Inject(SMS_ADAPTER) private readonly sms: SmsAdapter,
  ) {}

  /** Creates the row and pushes it live to that recipient's socket room in one step. */
  private async createPortalNotification(
    recipientType: 'vendor' | 'auction_team',
    recipientId: string,
    eventType: 'auction_live' | 'auction_cancelled' | 'auction_closed_result' | 'single_bidder_alert' | 'outbid',
    payload: Prisma.InputJsonValue,
  ) {
    const notification = await this.prisma.notification.create({
      data: { recipientType, recipientId, channel: 'portal', eventType, payload },
    });
    this.emitter.emit(NOTIFICATION_CREATED_EVENT, { recipientType, recipientId, notification });
    return notification;
  }

  @OnEvent(AUCTION_LIFECYCLE_EVENT)
  async handleLifecycle(envelope: LifecycleEnvelope) {
    switch (envelope.event) {
      case 'went_live':
        return this.notifyAllInvitees(envelope.auctionId, 'auction_live');
      case 'cancelled':
        return this.notifyAllInvitees(envelope.auctionId, 'auction_cancelled');
      case 'closed':
      case 'closed_no_bids':
        return this.notifyEachVendorOfOwnOutcome(envelope.auctionId);
      case 'single_bidder_alert':
        return this.notifyTeamSingleBidder(envelope.auctionId);
    }
  }

  private async auctionContext(auctionId: string) {
    const auction = await this.prisma.auction.findUniqueOrThrow({
      where: { id: auctionId },
      include: { prThread: true },
    });
    const invitees = await this.prisma.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: invitees.map((i) => i.vendorId) } } });
    return { auction, vendors };
  }

  private async notifyAllInvitees(auctionId: string, eventType: 'auction_live' | 'auction_cancelled') {
    const { auction, vendors } = await this.auctionContext(auctionId);
    const subject =
      eventType === 'auction_live'
        ? `Auction is live — ${auction.prThread.title} (${auction.prThread.threadCode})`
        : `Auction cancelled — ${auction.prThread.title} (${auction.prThread.threadCode})`;
    const body =
      eventType === 'auction_live'
        ? `Bidding is now open for ${auction.prThread.title}. Sign in to the vendor portal to participate.`
        : `The auction for ${auction.prThread.title} has been cancelled by the Auction Team.`;

    for (const vendor of vendors) {
      await this.dispatch('vendor', vendor.id, eventType, subject, body, vendor.email, vendor.phone);
    }
  }

  private async notifyEachVendorOfOwnOutcome(auctionId: string) {
    const { auction, vendors } = await this.auctionContext(auctionId);
    for (const vendor of vendors) {
      const snapshot = await this.view.getVendorSnapshot(auctionId, vendor.id).catch(() => null);
      const outcomeText =
        auction.status === 'closed_no_bids'
          ? 'The auction closed with no bids received.'
          : this.describeOwnOutcome(snapshot);
      const subject = `Auction closed — ${auction.prThread.title} (${auction.prThread.threadCode})`;
      // §13 — the vendor's own outcome only, never a competitor's.
      await this.dispatch('vendor', vendor.id, 'auction_closed_result', subject, outcomeText, vendor.email, vendor.phone);
    }
  }

  private describeOwnOutcome(snapshot: any): string {
    if (!snapshot) return 'The auction has closed. Sign in to the vendor portal to view the outcome.';
    if (snapshot.format === 'english') {
      return snapshot.myRank
        ? `The auction has closed. Your final rank: L${snapshot.myRank} at ${snapshot.myLastBid}.`
        : 'The auction has closed. You did not submit a bid.';
    }
    return snapshot.myStatus?.active
      ? 'The auction has closed. You remained active to the final call price.'
      : `The auction has closed. You dropped out at ${snapshot.myStatus?.dropPrice}.`;
  }

  /**
   * Portal-only, deliberately — unlike the four lifecycle events, "outbid"
   * can fire many times in a single fast-moving auction. Paging a vendor by
   * SMS/email on every overtake would be spammy and costly; the live
   * bell + socket push is the right channel for this one.
   */
  @OnEvent(AUCTION_OUTBID_EVENT)
  async handleOutbid(payload: OutbidPayload) {
    const auction = await this.prisma.auction.findUniqueOrThrow({
      where: { id: payload.auctionId },
      include: { prThread: true },
    });
    const body =
      payload.newLeaderPrice != null
        ? `You've been outbid on ${auction.prThread.title} — the new leading bid is ${payload.newLeaderPrice}.`
        : `You've been outbid on ${auction.prThread.title} — you are no longer in the lead.`;
    await this.createPortalNotification('vendor', payload.outbidVendorId, 'outbid', {
      subject: `Outbid — ${auction.prThread.title} (${auction.prThread.threadCode})`,
      body,
    });
  }

  private async notifyTeamSingleBidder(auctionId: string) {
    const auction = await this.prisma.auction.findUniqueOrThrow({ where: { id: auctionId }, include: { prThread: true } });
    const teamUsers = await this.prisma.auctionTeamUser.findMany({ where: { isActive: true } });
    for (const user of teamUsers) {
      await this.createPortalNotification('auction_team', user.id, 'single_bidder_alert', {
        auctionId,
        threadCode: auction.prThread.threadCode,
        title: auction.prThread.title,
      });
    }
    this.logger.log(`Single-bidder alert raised for auction ${auctionId}`);
  }

  private async dispatch(
    recipientType: 'vendor' | 'auction_team',
    recipientId: string,
    eventType: 'auction_live' | 'auction_cancelled' | 'auction_closed_result',
    subject: string,
    body: string,
    email?: string | null,
    phone?: string | null,
  ) {
    await this.createPortalNotification(recipientType, recipientId, eventType, { subject, body });
    await this.prisma.notification.create({
      data: { recipientType, recipientId, channel: 'email', eventType, payload: { subject, body, to: email } },
    });
    if (email) {
      await this.email.send(email, subject, body).catch((e) => this.logger.error('Email dispatch failed', e));
    }
    if (phone) {
      await this.prisma.notification.create({
        data: { recipientType, recipientId, channel: 'sms', eventType, payload: { body, to: phone } },
      });
      await this.sms.send(phone, `${subject}: ${body}`).catch((e) => this.logger.error('SMS dispatch failed', e));
    }
  }
}
