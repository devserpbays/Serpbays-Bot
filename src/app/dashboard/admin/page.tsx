'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

/* ── Types ─────────────────────────────────────────────────────── */
interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  postsByPlatform: Record<string, number>;
  subscriptionBreakdown: Record<string, number>;
  activeUsersToday: number;
  newUsersThisWeek: number;
}

interface UserRow {
  userId: string;
  email: string;
  fullName: string;
  plan: string;
  status: string;
  companyName: string;
  platformCount: number;
  platforms: string[];
  accountCount: number;
  totalPosts: number;
  postsToday: number;
  isAdmin: boolean;
  createdAt: string | null;
}

interface UserDetail {
  settings: Record<string, unknown>;
  subscription: { plan: string; status: string; currentPeriodEnd?: string };
  recentPosts: { _id: string; platform: string; status: string; content: string; postedAt?: string; createdAt: string }[];
  recentLogs: { _id: string; platform: string; level: string; action: string; message: string; createdAt: string }[];
  totalPosts: number;
  postedCount: number;
  isAdmin: boolean;
  isBlocked: boolean;
  blockedUntil: string | null;
  email: string;
  fullName: string;
}

/* ── Constants ─────────────────────────────────────────────────── */
const PLAN_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  free:     { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', border: 'rgba(156,163,175,0.2)' },
  pro:      { bg: 'rgba(14,165,233,0.1)',  color: '#38bdf8', border: 'rgba(14,165,233,0.2)' },
  business: { bg: 'rgba(244,114,182,0.1)', color: '#f472b6', border: 'rgba(244,114,182,0.2)' },
};

const STATUS_COLORS: Record<string, string> = {
  active:     '#10b981',
  past_due:   '#f59e0b',
  canceled:   '#ef4444',
  trialing:   '#3b82f6',
  incomplete: '#6b7280',
  blocked:    '#ef4444',
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1d9bf0', facebook: '#1877f2', reddit: '#3b82f6',
  quora: '#2563eb', youtube: '#0ea5e9', pinterest: '#60a5fa',
};

const PLAN_PRICES: Record<string, number> = { free: 0, pro: 49, business: 149 };

/* ── Helpers ────────────────────────────────────────────────────── */
function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string, fallback?: string): string {
  const src = name || fallback || '?';
  const parts = src.trim().split(/\s+/);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : src.slice(0, 2).toUpperCase();
}

