import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsAdapter } from './adapter.interfaces';

/**
 * MSG91 (https://msg91.com) — spec §7 suggests it as one of two
 * India-friendly SMS gateways. MSG91's actual send flow normally requires a
 * pre-approved DLT template ID rather than a free-text message, which
 * varies per account and can't be verified without live credentials.
 * Implemented against the generic send-SMS API shape as a best-effort
 * starting point — confirm template/route requirements against the
 * account's own MSG91 dashboard before relying on this in production.
 */
@Injectable()
export class Msg91SmsAdapter implements SmsAdapter {
  private readonly logger = new Logger('SmsAdapter(msg91)');

  constructor(private readonly config: ConfigService) {}

  async send(to: string, message: string): Promise<void> {
    const apiKey = this.config.get<string>('SMS_API_KEY');
    const senderId = this.config.get<string>('SMS_SENDER_ID', 'PROCZE');
    if (!apiKey) {
      this.logger.warn('SMS_API_KEY not set — falling back to logging only.');
      this.logger.log(`[unsent-sms] to=${to} message="${message}"`);
      return;
    }
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: senderId,
        mobiles: to.replace(/^\+/, ''),
        message,
      }),
    });
    if (!res.ok) {
      this.logger.error(`MSG91 send failed: ${res.status} ${await res.text()}`);
    }
  }
}
