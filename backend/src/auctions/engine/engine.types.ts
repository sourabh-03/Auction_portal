/**
 * Internal plumbing events: fired by EngineManagerService's timers, consumed
 * only by the matching engine service. Kept separate from the public
 * "ws.*" domain events below so a timer callback can never accidentally be
 * mistaken for a client-facing broadcast.
 */
export const ENGINE_ENGLISH_TIMER_DUE = 'engine.english_timer_due';
export const ENGINE_JAPANESE_WINDOW_DUE = 'engine.japanese_window_due';
export const ENGINE_JAPANESE_TRANSITION_DUE = 'engine.japanese_transition_due';

export interface EnglishTimerDuePayload {
  auctionId: string;
}

export interface JapaneseWindowDuePayload {
  auctionId: string;
  tickToken: number;
}

/**
 * Public domain events. One RealtimeGateway listener and one
 * NotificationsService listener both subscribe to these; each engine
 * service emits them only AFTER its DB transaction has committed (spec §11).
 */
export const WS_EVENT = 'ws.event';

export type WsEventName =
  | 'bid_accepted'
  | 'rank_changed'
  | 'tick_advanced'
  | 'window_opened'
  | 'window_closed'
  | 'vendor_dropped'
  | 'auction_extended'
  | 'auction_closed'
  | 'auction_cancelled';

export interface WsEventEnvelope {
  auctionId: string;
  event: WsEventName;
  // Payload is intentionally untyped here — RealtimeGateway rebuilds a
  // role-scoped snapshot per recipient rather than relaying a raw payload,
  // so no client ever receives more than its role is entitled to (§6.1, §12).
  meta?: Record<string, unknown>;
}

export const AUCTION_LIFECYCLE_EVENT = 'auction.lifecycle';

export type LifecycleEventName =
  | 'went_live'
  | 'closed'
  | 'closed_no_bids'
  | 'cancelled'
  | 'single_bidder_alert';

export interface LifecycleEnvelope {
  auctionId: string;
  event: LifecycleEventName;
  meta?: Record<string, unknown>;
}

/**
 * Fired the instant a portal Notification row is committed, so
 * RealtimeGateway can push it straight to that recipient's personal socket
 * room (independent of any auction-specific room) — this is what lights up
 * the topbar notification bell live, with no page refresh and no polling.
 */
export const NOTIFICATION_CREATED_EVENT = 'notification.created';

export interface NotificationCreatedPayload {
  recipientType: 'vendor' | 'auction_team';
  recipientId: string;
  notification: {
    id: string;
    eventType: string;
    payload: unknown;
    sentAt: Date;
    readAt: Date | null;
  };
}

/**
 * Fired after a bid transaction commits when the new bid displaces the
 * vendor who held L1 immediately beforehand. English Reverse only.
 */
export const AUCTION_OUTBID_EVENT = 'auction.outbid';

export interface OutbidPayload {
  auctionId: string;
  outbidVendorId: string;
  // null when the auction's visibility is 'rank_only' — the outbid vendor
  // is told their rank changed, never the new leader's price (§6.1).
  newLeaderPrice: number | null;
}
