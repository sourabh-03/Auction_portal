import { Controller, Get, UseGuards } from '@nestjs/common';
import { TeamGuard } from '../auth/guards/team.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Not in spec §10's REST table — an Ariba-style savings/spend analytics
 * addition. Every number here is computed fresh from Auction /
 * AuctionConfigEnglish / AuctionConfigJapanese / AuctionResult /
 * BidLogEntry / Notification rows on each request. Nothing is a stored,
 * separately-maintained metric that could drift from the source data.
 */
@Controller('api/analytics')
@UseGuards(TeamGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const auctions = await this.prisma.auction.findMany({
      include: { prThread: true, configEnglish: true, configJapanese: true, results: true },
    });

    const byStatus: Record<string, number> = {};
    const byFormat: Record<string, number> = { english: 0, japanese: 0 };
    for (const a of auctions) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      byFormat[a.format]++;
    }

    // "Decided" = actually produced an award (rank 1 exists) — excludes
    // drafts, live auctions still running, cancellations, and zero-bid closes.
    const decided = auctions
      .filter((a) => a.results.some((r) => r.rank === 1))
      .map((a) => {
        const winner = a.results.find((r) => r.rank === 1)!;
        const baseline =
          a.format === 'english' ? a.configEnglish!.ceilingPrice.toNumber() : a.configJapanese!.startingPrice.toNumber();
        const awarded = winner.finalRate!.toNumber();
        return {
          auctionId: a.id,
          category: a.prThread.category,
          format: a.format,
          baseline,
          awarded,
          savings: baseline - awarded,
          savingsPct: baseline > 0 ? ((baseline - awarded) / baseline) * 100 : 0,
        };
      });

    const totalBaselineValue = decided.reduce((s, d) => s + d.baseline, 0);
    const totalAwardedValue = decided.reduce((s, d) => s + d.awarded, 0);
    const totalSavings = totalBaselineValue - totalAwardedValue;
    const savingsPct = totalBaselineValue > 0 ? (totalSavings / totalBaselineValue) * 100 : 0;

    const liveOrBeyond = (format: 'english' | 'japanese') =>
      auctions.filter((a) => a.format === format && a.status !== 'draft_configuring');

    const englishAuctions = liveOrBeyond('english');
    const japaneseAuctions = liveOrBeyond('japanese');

    const bidCounts = await this.prisma.bidLogEntry.groupBy({
      by: ['auctionId'],
      where: { type: 'bid' },
      _count: { _all: true },
    });
    const totalBids = bidCounts
      .filter((c) => englishAuctions.some((a) => a.id === c.auctionId))
      .reduce((s, c) => s + c._count._all, 0);

    const responseCounts = await this.prisma.bidLogEntry.groupBy({
      by: ['auctionId'],
      where: { type: { in: ['stay', 'drop'] } },
      _count: { _all: true },
    });
    const totalResponses = responseCounts
      .filter((c) => japaneseAuctions.some((a) => a.id === c.auctionId))
      .reduce((s, c) => s + c._count._all, 0);

    const noBidsCount = auctions.filter(
      (a) => (a.status === 'closed_no_bids' || a.status === 'sent_to_tc') && a.results.length === 0,
    ).length;
    const cancelledCount = auctions.filter((a) => a.status === 'cancelled').length;
    const singleBidderAlertCount = await this.prisma.notification.count({
      where: { eventType: 'single_bidder_alert', channel: 'portal' },
    });

    const byCategoryMap = new Map<string, { auctionsCount: number; totalBaseline: number; totalAwarded: number }>();
    for (const d of decided) {
      const entry = byCategoryMap.get(d.category) ?? { auctionsCount: 0, totalBaseline: 0, totalAwarded: 0 };
      entry.auctionsCount++;
      entry.totalBaseline += d.baseline;
      entry.totalAwarded += d.awarded;
      byCategoryMap.set(d.category, entry);
    }
    const byCategory = Array.from(byCategoryMap.entries()).map(([category, v]) => ({
      category,
      auctionsCount: v.auctionsCount,
      totalSavings: v.totalBaseline - v.totalAwarded,
      avgSavingsPct: v.totalBaseline > 0 ? ((v.totalBaseline - v.totalAwarded) / v.totalBaseline) * 100 : 0,
    }));

    return {
      totalAuctions: auctions.length,
      byStatus,
      byFormat,
      decidedCount: decided.length,
      totalBaselineValue,
      totalAwardedValue,
      totalSavings,
      savingsPct,
      avgBidsPerEnglishAuction: englishAuctions.length > 0 ? totalBids / englishAuctions.length : 0,
      avgResponsesPerJapaneseAuction: japaneseAuctions.length > 0 ? totalResponses / japaneseAuctions.length : 0,
      noBidsCount,
      cancelledCount,
      singleBidderAlertCount,
      byCategory: byCategory.sort((a, b) => b.totalSavings - a.totalSavings),
    };
  }
}
