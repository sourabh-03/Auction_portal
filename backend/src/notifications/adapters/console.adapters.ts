import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter, SmsAdapter } from './adapter.interfaces';

/** Default, always-works dev/local fallback — logs instead of sending. */
@Injectable()
export class ConsoleEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger('EmailAdapter(console)');
  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[console-email] to=${to} subject="${subject}" body="${body}"`);
  }
}

@Injectable()
export class ConsoleSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger('SmsAdapter(console)');
  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[console-sms] to=${to} message="${message}"`);
  }
}
