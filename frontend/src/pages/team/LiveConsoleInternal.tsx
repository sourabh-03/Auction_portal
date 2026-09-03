import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api, apiBase, ApiError } from '../../api/client';
import { useAuctionSocket, useTick } from '../../hooks/useAuctionSocket';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { fmtINR, fmtClock, fmtTime } from '../../utils/format';
import { BidTrendChart } from '../../components/BidTrendChart';

export default function LiveConsoleInternal() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { auth } = useAuth();
  const { snapshot, serverNow } = useAuctionSocket<any>(auctionId);
  const [busy, setBusy] = useState(false);
  useTick();

  if (!snapshot) return <Shell wide>Loading live console…</Shell>;
  if (snapshot.status !== 'live') {
    navigate(`/auctions/${auctionId}/review`, { replace: true });
    return null;
  }

  async function closeNow() {
    if (!confirm('Close this auction immediately? This is logged as a manual emergency stop, distinct from a natural timer close.')) return;
    setBusy(true);
    try {
      await api.post(`/api/auctions/${auctionId}/close-now`);
    } catch (err) {
      toast('Could not close auction', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  async function cancelAuction() {
    const reason = prompt('Reason for cancelling (optional):') ?? undefined;
    setBusy(true);
    try {
      await api.post(`/api/auctions/${auctionId}/cancel`, { reason });
      navigate('/desk');
    } catch (err) {
      toast('Could not cancel auction', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/desk')}>
        ← Auction Desk
      </button>
      <div className="live-shell">
        {snapshot.format === 'english' ? (
          <EnglishLive snapshot={snapshot} serverNow={serverNow} />
        ) : (
          <JapaneseLive snapshot={snapshot} serverNow={serverNow} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-danger-outline" disabled={busy} onClick={closeNow}>
          Close auction now
        </button>
        <button className="btn btn-danger-outline" disabled={busy} onClick={cancelAuction}>
          Cancel auction
        </button>
        <a
          className="btn btn-secondary"
          href={`${apiBase}/api/auctions/${auctionId}/audit-log/export`}
          onClick={(e) => {
            // token-authenticated download: fetch as blob rather than a bare link
            e.preventDefault();
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
          }}
        >
          Export audit log (CSV)
        </a>
      </div>
    </Shell>
  );
}

function EnglishLive({ snapshot, serverNow }: { snapshot: any; serverNow: () => number }) {
  const remaining = new Date(snapshot.config.currentEndsAt).getTime() - serverNow();
  const ranking = snapshot.ranking ?? [];
  const leader = ranking[0];

  return (
    <>
      <div className="live-top">
        <div className="live-top-l">
          <h2>{snapshot.title}</h2>
          <div className="sub">{snapshot.threadCode} · English Reverse · {snapshot.invitees.length} bidders invited</div>
        </div>
        <div className="timer-block">
          <div className="tlabel">Time remaining</div>
          <div className={`tval${remaining < 30000 ? ' urgent' : ''}`}>{fmtClock(remaining)}</div>
        </div>
      </div>
      <div className="live-body">
        <div>
          <div className="price-strip">
            <div className="price-block">
              <div className="plabel">Ceiling</div>
              <div className="pval dim">{fmtINR(snapshot.config.ceilingPrice)}</div>
            </div>
            <div className="price-block">
              <div className="plabel">Current L1</div>
              <div className="pval">{leader ? fmtINR(leader.price) : '— no bids yet'}</div>
            </div>
            <div className="price-block">
              <div className="plabel">Reserve</div>
              <div className="pval dim">
                {fmtINR(snapshot.config.reservePrice)} <span style={{ fontSize: 10 }}>(hidden from vendors)</span>
              </div>
            </div>
          </div>
          <div className="rank-table">
            <div className="rank-head-row">
              <span>Rank</span>
              <span>Vendor</span>
              <span style={{ textAlign: 'right' }}>Bid</span>
              <span style={{ textAlign: 'right' }}>Status</span>
            </div>
            {ranking.map((r: any) => (
              <div className={`rank-row${r.rank === 1 ? ' l1' : ''}`} key={r.vendorId}>
                <span className="r-rank">L{r.rank}</span>
                <span className="r-name">{r.companyName}{r.tieFlagged ? <small>Tied — flagged for review</small> : null}</span>
                <span className="r-price">{fmtINR(r.price)}</span>
                <span className="r-status" />
              </div>
            ))}
            {snapshot.noBid.map((n: any) => (
              <div className="rank-row" key={n.vendorId}>
                <span className="r-rank">—</span>
                <span className="r-name">{n.companyName}</span>
                <span className="r-price">No bid yet</span>
                <span className="r-status" />
              </div>
            ))}
          </div>
          <div className="live-side-panel" style={{ marginTop: 14 }}>
            <h4>Price trend</h4>
            <BidTrendChart points={snapshot.priceHistory ?? []} format="english" dark />
          </div>
        </div>
        <div>
          <div className="live-side-panel">
            <h4>Auction parameters</h4>
            <div className="meta-line"><span className="k">Min. decrement</span><span className="v">{snapshot.config.decrementType === 'absolute' ? fmtINR(snapshot.config.decrementValue) : snapshot.config.decrementValue + '%'}</span></div>
            <div className="meta-line"><span className="k">Visibility to vendors</span><span className="v">{snapshot.config.visibility === 'full' ? 'Full price' : 'Rank only'}</span></div>
            <div className="meta-line"><span className="k">Auto-extensions used</span><span className="v">{snapshot.config.extensionsUsed} / {snapshot.config.autoExtend ? snapshot.config.maxExtensions : 0}</span></div>
            <div className="meta-line"><span className="k">Tie-break rule</span><span className="v">{snapshot.config.tieBreakRule === 'earliest' ? 'Earliest bid' : 'Manual review'}</span></div>
          </div>
          <AuditPanel entries={snapshot.recentLog} />
        </div>
      </div>
    </>
  );
}

function JapaneseLive({ snapshot, serverNow }: { snapshot: any; serverNow: () => number }) {
  const winRemaining = snapshot.config.currentPhase === 'awaiting_response'
    ? new Date(snapshot.config.currentWindowEndsAt).getTime() - serverNow()
    : 0;
  const active = snapshot.invitees.filter((v: any) => v.active);
  const dropped = snapshot.invitees.filter((v: any) => !v.active).sort((a: any, b: any) => (b.dropPrice ?? 0) - (a.dropPrice ?? 0));

  return (
    <>
      <div className="live-top">
        <div className="live-top-l">
          <h2>{snapshot.title}</h2>
          <div className="sub">{snapshot.threadCode} · Japanese Descending Clock · {snapshot.invitees.length} bidders invited</div>
        </div>
        <div className="timer-block">
          <div className="tlabel">{snapshot.config.currentPhase === 'transition' ? 'Calling next price' : 'Response window'}</div>
          <div className={`tval${winRemaining < 3000 && snapshot.config.currentPhase === 'awaiting_response' ? ' urgent' : ''}`}>
            {snapshot.config.currentPhase === 'transition' ? '···' : fmtClock(winRemaining)}
          </div>
        </div>
      </div>
      <div className="live-body">
        <div>
          <div className="price-strip">
            <div className="price-block"><div className="plabel">Starting price</div><div className="pval dim">{fmtINR(snapshot.config.startingPrice)}</div></div>
            <div className="price-block"><div className="plabel">Current call price</div><div className="pval">{fmtINR(snapshot.config.currentCallPrice)}</div></div>
            <div className="price-block"><div className="plabel">Floor</div><div className="pval dim">{fmtINR(snapshot.config.floorPrice)}</div></div>
          </div>
          <div className="rank-table">
            <div className="rank-head-row"><span>Status</span><span>Vendor</span><span style={{ textAlign: 'right' }}>Price</span><span style={{ textAlign: 'right' }}>Responded</span></div>
            {active.map((v: any) => (
              <div className="rank-row l1" key={v.vendorId}>
                <span className="r-rank">Active</span>
                <span className="r-name">{v.companyName}</span>
                <span className="r-price">{fmtINR(snapshot.config.currentCallPrice)}</span>
                <span className={`r-status${v.respondedThisWindow ? ' you' : ''}`}>{v.respondedThisWindow ? '✓ confirmed' : 'awaiting'}</span>
              </div>
            ))}
            {dropped.map((v: any) => (
              <div className="rank-row" key={v.vendorId}>
                <span className="r-rank">Out</span>
                <span className="r-name">{v.companyName}</span>
                <span className="r-price">{fmtINR(v.dropPrice)}</span>
                <span className="r-status dropped">dropped</span>
              </div>
            ))}
          </div>
          <div className="live-side-panel" style={{ marginTop: 14 }}>
            <h4>Price trend</h4>
            <BidTrendChart points={snapshot.priceHistory ?? []} format="japanese" dark />
          </div>
        </div>
        <div>
          <div className="live-side-panel">
            <h4>Clock parameters</h4>
            <div className="meta-line"><span className="k">Tick decrement</span><span className="v">{fmtINR(snapshot.config.tickDecrement)}</span></div>
            <div className="meta-line"><span className="k">Tick interval</span><span className="v">{snapshot.config.tickIntervalSec}s</span></div>
            <div className="meta-line"><span className="k">Response window</span><span className="v">{snapshot.config.responseWindowSec}s</span></div>
            <div className="meta-line"><span className="k">Min. vendors to continue</span><span className="v">{snapshot.config.minVendorsRemaining}</span></div>
            <div className="meta-line"><span className="k">Auto-drop on silence</span><span className="v">{snapshot.config.autoDrop ? 'On' : 'Off'}</span></div>
          </div>
          <AuditPanel entries={snapshot.recentLog} />
        </div>
      </div>
    </>
  );
}

function AuditPanel({ entries }: { entries: any[] }) {
  return (
    <div className="log-panel">
      <div className="log-head">
        <h4>Audit log — append only</h4>
      </div>
      <div className="log-body">
        {entries.length === 0 ? (
          <div className="log-row"><span className="lc">No activity yet.</span></div>
        ) : (
          entries.map((r) => (
            <div className={`log-row${r.type === 'system' ? ' sys' : r.type === 'drop' ? ' drop' : ''}`} key={r.id}>
              <span className="lt">{fmtTime(r.createdAt)}</span>
              <span className="lc">
                {r.type === 'system' ? (
                  r.message
                ) : (
                  <>
                    <b>{r.vendorName}</b>{' '}
                    {r.type === 'bid' ? `bid ${fmtINR(r.price)}` : r.type === 'stay' ? `confirmed stay at ${fmtINR(r.price)}` : `dropped out at ${fmtINR(r.price)}`}
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
