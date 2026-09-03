import { Module } from '@nestjs/common';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuctionViewService } from './auction-view.service';
import { EngineManagerService } from './engine/engine-manager.service';
import { EnglishEngineService } from './engine/english-engine.service';
import { JapaneseEngineService } from './engine/japanese-engine.service';

@Module({
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionViewService, EngineManagerService, EnglishEngineService, JapaneseEngineService],
  exports: [AuctionsService, AuctionViewService, EnglishEngineService, JapaneseEngineService],
})
export class AuctionsModule {}
