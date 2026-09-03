import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EnglishEngineService } from './engine/english-engine.service';
import { JapaneseEngineService } from './engine/japanese-engine.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionConfigDto } from './dto/update-auction-config.dto';
import { AUCTION_LIFECYCLE_EVENT } from './engine/engine.types';

// Sensible starting defaults for a freshly created draft — every field is
// editable via PATCH before go-live (spec §4.4/§9). Values are not
// spec-mandated; they exist only so a new draft renders with something
// reasonable already filled in, matching the prototype's UX.
const DEFAULT_ENGLISH = {
  decrementType: 'absolute' as const,
  decrementValue: 5000,
  durationSec: 15 * 60,
  autoExtend: true,
  triggerWindowSec: 45,
  extensionLengthSec: 45,
  maxExtensions: 3,
  visibility: 'full' as const,
  tieBreakRule: 'earliest' as const,
};

const DEFAULT_JAPANESE = {
  tickIntervalSec: 15,
  responseWindowSec: 10,
  autoDrop: true,
  minVendorsRemaining: 2,
};

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly english: EnglishEngineService,
    private readonly japanese: JapaneseEngineService,
    private readonly emitter: EventEmitter2,
  ) {}

  async create(dto: CreateAuctionDto, createdById: string) {
    // Check for an existing Auction directly (via the 1:1 relation), not
    // just thread.status — PrThread.status only moves to 'live' at
    // go-live, so a draft that's still draft_configuring leaves the
    // thread looking 'referred'. Relying on status alone let a duplicate
    // create request (e.g. a double-click) slip past this guard and hit
    // the DB's unique constraint on Auction.prThreadId instead, surfacing
    // as a raw 500 rather than a clean validation error.
    const thread = await this.prisma.prThread.findUnique({
      where: { id: dto.prThreadId },
      include: { auction: true },
    });
    if (!thread) throw new NotFoundException('Referred thread not found');
    if (thread.auction || thread.status !== 'referred') {
      throw new BadRequestException('An auction already exists for this thread, or it is not in referred status.');
    }
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: dto.inviteeVendorIds } } });
    if (vendors.length !== dto.inviteeVendorIds.length) {
      throw new BadRequestException('One or more invitee vendor ids do not exist.');
    }

    return this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.create({
        data: { prThreadId: dto.prThreadId, format: dto.format, createdById, status: 'draft_configuring' },
      });
      for (const vendorId of dto.inviteeVendorIds) {
        await tx.auctionInvitee.create({ data: { auctionId: auction.id, vendorId } });
      }
      if (dto.format === 'english') {
        await tx.auctionConfigEnglish.create({
          data: {
            auctionId: auction.id,
            ceilingPrice: 0,
            decrementType: DEFAULT_ENGLISH.decrementType,
            decrementValue: DEFAULT_ENGLISH.decrementValue,
            durationSec: DEFAULT_ENGLISH.durationSec,
            autoExtend: DEFAULT_ENGLISH.autoExtend,
            triggerWindowSec: DEFAULT_ENGLISH.triggerWindowSec,
            extensionLengthSec: DEFAULT_ENGLISH.extensionLengthSec,
            maxExtensions: DEFAULT_ENGLISH.maxExtensions,
            visibility: DEFAULT_ENGLISH.visibility,
            tieBreakRule: DEFAULT_ENGLISH.tieBreakRule,
          },
        });
      } else {
        await tx.auctionConfigJapanese.create({
          data: {
            auctionId: auction.id,
            startingPrice: 0,
            floorPrice: 0,
            tickDecrement: 0,
            tickIntervalSec: DEFAULT_JAPANESE.tickIntervalSec,
            responseWindowSec: DEFAULT_JAPANESE.responseWindowSec,
            autoDrop: DEFAULT_JAPANESE.autoDrop,
            minVendorsRemaining: DEFAULT_JAPANESE.minVendorsRemaining,
          },
        });
      }
      return tx.auction.findUniqueOrThrow({
        where: { id: auction.id },
        include: { configEnglish: true, configJapanese: true, invitees: true },
      });
    });
  }

  private async assertDraft(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'draft_configuring') {
      throw new BadRequestException('Auction can only be configured while in draft_configuring status.');
    }
    return auction;
  }

  /** §3 — configurable, including visibility, only until go-live; locked once live. */
  async updateConfig(auctionId: string, dto: UpdateAuctionConfigDto) {
    const auction = await this.assertDraft(auctionId);

    if (auction.format === 'english' && dto.english) {
      await this.prisma.auctionConfigEnglish.update({ where: { auctionId }, data: dto.english });
    }
    if (auction.format === 'japanese' && dto.japanese) {
      await this.prisma.auctionConfigJapanese.update({ where: { auctionId }, data: dto.japanese });
    }
    if (dto.english && auction.format !== 'english') {
      throw new BadRequestException(`This auction is ${auction.format}; cannot set an english config block.`);
    }
    if (dto.japanese && auction.format !== 'japanese') {
      throw new BadRequestException(`This auction is ${auction.format}; cannot set a japanese config block.`);
    }

    if (dto.inviteeVendorIds) {
      const vendors = await this.prisma.vendor.findMany({ where: { id: { in: dto.inviteeVendorIds } } });
      if (vendors.length !== dto.inviteeVendorIds.length) {
        throw new BadRequestException('One or more invitee vendor ids do not exist.');
      }
      const existing = await this.prisma.auctionInvitee.findMany({ where: { auctionId } });
      const existingIds = new Set(existing.map((e) => e.vendorId));
      const keepIds = new Set(dto.inviteeVendorIds);

      await this.prisma.$transaction([
        ...[...existingIds].map((vendorId) =>
          this.prisma.auctionInvitee.update({
            where: { auctionId_vendorId: { auctionId, vendorId } },
            data: { isActive: keepIds.has(vendorId) },
          }),
        ),
        ...dto.inviteeVendorIds
          .filter((vendorId) => !existingIds.has(vendorId))
          .map((vendorId) => this.prisma.auctionInvitee.create({ data: { auctionId, vendorId } })),
      ]);
    }

    return this.prisma.auction.findUniqueOrThrow({
      where: { id: auctionId },
      include: { configEnglish: true, configJapanese: true, invitees: { where: { isActive: true } } },
    });
  }

  async goLive(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.format === 'english') return this.english.goLive(auctionId);
    return this.japanese.goLive(auctionId);
  }

  async closeNow(auctionId: string, actedByUserId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.format === 'english') return this.english.closeNow(auctionId, actedByUserId);
    return this.japanese.closeNow(auctionId, actedByUserId);
  }

  /** §6.2 — cancellable while configured-or-live; bid_log is preserved, never deleted. */
  async cancel(auctionId: string, actedByUserId: string, reason?: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (!['draft_configuring', 'live'].includes(auction.status)) {
      throw new BadRequestException('Only a configured-or-live auction can be cancelled.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auction.update({
        where: { id: auctionId },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledById: actedByUserId, cancelReason: reason },
      });
      await tx.prThread.update({ where: { id: auction.prThreadId }, data: { status: 'cancelled' } });
      await tx.bidLogEntry.create({
        data: {
          auctionId,
          type: 'cancelled',
          message: reason ? `Auction cancelled by the Auction Team: ${reason}` : 'Auction cancelled by the Auction Team.',
          actedByUserId,
        },
      });
    });

    // Any in-memory timer still pending for this auction fires harmlessly
    // later — every engine timer callback re-checks status === 'live'
    // before acting, so a stale timeout for a now-cancelled auction is a
    // no-op rather than a race.
    this.emitter.emit(AUCTION_LIFECYCLE_EVENT, { auctionId, event: 'cancelled' });
  }

  /**
   * BR-06/§6.2 — a single explicit action, no maker-checker, no
   * auto-notification to TC (no system exists to notify).
   *
   * Also accepts closed_no_bids — §4.9 says a zero-bid close "routes back
   * to manual/direct vendor selection outside this module," which still
   * requires an explicit hand-off event for TC to act on (BR-06: "control
   * transfers only at explicit points"). Nothing is auto-selected or
   * re-ranked; this just carries the "no bids were received" outcome
   * across the same hand-off point a ranked result uses, rather than
   * leaving the thread stuck with no way to notify TC at all.
   */
  async sendResult(auctionId: string, sentToTcById: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'closed_pending_review' && auction.status !== 'closed_no_bids') {
      throw new BadRequestException('Only a closed auction can be sent to the TC Desk.');
    }
    const message =
      auction.status === 'closed_no_bids'
        ? 'Sent to Techno-Commercial Desk — zero bids received, routed back for manual/direct vendor selection.'
        : 'Sent to Techno-Commercial Desk with the final ranking.';
    await this.prisma.$transaction(async (tx) => {
      await tx.auction.update({
        where: { id: auctionId },
        data: { status: 'sent_to_tc', sentToTcAt: new Date(), sentToTcById },
      });
      await tx.prThread.update({ where: { id: auction.prThreadId }, data: { status: 'sent_to_tc' } });
      await tx.bidLogEntry.create({ data: { auctionId, type: 'system', message, actedByUserId: sentToTcById } });
    });
    return this.prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  }

  /**
   * Auction templates ("copy from a previous event") — not in spec §10.
   * Every field returned is read straight from a real, previously-saved
   * AuctionConfigEnglish/Japanese row; nothing here is synthesized. The
   * Configure screen uses this to pre-fill a new draft's fields so the
   * team doesn't retype the same decrement/duration/response-window
   * settings for every similar auction.
   */
  async listTemplates() {
    const auctions = await this.prisma.auction.findMany({
      where: { status: { not: 'draft_configuring' } },
      include: { prThread: true, configEnglish: true, configJapanese: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return auctions.map((a) => ({
      auctionId: a.id,
      threadCode: a.prThread.threadCode,
      title: a.prThread.title,
      format: a.format,
      createdAt: a.createdAt,
      english: a.configEnglish
        ? {
            ceilingPrice: a.configEnglish.ceilingPrice,
            decrementType: a.configEnglish.decrementType,
            decrementValue: a.configEnglish.decrementValue,
            durationSec: a.configEnglish.durationSec,
            autoExtend: a.configEnglish.autoExtend,
            triggerWindowSec: a.configEnglish.triggerWindowSec,
            extensionLengthSec: a.configEnglish.extensionLengthSec,
            maxExtensions: a.configEnglish.maxExtensions,
            visibility: a.configEnglish.visibility,
            reservePrice: a.configEnglish.reservePrice,
            tieBreakRule: a.configEnglish.tieBreakRule,
          }
        : null,
      japanese: a.configJapanese
        ? {
            startingPrice: a.configJapanese.startingPrice,
            floorPrice: a.configJapanese.floorPrice,
            tickDecrement: a.configJapanese.tickDecrement,
            tickIntervalSec: a.configJapanese.tickIntervalSec,
            responseWindowSec: a.configJapanese.responseWindowSec,
            autoDrop: a.configJapanese.autoDrop,
            minVendorsRemaining: a.configJapanese.minVendorsRemaining,
          }
        : null,
    }));
  }
}
