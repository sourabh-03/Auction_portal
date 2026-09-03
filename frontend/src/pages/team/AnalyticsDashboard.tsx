import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api } from '../../api/client';
import { AnalyticsOverview } from '../../types';
import { fmtINR } from '../../utils/format';

const STATUS_COLOR: Record<string, string> = {
  draft_configuring: 'var(--amber)',
  referred: 'var(--amber)',
  live: 'var(--red)',
  closed_pending_review: 'var(--copper)',
  closed_no_bids: 'var(--steel)',
  cancelled: 'var(--text-faint)',
  sent_to_tc: 'var(--green)',
};

const STATUS_LABEL: Record<string, string> = {
  draft_configuring: 'Draft — being configured',
  live: 'Live',
  closed_pending_review: 'Closed — pending review',
  closed_no_bids: 'Closed — no bids',
  cancelled: 'Cancelled',
  sent_to_tc: 'Sent to TC Desk',
};

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsOverview | null>(null);

  useEffect(() => {
    api.get<AnalyticsOverview>('/api/analytics/overview').then(setData);
  }, []);

  if (!data) return <Shell wide>Loading…</Shell>;

  const maxStatusCount = Math.max(1, ...Object.values(data.byStatus));
  const maxCategorySavings = Math.max(1, ...data.byCategory.map((c) => c.totalSavings));

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/desk')}>
        ← Auction Desk
      </button>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <div className="lede">
            Every figure computed fresh from Auction, AuctionResult, and BidLogEntry rows — the same source data the
            audit trail and vendor scorecards are built from.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Total auctions" value={data.totalAuctions} />
        <StatTile label="Decided (awarded)" value={data.decidedCount} />
        <StatTile label="Total savings" value={fmtINR(data.totalSavings)} accent="var(--green)" />
        <StatTile label="Savings vs. baseline" value={`${data.savingsPct.toFixed(1)}%`} accent="var(--green)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Avg. bids / English auction" value={data.avgBidsPerEnglishAuction.toFixed(1)} />
        <StatTile label="Avg. responses / Japanese auction" value={data.avgResponsesPerJapaneseAuction.toFixed(1)} />
        <StatTile label="Single-bidder alerts" value={data.singleBidderAlertCount} accent="var(--amber)" />
        <StatTile label="Zero-bid / cancelled" value={`${data.noBidsCount} / ${data.cancelledCount}`} accent="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="panel">
          <h3>Auctions by status</h3>
          <div className="panel-sub">Every auction ever created, by its current status.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {Object.entries(data.byStatus).map(([status, count]) => (
              <BarRow
                key={status}
                label={STATUS_LABEL[status] ?? status}
                value={count}
                max={maxStatusCount}
                color={STATUS_COLOR[status] ?? 'var(--steel)'}
                valueLabel={String(count)}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Savings by category</h3>
          <div className="panel-sub">Total (ceiling/starting price − final rate) across every awarded auction in that category.</div>
          {data.byCategory.length === 0 ? (
            <div className="empty-state">
              <p>No awarded auctions yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.byCategory.map((c) => (
                <BarRow
                  key={c.category}
                  label={`${c.category} (${c.auctionsCount})`}
                  value={c.totalSavings}
                  max={maxCategorySavings}
                  color="var(--copper)"
                  valueLabel={`${fmtINR(c.totalSavings)} · ${c.avgSavingsPct.toFixed(1)}%`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="panel" style={{ marginBottom: 0, textAlign: 'center', padding: '18px 14px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, color: accent }}>{value}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  valueLabel,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  valueLabel: string;
}) {
  const pct = max > 0 ? Math.max(2, (Math.abs(value) / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-mute)' }}>{label}</span>
        <span className="mono" style={{ fontWeight: 500 }}>{valueLabel}</span>
      </div>
      <div style={{ height: 8, background: 'var(--paper)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}
