import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const STATUS_LABEL: Record<string, { cls: string; label: string }> = {
  live: { cls: 'live', label: 'Live now — bidding open' },
  closed_pending_review: { cls: 'review', label: 'Closed — awaiting Auction Desk review' },
  closed_no_bids: { cls: 'review', label: 'Closed — no bids received' },
  cancelled: { cls: 'cancelled', label: 'Cancelled' },
  sent_to_tc: { cls: 'sent', label: 'Closed — result sent to TC Desk' },
};

export default function VendorHome() {
  const { auth, acceptNda } = useAuth();
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any[]>('/api/vendor/auctions').then(setAuctions).catch(() => setAuctions([]));
  }, []);

  async function onAcceptNda() {
    setBusy(true);
    try {
      await acceptNda();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h1>My auctions</h1>
          <div className="lede">
            Auctions {auth?.vendor?.companyName} has been invited to. You only see events your company is registered
            against.
          </div>
        </div>
      </div>

      {auth?.vendor && !auth.vendor.ndaAccepted && (
        <div className="callout warn" style={{ marginBottom: 20 }}>
          You must accept the NDA / bidder agreement once before your first bid is accepted on any auction.{' '}
          <button className="btn btn-dark btn-sm" style={{ marginLeft: 8 }} disabled={busy} onClick={onAcceptNda}>
            Accept NDA
          </button>
        </div>
      )}

      {auctions.length === 0 ? (
        <div className="empty-state">
          <p>No live or completed auctions right now for this company. Check back once the Auction Desk starts one you're invited to.</p>
        </div>
      ) : (
        auctions.map((a) => {
          const s = STATUS_LABEL[a.status] ?? { cls: 'referred', label: a.status };
          return (
            <div className="vh-card" key={a.auctionId}>
              <div>
                <h3>{a.title}</h3>
                <div className="vh-meta">
                  {a.threadCode} · {a.format === 'english' ? 'English Reverse' : 'Japanese Clock'} · {a.qtyDescription}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className={`status-pill ${s.cls}`}>
                  {a.status === 'live' && <span className="dot" />}
                  {s.label}
                </span>
                <button
                  className={a.status === 'live' ? 'btn btn-dark btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => navigate(`/vendor/auctions/${a.auctionId}`)}
                >
                  {a.status === 'live' ? 'Enter live bidding' : 'View outcome'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </Shell>
  );
}
