'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeToggleCompact } from '@/components/ThemeProvider';

/* ── Alert Poller ──────────────────────────────────────────────── */
// Only show toasts for actions the user actually needs to know about
const TOAST_ACTIONS = new Set([
  'post', 'post_failed', 'auth_error', 'config_error', 'limit',
  'automation_block', 'rate_limit', 'duplicate', 'account_suspended',
]);

function getToastConfig(log: { level: string; action: string }): { type: 'success' | 'error' | 'warning' | 'info'; autoClose: number } {
  if (log.action === 'post') return { type: 'success', autoClose: 5000 };
  if (log.action === 'post_failed') return { type: 'error', autoClose: 8000 };
  if (log.action === 'auth_error') return { type: 'error', autoClose: 8000 };
  if (log.action === 'config_error') return { type: 'warning', autoClose: 6000 };
  if (log.action === 'limit') return { type: 'info', autoClose: 5000 };
  if (log.action === 'automation_block') return { type: 'warning', autoClose: 10000 };
  if (log.action === 'rate_limit')       return { type: 'info',    autoClose: 6000  };
  if (log.action === 'duplicate')        return { type: 'info',    autoClose: 4000  };
  if (log.action === 'account_suspended') return { type: 'error',  autoClose: 0     };
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
    const tick = () => { if (!document.hidden) poll(); };
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [poll]);

  return null;
}

