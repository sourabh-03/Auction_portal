import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuctionsModule } from '../auctions/auctions.module';
import { NotificationsService, EMAIL_ADAPTER, SMS_ADAPTER } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ConsoleEmailAdapter, ConsoleSmsAdapter } from './adapters/console.adapters';
import { ResendEmailAdapter } from './adapters/resend-email.adapter';
import { Msg91SmsAdapter } from './adapters/msg91-sms.adapter';

@Module({
  imports: [ConfigModule, AuctionsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ConsoleEmailAdapter,
    ConsoleSmsAdapter,
    ResendEmailAdapter,
    Msg91SmsAdapter,
    {
      provide: EMAIL_ADAPTER,
      inject: [ConfigService, ConsoleEmailAdapter, ResendEmailAdapter],
      useFactory: (config: ConfigService, consoleAdapter: ConsoleEmailAdapter, resendAdapter: ResendEmailAdapter) => {
        const provider = config.get<string>('EMAIL_PROVIDER', 'console');
        if (provider === 'resend') return resendAdapter;
        // 'brevo' isn't implemented (no credentials to verify against) — falls
        // back to console rather than silently pretending to send.
        return consoleAdapter;
      },
    },
    {
      provide: SMS_ADAPTER,
      inject: [ConfigService, ConsoleSmsAdapter, Msg91SmsAdapter],
      useFactory: (config: ConfigService, consoleAdapter: ConsoleSmsAdapter, msg91Adapter: Msg91SmsAdapter) => {
        const provider = config.get<string>('SMS_PROVIDER', 'console');
        if (provider === 'msg91') return msg91Adapter;
        // 'fast2sms' isn't implemented (no credentials to verify against) —
        // falls back to console rather than silently pretending to send.
        return consoleAdapter;
      },
    },
  ],
})
export class NotificationsModule {}
