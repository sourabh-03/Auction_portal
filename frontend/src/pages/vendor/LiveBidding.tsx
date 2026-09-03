import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api, ApiError } from '../../api/client';
import { useAuctionSocket, useTick } from '../../hooks/useAuctionSocket';
import { fmtINR, fmtClock } from '../../utils/format';

export default function LiveBidding() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { snapshot, serverNow } = useAuctionSocket<any>(auctionId);
  useTick();

  if (!snapshot) return <Shell>Loading…</Shell>;

  if (snapshot.status !== 'live') {
    return (
      <Shell>
        <button className="back-link" onClick={() => navigate('/vendor')}>
          ← My auctions
        </button>
        <div className="vendor-console">
          <ClosedCard snapshot={snapshot} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <button className="back-link" onClick={() => navigate('/vendor')}>
        ← My auctions
      </button>
      <div className="vendor-console">
        {snapshot.format === 'english' ? (
          <EnglishBidding auctionId={auctionId!} snapshot={snapshot} serverNow={serverNow} />
        ) : (
          <JapaneseClock auctionId={auctionId!} snapshot={snapshot} serverNow={serverNow} />
        )}
      </div>
    </Shell>
  );
}

function ClosedCard({ snapshot }: { snapshot: any }) {
  const won = snapshot.format === 'english' ? snapshot.myRank === 1 : snapshot.myStatus?.active;
  const rate = snapshot.format === 'english' ? snapshot.myLastBid : snapshot.myStatus?.dropPrice;
  return (
    <div className="closed-card">
      <div className="icon-wrap" style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: won ? 'var(--green-bg)' : 'var(--paper)' }}>
        {won ? '✓' : '·'}
      </div>
      <h2>{snapshot.status === 'sent_to_tc' ? 'Auction closed' : snapshot.status === 'closed_no_bids' ? 'Auction closed — no bids received' : 'Auction closed — result under review'}</h2>
      <p>
        {snapshot.format === 'english'
          ? snapshot.myRank
            ? `Your final position was L${snapshot.myRank} at ${fmtINR(snapshot.myLastBid)}.`
            : 'You did not submit a bid before the auction closed.'
          : snapshot.myStatus?.active
            ? 'You remained active to the final call price.'
            : snapshot.myStatus
              ? `You dropped out at ${fmtINR(snapshot.myStatus.dropPrice)}.`
              : 'This auction has closed.'}
      </p>
      {rate != null && <div className="final-price">{fmtINR(rate)}</div>}
    </div>
  );
}

