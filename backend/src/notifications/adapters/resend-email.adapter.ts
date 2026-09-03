import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAdapter } from './adapter.interfaces';

/**
 * Resend (https://resend.com) transactional email — spec §7 suggests it as
 * one of two free-tier options. Implemented against Resend's published
 * REST API shape, but NOT exercised against a live account in this build
 * (no API key was available). Verify the endpoint/payload against current
 * Resend docs before relying on this in production.
 */
@Injectable()
export class ResendEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger('EmailAdapter(resend)');

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    const apiKey = this.config.get<string>('EMAIL_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM', 'auctions@procease.local');
    if (!apiKey) {
      this.logger.warn('EMAIL_API_KEY not set — falling back to logging only.');
      this.logger.log(`[unsent-email] to=${to} subject="${subject}"`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html: body }),
    });
    if (!res.ok) {
      this.logger.error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
  }
}
