import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuctionsModule } from '../auctions/auctions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, AuctionsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
