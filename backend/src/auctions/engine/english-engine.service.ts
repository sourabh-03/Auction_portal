import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineManagerService } from './engine-manager.service';
import { computeEnglishRanking, EnglishBidRecord } from '../ranking.util';
import {
  AUCTION_LIFECYCLE_EVENT,
  AUCTION_OUTBID_EVENT,
  ENGINE_ENGLISH_TIMER_DUE,
  EnglishTimerDuePayload,
  WS_EVENT,
} from './engine.types';

export interface SubmitBidResult {
  ok: boolean;
  rejectionReason?: string;
  minValidPrice?: number;
}

@Injectable()
export class EnglishEngineService {
  private readonly logger = new Logger(EnglishEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engineManager: EngineManagerService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * §4.4 — go-live is immediate; there is no separate scheduled start.
   * Note: the spec's tech doc is silent on a minimum invited-vendor count
   * for English (the prototype UI blocks below 2, but that's a UI nicety
   * not stated as a rule in the spec, and the build prompt says to follow
   * the spec over the prototype where they disagree) — so this only
   * enforces the bare logical minimum of 1 invitee, not the prototype's 2.
   * Flagged to the user rather than silently guessed either way.
   */
  async goLive(auctionId: string) {
    const { endsAt } = await this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.format !== 'english') throw new NotFoundException('English auction not found');
      if (auction.status !== 'draft_configuring') {
        throw new BadRequestException('Auction is not in draft_configuring state.');
      }
      const config = await tx.auctionConfigEnglish.findUniqueOrThrow({ where: { auctionId } });
      const invitees = await tx.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
      if (invitees.length < 1) {
        throw new BadRequestException('At least one invited vendor is required to go live.');
      }

      const endsAt = new Date(Date.now() + config.durationSec * 1000);
      await tx.auctionConfigEnglish.update({
        where: { auctionId },
        data: { currentEndsAt: endsAt, extensionsUsed: 0 },
      });
      await tx.auction.update({ where: { id: auctionId }, data: { status: 'live', startedAt: new Date() } });
      await tx.prThread.update({ where: { id: auction.prThreadId }, data: { status: 'live' } });

      for (const inv of invitees) {
        await tx.auctionSeat.upsert({
          where: { auctionId_vendorId: { auctionId, vendorId: inv.vendorId } },
          update: { active: true, lastBidPrice: null, dropPrice: null, respondedThisWindow: false, joinedByUserId: null },
          create: { auctionId, vendorId: inv.vendorId },
        });
      }
      await tx.bidLogEntry.create({ data: { auctionId, type: 'system', message: 'Auction is now live.' } });

      return { endsAt };
    });

    this.engineManager.scheduleEnglishClose(auctionId, endsAt);
    this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'went_live' });
    return { endsAt };
  }

  /**
   * §4.2 — every accepted bid, including the vendor's first, must be at
   * least decrement_value below that vendor's own previous accepted bid, or
   * below the ceiling if they have no prior bid. Re-validated here against
   * the current DB state under a row lock — the client's own check is UX
   * only (spec §12), never trusted.
   */
  async submitBid(auctionId: string, vendorId: string, price: number): Promise<SubmitBidResult> {
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, rejectionReason: 'Bid must be a positive amount.' };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Row-level lock: serializes every concurrent bid attempt on this
      // auction so two near-simultaneous bids can never both validate
      // against a now-stale leader/basis price (spec §11, §12).
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigEnglish" WHERE "auctionId" = ${auctionId} FOR UPDATE`;

      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.format !== 'english' || auction.status !== 'live') {
        return { ok: false, rejectionReason: 'This auction is not currently accepting bids.' } as SubmitBidResult;
      }

      const config = await tx.auctionConfigEnglish.findUniqueOrThrow({ where: { auctionId } });
      const seat = await tx.auctionSeat.findUnique({ where: { auctionId_vendorId: { auctionId, vendorId } } });
      if (!seat) {
        return { ok: false, rejectionReason: 'You are not an invited bidder on this auction.' } as SubmitBidResult;
      }

      const basis = seat.lastBidPrice ? seat.lastBidPrice.toNumber() : config.ceilingPrice.toNumber();
      const decrementValue = config.decrementValue.toNumber();
      const decrementAmount =
        config.decrementType === 'percentage' ? Math.round(basis * (decrementValue / 100)) : decrementValue;
      const maxValidPrice = basis - decrementAmount;

      if (price > maxValidPrice) {
        await tx.bidAttemptRejected.create({
          data: {
            auctionId,
            vendorId,
            attemptedPrice: price,
            reason: `Below-minimum decrement: needed <= ${maxValidPrice}, got ${price}`,
          },
        });
        return {
          ok: false,
          rejectionReason: `Your bid must be at least ${decrementAmount} lower than your last accepted bid of ${basis}.`,
          minValidPrice: maxValidPrice,
        } as SubmitBidResult;
      }

      // §-extension (v1.1, outbid alert): capture who held L1 BEFORE this
      // bid is inserted, using the exact same ranking function the final
      // result is computed with — so "who got outbid" is never a
      // second, inconsistent notion of rank.
      const priorBidEntries = await tx.bidLogEntry.findMany({
        where: { auctionId, type: 'bid' },
        select: { vendorId: true, price: true, createdAt: true },
      });
      const priorBids: EnglishBidRecord[] = priorBidEntries
        .filter((b) => b.vendorId && b.price)
        .map((b) => ({ vendorId: b.vendorId as string, price: (b.price as Prisma.Decimal).toNumber(), createdAt: b.createdAt }));
      const invitees = await tx.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
      const { ranked: priorRanked } = computeEnglishRanking(
        invitees.map((i) => i.vendorId),
        priorBids,
        config.tieBreakRule,
      );
      const priorLeaderId = priorRanked.find((r) => r.rank === 1)?.vendorId ?? null;
      const outbidVendorId = priorLeaderId && priorLeaderId !== vendorId ? priorLeaderId : null;

      await tx.bidLogEntry.create({
        data: { auctionId, vendorId, type: 'bid', price },
      });
      await tx.auctionSeat.update({
        where: { auctionId_vendorId: { auctionId, vendorId } },
        data: { lastBidPrice: price },
      });

      // §4.5 — anti-sniping auto-extension
      let newEndsAt: Date | null = null;
      const currentEndsAt = config.currentEndsAt as Date;
      const remainingMs = currentEndsAt.getTime() - Date.now();
      const triggerWindowMs = (config.triggerWindowSec ?? 0) * 1000;
      if (
        config.autoExtend &&
        remainingMs < triggerWindowMs &&
        config.extensionsUsed < (config.maxExtensions ?? 0)
      ) {
        newEndsAt = new Date(currentEndsAt.getTime() + (config.extensionLengthSec ?? 0) * 1000);
        await tx.auctionConfigEnglish.update({
          where: { auctionId },
          data: { currentEndsAt: newEndsAt, extensionsUsed: { increment: 1 } },
        });
        await tx.bidLogEntry.create({
          data: {
            auctionId,
            type: 'system',
            message: `Auto-extension triggered (+${config.extensionLengthSec}s) — bid landed inside the anti-sniping window.`,
          },
        });
      }

      return { ok: true, newEndsAt, outbidVendorId, visibility: config.visibility } as SubmitBidResult & {
        newEndsAt: Date | null;
        outbidVendorId: string | null;
        visibility: string;
      };
    });

    if (outcome.ok) {
      const withExt = outcome as SubmitBidResult & {
        newEndsAt: Date | null;
        outbidVendorId: string | null;
        visibility: string;
      };
      if (withExt.newEndsAt) {
        this.engineManager.scheduleEnglishClose(auctionId, withExt.newEndsAt);
        this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_extended' });
      }
      this.emitter.emit(WS_EVENT, { auctionId, event: 'bid_accepted' });
      this.emitter.emit(WS_EVENT, { auctionId, event: 'rank_changed' });
      if (withExt.outbidVendorId) {
        // Price is only carried in the event payload when visibility is
        // 'full' — under 'rank_only', NotificationsService must not reveal
        // it either, matching every other vendor-facing surface (§6.1).
        this.emitter.emit(AUCTION_OUTBID_EVENT, {
          auctionId,
          outbidVendorId: withExt.outbidVendorId,
          newLeaderPrice: withExt.visibility === 'full' ? price : null,
        });
      }
      await this.maybeRaiseSingleBidderAlert(auctionId);
    }

    return outcome;
  }

  @OnEvent(ENGINE_ENGLISH_TIMER_DUE)
  async handleTimerDue(payload: EnglishTimerDuePayload) {
    await this.finalizeIfLive(payload.auctionId, 'duration_elapsed', null);
  }

  /** §4.6 — manual emergency stop, logged as a distinct system event. */
  async closeNow(auctionId: string, actedByUserId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.format !== 'english') throw new NotFoundException('English auction not found');
    if (auction.status !== 'live') {
      throw new BadRequestException('Auction is not live.');
    }
    await this.finalizeIfLive(auctionId, 'manual_close_now', actedByUserId);
  }

  private async finalizeIfLive(
    auctionId: string,
    reason: 'duration_elapsed' | 'manual_close_now',
    actedByUserId: string | null,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "auctionId" FROM "AuctionConfigEnglish" WHERE "auctionId" = ${auctionId} FOR UPDATE`;

      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== 'live') return null; // already finalized by a concurrent path

      const config = await tx.auctionConfigEnglish.findUniqueOrThrow({ where: { auctionId } });
      const invitees = await tx.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
      const invitedVendorIds = invitees.map((i) => i.vendorId);

      const bidEntries = await tx.bidLogEntry.findMany({
        where: { auctionId, type: 'bid' },
        select: { vendorId: true, price: true, createdAt: true },
      });
      const bids: EnglishBidRecord[] = bidEntries
        .filter((b) => b.vendorId && b.price)
        .map((b) => ({ vendorId: b.vendorId as string, price: (b.price as Prisma.Decimal).toNumber(), createdAt: b.createdAt }));

      const { ranked, noBid } = computeEnglishRanking(invitedVendorIds, bids, config.tieBreakRule);

      const zeroBids = ranked.length === 0;
      const newStatus = zeroBids ? 'closed_no_bids' : 'closed_pending_review';

      await tx.auction.update({
        where: { id: auctionId },
        data: { status: newStatus, endedAt: new Date() },
      });
      await tx.prThread.update({
        where: { id: auction.prThreadId },
        data: { status: newStatus },
      });

      if (!zeroBids) {
        for (const r of ranked) {
          await tx.auctionResult.upsert({
            where: { auctionId_vendorId: { auctionId, vendorId: r.vendorId } },
            update: { rank: r.rank, finalRate: r.price },
            create: { auctionId, vendorId: r.vendorId, rank: r.rank, finalRate: r.price },
          });
        }
        for (const vendorId of noBid) {
          await tx.auctionResult.upsert({
            where: { auctionId_vendorId: { auctionId, vendorId } },
            update: { rank: null, finalRate: null },
            create: { auctionId, vendorId, rank: null, finalRate: null },
          });
        }
      }

      const closeMessage =
        reason === 'manual_close_now'
          ? 'Auction closed — manual emergency stop by the Auction Team.'
          : zeroBids
            ? 'Auction closed — duration elapsed with zero bids received.'
            : 'Auction closed — duration elapsed. Final ranking computed.';

      await tx.bidLogEntry.create({
        data: { auctionId, type: 'system', message: closeMessage, actedByUserId: actedByUserId ?? undefined },
      });

      return { zeroBids, singleBidder: ranked.length === 1 };
    });

    if (result) {
      this.engineManager.clearEnglish(auctionId);
      this.emitter.emit(WS_EVENT, { auctionId, event: 'auction_closed' });
      this.emitter.emit(AUCTION_LIFECYCLE_EVENT, {
        auctionId,
        event: result.zeroBids ? 'closed_no_bids' : 'closed',
      });
    }
  }

  private async maybeRaiseSingleBidderAlert(auctionId: string) {
    const distinctBidders = await this.prisma.bidLogEntry.findMany({
      where: { auctionId, type: 'bid' },
      distinct: ['vendorId'],
      select: { vendorId: true },
    });
    if (distinctBidders.length !== 1) return;

    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        eventType: 'single_bidder_alert',
        recipientType: 'auction_team',
        payload: { path: ['auctionId'], equals: auctionId },
      },
    });
    if (alreadySent) return;

    this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'single_bidder_alert' });
  }
}
