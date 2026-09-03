import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PrThread } from '../../types';
import { NewReferralModal } from './NewReferralModal';
import { AddVendorModal } from './AddVendorModal';

const STATUS_LABEL: Record<string, { cls: string; label: string }> = {
  referred: { cls: 'referred', label: 'Referred — awaiting configuration' },
  draft_configuring: { cls: 'referred', label: 'Draft — being configured' },
  live: { cls: 'live', label: 'Live now' },
  closed_pending_review: { cls: 'review', label: 'Closed — pending review' },
  closed_no_bids: { cls: 'review', label: 'Closed — no bids received' },
  cancelled: { cls: 'cancelled', label: 'Cancelled' },
  sent_to_tc: { cls: 'sent', label: 'Sent to TC Desk' },
};

export default function AuctionDesk() {
  const [threads, setThreads] = useState<PrThread[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<PrThread[]>('/api/threads');
      setThreads(data);
    } catch (err) {
      toast('Could not load threads', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function actionFor(t: PrThread) {
    // Check auction existence FIRST, not thread.status — PrThread.status
    // only ever moves to 'live' at go-live (that's the schema's actual
    // design, not a bug: it has no "being configured" state), so a thread
    // with a draft still sitting in draft_configuring still reads as
    // 'referred'. Checking status first sent the team back to the CREATE
    // route for a thread that already had a draft, which then hit the
    // database's one-auction-per-thread constraint as an ugly 500 instead
    // of a clean "continue configuring" link.
    if (!t.auction) {
      return (
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/auctions/new/${t.id}`)}>
          Configure auction
        </button>
      );
    }
    if (t.auction.status === 'draft_configuring') {
      return (
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/auctions/${t.auction!.id}/configure`)}>
          Continue configuring
        </button>
      );
    }
    if (t.auction.status === 'live') {
      return (
        <button className="btn btn-dark btn-sm" onClick={() => navigate(`/auctions/${t.auction!.id}/live`)}>
          Enter live console
        </button>
      );
    }
    if (t.auction.status === 'closed_pending_review') {
      return (
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/auctions/${t.auction!.id}/review`)}>
          Review result
        </button>
      );
    }
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/auctions/${t.auction!.id}/review`)}>
        View summary
      </button>
    );
  }

  const statusKey = (t: PrThread) => t.auction?.status ?? t.status;

  return (
    <Shell wide>
      <div className="page-head">
        <div>
          <h1>Auction Desk</h1>
          <div className="lede">Purchase requisition threads referred here by the Techno-Commercial Desk for a live reverse auction.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/analytics')}>
            Analytics
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/vendors/scorecards')}>
            Vendor scorecards
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddVendor(true)}>
            + Add vendor
          </button>
          <button className="btn btn-dark" onClick={() => setShowNew(true)}>
            + New referral
          </button>
        </div>
      </div>

      <div className="scope-strip" style={{ display: 'flex', gap: 10, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 22, fontSize: 12.5, color: 'var(--text-mute)' }}>
        <div>
          <b style={{ color: 'var(--text)' }}>How a thread gets here:</b> a thread only lands on this desk when the TC
          Desk explicitly refers it — control transfers back only when this desk explicitly sends a result.
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="empty-state">
          <p>No referred threads yet. Use "New referral" to bring one in manually.</p>
        </div>
      ) : (
        <div className="thread-list">
          {threads.map((t) => {
            const s = STATUS_LABEL[statusKey(t)] ?? { cls: 'referred', label: statusKey(t) };
            return (
              <div className="thread-card" key={t.id}>
                <div className="thread-main">
                  <div className="thread-id">{t.threadCode}</div>
                  <div className="thread-info">
                    <h3>{t.title}</h3>
                    <div className="thread-meta">
                      <span>{t.category}</span>
                      <span className="dim">·</span>
                      <span>{t.qtyDescription}</span>
                      <span className="dim">·</span>
                      <span>TC: {t.tcBuyerName}</span>
                    </div>
                  </div>
                </div>
                <div className="thread-side">
                  <span className={`status-pill ${s.cls}`}>
                    {statusKey(t) === 'live' && <span className="dot" />}
                    {s.label}
                  </span>
                  {actionFor(t)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewReferralModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
      {showAddVendor && <AddVendorModal onClose={() => setShowAddVendor(false)} onCreated={() => {}} />}
    </Shell>
  );
}
