export interface EmailAdapter {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface SmsAdapter {
  send(to: string, message: string): Promise<void>;
}
