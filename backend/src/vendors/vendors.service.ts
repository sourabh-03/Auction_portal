import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionViewService } from '../auctions/auction-view.service';
import { EnglishEngineService, SubmitBidResult } from '../auctions/engine/english-engine.service';
import { JapaneseEngineService, RespondAction, RespondResult } from '../auctions/engine/japanese-engine.service';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly view: AuctionViewService,
    private readonly english: EnglishEngineService,
    private readonly japanese: JapaneseEngineService,
  ) {}

  /** §13.3 (via prototype) — a vendor only ever sees auctions its company was actually invited to, and only once live-or-later. */
  async listMyAuctions(vendorId: string) {
    const invites = await this.prisma.auctionInvitee.findMany({
      where: { vendorId, isActive: true },
      include: {
        auction: { include: { prThread: true } },
      },
    });
    return invites
      .filter((i) => i.auction.status !== 'draft_configuring')
      .map((i) => ({
        auctionId: i.auction.id,
        threadCode: i.auction.prThread.threadCode,
        title: i.auction.prThread.title,
        format: i.auction.format,
        status: i.auction.status,
        qtyDescription: i.auction.prThread.qtyDescription,
      }));
  }

  async getState(auctionId: string, vendorId: string) {
    return this.view.getVendorSnapshot(auctionId, vendorId);
  }

  /** My Profile — every field straight from the Vendor row, never the passwordHash. */
  async getProfile(vendorId: string) {
    const vendor = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    return {
      id: vendor.id,
      companyName: vendor.companyName,
      city: vendor.city,
      email: vendor.email,
      phone: vendor.phone,
      registeredCategories: vendor.registeredCategories,
      ndaAcceptedAt: vendor.ndaAcceptedAt,
      createdAt: vendor.createdAt,
    };
  }

  /**
   * My Activity — real aggregation over this vendor's own AuctionResult and
   * BidLogEntry rows. No derived/mock numbers: every figure here is
   * computed straight from rows this vendor's own actions created.
   */
  async getActivity(vendorId: string) {
    const invitedCount = await this.prisma.auctionInvitee.count({ where: { vendorId } });

    const participatedAuctionIds = await this.prisma.bidLogEntry.findMany({
      where: { vendorId, type: { in: ['bid', 'stay', 'drop'] } },
      distinct: ['auctionId'],
      select: { auctionId: true },
    });

    const results = await this.prisma.auctionResult.findMany({
      where: { vendorId },
      include: { auction: { include: { prThread: true } } },
      orderBy: { computedAt: 'desc' },
    });

    const decided = results.filter((r) => r.rank != null);
    const wins = decided.filter((r) => r.rank === 1).length;
    const averageRank = decided.length
      ? decided.reduce((sum, r) => sum + (r.rank as number), 0) / decided.length
      : null;

    return {
      invitedCount,
      participatedCount: participatedAuctionIds.length,
      resultsCount: results.length,
      wins,
      averageRank,
      history: results.map((r) => ({
        auctionId: r.auctionId,
        threadCode: r.auction.prThread.threadCode,
        title: r.auction.prThread.title,
        format: r.auction.format,
        status: r.auction.status,
        rank: r.rank,
        finalRate: r.finalRate,
        computedAt: r.computedAt,
      })),
    };
  }

  private async assertNdaAccepted(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.ndaAcceptedAt) {
      throw new ForbiddenException('Accept the NDA / bidder agreement before submitting a bid.');
    }
  }

  async submitBid(auctionId: string, vendorId: string, price: number): Promise<SubmitBidResult> {
    await this.assertNdaAccepted(vendorId);
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.format !== 'english') {
      throw new BadRequestException('This auction is not an English Reverse auction.');
    }
    return this.english.submitBid(auctionId, vendorId, price);
  }

  async respond(auctionId: string, vendorId: string, action: RespondAction): Promise<RespondResult> {
    await this.assertNdaAccepted(vendorId);
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.format !== 'japanese') {
      throw new BadRequestException('This auction is not a Japanese Descending Clock auction.');
    }
    return this.japanese.respond(auctionId, vendorId, action);
  }
}
