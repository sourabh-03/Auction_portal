import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api } from '../../api/client';
import { VendorProfile as VendorProfileType } from '../../types';

export default function VendorProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<VendorProfileType | null>(null);

  useEffect(() => {
    api.get<VendorProfileType>('/api/vendor/me').then(setProfile);
  }, []);

  if (!profile) return <Shell>Loading…</Shell>;

  return (
    <Shell>
      <button className="back-link" onClick={() => navigate('/vendor')}>
        ← My auctions
      </button>
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
          <div className="lede">Your company's record on file — used for invitations, notifications, and identity in every auction.</div>
        </div>
      </div>

      <div className="panel">
        <h3>Company details</h3>
        <div className="panel-sub">Read-only in v1 — contact the Auction Team to correct any of these.</div>
        <Row k="Company name" v={profile.companyName} />
        <Row k="City" v={profile.city ?? '—'} />
        <Row k="Email" v={profile.email} />
        <Row k="Phone" v={profile.phone ?? '—'} />
        <Row k="Registered categories" v={profile.registeredCategories.join(', ') || '—'} />
        <Row
          k="NDA / bidder agreement"
          v={profile.ndaAcceptedAt ? `Accepted ${new Date(profile.ndaAcceptedAt).toLocaleString('en-IN')}` : 'Not yet accepted'}
        />
        <Row k="On the platform since" v={new Date(profile.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      className="summary-row"
      style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5 }}
    >
      <span className="k" style={{ color: 'var(--text-mute)' }}>{k}</span>
      <span className="v" style={{ textAlign: 'right' }}>{v}</span>
    </div>
  );
}
