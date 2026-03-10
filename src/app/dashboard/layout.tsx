'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/* ── Alert Poller ──────────────────────────────────────────────── */
// Only show toasts for actions the user actually needs to know about
const TOAST_ACTIONS = new Set(['post', 'post_failed', 'auth_error', 'config_error', 'limit']);

function getToastConfig(log: { level: string; action: string }): { type: 'success' | 'error' | 'warning' | 'info'; autoClose: number } {
  if (log.action === 'post') return { type: 'success', autoClose: 5000 };
  if (log.action === 'post_failed') return { type: 'error', autoClose: 8000 };
  if (log.action === 'auth_error') return { type: 'error', autoClose: 8000 };
  if (log.action === 'config_error') return { type: 'warning', autoClose: 6000 };
  if (log.action === 'limit') return { type: 'info', autoClose: 5000 };
  if (log.level === 'error') return { type: 'error', autoClose: 8000 };
  if (log.level === 'warn') return { type: 'warning', autoClose: 6000 };
  if (log.level === 'success') return { type: 'success', autoClose: 5000 };
  return { type: 'info', autoClose: 4000 };
}

function AlertPoller() {
  const lastCheck = useRef<string>(new Date().toISOString());
  const seenIds = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?limit=10&since=${encodeURIComponent(lastCheck.current)}`);
      if (!res.ok) return;
      const data = await res.json();
      const logs: { _id: string; level: string; action: string; message: string; platform: string; timestamp: string }[] = data.logs || [];

      for (const log of logs.reverse()) {
        if (seenIds.current.has(log._id)) continue;
        if (!TOAST_ACTIONS.has(log.action) && log.level !== 'error' && log.level !== 'success') continue;
        seenIds.current.add(log._id);

        const platform = log.platform ? log.platform.charAt(0).toUpperCase() + log.platform.slice(1) : '';
        const { type, autoClose } = getToastConfig(log);
        const prefix = platform ? `[${platform}] ` : '';
        toast(`${prefix}${log.message}`, { type, autoClose });
      }

      lastCheck.current = new Date().toISOString();

      // Keep seenIds from growing forever
      if (seenIds.current.size > 200) {
        const arr = [...seenIds.current];
        seenIds.current = new Set(arr.slice(-100));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [poll]);

  return null;
}

/* ── Nav items ─────────────────────────────────────────────────── */
const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Overview',
    desc: 'Stats & health',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/dashboard/pipeline',
    label: 'Pipeline',
    desc: 'Scrape & evaluate',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/accounts',
    label: 'Accounts',
    desc: 'Connect platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    desc: 'Configure bot',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/billing',
    label: 'Billing',
    desc: 'Plan & usage',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    href: '/dashboard/logs',
    label: 'Logs',
    desc: 'Activity history',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10,9 9,9 8,9" />
      </svg>
    ),
  },
];

const ADMIN_NAV_ITEM = {
  href: '/dashboard/admin',
  label: 'Admin',
  desc: 'System admin',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const userName = user?.fullName || user?.firstName || '';
  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? '';
  const userInitial = (userName || userEmail || '?')[0].toUpperCase();

  // Check admin status on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (!cancelled && res.ok) setIsAdmin(true);
      } catch { /* not admin */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const navItems = useMemo(() => {
    if (isAdmin) return [...NAV_ITEMS, ADMIN_NAV_ITEM];
    return NAV_ITEMS;
  }, [isAdmin]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="dashboard-layout">
      <AlertPoller />
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        draggable={false}
        pauseOnHover
        theme="dark"
        limit={5}
        style={{ zIndex: 99999 }}
      />
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg viewBox="0 0 64 64" width="16" height="16">
              <rect x="4" y="4" width="56" height="46" rx="14" fill="white" />
              <polygon points="18,50 28,50 20,60" fill="white" />
              <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#7c3aed">G</text>
            </svg>
          </div>
          {!collapsed && (
            <div className="sidebar-brand">
              <h1>GetMention</h1>
              <span>Engagement Bot</span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {!collapsed && <div className="sidebar-section-label">Navigation</div>}
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && userEmail && (
            <div style={{
              padding: '12px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {userInitial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {userName && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                      {userName}
                    </div>
                  )}
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {userEmail}
                  </div>
                </div>
              </div>
              <button
                onClick={() => signOut(() => { window.location.href = '/login'; })}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
              >
                Sign out
              </button>
            </div>
          )}
          {collapsed && userEmail && (
            <button
              onClick={() => signOut(() => { window.location.href = '/login'; })}
              title="Sign out"
              style={{
                width: '100%', padding: '10px',
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', marginBottom: '4px',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width="18" height="18">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              width="18"
              height="18"
              style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform 250ms' }}
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {children}
      </main>
    </div>
  );
}
