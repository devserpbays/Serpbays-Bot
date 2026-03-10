'use client';

import { useState, useEffect, useCallback } from 'react';

/* ── Types ───────────────────────────────────────────────────────── */
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
}

const PLAN_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  free: { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', border: 'rgba(156,163,175,0.2)' },
  pro: { bg: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: 'rgba(139,92,246,0.2)' },
  business: { bg: 'rgba(236,72,153,0.1)', color: '#f472b6', border: 'rgba(236,72,153,0.2)' },
};

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  past_due: '#f59e0b',
  canceled: '#ef4444',
  trialing: '#3b82f6',
  incomplete: '#6b7280',
};

const PLAN_PRICES: Record<string, number> = { free: 0, pro: 49, business: 149 };

/* ── Main Admin Page ─────────────────────────────────────────────── */
export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingPlan, setEditingPlan] = useState<{ userId: string; plan: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users'),
      ]);
      if (statsRes.status === 403 || usersRes.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      if (!statsRes.ok || !usersRes.ok) {
        setLoading(false);
        return;
      }
      const statsData = await statsRes.json();
      const usersData = await usersRes.json();
      setStats(statsData);
      setUsers(usersData.users || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchUserDetail = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserDetail(null);
      return;
    }
    setExpandedUser(userId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUserDetail(data);
      }
    } catch { /* silent */ }
    setDetailLoading(false);
  };

  const savePlanChange = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editingPlan.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: editingPlan.plan }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.userId === editingPlan.userId ? { ...u, plan: editingPlan.plan } : u
          )
        );
        setEditingPlan(null);
        // Refresh stats
        fetchData();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const toggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    setTogglingAdmin(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.userId === userId ? { ...u, isAdmin: !currentIsAdmin } : u));
        if (userDetail && expandedUser === userId) {
          setUserDetail({ ...userDetail, isAdmin: !currentIsAdmin });
        }
      }
    } catch { /* silent */ }
    setTogglingAdmin(null);
  };

  /* ── Access Denied ── */
  if (accessDenied) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h2>Admin Panel</h2>
          <p>System administration</p>
        </div>
        <div className="page-body">
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '60px 40px',
            textAlign: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.5} width={48} height={48} style={{ margin: '0 auto 16px' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Access Denied
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              You do not have admin privileges. Contact the system administrator if you believe this is an error.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h2>Admin Panel</h2>
          <p>System administration</p>
        </div>
        <div className="page-body" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading admin data...</div>
        </div>
      </div>
    );
  }

  const totalRevenue = stats
    ? Object.entries(stats.subscriptionBreakdown).reduce(
        (sum, [plan, count]) => sum + (PLAN_PRICES[plan] || 0) * count,
        0
      )
    : 0;

  const totalSubUsers = stats
    ? Object.values(stats.subscriptionBreakdown).reduce((s, c) => s + c, 0)
    : 0;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Admin Panel</h2>
        <p>System-wide overview and user management</p>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Stats Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            {
              label: 'Total Users',
              value: stats?.totalUsers ?? 0,
              sub: `+${stats?.newUsersThisWeek ?? 0} this week`,
              color: '#a78bfa',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}>
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              ),
            },
            {
              label: 'Total Posts',
              value: stats?.totalPosts ?? 0,
              sub: `${stats?.postsToday ?? 0} posted today`,
              color: '#3b82f6',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              ),
            },
            {
              label: 'Active Today',
              value: stats?.activeUsersToday ?? 0,
              sub: `of ${stats?.totalUsers ?? 0} users`,
              color: '#10b981',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}>
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              ),
            },
            {
              label: 'Est. MRR',
              value: `$${totalRevenue.toLocaleString()}`,
              sub: `${(stats?.subscriptionBreakdown?.pro ?? 0) + (stats?.subscriptionBreakdown?.business ?? 0)} paid users`,
              color: '#f59e0b',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}>
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              ),
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>{card.label}</span>
                <div style={{ color: card.color, opacity: 0.7 }}>{card.icon}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Plan Distribution ── */}
        {stats && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              Plan Distribution
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['free', 'pro', 'business'].map((plan) => {
                const count = stats.subscriptionBreakdown[plan] || 0;
                const pct = totalSubUsers > 0 ? Math.round((count / totalSubUsers) * 100) : 0;
                const colors = PLAN_COLORS[plan];
                return (
                  <div key={plan}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                          color: colors.color,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 6,
                          padding: '2px 10px',
                          letterSpacing: '0.04em',
                        }}>
                          {plan}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {count} user{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{
                      height: 6, borderRadius: 3,
                      background: 'rgba(255,255,255,0.04)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        borderRadius: 3,
                        background: colors.color,
                        transition: 'width 600ms ease',
                        minWidth: count > 0 ? 4 : 0,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Posts by Platform ── */}
        {stats && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              Posts by Platform
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {Object.entries(stats.postsByPlatform)
                .sort((a, b) => b[1] - a[1])
                .map(([platform, count]) => (
                  <div
                    key={platform}
                    style={{
                      textAlign: 'center',
                      padding: '14px 10px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                      {count.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textTransform: 'capitalize' }}>
                      {platform}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Users Table ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Users ({users.length})
            </h3>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 90px 120px 80px 80px 80px',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(255,255,255,0.02)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            <div>User ID</div>
            <div>Company</div>
            <div>Plan</div>
            <div>Platforms</div>
            <div style={{ textAlign: 'center' }}>Posts</div>
            <div style={{ textAlign: 'center' }}>Today</div>
            <div style={{ textAlign: 'center' }}>Actions</div>
          </div>

          {/* User rows */}
          {users.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No users found
            </div>
          )}
          {users.map((user) => {
            const isExpanded = expandedUser === user.userId;
            const planColors = PLAN_COLORS[user.plan] || PLAN_COLORS.free;
            const statusColor = STATUS_COLORS[user.status] || '#6b7280';

            return (
              <div key={user.userId}>
                {/* Main row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr 90px 120px 80px 80px 80px',
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    alignItems: 'center',
                    fontSize: 13,
                    transition: 'background 150ms',
                    background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => fetchUserDetail(user.userId)}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: statusColor,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {user.userId.length > 20
                        ? `${user.userId.slice(0, 8)}...${user.userId.slice(-6)}`
                        : user.userId}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.companyName || '--'}
                    </span>
                    {user.isAdmin && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                        color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em',
                        flexShrink: 0,
                      }}>Admin</span>
                    )}
                  </div>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      color: planColors.color,
                      background: planColors.bg,
                      border: `1px solid ${planColors.border}`,
                      borderRadius: 6,
                      padding: '2px 8px',
                      letterSpacing: '0.04em',
                    }}>
                      {user.plan}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {user.platforms.map((p) => (
                      <span key={p} style={{
                        fontSize: 10, color: 'var(--text-muted)',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 4,
                        padding: '1px 5px',
                        textTransform: 'capitalize',
                      }}>
                        {p}
                      </span>
                    ))}
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {user.totalPosts.toLocaleString()}
                  </div>
                  <div style={{ textAlign: 'center', color: user.postsToday > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>
                    {user.postsToday}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); fetchUserDetail(user.userId); }}
                      style={{
                        background: isExpanded ? 'var(--accent-bg)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isExpanded ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: isExpanded ? 'var(--accent-light)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 150ms',
                      }}
                    >
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    padding: '20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'rgba(255,255,255,0.01)',
                  }}>
                    {detailLoading ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
                        Loading user details...
                      </div>
                    ) : userDetail ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* User info row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                          <InfoCard label="Company" value={(userDetail.settings.companyName as string) || 'Not set'} />
                          <InfoCard label="Plan" value={userDetail.subscription.plan} />
                          <InfoCard label="Status" value={userDetail.subscription.status} />
                          <InfoCard label="Total Posts" value={String(userDetail.totalPosts)} />
                          <InfoCard label="Posted" value={String(userDetail.postedCount)} />
                          <InfoCard
                            label="Accounts"
                            value={String((userDetail.settings.socialAccounts as unknown[])?.length || 0)}
                          />
                        </div>

                        {/* Plan override */}
                        <div style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '14px 16px',
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Change Plan
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {['free', 'pro', 'business'].map((plan) => {
                              const colors = PLAN_COLORS[plan];
                              const isCurrentEdit = editingPlan?.userId === user.userId && editingPlan?.plan === plan;
                              const isCurrent = !editingPlan && userDetail.subscription.plan === plan;
                              return (
                                <button
                                  key={plan}
                                  onClick={() => setEditingPlan({ userId: user.userId, plan })}
                                  style={{
                                    fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                                    color: colors.color,
                                    background: isCurrentEdit || isCurrent ? colors.bg : 'transparent',
                                    border: `1px solid ${isCurrentEdit || isCurrent ? colors.border : 'var(--border-subtle)'}`,
                                    borderRadius: 6,
                                    padding: '6px 14px',
                                    cursor: 'pointer',
                                    transition: 'all 150ms',
                                    letterSpacing: '0.04em',
                                    outline: isCurrentEdit ? `2px solid ${colors.color}` : 'none',
                                    outlineOffset: 1,
                                  }}
                                >
                                  {plan}
                                  {isCurrent && ' (current)'}
                                </button>
                              );
                            })}
                            {editingPlan?.userId === user.userId && editingPlan.plan !== userDetail.subscription.plan && (
                              <button
                                onClick={savePlanChange}
                                disabled={saving}
                                style={{
                                  fontSize: 12, fontWeight: 700,
                                  color: '#fff',
                                  background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '6px 16px',
                                  cursor: saving ? 'wait' : 'pointer',
                                  opacity: saving ? 0.6 : 1,
                                  transition: 'all 150ms',
                                }}
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Admin role toggle */}
                        <div style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '14px 16px',
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                Admin Access
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                {userDetail.isAdmin
                                  ? 'This user has admin privileges and can access the admin panel.'
                                  : 'Grant this user admin privileges to manage the system.'}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleAdmin(user.userId, userDetail.isAdmin); }}
                              disabled={togglingAdmin === user.userId}
                              style={{
                                padding: '8px 20px',
                                fontSize: 12,
                                fontWeight: 700,
                                borderRadius: 8,
                                cursor: togglingAdmin === user.userId ? 'wait' : 'pointer',
                                transition: 'all 150ms',
                                flexShrink: 0,
                                marginLeft: 16,
                                opacity: togglingAdmin === user.userId ? 0.6 : 1,
                                background: userDetail.isAdmin ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                color: userDetail.isAdmin ? '#ef4444' : '#f59e0b',
                                border: userDetail.isAdmin ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(245,158,11,0.25)',
                              }}
                            >
                              {togglingAdmin === user.userId
                                ? 'Saving...'
                                : userDetail.isAdmin
                                  ? 'Remove Admin'
                                  : 'Make Admin'}
                            </button>
                          </div>
                        </div>

                        {/* Recent posts */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Recent Posts ({userDetail.recentPosts.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                            {userDetail.recentPosts.slice(0, 10).map((post) => (
                              <div
                                key={post._id}
                                style={{
                                  display: 'flex', gap: 10, alignItems: 'center',
                                  padding: '8px 12px',
                                  background: 'rgba(255,255,255,0.015)',
                                  borderRadius: 6,
                                  fontSize: 12,
                                }}
                              >
                                <span style={{
                                  textTransform: 'capitalize', fontWeight: 600,
                                  color: 'var(--text-secondary)', minWidth: 60,
                                }}>
                                  {post.platform}
                                </span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '1px 6px',
                                  borderRadius: 4,
                                  background: post.status === 'posted' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                                  color: post.status === 'posted' ? '#10b981' : 'var(--text-muted)',
                                }}>
                                  {post.status}
                                </span>
                                <span style={{
                                  flex: 1, color: 'var(--text-muted)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {post.content?.slice(0, 80)}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                                  {formatDate(post.createdAt)}
                                </span>
                              </div>
                            ))}
                            {userDetail.recentPosts.length === 0 && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>
                                No posts yet
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Recent activity logs */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Recent Activity ({userDetail.recentLogs.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                            {userDetail.recentLogs.slice(0, 10).map((log) => {
                              const levelColors: Record<string, string> = {
                                error: '#ef4444', warn: '#f59e0b', success: '#10b981', info: '#6b7280',
                              };
                              return (
                                <div
                                  key={log._id}
                                  style={{
                                    display: 'flex', gap: 10, alignItems: 'center',
                                    padding: '8px 12px',
                                    background: 'rgba(255,255,255,0.015)',
                                    borderRadius: 6,
                                    fontSize: 12,
                                  }}
                                >
                                  <span style={{
                                    width: 6, height: 6, borderRadius: 3,
                                    background: levelColors[log.level] || '#6b7280',
                                    flexShrink: 0,
                                  }} />
                                  <span style={{
                                    textTransform: 'capitalize', fontWeight: 600,
                                    color: 'var(--text-secondary)', minWidth: 60,
                                  }}>
                                    {log.platform}
                                  </span>
                                  <span style={{
                                    flex: 1, color: 'var(--text-muted)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {log.message}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                                    {formatDate(log.createdAt)}
                                  </span>
                                </div>
                              );
                            })}
                            {userDetail.recentLogs.length === 0 && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>
                                No activity logs
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Helper Components ─────────────────────────────────────────── */
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
        {value}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
