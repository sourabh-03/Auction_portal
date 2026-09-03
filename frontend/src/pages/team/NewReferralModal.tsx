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
  width: 560,
  maxWidth: '92vw',
  maxHeight: '86vh',
  overflowY: 'auto',
};

export function NewReferralModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    category: '',
    purchaseCode: '',
    department: '',
    costCentre: '',
    tcBuyerName: '',
    qtyDescription: '',
    referralNote: '',
    resultsNeededBy: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/threads', {
        ...form,
        resultsNeededBy: form.resultsNeededBy ? new Date(form.resultsNeededBy).toISOString() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create referral.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>New referral</h3>
        <div className="panel-sub">§6.2 — manual data entry by the Auction Team; a thread code is assigned automatically.</div>
        <form onSubmit={submit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Title</label>
            <input required value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Category</label>
              <input required value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="field">
              <label>Purchase code</label>
              <input required value={form.purchaseCode} onChange={(e) => set('purchaseCode', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Department</label>
              <input required value={form.department} onChange={(e) => set('department', e.target.value)} />
            </div>
            <div className="field">
              <label>Cost centre</label>
              <input required value={form.costCentre} onChange={(e) => set('costCentre', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>TC buyer name</label>
              <input required value={form.tcBuyerName} onChange={(e) => set('tcBuyerName', e.target.value)} />
            </div>
            <div className="field">
              <label>Quantity description</label>
              <input required value={form.qtyDescription} onChange={(e) => set('qtyDescription', e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Referral note</label>
            <textarea rows={3} value={form.referralNote} onChange={(e) => set('referralNote', e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Results needed by</label>
            <input type="date" value={form.resultsNeededBy} onChange={(e) => set('resultsNeededBy', e.target.value)} />
          </div>
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
