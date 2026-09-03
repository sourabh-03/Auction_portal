import React, { useState } from 'react';
import { api, ApiError } from '../../api/client';

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20,24,28,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};
const modal: React.CSSProperties = {
  background: 'var(--paper-2)',
  borderRadius: 'var(--r-md)',
  padding: 24,
  width: 480,
  maxWidth: '92vw',
  maxHeight: '86vh',
  overflowY: 'auto',
};

interface CreatedVendor {
  vendor: { companyName: string; email: string };
  generatedPassword: string;
}

export function AddVendorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ companyName: '', city: '', email: '', phone: '', registeredCategories: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedVendor | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<CreatedVendor>('/api/vendors', {
        companyName: form.companyName,
        city: form.city || undefined,
        email: form.email,
        phone: form.phone || undefined,
        registeredCategories: form.registeredCategories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setCreated(res);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create vendor.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginBottom: 4 }}>Vendor created</h3>
          <div className="panel-sub">
            Share these credentials with {created.vendor.companyName} — the password is shown only once and cannot be
            recovered afterward (only its hash is stored).
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 14, marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Login email</div>
            <div className="mono" style={{ fontSize: 14, marginBottom: 10 }}>{created.vendor.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Password</div>
            <div className="mono" style={{ fontSize: 14 }}>{created.generatedPassword}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Add vendor</h3>
        <div className="panel-sub">Manual onboarding by the Auction Team — a real Vendor row, real login, real password (shown once).</div>
        <form onSubmit={submit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Company name</label>
            <input required value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Login email</label>
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Registered categories <span className="hint">comma-separated</span></label>
            <input
              required
              placeholder="Mechanical Spares, Safety & PPE"
              value={form.registeredCategories}
              onChange={(e) => set('registeredCategories', e.target.value)}
            />
          </div>
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
