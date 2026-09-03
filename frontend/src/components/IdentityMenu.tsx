import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function IdentityMenu() {
  const { auth, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!auth) return null;
  const displayName = auth.kind === 'team' ? auth.team?.name : auth.vendor?.companyName;
  const roleTag = auth.kind === 'team' ? 'Auction Team' : 'Vendor';
  if (!displayName) return null;

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        className="identity-chip"
        style={{ border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="avatar">{initials(displayName)}</div>
        <div>
          <div style={{ fontWeight: 500, textAlign: 'left' }}>{displayName}</div>
          <div className="role-tag">{roleTag}</div>
        </div>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 200,
            background: 'var(--paper-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            zIndex: 50,
            padding: 6,
          }}
        >
          {auth.kind === 'vendor' && (
            <>
              <MenuItem label="My Profile" onClick={() => go('/vendor/profile')} />
              <MenuItem label="My Activity" onClick={() => go('/vendor/activity')} />
              <div style={{ height: 1, background: 'var(--line-soft)', margin: '5px 4px' }} />
            </>
          )}
          <MenuItem
            label="Sign out"
            onClick={() => {
              setOpen(false);
              signOut();
              navigate('/');
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        border: 'none',
        background: 'transparent',
        borderRadius: 'var(--r-sm)',
        fontSize: 12.5,
        cursor: 'pointer',
        color: 'var(--text)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
