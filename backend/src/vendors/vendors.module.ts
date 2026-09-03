import { Module } from '@nestjs/common';
import { AuctionsModule } from '../auctions/auctions.module';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuctionsModule],
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
