import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

const WS_EVENTS = [
  'bid_accepted',
  'rank_changed',
  'tick_advanced',
  'window_opened',
  'window_closed',
  'vendor_dropped',
  'auction_extended',
  'auction_closed',
  'auction_cancelled',
];

/**
 * Joins the `auction:{id}` room and always renders from the latest
 * role-scoped state_snapshot the server pushes — never from a client-side
 * delta — per spec §11. `serverNow()` applies the clock offset computed
 * from the snapshot's serverNow field, so local countdowns track the
 * server's authoritative deadline rather than the browser's own clock.
 */
export function useAuctionSocket<T = any>(auctionId: string | undefined) {
  const { auth } = useAuth();
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!auctionId || !auth) return;
    const socket = getSocket(auth.token);

    const apply = (data: any) => {
      if (data?.serverNow) offsetRef.current = new Date(data.serverNow).getTime() - Date.now();
      setSnapshot(data);
    };

    socket.emit('join_auction', { auctionId });
    socket.on('state_snapshot', apply);
    WS_EVENTS.forEach((e) => socket.on(e, apply));

    return () => {
      socket.off('state_snapshot', apply);
      WS_EVENTS.forEach((e) => socket.off(e, apply));
    };
  }, [auctionId, auth]);

  return { snapshot, serverNow: () => Date.now() + offsetRef.current };
}

/** Re-renders once a second so countdowns visibly tick without a network round-trip per second. */
export function useTick(intervalMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setN((n) => n + 1), intervalMs);
    return () => clearInterval(h);
  }, [intervalMs]);
}