/* ── Copy button ────────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: copied ? '#10b981' : 'var(--text-muted)',
        padding: '2px 4px', borderRadius: 4, flexShrink: 0,
        transition: 'color 150ms', display: 'flex', alignItems: 'center',
      }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={12} height={12}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}>
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const [adminConfirm, setAdminConfirm] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users'),
      ]);
      if (statsRes.status === 403 || usersRes.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (statsRes.ok && usersRes.ok) {
        setStats(await statsRes.json());
        const ud = await usersRes.json();
        setUsers(ud.users || []);
        setLastRefresh(new Date());
      }
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openUser = async (user: UserRow) => {
    setSelectedUser(user);
    setEditingPlan(null);
    setAdminConfirm(false);
    setBlockConfirm(false);
    setDeleteConfirm(false);
    setUserDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.userId}`);
      if (res.ok) setUserDetail(await res.json());
    } catch { /* silent */ }
    setDetailLoading(false);
  };

  const savePlanChange = async () => {
    if (!selectedUser || !editingPlan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: editingPlan }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.userId === selectedUser.userId ? { ...u, plan: editingPlan } : u));
        setSelectedUser(s => s ? { ...s, plan: editingPlan } : s);
        setUserDetail(d => d ? { ...d, subscription: { ...d.subscription, plan: editingPlan } } : d);
        setEditingPlan(null);
        fetchData();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const toggleAdmin = async () => {
    if (!selectedUser || !userDetail) return;
    setTogglingAdmin(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !userDetail.isAdmin }),
      });
      if (res.ok) {
        const next = !userDetail.isAdmin;
        setUsers(prev => prev.map(u => u.userId === selectedUser.userId ? { ...u, isAdmin: next } : u));
        setSelectedUser(s => s ? { ...s, isAdmin: next } : s);
        setUserDetail(d => d ? { ...d, isAdmin: next } : d);
        setAdminConfirm(false);
      }
    } catch { /* silent */ }
    setTogglingAdmin(false);
  };

  const blockUser = async (days = 30) => {
    if (!selectedUser || !userDetail) return;
    setBlocking(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: true, days }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserDetail(d => d ? { ...d, isBlocked: true, blockedUntil: data.blockedUntil } : d);
        setUsers(prev => prev.map(u => u.userId === selectedUser.userId ? { ...u, status: 'blocked' } : u));
        setBlockConfirm(false);
      }
    } catch { /* silent */ }
    setBlocking(false);
  };

  const unblockUser = async () => {
    if (!selectedUser) return;
    setBlocking(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unblock: true }),
      });
      if (res.ok) {
        setUserDetail(d => d ? { ...d, isBlocked: false, blockedUntil: null } : d);
        setUsers(prev => prev.map(u => u.userId === selectedUser.userId ? { ...u, status: 'active' } : u));
      }
    } catch { /* silent */ }
    setBlocking(false);
  };

  const deleteUser = async () => {
    if (!selectedUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.userId}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.userId !== selectedUser.userId));
        setSelectedUser(null);
        setUserDetail(null);
        setDeleteConfirm(false);
        fetchData();
      }
    } catch { /* silent */ }
    setDeleting(false);
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (planFilter !== 'all') list = list.filter(u => u.plan === planFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.userId.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.companyName.toLowerCase().includes(q) ||
        u.platforms.some(p => p.includes(q))
      );
    }
    return list;
  }, [users, planFilter, search]);

  const totalRevenue = stats
    ? Object.entries(stats.subscriptionBreakdown).reduce((s, [p, c]) => s + (PLAN_PRICES[p] || 0) * c, 0)
    : 0;
  const totalSubUsers = stats
    ? Object.values(stats.subscriptionBreakdown).reduce((s, c) => s + c, 0)
    : 0;

  /* ── Access Denied ── */
  if (accessDenied) return (
    <div className="animate-fade-in">
      <div className="page-header"><h2>Admin Panel</h2><p>System administration</p></div>
      <div className="page-body">
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.5} width={28} height={28}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Access Denied</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            You do not have admin privileges. Contact the system administrator if you believe this is an error.
          </p>
        </div>
      </div>
    </div>
  );

  /* ── Loading ── */
  if (loading) return (
    <div className="animate-fade-in">
      <div className="page-header"><h2>Admin Panel</h2><p>Loading...</p></div>
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5} style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading admin data…</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* ── Page Header ── */}
      <div className="admin-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.03em' }}>
              Admin Panel
            </h2>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '3px 8px', borderRadius: 20,
              background: 'rgba(14,165,233,0.15)', color: 'var(--accent)',
              border: '1px solid rgba(14,165,233,0.25)',
            }}>
              Internal
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Last updated {formatDate(lastRefresh.toISOString())}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(14,165,233,0.08)', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'all 150ms', opacity: refreshing ? 0.6 : 1,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}
            style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="admin-tabs">
        {(['overview', 'users'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
              textTransform: 'capitalize',
              background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 150ms',
            }}
          >
            {tab === 'users' ? `Users (${users.length})` : 'Overview'}
          </button>
        ))}
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {[
                {
                  label: 'Total Users', value: stats?.totalUsers ?? 0,
                  sub: `+${stats?.newUsersThisWeek ?? 0} this week`,
                  color: '#38bdf8', bg: 'rgba(14,165,233,0.1)',
                  icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
                },
                {
                  label: 'Est. MRR', value: `$${totalRevenue.toLocaleString()}`,
                  sub: `${(stats?.subscriptionBreakdown?.pro ?? 0) + (stats?.subscriptionBreakdown?.business ?? 0)} paying`,
                  color: '#10b981', bg: 'rgba(16,185,129,0.1)',
                  icon: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
                },
                {
                  label: 'Active Today', value: stats?.activeUsersToday ?? 0,
                  sub: `of ${stats?.totalUsers ?? 0} total users`,
                  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',
                  icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
                },
                {
                  label: 'Comments Today', value: stats?.postsToday ?? 0,
                  sub: `${stats?.postsThisWeek ?? 0} this week`,
                  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',
                  icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
                },
              ].map(card => (
                <div key={card.label} style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${card.color}, transparent)`, opacity: 0.6 }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {card.label}
                    </span>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
                        {card.icon}
                      </svg>
                    </div>
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Plan distribution + Platform breakdown */}
            <div className="admin-overview-grid-2">
              {/* Plan distribution */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Plan Distribution
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {['business', 'pro', 'free'].map(plan => {
                    const count = stats?.subscriptionBreakdown[plan] || 0;
                    const pct = totalSubUsers > 0 ? Math.round((count / totalSubUsers) * 100) : 0;
                    const pc = PLAN_COLORS[plan];
                    const price = PLAN_PRICES[plan];
                    return (
                      <div key={plan}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                              color: pc.color, background: pc.bg, border: `1px solid ${pc.border}`,
                              borderRadius: 6, padding: '2px 10px',
                            }}>{plan}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{count}</span>
                            {price > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ${(count * price).toLocaleString()}/mo
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%', borderRadius: 3,
                            background: pc.color, transition: 'width 600ms ease',
                            minWidth: count > 0 ? 4 : 0,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  marginTop: 20, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Monthly Recurring Revenue</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981', letterSpacing: '-0.03em' }}>
                    ${totalRevenue.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Platform breakdown */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Comments by Platform
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(stats?.postsByPlatform || {}).sort((a, b) => b[1] - a[1]).map(([platform, count]) => {
                    const total = stats?.totalPosts || 1;
                    const pct = Math.round((count / total) * 100);
                    const color = PLATFORM_COLORS[platform] || 'var(--accent)';
                    return (
                      <div key={platform}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'capitalize' }}>{platform}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{count.toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 600ms ease' }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(stats?.postsByPlatform || {}).length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No data yet</div>
                  )}
                </div>
              </div>
            </div>

            {/* Admins quick list */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Admin Users
                </h3>
                <button
                  onClick={() => { setActiveTab('users'); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: '2px 6px',
                  }}
                >
                  Manage →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.filter(u => u.isAdmin).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                    No admin users yet (besides env ADMIN_USER_IDS)
                  </div>
                ) : (
                  users.filter(u => u.isAdmin).map(u => (
                    <div key={u.userId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                      }}>
                        {initials(u.fullName || u.companyName, u.email)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {u.fullName || u.companyName || 'Admin User'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.email || u.userId}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                      }}>Admin</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* ══════════════ USERS TAB ══════════════ */}
        {activeTab === 'users' && (
          <div className="admin-users-layout">

            {/* Left: table */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Search + filter bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, position: 'relative', minWidth: 220 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    placeholder="Search by name, email, company, platform…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
                      background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['all', 'free', 'pro', 'business'].map(p => (
                    <button key={p} onClick={() => setPlanFilter(p)} style={{
                      padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: planFilter === p
                        ? `1px solid ${p === 'all' ? 'var(--accent-border)' : (PLAN_COLORS[p]?.border || 'var(--accent-border)')}`
                        : '1px solid var(--border-subtle)',
                      background: planFilter === p
                        ? p === 'all' ? 'var(--accent-bg)' : PLAN_COLORS[p]?.bg
                        : 'transparent',
                      color: planFilter === p
                        ? p === 'all' ? 'var(--accent-light)' : PLAN_COLORS[p]?.color
                        : 'var(--text-muted)',
                      textTransform: 'capitalize',
                      transition: 'all 150ms',
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {/* Table header */}
                <div className="admin-user-table-header" style={{
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div>User / Email</div>
                  <div className="admin-col-hide-sm">Platforms</div>
                  <div className="admin-col-hide-md">Plan</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div style={{ textAlign: 'right' }}>Today</div>
                </div>

                {filteredUsers.length === 0 && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No users match your filter
                  </div>
                )}

                {filteredUsers.map(user => {
                  const isSelected = selectedUser?.userId === user.userId;
                  const pc = PLAN_COLORS[user.plan] || PLAN_COLORS.free;
                  const statusColor = STATUS_COLORS[user.status] || '#6b7280';
                  return (
                    <div
                      key={user.userId}
                      onClick={() => openUser(user)}
                      className="admin-user-table-row"
                      style={{
                        background: isSelected ? 'rgba(14,165,233,0.07)' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* User cell */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: `linear-gradient(135deg, ${statusColor}33, ${statusColor}55)`,
                          border: `1.5px solid ${statusColor}44`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: statusColor,
                        }}>
                          {initials(user.fullName || user.companyName, user.email)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {user.fullName || user.companyName || 'Unnamed'}
                            </span>
                            {user.isAdmin && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                              }}>Admin</span>
                            )}
                            {user.status === 'blocked' && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                              }}>Blocked</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email || user.userId.slice(0, 16) + '…'}
                          </div>
                        </div>
                      </div>

                      {/* Platforms */}
                      <div className="admin-col-hide-sm" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {user.platforms.length === 0 ? (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>None</span>
                        ) : user.platforms.slice(0, 3).map(p => (
                          <span key={p} style={{
                            fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
                            padding: '2px 6px', borderRadius: 4,
                            background: `${PLATFORM_COLORS[p] || 'var(--accent)'}18`,
                            color: PLATFORM_COLORS[p] || 'var(--accent)',
                          }}>{p}</span>
                        ))}
                        {user.platforms.length > 3 && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 4px' }}>+{user.platforms.length - 3}</span>
                        )}
                      </div>

                      {/* Plan badge */}
                      <div className="admin-col-hide-md">
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                          color: pc.color, background: pc.bg, border: `1px solid ${pc.border}`,
                          borderRadius: 6, padding: '3px 8px',
                        }}>{user.plan}</span>
                      </div>

                      {/* Comments */}
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {user.totalPosts.toLocaleString()}
                      </div>

                      {/* Today */}
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: user.postsToday > 0 ? '#10b981' : 'var(--text-muted)' }}>
                        {user.postsToday > 0 ? `+${user.postsToday}` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                Showing {filteredUsers.length} of {users.length} users
              </div>
            </div>

            {/* Right: detail panel */}
            {selectedUser && (
              <div className="admin-detail-panel">
                {/* Panel header */}
                <div style={{
                  padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
                  background: 'rgba(14,165,233,0.04)',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, var(--accent), #0284c7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: 'white',
                      }}>
                        {initials(selectedUser.fullName || selectedUser.companyName, selectedUser.email)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {selectedUser.fullName || selectedUser.companyName || 'Unknown User'}
                        </div>
                        {selectedUser.companyName && selectedUser.fullName && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedUser.companyName}</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[selectedUser.status] || '#6b7280', display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedUser.status}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedUser(null)} style={{
                      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)',
                      borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, flexShrink: 0,
                    }}>✕</button>
                  </div>

                  {/* Email row */}
                  {selectedUser.email && (
                    <div style={{
                      marginTop: 12, padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8} width={14} height={14} style={{ flexShrink: 0 }}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedUser.email}
                      </span>
                      <CopyBtn text={selectedUser.email} />
                    </div>
                  )}

                  {/* User ID row */}
                  <div style={{
                    marginTop: 6, padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8} width={14} height={14} style={{ flexShrink: 0 }}>
                      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
                    </svg>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedUser.userId}
                    </span>
                    <CopyBtn text={selectedUser.userId} />
                  </div>
                </div>

                {/* ── Sticky Action Bar: Block + Delete ── always visible, no scrolling needed */}
                <div style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'rgba(0,0,0,0.2)',
                  flexShrink: 0,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>
                    Admin Actions
                  </div>

                  {/* Block / Unblock row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    background: userDetail?.isBlocked ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.05)',
                    border: userDetail?.isBlocked ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(245,158,11,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={userDetail?.isBlocked ? '#ef4444' : '#f59e0b'} strokeWidth={1.8} width={14} height={14} style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: userDetail?.isBlocked ? '#ef4444' : 'var(--text-primary)', lineHeight: 1.2 }}>
                          {userDetail?.isBlocked ? 'User is Blocked' : 'Block User'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {userDetail?.isBlocked && userDetail.blockedUntil
                            ? `Until ${new Date(userDetail.blockedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Suspend — pauses all bot activity'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      {userDetail?.isBlocked ? (
                        <button onClick={unblockUser} disabled={blocking} style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                          cursor: blocking ? 'wait' : 'pointer', opacity: blocking ? 0.6 : 1,
                          color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        }}>
                          {blocking ? '…' : 'Unblock'}
                        </button>
                      ) : blockConfirm ? (
                        <>
                          <button onClick={() => setBlockConfirm(false)} style={{ padding: '5px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Cancel</button>
                          <button onClick={() => blockUser(30)} disabled={blocking} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: blocking ? 'wait' : 'pointer', opacity: blocking ? 0.6 : 1, color: '#fff', background: '#f59e0b', border: 'none' }}>
                            {blocking ? '…' : 'Block 30d'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setBlockConfirm(true)} style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                          cursor: 'pointer', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                        }}>
                          Block
                        </button>
                      )}
                    </div>
                  </div>
                  {blockConfirm && !userDetail?.isBlocked && (
                    <div style={{ fontSize: 11, color: '#f59e0b', padding: '4px 2px' }}>
                      ⚠ Will pause all bot activity for <strong>{userDetail?.email || selectedUser.userId.slice(0, 16)}</strong> for 30 days.
                    </div>
                  )}

                  {/* Delete row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.04)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.8} width={14} height={14} style={{ flexShrink: 0 }}>
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', lineHeight: 1.2 }}>Delete Account</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Permanently removes all data. Irreversible.</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      {deleteConfirm ? (
                        <>
                          <button onClick={() => setDeleteConfirm(false)} style={{ padding: '5px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Cancel</button>
                          <button onClick={deleteUser} disabled={deleting} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.6 : 1, color: '#fff', background: '#ef4444', border: 'none' }}>
                            {deleting ? '…' : 'Confirm Delete'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteConfirm(true)} style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                          cursor: 'pointer', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                        }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {deleteConfirm && (
                    <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 2px' }}>
                      ⚠ This will permanently delete <strong>{userDetail?.email || selectedUser.userId.slice(0, 16)}</strong> — all posts, logs, settings, and Clerk login.
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {detailLoading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 32 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5}
                        style={{ animation: 'spin 0.8s linear infinite', display: 'block', margin: '0 auto 10px' }}>
                        <circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2a10 10 0 0 1 10 10"/>
                      </svg>
                      Loading…
                    </div>
                  ) : userDetail ? (
                    <>
                      {/* Quick stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { label: 'Total Comments', value: userDetail.totalPosts.toLocaleString() },
                          { label: 'Published', value: userDetail.postedCount.toLocaleString() },
                          { label: 'Accounts', value: String((userDetail.settings.socialAccounts as unknown[])?.length || 0) },
                          { label: 'Platforms', value: String(selectedUser.platforms.length) },
                        ].map(s => (
                          <div key={s.label} style={{
                            padding: '10px 12px',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                          }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Connected Platforms */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Connected Platforms
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {(['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'] as const).map(platform => {
                            const accounts = ((userDetail.settings.socialAccounts as {platform: string; username?: string; displayName?: string; active?: boolean}[]) || []).filter(a => a.platform === platform);
                            const connected = accounts.length > 0;
                            const color = PLATFORM_COLORS[platform];
                            const activeCount = accounts.filter(a => a.active !== false).length;
                            return (
                              <div key={platform} style={{
                                padding: '8px 10px', borderRadius: 8,
                                background: connected ? `${color}0d` : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${connected ? `${color}30` : 'var(--border-subtle)'}`,
                                display: 'flex', alignItems: 'center', gap: 7,
                              }}>
                                <div style={{
                                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                  background: connected ? color : 'rgba(255,255,255,0.15)',
                                }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: connected ? color : 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    {platform}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {connected
                                      ? accounts[0].username || accounts[0].displayName
                                        ? `@${accounts[0].username || accounts[0].displayName}${accounts.length > 1 ? ` +${accounts.length - 1}` : ''}${activeCount < accounts.length ? ' (paused)' : ''}`
                                        : `${accounts.length} account${accounts.length > 1 ? 's' : ''}`
                                      : 'Not connected'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Change plan */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Subscription Plan
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: editingPlan && editingPlan !== userDetail.subscription.plan ? 8 : 0 }}>
                          {['free', 'pro', 'business'].map(plan => {
                            const pc = PLAN_COLORS[plan];
                            const isCurrent = (editingPlan || userDetail.subscription.plan) === plan;
                            return (
                              <button key={plan} onClick={() => setEditingPlan(plan)} style={{
                                flex: 1, padding: '7px 0',
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                cursor: 'pointer', borderRadius: 6, transition: 'all 150ms',
                                color: pc.color,
                                background: isCurrent ? pc.bg : 'transparent',
                                border: isCurrent ? `1px solid ${pc.border}` : '1px solid var(--border-subtle)',
                                outline: isCurrent ? `2px solid ${pc.color}40` : 'none',
                                outlineOffset: 1,
                              }}>{plan}</button>
                            );
                          })}
                        </div>
                        {editingPlan && editingPlan !== userDetail.subscription.plan && (
                          <button onClick={savePlanChange} disabled={saving} style={{
                            width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
                            color: '#fff', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                            border: 'none', borderRadius: 6, cursor: saving ? 'wait' : 'pointer',
                            opacity: saving ? 0.7 : 1, transition: 'all 150ms',
                          }}>
                            {saving ? 'Saving…' : `Confirm → ${editingPlan}`}
                          </button>
                        )}
                      </div>

                      {/* Admin toggle */}
                      <div style={{
                        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                        border: userDetail.isAdmin ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border-subtle)',
                      }}>
                        <div style={{
                          padding: '12px 14px',
                          background: userDetail.isAdmin ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke={userDetail.isAdmin ? '#f59e0b' : 'var(--text-muted)'} strokeWidth={1.8} width={14} height={14}>
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                              </svg>
                              <span style={{ fontSize: 12, fontWeight: 600, color: userDetail.isAdmin ? '#f59e0b' : 'var(--text-primary)' }}>
                                {userDetail.isAdmin ? 'Admin User' : 'Standard User'}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {userDetail.isAdmin
                                ? 'Has full admin panel access'
                                : 'No admin privileges — can grant to manage the platform'}
                            </div>
                          </div>
                          {!adminConfirm ? (
                            <button
                              onClick={() => setAdminConfirm(true)}
                              style={{
                                padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                                cursor: 'pointer', flexShrink: 0, transition: 'all 150ms',
                                color: userDetail.isAdmin ? '#ef4444' : '#f59e0b',
                                background: userDetail.isAdmin ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                border: userDetail.isAdmin ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(245,158,11,0.25)',
                              }}
                            >
                              {userDetail.isAdmin ? 'Revoke' : 'Grant'}
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => setAdminConfirm(false)}
                                style={{
                                  padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                                  cursor: 'pointer', background: 'transparent',
                                  color: 'var(--text-muted)', border: '1px solid var(--border-subtle)',
                                }}
                              >Cancel</button>
                              <button
                                onClick={toggleAdmin}
                                disabled={togglingAdmin}
                                style={{
                                  padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                                  cursor: togglingAdmin ? 'wait' : 'pointer',
                                  opacity: togglingAdmin ? 0.6 : 1,
                                  color: '#fff',
                                  background: userDetail.isAdmin ? '#ef4444' : '#f59e0b',
                                  border: 'none',
                                }}
                              >
                                {togglingAdmin ? '…' : 'Confirm'}
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Email tip for granting admin */}
                        {!userDetail.isAdmin && adminConfirm && userDetail.email && (
                          <div style={{
                            padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)',
                            background: 'rgba(245,158,11,0.04)',
                            borderTop: '1px solid rgba(245,158,11,0.15)',
                          }}>
                            Granting admin to <strong style={{ color: '#f59e0b' }}>{userDetail.email}</strong>
                          </div>
                        )}
                      </div>

                      {/* Recent comments */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Recent Comments ({userDetail.recentPosts.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {userDetail.recentPosts.slice(0, 8).map(post => (
                            <div key={post._id} style={{
                              padding: '8px 10px', borderRadius: 6,
                              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                              fontSize: 12,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
                                  color: PLATFORM_COLORS[post.platform] || 'var(--accent)',
                                  background: `${PLATFORM_COLORS[post.platform] || 'var(--accent)'}18`,
                                  padding: '1px 6px', borderRadius: 4,
                                }}>{post.platform}</span>
                                <span style={{
                                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                  background: post.status === 'posted' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                                  color: post.status === 'posted' ? '#10b981' : 'var(--text-muted)',
                                }}>{post.status}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(post.createdAt)}</span>
                              </div>
                              <div style={{ color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {post.content?.slice(0, 70) || '—'}
                              </div>
                            </div>
                          ))}
                          {userDetail.recentPosts.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No comments yet</div>
                          )}
                        </div>
                      </div>

                      {/* Recent activity */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Activity Logs ({userDetail.recentLogs.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {userDetail.recentLogs.slice(0, 8).map(log => {
                            const lc: Record<string, string> = { error: '#ef4444', warn: '#f59e0b', success: '#10b981', info: '#60a5fa' };
                            return (
                              <div key={log._id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 6,
                                background: 'rgba(255,255,255,0.015)', fontSize: 12,
                              }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: lc[log.level] || '#6b7280', flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize', minWidth: 52, fontSize: 11 }}>{log.platform}</span>
                                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDate(log.createdAt)}</span>
                              </div>
                            );
                          })}
                          {userDetail.recentLogs.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No activity</div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
