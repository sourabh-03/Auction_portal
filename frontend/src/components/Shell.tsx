import React from 'react';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { IdentityMenu } from './IdentityMenu';

export function Shell({ children, wide, crumbs }: { children: React.ReactNode; wide?: boolean; crumbs?: React.ReactNode }) {
  const { auth } = useAuth();

  return (
    <div className="shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header className="topbar">
        <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="brandmark">
            <div className="dot" />
            <span>ProcEaze</span>
            <small>&nbsp;AUCTION DESK</small>
          </div>
          {crumbs}
        </div>
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {auth && <NotificationBell />}
          <IdentityMenu />
        </div>
      </header>
      <main className={`view${wide ? ' wide' : ''}`}>{children}</main>
    </div>
  );
}
