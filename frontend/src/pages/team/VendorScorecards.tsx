import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api } from '../../api/client';
import { VendorScorecard } from '../../types';

export default function VendorScorecards() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<VendorScorecard[] | null>(null);

  useEffect(() => {
    api.get<VendorScorecard[]>('/api/vendors/scorecards').then(setRows);
  }, []);

  if (!rows) return <Shell wide>Loading…</Shell>;

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/desk')}>
        ← Auction Desk
      </button>
      <div className="page-head">
        <div>
          <h1>Vendor Scorecards</h1>
          <div className="lede">
            Every figure computed fresh from this vendor's own bid/tick log and final results across every auction —
            the same source data the audit trail is built from, not a separate tracked metric.
          </div>
        </div>
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <div className="empty-state">
            <p>No vendors registered yet.</p>
          </div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="num">Invited</th>
                <th className="num">Participated</th>
                <th className="num">Results</th>
                <th className="num">Wins (L1)</th>
                <th className="num">Avg. rank</th>
                <th className="num">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const winRate = r.resultsCount > 0 ? ((r.wins / r.resultsCount) * 100).toFixed(0) + '%' : '—';
                return (
                  <tr key={r.vendorId} className={r.wins > 0 ? 'winner' : ''}>
                    <td>
                      {r.companyName}
                      {r.city && <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>· {r.city}</span>}
                    </td>
                    <td className="num">{r.invitedCount}</td>
                    <td className="num">{r.participatedCount}</td>
                    <td className="num">{r.resultsCount}</td>
                    <td className="num">
                      <span className={`rank-badge${r.wins > 0 ? ' l1' : ''}`}>{r.wins}</span>
                    </td>
                    <td className="num">{r.averageRank != null ? r.averageRank.toFixed(1) : '—'}</td>
                    <td className="num">{winRate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
