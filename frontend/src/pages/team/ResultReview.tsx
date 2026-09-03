import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api, apiBase, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmtINR, fmtTime } from '../../utils/format';
import { BidTrendChart } from '../../components/BidTrendChart';

export default function ResultReview() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await api.get<any>(`/api/auctions/${auctionId}/state`);
      setSnapshot(s);
      setAuditLog(await api.get<any[]>(`/api/auctions/${auctionId}/audit-log`));
    } catch (err) {
      toast('Could not load result', err instanceof ApiError ? err.message : undefined, 'twarn');
    }
  }

  useEffect(() => {
    load();
  }, [auctionId]);

  if (!snapshot) return <Shell wide>Loading…</Shell>;

  const closedNoBids = snapshot.status === 'closed_no_bids';
  const ranking: any[] = snapshot.ranking ?? [];
  const respondedCount = snapshot.format === 'english' ? ranking.length : ranking.filter((r) => r.finalRate != null).length;
  const l1 = ranking.find((r) => r.rank === 1);
  // null means "not applicable" — no reserve was configured at all, not
  // that the reserve was missed. Only a genuinely set reserve (a number)
  // should ever trigger the "reserve not met" banner below.
  const hasReserve = snapshot.format === 'english' && snapshot.config.reservePrice != null;
  const reserveMet = hasReserve && l1 ? l1.price <= snapshot.config.reservePrice : null;

  async function sendResult() {
    setBusy(true);
    try {
      await api.post(`/api/auctions/${auctionId}/send-result`);
      toast('Result sent', 'Back in the TC Desk queue for vendor selection approval.', 'tgood');
      load();
    } catch (err) {
      toast('Could not send result', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    fetch(`${apiBase}/api/auctions/${auctionId}/audit-log/export`, {
      headers: { Authorization: `Bearer ${auth?.token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${auctionId}-audit-log.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/desk')}>
        ← Auction Desk
      </button>
      <div className="page-head">
        <div>
          <h1>{snapshot.status === 'sent_to_tc' ? 'Result summary' : 'Result review'} — {snapshot.title}</h1>
          <div className="lede">{snapshot.threadCode} · {snapshot.format === 'english' ? 'English Reverse' : 'Japanese Descending Clock'}</div>
        </div>
      </div>

      {closedNoBids && (
        <div className="banner amber">
          <div>⚠</div>
          <div>
            <b>Zero bids received.</b> This is a distinct terminal state — there is no ranking to send, but the
            outcome itself should still reach the Techno-Commercial Desk so they can proceed with manual/direct
            vendor selection outside this module.
          </div>
        </div>
      )}
      {!closedNoBids && respondedCount < 2 && (
        <div className="banner amber">
          <div>⚠</div>
          <div>
            <b>Only {respondedCount} vendor{respondedCount === 1 ? '' : 's'} produced a competitive rate.</b> A
            single-bidder outcome is still a valid, awardable result — this is a non-blocking notice.
          </div>
        </div>
      )}
      {reserveMet === false && (
        <div className="banner amber">
          <div>⚠</div>
          <div>
            <b>Reserve not met.</b> L1 ({fmtINR(l1.price)}) is above the hidden reserve of {fmtINR(snapshot.config.reservePrice)}.
          </div>
        </div>
      )}
      {snapshot.status === 'sent_to_tc' && (
        <div className="banner green">
          <div>✓</div>
          <div>
            <b>Sent to Techno-Commercial Desk.</b> This thread is now back with the TC buyer for vendor selection approval.
          </div>
        </div>
      )}

      {!closedNoBids && (
        <div className="panel">
          <h3>Price trend</h3>
          <div className="panel-sub">Every {snapshot.format === 'english' ? 'bid' : 'tick'}, straight from the same bid/tick log the ranking below is computed from.</div>
          <BidTrendChart points={snapshot.priceHistory ?? []} format={snapshot.format} />
        </div>
      )}

      {!closedNoBids && (
        <div className="panel">
          <h3>Final ranking</h3>
          <div className="panel-sub">Computed view over the immutable bid/tick log — never a directly editable field.</div>
          <table className="result-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Vendor</th>
                <th className="num">Final rate</th>
                <th className="num">{snapshot.format === 'english' ? 'vs. ceiling' : 'vs. starting price'}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => {
                const base = snapshot.format === 'english' ? snapshot.config.ceilingPrice : snapshot.config.startingPrice;
                const rate = snapshot.format === 'english' ? r.price : r.finalRate;
                const delta = rate != null ? (((rate - base) / base) * 100).toFixed(1) + '%' : '—';
                return (
                  <tr className={r.rank === 1 ? 'winner' : ''} key={r.vendorId}>
                    <td>
                      <span className={`rank-badge${r.rank === 1 ? ' l1' : ''}`}>{r.rank ?? '—'}</span>
                      {r.tieFlagged && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--amber)' }}>tied — review</span>}
                    </td>
                    <td>{r.companyName}</td>
                    <td className="num">{fmtINR(rate)}</td>
                    <td className="num">{delta}</td>
                  </tr>
                );
              })}
              {(snapshot.noBid ?? []).map((n: any) => (
                <tr key={n.vendorId}>
                  <td>—</td>
                  <td>{n.companyName}</td>
                  <td className="num">No bid submitted</td>
                  <td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>

          {snapshot.status === 'closed_pending_review' && (
            <div className="sendoff-box">
              <div className="stext">
                Closing the auction does not notify the TC Desk automatically — this is a deliberate hand-off point.
                Sending makes the full ranking visible in the TC buyer's queue.
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={sendResult}>
                Send result to Techno-Commercial Desk
              </button>
            </div>
          )}
        </div>
      )}

      {closedNoBids && (
        <div className="panel">
          <h3>Hand off to Techno-Commercial Desk</h3>
          <div className="panel-sub">No ranking to send — this carries the "zero bids" outcome itself across the same explicit hand-off point.</div>
          <div className="sendoff-box">
            <div className="stext">
              TC needs to know this auction produced no bids so they can proceed with manual/direct vendor selection
              outside this module — closing alone does not tell them.
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={sendResult}>
              Send "no bids" outcome to Techno-Commercial Desk
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ marginBottom: 0 }}>Audit log</h3>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <div className="panel-sub">Every bid or stay/drop decision, timestamped and attributed.</div>
        <table className="result-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Vendor</th>
              <th>Action</th>
              <th className="num">Price</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtTime(r.createdAt)}</td>
                <td>{r.vendorName ?? 'System'}</td>
                <td>
                  {r.type === 'bid'
                    ? 'Bid submitted'
                    : r.type === 'stay'
                      ? 'Confirmed stay'
                      : r.type === 'drop'
                        ? 'Dropped out'
                        : r.type === 'cancelled'
                          ? 'Cancelled'
                          : r.message}
                </td>
                <td className="num">{r.price != null ? fmtINR(r.price) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
