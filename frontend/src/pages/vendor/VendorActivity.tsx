import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api } from '../../api/client';
import { VendorActivity as VendorActivityType } from '../../types';
import { fmtINR } from '../../utils/format';

const STATUS_LABEL: Record<string, string> = {
  closed_pending_review: 'Awaiting review',
  closed_no_bids: 'No bids received',
  cancelled: 'Cancelled',
  sent_to_tc: 'Sent to TC Desk',
  live: 'Live',
};

export default function VendorActivity() {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<VendorActivityType | null>(null);

  useEffect(() => {
    api.get<VendorActivityType>('/api/vendor/activity').then(setActivity);
  }, []);

  if (!activity) return <Shell>Loading…</Shell>;

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/vendor')}>
        ← My auctions
      </button>
      <div className="page-head">
        <div>
          <h1>My Activity</h1>
          <div className="lede">Computed from your own bid/tick log and final results — the same data the Auction Team's audit trail is built from.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Invited to" value={activity.invitedCount} />
        <StatTile label="Actually participated in" value={activity.participatedCount} />
        <StatTile label="Wins (L1)" value={activity.wins} />
        <StatTile label="Average final rank" value={activity.averageRank != null ? activity.averageRank.toFixed(1) : '—'} />
      </div>

      <div className="panel">
        <h3>Auction history</h3>
        <div className="panel-sub">Every auction that has reached a final ranking with your company included.</div>
        {activity.history.length === 0 ? (
          <div className="empty-state">
            <p>No completed auctions yet.</p>
          </div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th>Auction</th>
                <th>Format</th>
                <th>Status</th>
                <th className="num">Your rank</th>
                <th className="num">Final rate</th>
              </tr>
            </thead>
            <tbody>
              {activity.history.map((h) => (
                <tr key={h.auctionId} className={h.rank === 1 ? 'winner' : ''}>
                  <td>
                    {h.threadCode} — {h.title}
                  </td>
                  <td>{h.format === 'english' ? 'English Reverse' : 'Japanese Clock'}</td>
                  <td>{STATUS_LABEL[h.status] ?? h.status}</td>
                  <td className="num">
                    <span className={`rank-badge${h.rank === 1 ? ' l1' : ''}`}>{h.rank ?? '—'}</span>
                  </td>
                  <td className="num">{h.finalRate != null ? fmtINR(h.finalRate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel" style={{ marginBottom: 0, textAlign: 'center', padding: '18px 14px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
