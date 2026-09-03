import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeEnglishRanking, computeJapaneseRanking } from './ranking.util';

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : d.toNumber();
}

/**
 * The single place that decides what a given viewer is allowed to see.
 * Spec §6.1 (competitor identity always anonymized to vendors, regardless
 * of visibility setting — the prototype's known bug) and §12 (reserve price
 * never serialized to a vendor-facing response) are both enforced here,
 * not left to the frontend to hide. Every vendor-facing REST/WS payload in
 * this system must go through getVendorSnapshot, never a raw Prisma read.
 */
@Injectable()
export class AuctionViewService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stable "Bidder A/B/C..." labels for the lifetime of the auction, ordered by invite time. */
  private async anonymityMap(auctionId: string): Promise<Map<string, string>> {
    const invitees = await this.prisma.auctionInvitee.findMany({
      where: { auctionId },
      orderBy: [{ invitedAt: 'asc' }, { vendorId: 'asc' }],
    });
    const map = new Map<string, string>();
    invitees.forEach((inv, i) => {
      const label = i < 26 ? `Bidder ${String.fromCharCode(65 + i)}` : `Bidder #${i + 1}`;
      map.set(inv.vendorId, label);
    });
    return map;
  }

  private async loadAuction(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { prThread: true, configEnglish: true, configJapanese: true },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    return auction;
  }

  /**
   * Auction Team internal console — always real names, always full prices,
   * reserve included (spec §3).
   *
   * Invitees come from AuctionInvitee, not AuctionSeat — AuctionSeat rows
   * only exist from go-live onward (created by EnglishEngine/JapaneseEngine
   * .goLive), so a draft_configuring auction has zero seats. Sourcing the
   * invitee list from seats made the Configure screen's vendor checklist
   * silently go empty the instant a draft was created — caught via an
   * actual browser run, not the curl-based API tests, which happened to
   * always check state only after go-live.
   */
  async getTeamSnapshot(auctionId: string) {
    const auction = await this.loadAuction(auctionId);
    const invitees = await this.prisma.auctionInvitee.findMany({ where: { auctionId, isActive: true } });
    const seats = await this.prisma.auctionSeat.findMany({ where: { auctionId } });
    const seatByVendor = new Map(seats.map((s) => [s.vendorId, s]));
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: invitees.map((i) => i.vendorId) } },
    });
    const vendorById = new Map(vendors.map((v) => [v.id, v]));

    const bidLog = await this.prisma.bidLogEntry.findMany({
      where: { auctionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const base = {
      id: auction.id,
      threadCode: auction.prThread.threadCode,
      title: auction.prThread.title,
      format: auction.format,
      status: auction.status,
      startedAt: auction.startedAt,
      endedAt: auction.endedAt,
      invitees: invitees.map((i) => {
        const seat = seatByVendor.get(i.vendorId);
        return {
          vendorId: i.vendorId,
          companyName: vendorById.get(i.vendorId)?.companyName ?? 'Unknown vendor',
          city: vendorById.get(i.vendorId)?.city ?? null,
          active: seat?.active ?? true, // pre-go-live: every invitee is presumptively active
          lastBidPrice: seat ? toNum(seat.lastBidPrice) : null,
          dropPrice: seat ? toNum(seat.dropPrice) : null,
          respondedThisWindow: seat?.respondedThisWindow ?? false,
        };
      }),
      recentLog: bidLog.map((b) => ({
        id: b.id.toString(),
        vendorId: b.vendorId,
        vendorName: b.vendorId ? (vendorById.get(b.vendorId)?.companyName ?? 'Unknown vendor') : null,
        type: b.type,
        price: toNum(b.price),
        message: b.message,
        createdAt: b.createdAt,
      })),
    };

    if (auction.format === 'english') {
      const cfg = auction.configEnglish!;
      const bids = bidLog
        .filter((b) => b.type === 'bid' && b.vendorId && b.price)
        .map((b) => ({ vendorId: b.vendorId as string, price: toNum(b.price) as number, createdAt: b.createdAt }));
      const invitedVendorIds = invitees.map((i) => i.vendorId);
      const { ranked, noBid } = computeEnglishRanking(invitedVendorIds, bids, cfg.tieBreakRule);

      // Live bid-trend chart (team-facing): every bid, oldest first, real
      // names, straight off the same bidLog rows the audit trail already
      // reads — no separate tracked series to drift out of sync.
      const priceHistory = [...bids]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((b) => ({
          timestamp: b.createdAt,
          price: b.price,
          vendorId: b.vendorId,
          label: vendorById.get(b.vendorId)?.companyName ?? 'Unknown vendor',
        }));

      return {
        ...base,
        priceHistory,
        config: {
          ceilingPrice: toNum(cfg.ceilingPrice),
          reservePrice: toNum(cfg.reservePrice), // team only — never leaked to vendor snapshot
          decrementType: cfg.decrementType,
          decrementValue: toNum(cfg.decrementValue),
          durationSec: cfg.durationSec,
          autoExtend: cfg.autoExtend,
          triggerWindowSec: cfg.triggerWindowSec,
          extensionLengthSec: cfg.extensionLengthSec,
          maxExtensions: cfg.maxExtensions,
          extensionsUsed: cfg.extensionsUsed,
          visibility: cfg.visibility,
          tieBreakRule: cfg.tieBreakRule,
          currentEndsAt: cfg.currentEndsAt,
        },
        ranking: ranked.map((r) => ({ ...r, companyName: vendorById.get(r.vendorId)?.companyName })),
        noBid: noBid.map((vid) => ({ vendorId: vid, companyName: vendorById.get(vid)?.companyName })),
      };
    }

    const cfg = auction.configJapanese!;
    const vendorStates = seats.map((s) => ({ vendorId: s.vendorId, active: s.active, dropPrice: toNum(s.dropPrice) }));
    const ranking =
      auction.status === 'closed_pending_review' || auction.status === 'sent_to_tc'
        ? computeJapaneseRanking(vendorStates, toNum(cfg.currentCallPrice) ?? 0)
        : null;

    // Live bid-trend chart: the call price at every tick, from the same
    // stay/drop rows (each carries the call price active at that moment).
    // Seeded with the auction's actual starting price at its actual
    // startedAt timestamp so the line begins where the auction really did,
    // not at the first response.
    const tickPoints = bidLog
      .filter((b) => (b.type === 'stay' || b.type === 'drop') && b.price)
      .map((b) => ({ timestamp: b.createdAt, price: toNum(b.price) as number }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const priceHistory =
      auction.startedAt != null
        ? [{ timestamp: auction.startedAt, price: toNum(cfg.startingPrice) as number }, ...tickPoints]
        : tickPoints;

    return {
      ...base,
      priceHistory,
      config: {
        startingPrice: toNum(cfg.startingPrice),
        floorPrice: toNum(cfg.floorPrice),
        tickDecrement: toNum(cfg.tickDecrement),
        tickIntervalSec: cfg.tickIntervalSec,
        responseWindowSec: cfg.responseWindowSec,
        autoDrop: cfg.autoDrop,
        minVendorsRemaining: cfg.minVendorsRemaining,
        currentCallPrice: toNum(cfg.currentCallPrice),
        currentPhase: cfg.currentPhase,
        currentWindowEndsAt: cfg.currentWindowEndsAt,
        tickToken: cfg.tickToken,
      },
      activeVendorCount: seats.filter((s) => s.active).length,
      ranking: ranking?.map((r) => ({ ...r, companyName: vendorById.get(r.vendorId)?.companyName })) ?? null,
    };
  }

  /**
   * Vendor bidding console. §6.1 — every OTHER bidder is always shown as
   * "Bidder A/B/C", never a real company name, regardless of the
   * visibility setting (this is the exact bug the tech spec calls out in
   * the prototype). §12 — reservePrice is never included at all, not even
   * as null (it is omitted from the object entirely).
   */
  async getVendorSnapshot(auctionId: string, vendorId: string) {
    const auction = await this.loadAuction(auctionId);
    const invitee = await this.prisma.auctionInvitee.findUnique({
      where: { auctionId_vendorId: { auctionId, vendorId } },
    });
    if (!invitee) throw new NotFoundException('You are not invited to this auction.');

    const labels = await this.anonymityMap(auctionId);
    const mySeat = await this.prisma.auctionSeat.findUnique({
      where: { auctionId_vendorId: { auctionId, vendorId } },
    });

    const base = {
      id: auction.id,
      threadCode: auction.prThread.threadCode,
      title: auction.prThread.title,
      format: auction.format,
      status: auction.status,
    };

    if (auction.format === 'english') {
      const cfg = auction.configEnglish!;
      const bidEntries = await this.prisma.bidLogEntry.findMany({
        where: { auctionId, type: 'bid' },
        select: { vendorId: true, price: true, createdAt: true },
      });
      const invitees = await this.prisma.auctionInvitee.findMany({ where: { auctionId } });
      const bids = bidEntries
        .filter((b) => b.vendorId && b.price)
        .map((b) => ({ vendorId: b.vendorId as string, price: toNum(b.price) as number, createdAt: b.createdAt }));
      const { ranked, noBid } = computeEnglishRanking(
        invitees.map((i) => i.vendorId),
        bids,
        cfg.tieBreakRule,
      );
      const myRow = ranked.find((r) => r.vendorId === vendorId);

      const board =
        cfg.visibility === 'full'
          ? ranked.map((r) => ({
              label: r.vendorId === vendorId ? 'You' : labels.get(r.vendorId),
              price: r.price,
              rank: r.rank,
              isYou: r.vendorId === vendorId,
            }))
          : null; // rank_only — no other bidders' prices or identities at all

      return {
        ...base,
        config: {
          ceilingPrice: toNum(cfg.ceilingPrice), // BR-07 — always visible
          decrementType: cfg.decrementType,
          decrementValue: toNum(cfg.decrementValue),
          visibility: cfg.visibility,
          currentEndsAt: cfg.currentEndsAt,
          // reservePrice deliberately absent — never sent to a vendor, at any visibility setting (spec §3, §12)
        },
        myRank: myRow?.rank ?? null,
        myLastBid: mySeat ? toNum(mySeat.lastBidPrice) : null,
        board,
        totalInvited: invitees.length,
        noBidCount: noBid.length,
      };
    }

    const cfg = auction.configJapanese!;
    const seats = await this.prisma.auctionSeat.findMany({ where: { auctionId } });
    const activeVendorCount = seats.filter((s) => s.active).length;

    return {
      ...base,
      config: {
        startingPrice: toNum(cfg.startingPrice), // BR-07 — always visible
        floorPrice: toNum(cfg.floorPrice), // always visible per §5.1
        tickDecrement: toNum(cfg.tickDecrement),
        tickIntervalSec: cfg.tickIntervalSec,
        responseWindowSec: cfg.responseWindowSec,
        autoDrop: cfg.autoDrop,
        minVendorsRemaining: cfg.minVendorsRemaining,
        currentCallPrice: toNum(cfg.currentCallPrice),
        currentPhase: cfg.currentPhase,
        currentWindowEndsAt: cfg.currentWindowEndsAt,
      },
      activeVendorCount, // §3 — vendor headcount is not treated as sensitive
      myStatus: mySeat
        ? {
            active: mySeat.active,
            dropPrice: toNum(mySeat.dropPrice),
            respondedThisWindow: mySeat.respondedThisWindow,
          }
        : null,
    };
  }

  async getAuditLog(auctionId: string) {
    const entries = await this.prisma.bidLogEntry.findMany({
      where: { auctionId },
      orderBy: { createdAt: 'asc' },
    });
    const vendorIds = [...new Set(entries.map((e) => e.vendorId).filter(Boolean))] as string[];
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: vendorIds } } });
    const nameById = new Map(vendors.map((v) => [v.id, v.companyName]));
    return entries.map((e) => ({
      id: e.id.toString(),
      createdAt: e.createdAt,
      vendorId: e.vendorId,
      vendorName: e.vendorId ? (nameById.get(e.vendorId) ?? 'Unknown vendor') : 'System',
      actedByUserId: e.actedByUserId,
      type: e.type,
      price: toNum(e.price),
      message: e.message,
    }));
  }

  async exportAuditLogCsv(auctionId: string): Promise<string> {
    const rows = await this.getAuditLog(auctionId);
    const header = 'timestamp,vendor,type,price,message';
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        escape(r.vendorName),
        r.type,
        r.price ?? '',
        escape(r.message ?? ''),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }
}
