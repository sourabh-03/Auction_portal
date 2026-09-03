import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { TeamGuard } from '../auth/guards/team.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

function randomPassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

/**
 * Not enumerated in spec §10's REST table but necessary plumbing: the
 * Auction Team has to be able to browse the vendor directory to pick
 * invitees when creating/configuring an auction (spec §14 screen 3).
 */
@Controller('api/vendors')
@UseGuards(TeamGuard)
export class VendorDirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, companyName: true, city: true, email: true, registeredCategories: true },
      orderBy: { companyName: 'asc' },
    });
  }

  /**
   * Vendor scorecards — every figure is a real aggregate over this
   * vendor's own AuctionInvitee/BidLogEntry/AuctionResult rows, computed
   * fresh on each request. Not in spec §10's REST table (a team-facing
   * analytics addition, same spirit as the vendor's own "My Activity").
   */
  /**
   * Not in spec §10 — the spec assumes a Vendor Master integration exists
   * to populate vendors and explicitly defers that integration (§2's
   * out-of-scope table). It says nothing about how vendors get into this
   * table in the meantime beyond "own tables, real login" (§7). Manual
   * onboarding by the Auction Team, the same way referrals are manually
   * entered (§6.2), fills that gap without building anything the spec
   * defers — no external sync, just a row in a table that already exists
   * for exactly this purpose.
   *
   * Returns the plaintext password once, at creation time only — same
   * pattern as the seed script. It is never recoverable after this
   * response; only its bcrypt hash is stored.
   */
  @Post()
  async create(@Body() dto: CreateVendorDto) {
    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const vendor = await this.prisma.vendor.create({
        data: {
          companyName: dto.companyName,
          city: dto.city,
          email: dto.email,
          phone: dto.phone,
          registeredCategories: dto.registeredCategories,
          passwordHash,
        },
        select: { id: true, companyName: true, city: true, email: true, registeredCategories: true },
      });
      return { vendor, generatedPassword: password };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('A vendor with this email already exists.');
      }
      throw err;
    }
  }

  @Get('scorecards')
  async scorecards() {
    const vendors = await this.prisma.vendor.findMany({
      select: { id: true, companyName: true, city: true },
      orderBy: { companyName: 'asc' },
    });

    const invitedGroups = await this.prisma.auctionInvitee.groupBy({
      by: ['vendorId'],
      _count: { _all: true },
    });
    const invitedByVendor = new Map(invitedGroups.map((g) => [g.vendorId, g._count._all]));

    const participationRows = await this.prisma.bidLogEntry.findMany({
      where: { vendorId: { not: null }, type: { in: ['bid', 'stay', 'drop'] } },
      distinct: ['vendorId', 'auctionId'],
      select: { vendorId: true },
    });
    const participatedByVendor = new Map<string, number>();
    for (const row of participationRows) {
      const vid = row.vendorId as string;
      participatedByVendor.set(vid, (participatedByVendor.get(vid) ?? 0) + 1);
    }

    const resultAgg = await this.prisma.auctionResult.groupBy({
      by: ['vendorId'],
      _count: { rank: true },
      _avg: { rank: true },
    });
    const resultsByVendor = new Map(resultAgg.map((g) => [g.vendorId, g]));

    const winGroups = await this.prisma.auctionResult.groupBy({
      by: ['vendorId'],
      where: { rank: 1 },
      _count: { _all: true },
    });
    const winsByVendor = new Map(winGroups.map((g) => [g.vendorId, g._count._all]));

    return vendors
      .map((v) => {
        const results = resultsByVendor.get(v.id);
        return {
          vendorId: v.id,
          companyName: v.companyName,
          city: v.city,
          invitedCount: invitedByVendor.get(v.id) ?? 0,
          participatedCount: participatedByVendor.get(v.id) ?? 0,
          resultsCount: results?._count.rank ?? 0,
          wins: winsByVendor.get(v.id) ?? 0,
          averageRank: results?._avg.rank ?? null,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.participatedCount - a.participatedCount);
  }
}
