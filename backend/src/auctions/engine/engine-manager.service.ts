import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ENGINE_ENGLISH_TIMER_DUE,
  ENGINE_JAPANESE_TRANSITION_DUE,
  ENGINE_JAPANESE_WINDOW_DUE,
} from './engine.types';

/**
 * Owns every in-memory timer for every live auction, in this single Node
 * process (spec §8 — no Redis / no multi-node in v1). Timers fire exactly
 * at the authoritative deadline stored in Postgres rather than polling, and
 * always emit an event rather than calling engine logic directly, so this
 * service never depends on EnglishEngineService/JapaneseEngineService
 * (avoids a circular DI cycle — those services depend on this one, to
 * (re)schedule after an extension or a tick).
 *
 * Crash recovery (§17): on boot, resume every auction whose DB status is
 * still `live` from its last committed state. A few seconds of drift are
 * acceptable at pilot scale — full replay-safety is explicitly a later
 * hardening pass per the spec.
 */
@Injectable()
export class EngineManagerService implements OnModuleInit {
  private readonly logger = new Logger(EngineManagerService.name);
  private readonly englishTimers = new Map<string, NodeJS.Timeout>();
  private readonly japaneseTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    const liveEnglish = await this.prisma.auction.findMany({
      where: { status: 'live', format: 'english' },
      include: { configEnglish: true },
    });
    for (const a of liveEnglish) {
      if (a.configEnglish?.currentEndsAt) {
        this.logger.log(`Resuming English auction ${a.id} after restart`);
        this.scheduleEnglishClose(a.id, a.configEnglish.currentEndsAt);
      }
    }

    const liveJapanese = await this.prisma.auction.findMany({
      where: { status: 'live', format: 'japanese' },
      include: { configJapanese: true },
    });
    for (const a of liveJapanese) {
      const cfg = a.configJapanese;
      if (!cfg) continue;
      this.logger.log(`Resuming Japanese auction ${a.id} after restart`);
      if (cfg.currentPhase === 'awaiting_response' && cfg.currentWindowEndsAt) {
        this.scheduleJapaneseWindowClose(a.id, cfg.currentWindowEndsAt, cfg.tickToken);
      } else {
        // Crashed mid-transition: safest recovery is to re-open a fresh
        // window at the same price rather than guess how far the pause had
        // progressed. JapaneseEngineService exposes this for exactly that case.
        this.emitter.emit(ENGINE_JAPANESE_TRANSITION_DUE, { auctionId: a.id, tickToken: cfg.tickToken });
      }
    }
  }

  scheduleEnglishClose(auctionId: string, endsAt: Date) {
    this.clearEnglish(auctionId);
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    const handle = setTimeout(() => {
      this.englishTimers.delete(auctionId);
      this.emitter.emit(ENGINE_ENGLISH_TIMER_DUE, { auctionId });
    }, delay);
    this.englishTimers.set(auctionId, handle);
  }

  clearEnglish(auctionId: string) {
    const existing = this.englishTimers.get(auctionId);
    if (existing) {
      clearTimeout(existing);
      this.englishTimers.delete(auctionId);
    }
  }

  scheduleJapaneseWindowClose(auctionId: string, windowEndsAt: Date, tickToken: number) {
    this.clearJapanese(auctionId);
    const delay = Math.max(0, windowEndsAt.getTime() - Date.now());
    const handle = setTimeout(() => {
      this.japaneseTimers.delete(auctionId);
      this.emitter.emit(ENGINE_JAPANESE_WINDOW_DUE, { auctionId, tickToken });
    }, delay);
    this.japaneseTimers.set(auctionId, handle);
  }

  scheduleJapaneseTransitionEnd(auctionId: string, delayMs: number, tickToken: number) {
    this.clearJapanese(auctionId);
    const handle = setTimeout(() => {
      this.japaneseTimers.delete(auctionId);
      this.emitter.emit(ENGINE_JAPANESE_TRANSITION_DUE, { auctionId, tickToken });
    }, delayMs);
    this.japaneseTimers.set(auctionId, handle);
  }

  clearJapanese(auctionId: string) {
    const existing = this.japaneseTimers.get(auctionId);
    if (existing) {
      clearTimeout(existing);
      this.japaneseTimers.delete(auctionId);
    }
  }
}