function EnglishBidding({ auctionId, snapshot, serverNow }: { auctionId: string; snapshot: any; serverNow: () => number }) {
  const remaining = new Date(snapshot.config.currentEndsAt).getTime() - serverNow();
  const basis = snapshot.myLastBid ?? snapshot.config.ceilingPrice;
  const dec = snapshot.config.decrementType === 'percentage' ? Math.round(basis * (snapshot.config.decrementValue / 100)) : snapshot.config.decrementValue;
  const suggested = Math.max(0, basis - dec);
  const [price, setPrice] = useState<number>(suggested);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.post<{ ok: boolean; rejectionReason?: string }>(`/api/vendor/auctions/${auctionId}/bid`, { price });
      if (res.ok) setFeedback({ ok: true, message: 'Bid accepted.' });
      else setFeedback({ ok: false, message: res.rejectionReason ?? 'Bid rejected.' });
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof ApiError ? err.message : 'Could not submit bid.' });
    } finally {
      setBusy(false);
    }
  }

  const leader = snapshot.board?.[0];

  return (
    <div className="bid-panel">
      <div className="bid-panel-top">
        <div>
          <h2>{snapshot.title}</h2>
          <div className="sub">{snapshot.threadCode} · English Reverse · Ceiling {fmtINR(snapshot.config.ceilingPrice)}</div>
        </div>
        <div className="timer-block">
          <div className="tlabel">Closes in</div>
          <div className={`tval${remaining < 30000 ? ' urgent' : ''}`}>{fmtClock(remaining)}</div>
        </div>
      </div>

      <div className="your-rank-box">
        <div className="rlabel">Your current rank</div>
        <div className={`rvalue${snapshot.myRank === 1 ? ' l1' : ''}`}>{snapshot.myRank ? 'L' + snapshot.myRank : '—'}</div>
        <div className="rnote">
          {snapshot.myLastBid ? `Your bid: ${fmtINR(snapshot.myLastBid)}` : 'Submit your first bid below'}
          {leader && snapshot.myRank !== 1 ? ` · Leading bid: ${snapshot.board ? fmtINR(leader.price) : 'hidden — rank only'}` : ''}
        </div>
      </div>

      <div className="bid-form">
        <div className="input-prefix">
          <span>₹</span>
          <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          Submit bid
        </button>
      </div>
      {feedback && (
        <div className={feedback.ok ? 'bid-success-msg' : 'bid-error'}>{feedback.ok ? feedback.message : `⚠ ${feedback.message}`}</div>
      )}
      <div className="mini-note">
        Your next bid must undercut your own last accepted bid by at least{' '}
        {snapshot.config.decrementType === 'absolute' ? fmtINR(snapshot.config.decrementValue) : snapshot.config.decrementValue + '%'}.{' '}
        {snapshot.config.visibility === 'full' ? "You can see every bidder's live price (as Bidder A/B/C — never a real name)." : "You can only see your own rank — not competitors' prices."}
      </div>

      {snapshot.board && (
        <div className="rank-board-mini" style={{ marginTop: 20 }}>
          <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--on-dark-faint)', marginBottom: 8 }}>Live board</h4>
          <div className="rank-table">
            <div className="rank-head-row">
              <span>Rank</span>
              <span>Vendor</span>
              <span style={{ textAlign: 'right' }}>Bid</span>
              <span />
            </div>
            {snapshot.board.map((b: any) => (
              <div className={`rank-row${b.rank === 1 ? ' l1' : ''}`} key={b.label}>
                <span className="r-rank">L{b.rank}</span>
                <span className="r-name">{b.label}</span>
                <span className="r-price">{fmtINR(b.price)}</span>
                <span />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JapaneseClock({ auctionId, snapshot, serverNow }: { auctionId: string; snapshot: any; serverNow: () => number }) {
  const windowRemaining = snapshot.config.currentPhase === 'awaiting_response'
    ? new Date(snapshot.config.currentWindowEndsAt).getTime() - serverNow()
    : 0;
  const pct = snapshot.config.currentPhase === 'awaiting_response'
    ? Math.max(0, (windowRemaining / (snapshot.config.responseWindowSec * 1000)) * 100)
    : 0;
  const [busy, setBusy] = useState(false);

  async function respond(action: 'stay' | 'drop') {
    setBusy(true);
    try {
      await api.post(`/api/vendor/auctions/${auctionId}/respond`, { action });
    } finally {
      setBusy(false);
    }
  }

  const responded = snapshot.myStatus?.respondedThisWindow;

  return (
    <div className="bid-panel">
      <div className="bid-panel-top">
        <div>
          <h2>{snapshot.title}</h2>
          <div className="sub">{snapshot.threadCode} · Japanese Descending Clock · Starting price {fmtINR(snapshot.config.startingPrice)}</div>
        </div>
      </div>

      <div className="clock-face">
        <div className="clabel">Current call price</div>
        <div className="cprice">{fmtINR(snapshot.config.currentCallPrice)}</div>
        <div className="cdelta">
          Floor {fmtINR(snapshot.config.floorPrice)} · {snapshot.activeVendorCount} bidder{snapshot.activeVendorCount === 1 ? '' : 's'} still active
        </div>
      </div>

      {!snapshot.myStatus?.active ? (
        <div className="decision-status dropped">You dropped out at {fmtINR(snapshot.myStatus?.dropPrice)}. A drop is permanent.</div>
      ) : snapshot.config.currentPhase === 'transition' ? (
        <div className="decision-status">Calling the next price…</div>
      ) : (
        <div className="decision-window">
          <div className="window-bar">
            <div className="window-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {responded ? (
            <div className="decision-status responded">✓ Confirmed — you're staying in at {fmtINR(snapshot.config.currentCallPrice)}</div>
          ) : (
            <div className="decision-btns">
              <button className="btn btn-dark" disabled={busy} onClick={() => respond('stay')}>
                Stay in
              </button>
              <button className="btn btn-danger-outline" disabled={busy} onClick={() => respond('drop')}>
                Drop out
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mini-note">
        Confirm within the response window at each falling price.{' '}
        {snapshot.config.autoDrop
          ? 'No response before the window closes drops you automatically at that price.'
          : 'In this configuration, no response is treated as staying in.'}
      </div>

      <div className="field-count">
        <div>
          <b>{fmtINR(snapshot.config.tickDecrement)}</b>
          <span>Per tick</span>
        </div>
        <div>
          <b>{snapshot.config.tickIntervalSec}s</b>
          <span>Tick interval</span>
        </div>
        <div>
          <b>{snapshot.config.minVendorsRemaining}</b>
          <span>Closes at</span>
        </div>
      </div>
    </div>
  );
}
