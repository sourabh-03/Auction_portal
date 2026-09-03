import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

export default function Login() {
  const { loginTeam, loginVendor } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<'team' | 'vendor'>('team');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (role === 'team') {
        await loginTeam(email, password);
        navigate('/desk');
      } else {
        await loginVendor(email, password);
        navigate('/vendor');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brandmark">
          <div className="dot" />
          <span>ProcEaze</span>
          <small>&nbsp;AUCTION DESK</small>
        </div>
        <div className="hero-copy">
          <h1>Where a sourced rate becomes a bid.</h1>
          <p>
            The live reverse-auction console for Techno-Commercial sourcing — configure, run, and hand off English
            Reverse and Japanese Descending-Clock auctions across referred purchase requisitions.
          </p>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--on-dark-faint)', borderTop: '1px solid var(--steel-line)', paddingTop: 14, marginTop: 36 }}>
          Module scope: Auction Team referral → live bidding → result hand-off to the Techno-Commercial Desk.
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <h2>Sign in</h2>
          <div className="sub">Choose how you're entering the Auction Desk.</div>

          <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 18 }}>
            <button
              type="button"
              className={role === 'team' ? 'btn btn-dark' : 'btn btn-secondary'}
              onClick={() => setRole('team')}
            >
              Auction Team
            </button>
            <button
              type="button"
              className={role === 'vendor' ? 'btn btn-dark' : 'btn btn-secondary'}
              onClick={() => setRole('vendor')}
            >
              Vendor
            </button>
          </div>

          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-dark btn-block" disabled={busy} type="submit">
              {busy ? 'Signing in…' : role === 'team' ? 'Enter Auction Desk' : 'Enter Vendor Portal'}
            </button>
            {error && <div className="auth-error">{error}</div>}
          </form>

          <div className="auth-note" style={{ marginTop: 22, fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-faint)', padding: '12px 14px', background: 'var(--paper-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)' }}>
            Every role is enforced server-side per session — a vendor session only ever sees the auctions its company
            was actually invited to.
          </div>
        </div>
      </div>
    </div>
  );
}
