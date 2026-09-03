import { Injectable } from '@nestjs/common';
import { Prisma, ThreadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';

const CODE_PREFIX = 'THR-';
const CODE_START = 2000;
const MAX_RETRIES = 5;

@Injectable()
export class ThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: ThreadStatus) {
    return this.prisma.prThread.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { auction: true },
    });
  }

  findOne(id: string) {
    return this.prisma.prThread.findUniqueOrThrow({
      where: { id },
      include: { auction: true },
    });
  }

  // §6.2 — referral into this module is a manual data-entry action by the
  // Auction Team; there is no API/event trigger from a PR/RFQ system in v1.
  // threadCode is generated here (not typed by the user) to guarantee
  // uniqueness without adding a DB sequence beyond spec §9's schema; retried
  // on the rare collision under concurrent entry.
  async create(dto: CreateThreadDto, createdById: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const threadCode = await this.nextThreadCode();
      try {
        return await this.prisma.prThread.create({
          data: {
            threadCode,
            title: dto.title,
            category: dto.category,
            purchaseCode: dto.purchaseCode,
            department: dto.department,
            costCentre: dto.costCentre,
            tcBuyerName: dto.tcBuyerName,
            qtyDescription: dto.qtyDescription,
            referralNote: dto.referralNote,
            resultsNeededBy: dto.resultsNeededBy ? new Date(dto.resultsNeededBy) : undefined,
            status: 'referred',
            createdById,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          lastError = err;
          continue; // threadCode collision — retry with the next number
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async nextThreadCode(): Promise<string> {
    const latest = await this.prisma.prThread.findMany({
      select: { threadCode: true },
      orderBy: { createdAt: 'desc' },
      take: 50, // enough to skip past any out-of-order codes from retries
    });
    let max = CODE_START;
    for (const t of latest) {
      const n = Number(t.threadCode.replace(CODE_PREFIX, ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${CODE_PREFIX}${max + 1}`;
  }
}
