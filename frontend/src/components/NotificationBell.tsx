import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { AppNotification } from '../types';
import { fmtTime } from '../utils/format';

const EVENT_LABEL: Record<string, string> = {
  auction_live: 'Auction is live',
  auction_cancelled: 'Auction cancelled',
  auction_closed_result: 'Auction closed',
  single_bidder_alert: 'Single-bidder alert',
  outbid: "You've been outbid",
};

/**
 * Real notification center, not a UI mock: seeded from GET
 * /api/notifications(/vendor) on mount (real DB rows), then kept live by the
 * same shared socket every auction page already uses — the backend joins
 * every connection to a personal room and pushes a `notification` event the
 * instant a portal Notification row is committed (e.g. the moment an
 * auction the vendor is invited to goes live). Marking read calls the real
 * PATCH endpoint; nothing here is client-only state.
 */
export function NotificationBell() {
  const { auth } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const listPath = auth?.kind === 'team' ? '/api/notifications' : '/api/notifications/vendor';
  const readPath = (id: string) =>
    auth?.kind === 'team' ? `/api/notifications/${id}/read` : `/api/notifications/vendor/${id}/read`;

  useEffect(() => {
    if (!auth) return;
    api.get<AppNotification[]>(listPath).then(setItems);
  }, [auth?.token]);

  useEffect(() => {
    if (!auth) return;
    const socket = getSocket(auth.token);
    const onNotification = (n: AppNotification) => setItems((prev) => [n, ...prev]);
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
    };
  }, [auth?.token]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!auth) return null;

  const unreadCount = items.filter((n) => !n.readAt).length;

  async function markRead(n: AppNotification) {
    if (n.readAt) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    await api.patch(readPath(n.id));
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        className="btn-ghost-sm"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 9px' }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              background: 'var(--red)',
              color: '#fff',
              borderRadius: 99,
              fontSize: 10,
              lineHeight: 1,
              padding: '3px 5px',
              fontFamily: 'var(--mono)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--paper-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            zIndex: 50,
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5, fontWeight: 500 }}>
            Notifications
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '24px 14px', color: 'var(--text-mute)', fontSize: 12.5, textAlign: 'center' }}>
              No notifications yet.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 14px',
                  border: 'none',
                  borderBottom: '1px solid var(--line-soft)',
                  background: n.readAt ? 'transparent' : 'var(--copper-bg)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{EVENT_LABEL[n.eventType] ?? n.eventType}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                    {fmtTime(n.sentAt)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 3 }}>
                  {n.payload?.body ?? n.payload?.subject ?? n.payload?.title ?? ''}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
