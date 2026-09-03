import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineManagerService } from './engine-manager.service';
import { computeJapaneseRanking, JapaneseVendorState } from '../ranking.util';
import { hasReachedFloor, nextCallPrice, shouldFinalizeForMinVendors } from './japanese.util';
import {
  AUCTION_LIFECYCLE_EVENT,
  ENGINE_JAPANESE_TRANSITION_DUE,
  ENGINE_JAPANESE_WINDOW_DUE,
  JapaneseWindowDuePayload,
  WS_EVENT,
} from './engine.types';

// Cosmetic-only pacing between one tick's close and the next tick's open,
// mirroring the prototype's brief "calling next price..." pause. Not a
// spec-mandated value — purely so the schema's AuctionPhase.transition
// state (§9) is a real, observable phase rather than dead enum data.
const TRANSITION_PAUSE_MS = 1500;

export type RespondAction = 'stay' | 'drop';

export interface RespondResult {
  ok: boolean;
  rejectionReason?: string;
}

@Injectable()
export class JapaneseEngineService {
  private readonly logger = new Logger(JapaneseEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engineManager: EngineManagerService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * §5.4 (go-live is immediate, mirrors §4.4) and §5.5 — the min-vendor
   * check is evaluated uniformly, including "if it would trigger on the
   * very first tick": we run it right after seating invitees and BEFORE
   * opening the first response window, rather than special-casing tick 1
   * out of the check.
   */
  async goLive(auctionId: string) {
    const opened = await this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.format !== 'japanese') throw new NotFoundException('Japanese auction not found');
      if (auction.status !== 'draft_configuring') {
        throw new BadRequestException('Auction is not in draft_configuring state.');
      }
      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      const invitees = await tx.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
      if (invitees.length < 1) {
        throw new BadRequestException('At least one invited vendor is required to go live.');
      }

      for (const inv of invitees) {
        await tx.auctionSeat.upsert({
          where: { auctionId_vendorId: { auctionId, vendorId: inv.vendorId } },
          update: { active: true, lastBidPrice: null, dropPrice: null, respondedThisWindow: false, joinedByUserId: null },
          create: { auctionId, vendorId: inv.vendorId },
        });
      }

      const windowEndsAt = new Date(Date.now() + config.responseWindowSec * 1000);
      await tx.auctionConfigJapanese.update({
        where: { auctionId },
        data: {
          currentCallPrice: config.startingPrice,
          currentPhase: 'awaiting_response',
          currentWindowEndsAt: windowEndsAt,
          tickToken: 0,
        },
      });
      await tx.auction.update({ where: { id: auctionId }, data: { status: 'live', startedAt: new Date() } });
      await tx.prThread.update({ where: { id: auction.prThreadId }, data: { status: 'live' } });
      await tx.bidLogEntry.create({ data: { auctionId, type: 'system', message: 'Auction is now live.' } });

      const activeCount = invitees.length; // every seat starts active
      if (shouldFinalizeForMinVendors(activeCount, config.minVendorsRemaining)) {
        await this.finalizeWithinTx(
          tx,
          auction,
          { currentCallPrice: config.startingPrice },
          'Minimum active-vendor threshold reached at go-live — invited vendor count did not exceed the configured minimum.',
        );
        return { finalizedImmediately: true };
      }

      return { finalizedImmediately: false, windowEndsAt, tickToken: 0 };
    });

    this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'went_live' });

    if (opened.finalizedImmediately) {
      this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_closed' });
      this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'closed' });
      return;
    }

    this.engineManager.scheduleJapaneseWindowClose(auctionId, opened.windowEndsAt as Date, opened.tickToken as number);
    this.emitter.emit(WS_EVENT, { auctionId, event: 'window_opened' });
  }

  /**
   * §5.2/§5.3 — re-validated server-side under a row lock; the client's own
   * countdown/state is UX only. §5.4 — a drop is permanent, enforced by
   * requiring `active` and rejecting a second response in the same window.
   */
  async respond(auctionId: string, vendorId: string, action: RespondAction): Promise<RespondResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigJapanese" WHERE "auctionId" = ${auctionId} FOR UPDATE`;

      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.format !== 'japanese' || auction.status !== 'live') {
        return { ok: false, rejectionReason: 'This auction is not currently live.' };
      }

      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      if (config.currentPhase !== 'awaiting_response') {
        return { ok: false, rejectionReason: 'No response window is currently open.' };
      }

      const seat = await tx.auctionSeat.findUnique({ where: { auctionId_vendorId: { auctionId, vendorId } } });
      if (!seat) {
        return { ok: false, rejectionReason: 'You are not an invited bidder on this auction.' };
      }
      if (!seat.active) {
        return { ok: false, rejectionReason: 'You have already dropped out of this auction — a drop is permanent.' };
      }
      if (seat.respondedThisWindow) {
        return { ok: false, rejectionReason: 'You have already responded in this window.' };
      }

      const callPrice = (config.currentCallPrice as Prisma.Decimal).toNumber();

      if (action === 'stay') {
        await tx.bidLogEntry.create({ data: { auctionId, vendorId, type: 'stay', price: callPrice } });
        await tx.auctionSeat.update({
          where: { auctionId_vendorId: { auctionId, vendorId } },
          data: { respondedThisWindow: true },
        });
      } else {
        await tx.bidLogEntry.create({ data: { auctionId, vendorId, type: 'drop', price: callPrice } });
        await tx.auctionSeat.update({
          where: { auctionId_vendorId: { auctionId, vendorId } },
          data: { active: false, dropPrice: callPrice, respondedThisWindow: true },
        });
      }

      return { ok: true };
    });

    if (outcome.ok) {
      this.emitter.emit(WS_EVENT, {
        auctionId,
        event: action === 'drop' ? 'vendor_dropped' : 'window_opened', // window_opened re-broadcasts the updated "who has responded" board
      });
      // §5.5 — the minimum-vendor-remaining check applies uniformly and is
      // evaluated immediately on every drop, not only at window close
      // (mirrors the validated prototype behaviour — a drop can end the
      // auction mid-window without waiting for remaining vendors to respond).
      if (action === 'drop') {
        await this.checkEarlyFinalize(auctionId);
      }
    }

    return outcome;
  }

  /** Called right after go-live, and after every drop, to apply §5.5 uniformly. */
  async checkEarlyFinalize(auctionId: string): Promise<boolean> {
    const finalized = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigJapanese" WHERE "auctionId" = ${auctionId} FOR UPDATE`;
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== 'live') return false;

      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      const seats = await tx.auctionSeat.findMany({ where: { auctionId } });
      const activeCount = seats.filter((s) => s.active).length;

      if (!shouldFinalizeForMinVendors(activeCount, config.minVendorsRemaining)) return false;

      await this.finalizeWithinTx(tx, auction, config, 'Minimum active-vendor threshold reached.');
      return true;
    });

    if (finalized) {
      this.engineManager.clearJapanese(auctionId);
      this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_closed' });
      this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'closed' });
    }
    return finalized;
  }

  @OnEvent(ENGINE_JAPANESE_WINDOW_DUE)
  async handleWindowDue(payload: JapaneseWindowDuePayload) {
    await this.closeWindow(payload.auctionId, payload.tickToken);
  }

  /**
   * Window timeout: apply auto-drop / implicit-stay to every non-responder
   * (§5.3), then re-check the min-vendor and floor-price stop conditions
   * (§5.5, §5.6) before opening the next tick.
   */
  private async closeWindow(auctionId: string, expectedTickToken: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigJapanese" WHERE "auctionId" = ${auctionId} FOR UPDATE`;
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== 'live') return null;

      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      if (config.tickToken !== expectedTickToken || config.currentPhase !== 'awaiting_response') {
        return null; // stale callback — a newer tick or an early finalize already superseded this one
      }

      const callPrice = (config.currentCallPrice as Prisma.Decimal).toNumber();
      const seats = await tx.auctionSeat.findMany({ where: { auctionId, active: true, respondedThisWindow: false } });
      for (const seat of seats) {
        if (config.autoDrop) {
          await tx.bidLogEntry.create({
            data: { auctionId, vendorId: seat.vendorId, type: 'drop', price: callPrice, message: 'Auto-dropped — no response before the window closed.' },
          });
          await tx.auctionSeat.update({
            where: { auctionId_vendorId: { auctionId, vendorId: seat.vendorId } },
            data: { active: false, dropPrice: callPrice, respondedThisWindow: true },
          });
        } else {
          // §5.3 — no response with auto-drop off is an implicit stay.
          await tx.bidLogEntry.create({
            data: { auctionId, vendorId: seat.vendorId, type: 'stay', price: callPrice, message: 'Implicit stay — no response, auto-drop is off for this auction.' },
          });
          await tx.auctionSeat.update({
            where: { auctionId_vendorId: { auctionId, vendorId: seat.vendorId } },
            data: { respondedThisWindow: true },
          });
        }
      }

      const allSeats = await tx.auctionSeat.findMany({ where: { auctionId } });
      const activeCount = allSeats.filter((s) => s.active).length;

      if (shouldFinalizeForMinVendors(activeCount, config.minVendorsRemaining)) {
        await this.finalizeWithinTx(tx, auction, config, 'Minimum active-vendor threshold reached.');
        return { finalized: true };
      }
      if (hasReachedFloor(callPrice, config.floorPrice.toNumber())) {
        await this.finalizeWithinTx(tx, auction, config, 'Floor price reached.');
        return { finalized: true };
      }

      // Transition to the next tick.
      await tx.auctionConfigJapanese.update({
        where: { auctionId },
        data: { currentPhase: 'transition' },
      });
      await tx.bidLogEntry.create({
        data: { auctionId, type: 'system', message: `Window closed at ${callPrice} — calling the next price.` },
      });
      return { finalized: false, nextTickToken: config.tickToken };
    });

    if (!result) return;
    this.emitter.emit(WS_EVENT, { auctionId, event: 'window_closed' });

    if (result.finalized) {
      this.engineManager.clearJapanese(auctionId);
      this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_closed' });
      this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'closed' });
      return;
    }

    this.engineManager.scheduleJapaneseTransitionEnd(auctionId, TRANSITION_PAUSE_MS, result.nextTickToken as number);
  }

  @OnEvent(ENGINE_JAPANESE_TRANSITION_DUE)
  async handleTransitionDue(payload: { auctionId: string; tickToken: number }) {
    await this.openNextTick(payload.auctionId, payload.tickToken);
  }

  private async openNextTick(auctionId: string, expectedTickToken: number) {
    const opened = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigJapanese" WHERE "auctionId" = ${auctionId} FOR UPDATE`;
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== 'live') return null;

      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      if (config.tickToken !== expectedTickToken) return null; // superseded

      const currentPrice = (config.currentCallPrice as Prisma.Decimal).toNumber();
      const floor = config.floorPrice.toNumber();
      const nextPrice = nextCallPrice(currentPrice, config.tickDecrement.toNumber(), floor);
      const nextTickToken = config.tickToken + 1;
      const windowEndsAt = new Date(Date.now() + config.responseWindowSec * 1000);

      await tx.auctionConfigJapanese.update({
        where: { auctionId },
        data: {
          currentCallPrice: nextPrice,
          currentPhase: 'awaiting_response',
          currentWindowEndsAt: windowEndsAt,
          tickToken: nextTickToken,
        },
      });
      await tx.auctionSeat.updateMany({
        where: { auctionId, active: true },
        data: { respondedThisWindow: false },
      });
      await tx.bidLogEntry.create({
        data: { auctionId, type: 'system', message: `New call price: ${nextPrice}.` },
      });

      return { windowEndsAt, nextTickToken };
    });

    if (!opened) return;
    this.engineManager.scheduleJapaneseWindowClose(auctionId, opened.windowEndsAt, opened.nextTickToken);
    this.emitter.emit(WS_EVENT, { auctionId, event: 'tick_advanced' });
    this.emitter.emit(WS_EVENT, { auctionId, event: 'window_opened' });
  }

  private async finalizeWithinTx(
    tx: Prisma.TransactionClient,
    auction: { id: string; prThreadId: string },
    config: { currentCallPrice: Prisma.Decimal | null },
    reasonMessage: string,
  ) {
    const auctionId = auction.id;
    const callPrice = (config.currentCallPrice as Prisma.Decimal).toNumber();
    const seats = await tx.auctionSeat.findMany({ where: { auctionId } });
    const vendorStates: JapaneseVendorState[] = seats.map((s) => ({
      vendorId: s.vendorId,
      active: s.active,
      dropPrice: s.dropPrice ? s.dropPrice.toNumber() : null,
    }));
    const ranking = computeJapaneseRanking(vendorStates, callPrice);

    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'closed_pending_review', endedAt: new Date() },
    });
    await tx.prThread.update({
      where: { id: auction.prThreadId },
      data: { status: 'closed_pending_review' },
    });

    for (const r of ranking) {
      await tx.auctionResult.upsert({
        where: { auctionId_vendorId: { auctionId, vendorId: r.vendorId } },
        update: { rank: r.rank, finalRate: r.finalRate },
        create: { auctionId, vendorId: r.vendorId, rank: r.rank, finalRate: r.finalRate },
      });
    }

    await tx.bidLogEntry.create({
      data: { auctionId, type: 'system', message: `Auction closed — ${reasonMessage} Final ranking computed.` },
    });
  }

  async closeNow(auctionId: string, actedByUserId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.format !== 'japanese') throw new NotFoundException('Japanese auction not found');
    if (auction.status !== 'live') {
      throw new BadRequestException('Auction is not live.');
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigJapanese" WHERE "auctionId" = ${auctionId} FOR UPDATE`;
      const freshAuction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!freshAuction || freshAuction.status !== 'live') return false;
      const config = await tx.auctionConfigJapanese.findUniqueOrThrow({ where: { auctionId } });
      await this.finalizeWithinTx(tx, freshAuction, config, 'Manual emergency stop by the Auction Team.');
      await tx.bidLogEntry.create({
        data: { auctionId, type: 'system', message: 'Manual close-now invoked by the Auction Team.', actedByUserId },
      });
      return true;
    });

    if (finalized) {
      this.engineManager.clearJapanese(auctionId);
      this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_closed' });
      this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'closed' });
    }
  }
}