/* ── Notification Bell ────────────────────────────────────────── */
interface Notification {
  _id: string;
  type: string;
  platform: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  actionLabel?: string;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      if (data.notifications) {
        // Only show unread notifications in the panel
        const unread = data.notifications.filter((n: Notification) => !n.read);
        setNotifications(unread);
        setUnreadCount(unread.length);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetch('/api/check-cookies').catch(() => {});
    const tick = () => { if (!document.hidden) fetchNotifications(); };
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Click a notification → mark read, remove from list, navigate to action URL
  const handleNotificationClick = async (n: Notification) => {
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n._id }) });
    } catch { /* silent */ }
    setNotifications(prev => prev.filter(item => item._id !== n._id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    setOpen(false);
    router.push(n.actionUrl || '/dashboard/accounts');
  };

  // Mark all read → clear all from panel
  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
    } catch { /* silent */ }
    setNotifications([]);
    setUnreadCount(0);
  };

  const getDotColor = (type: string) => {
    if (type === 'cookie_expired' || type === 'cookie_expiring_soon') return '#ed4245';
    if (type === 'account_removed') return '#fee75c';
    return '#0ea5e9';
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        title="Notifications"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, position: 'relative',
          background: open ? 'rgba(14, 165, 233, 0.14)' : 'rgba(14, 165, 233, 0.07)',
          border: `1px solid ${open ? 'rgba(14,165,233,0.38)' : 'var(--border-default)'}`,
          borderRadius: 10,
          color: open ? 'var(--accent-light)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 180ms',
          boxShadow: open ? '0 0 14px rgba(14,165,233,0.18)' : 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(14, 165, 233, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(14, 165, 233, 0.25)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.07)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width="18" height="18">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 18, height: 18, borderRadius: 9,
            background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px',
            boxShadow: '0 0 8px rgba(14,165,233,0.5)',
            border: '1.5px solid rgba(13,9,20,0.8)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 10,
          width: 368, maxHeight: 460,
          background: 'rgba(10, 15, 25, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(14,165,233,0.08), 0 0 40px rgba(14,165,233,0.08)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn 150ms ease-out',
        }}>
          {/* Top accent line */}
          <div style={{
            height: 2,
            background: 'linear-gradient(90deg, transparent, #0ea5e9, #2563eb, transparent)',
            flexShrink: 0,
          }} />
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(14, 165, 233, 0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 10,
                  background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                  color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 6px',
                  boxShadow: '0 0 8px rgba(14,165,233,0.4)',
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none', border: 'none',
                  color: '#0ea5e9', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', padding: '4px 8px',
                  borderRadius: 6,
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14, 165, 233, 0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '48px 20px', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                  opacity: 0.6,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth={1.5} width="22" height="22">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                </div>
                <div style={{ fontWeight: 600, color: '#b8a8d4', marginBottom: 4 }}>All caught up!</div>
                <div style={{ fontSize: 12 }}>No unread notifications</div>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n._id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(14, 165, 233, 0.04)',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14, 165, 233, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(14, 165, 233, 0.04)'; }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: getDotColor(n.type),
                    marginTop: 5, flexShrink: 0,
                    boxShadow: `0 0 6px ${getDotColor(n.type)}80`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: '#f0eaff',
                      marginBottom: 4,
                    }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#b8a8d4', lineHeight: 1.5 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 7, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {n.platform && (
                        <span style={{
                          textTransform: 'capitalize',
                          background: 'rgba(14, 165, 233, 0.12)',
                          color: '#38bdf8',
                          padding: '1px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid rgba(168, 85, 247, 0.2)',
                        }}>
                          {n.platform}
                        </span>
                      )}
                      <span style={{ color: '#6e5a8e' }}>{timeAgo(n.createdAt)}</span>
                      {(n.actionUrl || n.type === 'cookie_expired') && (
                        <span style={{
                          marginLeft: 'auto',
                          color: '#0ea5e9',
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {n.actionLabel || 'Reconnect'} →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
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
    href: '/dashboard/health',
    label: 'Health',
    desc: 'Account health scores',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="nav-icon">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

const SETTINGS_SUB_NAV = [
  { id: 'company-info', label: 'Company Info' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'subreddits', label: 'Subreddits' },
  { id: 'facebook-groups', label: 'Facebook Groups' },
  { id: 'post-limits', label: 'Limits & Thresholds' },
  { id: 'cron-schedule', label: 'Cron Schedule' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'prompt-template', label: 'Prompt Template' },
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

/* ── Blocked Screen ─────────────────────────────────────────────── */
function BlockedScreen({ blockedUntil, onSignOut }: { blockedUntil: string | null; onSignOut: () => void }) {
  const until = blockedUntil ? new Date(blockedUntil) : null;
  const untilStr = until
    ? until.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '24px',
    }}>
      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-card)',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Red top bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #ef4444, #dc2626, #ef4444)' }} />

        <div style={{ padding: '40px 36px 36px' }}>
          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 0 24px',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.5} width={30} height={30}>
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.03em' }}>
            Account Suspended
          </h1>

          {/* Status badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20, marginBottom: 20,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Access Restricted
            </span>
          </div>

          {/* Description */}
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
            Your access to <strong style={{ color: 'var(--text-primary)' }}>GetMention</strong> has been temporarily suspended.
            This may be due to a violation of our terms of service, unusual activity, or an admin action.
          </p>

          {/* Expiry */}
          {untilStr && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 20,
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={1.8} width={16} height={16} style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Suspension expires on <strong style={{ color: '#f59e0b' }}>{untilStr}</strong>
              </span>
            </div>
          )}

          {/* Contact box */}
          <div style={{
            padding: '16px', borderRadius: 10, marginBottom: 28,
            background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Think this is a mistake?
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6 }}>
              If you believe your account was suspended in error, our support team is here to help.
              Please reach out and include your account email.
            </p>
            <a
              href="mailto:dev@serpbay.com?subject=Account%20Suspension%20Appeal"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 8,
                background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)',
                color: '#38bdf8', fontSize: 13, fontWeight: 600,
                textDecoration: 'none', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,165,233,0.2)'; e.currentTarget.style.color = '#7dd3fc'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,165,233,0.12)'; e.currentTarget.style.color = '#38bdf8'; }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={14} height={14}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              dev@serpbay.com
            </a>
          </div>

          {/* Sign out */}
          <button
            onClick={onSignOut}
            style={{
              width: '100%', padding: '12px', fontSize: 14, fontWeight: 700,
              borderRadius: 10, cursor: 'pointer', transition: 'all 150ms',
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={16} height={16}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        GetMention · <a href="mailto:dev@serpbay.com" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>dev@serpbay.com</a>
      </p>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();

  const handleSignOut = () => setShowLogoutConfirm(true);
  const confirmSignOut = () => signOut(() => { window.location.href = '/login'; });
  const userName = user?.fullName || user?.firstName || '';
  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? '';
  const userInitial = (userName || userEmail || '?')[0].toUpperCase();

  // Check if account is blocked
  useEffect(() => {
    fetch('/api/me/status')
      .then(r => r.json())
      .then(data => {
        if (data.isBlocked) {
          setIsBlocked(true);
          setBlockedUntil(data.blockedUntil ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // Check admin status — cache '1' (admin confirmed) but never cache '0',
  // so newly promoted users see the admin nav on next page load without manual cache clearing.
  useEffect(() => {
    const cached = sessionStorage.getItem('gm_isAdmin');
    if (cached === '1') { setIsAdmin(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (!cancelled && res.ok) { setIsAdmin(true); sessionStorage.setItem('gm_isAdmin', '1'); }
      } catch { /* non-admin — no cache, will re-check on next mount */ }
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

  if (isBlocked) {
    return (
      <BlockedScreen
        blockedUntil={blockedUntil}
        onSignOut={handleSignOut}
      />
    );
  }

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
              <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#0ea5e9">G</text>
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
          {navItems.map((item) => {
            const active = isActive(item.href);
            const isSettings = item.href === '/dashboard/settings';
            const canExpand = isSettings && active && !collapsed;
            return (
              <div key={item.href}>
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <Link
                    href={item.href}
                    className={`nav-item ${active ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                    style={{ flex: 1 }}
                  >
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                  {canExpand && (
                    <button
                      onClick={(e) => { e.preventDefault(); setSettingsExpanded(!settingsExpanded); }}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 4, borderRadius: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}
                        style={{ transform: settingsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6,9 12,15 18,9" />
                      </svg>
                    </button>
                  )}
                </div>
                {canExpand && settingsExpanded && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 1,
                    padding: '4px 0 4px 0', marginLeft: 16,
                    borderLeft: '1px solid var(--border-subtle)',
                    overflow: 'hidden',
                  }}>
                    {SETTINGS_SUB_NAV.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => {
                          const el = document.getElementById(sub.id);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '5px 12px',
                          fontSize: 12, fontWeight: 400,
                          color: 'var(--text-muted)',
                          textAlign: 'left',
                          borderRadius: '0 4px 4px 0',
                          transition: 'all 0.12s',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(14,165,233,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {/* Discord-style user panel at bottom */}
          {!collapsed && userEmail && (
            <div style={{
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 'var(--radius-xs)',
              marginBottom: '4px',
              background: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--gradient-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {userInitial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {userName && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {userName}
                  </div>
                )}
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  Online
                </div>
              </div>
              <button
                onClick={handleSignOut}
                title="Sign out"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 120ms',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width="16" height="16">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16,17 21,12 16,7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
          {collapsed && userEmail && (
            <button
              onClick={handleSignOut}
              title="Sign out"
              style={{
                width: '100%', padding: '8px',
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', marginBottom: '4px',
                borderRadius: 'var(--radius-xs)',
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
              width="16"
              height="16"
              style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top bar with notification + theme toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '12px 24px 0',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <NotificationBell />
          <ThemeToggleCompact />
        </div>
        {children}
      </main>

      {/* ── Logout confirmation modal ── */}
      {showLogoutConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 150ms ease',
          }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)', padding: '32px 28px',
              maxWidth: 380, width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              width: 52, height: 52, borderRadius: '50%', margin: '0 auto 18px',
              background: 'rgba(239,68,68,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} width={24} height={24}>
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Sign out?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
              You'll need to sign back in to access your dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid var(--border-default)',
                  background: 'transparent', color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none',
                  background: '#ef4444', color: '#fff',
                  boxShadow: '0 2px 10px rgba(239,68,68,0.3)',
                }}
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
