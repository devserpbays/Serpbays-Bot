'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

interface AccountHealth {
  platform: string;
  username: string;
  displayName: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'paused';
  reasons: string[];
  autoPaused: boolean;
  totalPosts: number;
  totalErrors: number;
  errorRate: number;
  errorCount: number;
  backoffUntil: string | null;
  lastPostedAt: string | null;
  lastErrorAt: string | null;
  connectedAt: string | null;
  recentPosts: number;
}

interface Summary {
  healthy: number;
  warning: number;
  critical: number;
  paused: number;
  total: number;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  reddit: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  quora: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" />
    </svg>
  ),
  pinterest: (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" />
    </svg>
  ),
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1d9bf0', reddit: '#3b82f6', facebook: '#1877f2',
  youtube: '#ef4444', quora: '#2563eb', pinterest: '#60a5fa',
};

function healthColor(score: number, paused: boolean): { color: string; bg: string; border: string } {
  if (paused)     return { color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' };
  if (score < 25) return { color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' };
  if (score < 50) return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' };
  if (score < 75) return { color: '#38bdf8', bg: 'rgba(14,165,233,0.1)',  border: 'rgba(14,165,233,0.25)' };
  return              { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)' };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Summary card ────────────────────────────────────────────────────── */
function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)', padding: '18px 24px',
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120,
    }}>
      <span style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

/* ── Score bar ───────────────────────────────────────────────────────── */
function ScoreBar({ score, paused }: { score: number; paused: boolean }) {
  const { color } = healthColor(score, paused);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${paused ? 0 : score}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 32 }}>{paused ? '—' : `${score}`}</span>
    </div>
  );
}

export default function HealthPage() {
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [summary, setSummary]   = useState<Summary>({ healthy: 0, warning: 0, critical: 0, paused: 0, total: 0 });
  const [loading, setLoading]   = useState(true);
  const [resuming, setResuming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/account-health');
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setSummary(data.summary ?? { healthy: 0, warning: 0, critical: 0, paused: 0, total: 0 });
    } catch {
      toast.error('Failed to load account health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resume = async (platform: string) => {
    setResuming(platform);
    try {
      const res = await fetch('/api/account-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${platform} account resumed (health reset to ${data.healthScore})`);
        load();
      } else {
        toast.error(data.error || 'Failed to resume account');
      }
    } catch {
      toast.error('Failed to resume account');
    } finally {
      setResuming(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', color: 'var(--text-secondary)', fontSize: 14 }}>
        Loading account health...
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Account Health</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          No connected accounts found. Connect accounts from the <a href="/dashboard/accounts" style={{ color: 'var(--accent)' }}>Accounts</a> page.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Account Health
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Monitor posting safety scores across all connected accounts.
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(14,165,233,0.08)', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
            <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <SummaryCard label="Healthy"  value={summary.healthy}  color="#34d399" />
        <SummaryCard label="Warning"  value={summary.warning}  color="#fbbf24" />
        <SummaryCard label="Critical" value={summary.critical} color="#f87171" />
        <SummaryCard label="Paused"   value={summary.paused}   color="#f87171" />
        <SummaryCard label="Total"    value={summary.total}    color="var(--text-primary)" />
      </div>

      {/* Account rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accounts.map((acc) => {
          const platformColor = PLATFORM_COLORS[acc.platform] ?? '#94a3b8';
          const hc = healthColor(acc.healthScore, acc.autoPaused);
          const isExpanded = expanded === acc.platform;
          const statusLabel = acc.autoPaused ? 'Auto-Paused'
            : acc.status === 'critical' ? 'Critical'
            : acc.status === 'warning'  ? 'Warning'
            : 'Healthy';

          return (
            <div key={acc.platform} style={{
              background: 'var(--bg-card)',
              border: `1px solid ${isExpanded ? hc.border : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              transition: 'border-color 150ms',
            }}>
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExpanded ? null : acc.platform)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', cursor: 'pointer',
                  background: isExpanded ? hc.bg : 'transparent',
                  transition: 'background 150ms',
                }}
              >
                {/* Platform icon */}
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: `${platformColor}18`, color: platformColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {PLATFORM_ICONS[acc.platform] ?? acc.platform[0].toUpperCase()}
                </div>

                {/* Account info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {acc.displayName || acc.username || acc.platform}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {acc.username ? `@${acc.username}` : acc.platform}
                    {acc.connectedAt && ` · connected ${formatDate(acc.connectedAt)}`}
                  </div>
                </div>

                {/* Score bar */}
                <ScoreBar score={acc.healthScore} paused={acc.autoPaused} />

                {/* Status badge */}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                  background: hc.bg, color: hc.color, border: `1px solid ${hc.border}`,
                  textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                }}>{statusLabel}</span>

                {/* Quick stats */}
                <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{acc.totalPosts}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Posts</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: acc.errorRate > 20 ? '#f87171' : 'var(--text-primary)' }}>
                      {acc.errorRate}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Errors</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{acc.recentPosts}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>7d posts</div>
                  </div>
                </div>

                {/* Chevron */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  width={14} height={14} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div style={{ padding: '16px 18px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Health reasons */}
                  {acc.reasons.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Score Breakdown
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {acc.reasons.map((r, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                            <span style={{ color: '#f87171', marginTop: 1, flexShrink: 0 }}>⚠</span>
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed stats grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {[
                      { label: 'Total posts',        value: acc.totalPosts.toString() },
                      { label: 'Total errors',       value: acc.totalErrors.toString() },
                      { label: 'Consecutive errors', value: acc.errorCount.toString() },
                      { label: 'Last posted',        value: timeAgo(acc.lastPostedAt) },
                      { label: 'Last error',         value: timeAgo(acc.lastErrorAt) },
                      { label: 'Backoff until',      value: acc.backoffUntil ? timeAgo(acc.backoffUntil) : 'None' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{
                        background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)',
                        padding: '10px 12px', border: '1px solid var(--border-subtle)',
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                    {acc.autoPaused && (
                      <button
                        onClick={(e) => { e.stopPropagation(); resume(acc.platform); }}
                        disabled={resuming === acc.platform}
                        style={{
                          padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                          background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
                          color: '#34d399', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          opacity: resuming === acc.platform ? 0.6 : 1,
                        }}
                      >
                        {resuming === acc.platform ? 'Resuming…' : 'Resume Account'}
                      </button>
                    )}
                    <a
                      href="/dashboard/accounts"
                      style={{
                        padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-default)',
                        color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                      }}
                    >
                      Manage Account
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
