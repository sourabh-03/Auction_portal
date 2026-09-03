import { io, Socket } from 'socket.io-client';
import { apiBase } from './client';

let socket: Socket | null = null;

/**
 * One shared socket per session. Spec §11 — on join_auction the server
 * pushes a full state_snapshot immediately, and again on every subsequent
 * event, so a client that reconnects (or missed an event) is never left
 * silently stale — callers should always render from the latest snapshot
 * event rather than trying to apply deltas.
 */
export function getSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(apiBase, { auth: { token }, transports: ['websocket'] });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
