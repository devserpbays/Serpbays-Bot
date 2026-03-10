'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import type { SocialAccount, ISettings } from '@/lib/types';

/* ── Types ───────────────────────────────────────────────────────── */
interface Stats {
    total: number;
    new: number;
    evaluating: number;
    evaluated: number;
    approved: number;
    rejected: number;
    posted: number;
    byPlatform: Record<string, number>;
    postedByPlatform: Record<string, number>;
}

/* ── Platform metadata ──────────────────────────────────────────── */
interface PlatformMeta {
    id: string;
    label: string;
    color: string;
    icon: React.ReactNode;
    keywordsKey: keyof ISettings;
    dailyLimitKey: keyof ISettings;
    thresholdKey: keyof ISettings;
}

const PLATFORM_META: PlatformMeta[] = [
    {
        id: 'twitter', label: 'Twitter / X', color: '#a0a0a0',
        keywordsKey: 'twitterKeywords', dailyLimitKey: 'twitterDailyLimit', thresholdKey: 'twitterAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    {
        id: 'reddit', label: 'Reddit', color: '#ff4500',
        keywordsKey: 'redditKeywords', dailyLimitKey: 'redditDailyLimit', thresholdKey: 'redditAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    {
        id: 'facebook', label: 'Facebook', color: '#1877f2',
        keywordsKey: 'facebookKeywords', dailyLimitKey: 'facebookDailyLimit', thresholdKey: 'facebookAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    {
        id: 'quora', label: 'Quora', color: '#b92b27',
        keywordsKey: 'quoraKeywords', dailyLimitKey: 'quoraDailyLimit', thresholdKey: 'quoraAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    {
        id: 'youtube', label: 'YouTube', color: '#ff0000',
        keywordsKey: 'youtubeKeywords', dailyLimitKey: 'youtubeDailyLimit', thresholdKey: 'youtubeAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    {
        id: 'pinterest', label: 'Pinterest', color: '#e60023',
        keywordsKey: 'pinterestKeywords', dailyLimitKey: 'pinterestDailyLimit', thresholdKey: 'pinterestAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
];

const POLL_INTERVAL = 15_000;

/* ── Main Overview Page ─────────────────────────────────────────── */
export default function OverviewPage() {
    const { user } = useUser();
    const onboardingDone = !!(user?.publicMetadata as Record<string, unknown>)?.onboardingCompleted;
    const [stats, setStats] = useState<Stats>({
        total: 0, new: 0, evaluating: 0, evaluated: 0,
        approved: 0, rejected: 0, posted: 0,
        byPlatform: {}, postedByPlatform: {},
    });
    const [settings, setSettings] = useState<ISettings | null>(null);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/stats`);
            const data = await res.json();
            setStats({
                total: data.total ?? 0,
                new: data.byStatus?.new ?? 0,
                evaluating: data.byStatus?.evaluating ?? 0,
                evaluated: data.byStatus?.evaluated ?? 0,
                approved: data.byStatus?.approved ?? 0,
                rejected: data.byStatus?.rejected ?? 0,
                posted: data.byStatus?.posted ?? 0,
                byPlatform: data.byPlatform ?? {},
                postedByPlatform: data.postedByPlatform ?? {},
            });
        } catch { /* polling will retry */ }
    }, []);

    const fetchSettings = useCallback(async () => {
        try {
            const [settRes, accRes] = await Promise.all([
                fetch(`${API_BASE}/api/settings`),
                fetch(`${API_BASE}/api/social-accounts`),
            ]);
            const settData = await settRes.json();
            const accData = await accRes.json();
            setSettings(settData.settings ?? null);
            setAccounts(accData.accounts ?? []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchSettings();
        const id = setInterval(fetchStats, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchStats, fetchSettings]);

    const accountsFor = (pid: string) => accounts.filter((a) => a.platform === pid);
    const enabledPlatforms = settings?.platforms ?? [];
    const hasAccounts = accounts.length > 0;
    const hasKeywords = settings && (
        (settings.twitterKeywords?.length ?? 0) > 0 ||
        (settings.redditKeywords?.length ?? 0) > 0 ||
        (settings.facebookKeywords?.length ?? 0) > 0
    );

    /* Getting started steps */
    const steps = [
        { label: 'Create your account', desc: 'Sign up and set up your profile', done: true, href: '#' },
        { label: 'Connect social accounts', desc: 'Link Twitter, Reddit, Facebook, or others via cookies', done: hasAccounts, href: '/dashboard/accounts' },
        { label: 'Add target keywords', desc: 'Tell the bot what topics to search for', done: !!hasKeywords, href: '/dashboard/settings' },
        { label: 'Run your first pipeline', desc: 'Scrape posts and generate AI replies', done: stats.total > 0, href: '/dashboard/pipeline' },
    ];
    const completedSteps = steps.filter(s => s.done).length;
    const allDone = completedSteps === steps.length;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Overview</h2>
                <p>Your social engagement command center</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── Getting Started Guide ── */}
                {!onboardingDone && !allDone && (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xl)',
                        overflow: 'hidden',
                        backdropFilter: 'blur(12px)',
                    }}>
                        {/* Header with gradient */}
                        <div style={{
                            padding: '24px 28px 20px',
                            background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(37,99,235,0.04) 100%)',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                                        Getting Started
                                    </h3>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                                        Complete these steps to start growing your brand
                                    </p>
                                </div>
                                <div style={{
                                    fontSize: 12, fontWeight: 700, color: 'var(--accent-light)',
                                    background: 'var(--accent-bg)', borderRadius: 20,
                                    padding: '4px 12px', border: '1px solid var(--accent-border)',
                                }}>
                                    {completedSteps}/{steps.length}
                                </div>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${(completedSteps / steps.length) * 100}%`,
                                    height: '100%', borderRadius: 4,
                                    background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                                    transition: 'width 600ms ease',
                                }} />
                            </div>
                        </div>

                        {/* Steps */}
                        <div style={{ padding: '8px 12px' }}>
                            {steps.map((step, i) => {
                                const isCurrent = !step.done && steps.slice(0, i).every(s => s.done);
                                return (
                                    <Link
                                        key={i}
                                        href={step.href}
                                        className="getting-started-step"
                                        style={{ textDecoration: 'none', opacity: step.done ? 0.6 : 1 }}
                                    >
                                        <div className={`step-number ${step.done ? 'completed' : isCurrent ? 'current' : 'upcoming'}`}>
                                            {step.done ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} width={14} height={14}>
                                                    <polyline points="20,6 9,17 4,12" />
                                                </svg>
                                            ) : (
                                                i + 1
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)',
                                                marginBottom: 2,
                                            }}>
                                                {step.label}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {step.desc}
                                            </div>
                                        </div>
                                        {isCurrent && (
                                            <div style={{
                                                fontSize: 11, fontWeight: 600, color: 'var(--accent-light)',
                                                background: 'var(--accent-bg)', borderRadius: 6,
                                                padding: '4px 10px', border: '1px solid var(--accent-border)',
                                                flexShrink: 0,
                                            }}>
                                                Start
                                            </div>
                                        )}
                                        {!isCurrent && !step.done && (
                                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8}
                                                style={{ width: 16, height: 16, flexShrink: 0 }}>
                                                <polyline points="9,18 15,12 9,6" />
                                            </svg>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Platform Cards ── */}
                <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.02em' }}>
                        Platforms
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                        {PLATFORM_META.map((p) => {
                            const platAccounts = accountsFor(p.id);
                            const isEnabled = enabledPlatforms.includes(p.id) || platAccounts.length > 0;
                            const total = stats.byPlatform[p.id] ?? 0;
                            const posted = stats.postedByPlatform[p.id] ?? 0;
                            const pct = total > 0 ? Math.round((posted / total) * 100) : 0;

                            return (
                                <Link
                                    key={p.id}
                                    href={`/dashboard/platform/${p.id}`}
                                    style={{
                                        textDecoration: 'none', display: 'block',
                                        background: 'var(--bg-card)',
                                        border: `1px solid ${isEnabled && platAccounts.length > 0 ? `${p.color}20` : 'var(--border-subtle)'}`,
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '18px 20px',
                                        transition: 'all 200ms',
                                        opacity: isEnabled ? 1 : 0.5,
                                        backdropFilter: 'blur(12px)',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${p.color}40`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = isEnabled && platAccounts.length > 0 ? `${p.color}20` : 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; }}
                                >
                                    {/* Platform header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                                            background: `${p.color}12`, color: p.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            {p.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                                        </div>
                                        {platAccounts.length > 0 && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                                                borderRadius: 20, background: 'rgba(16,185,129,0.1)',
                                                color: '#10b981',
                                            }}>
                                                Connected
                                            </span>
                                        )}
                                        {!isEnabled && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, padding: '3px 8px',
                                                borderRadius: 20, background: 'rgba(255,255,255,0.04)',
                                                color: 'var(--text-muted)',
                                            }}>
                                                Disabled
                                            </span>
                                        )}
                                    </div>

                                    {/* Stats row */}
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{total}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Posts</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: p.color, letterSpacing: '-0.03em' }}>{posted}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Replied</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '-0.03em' }}>{pct}%</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rate</div>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{
                                        height: 3, borderRadius: 3,
                                        background: 'rgba(255,255,255,0.05)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${pct}%`, height: '100%',
                                            borderRadius: 3, background: p.color,
                                            transition: 'width 600ms ease',
                                        }} />
                                    </div>

                                    {/* Connected accounts */}
                                    {platAccounts.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                                            {platAccounts.map((acc) => (
                                                <div key={acc.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 5,
                                                    background: `${p.color}08`, borderRadius: 'var(--radius-xs)',
                                                    padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)',
                                                }}>
                                                    <span style={{
                                                        width: 5, height: 5, borderRadius: 3,
                                                        background: acc.active !== false ? '#10b981' : '#ef4444',
                                                    }} />
                                                    @{acc.username || acc.id}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* ── Pipeline Health ── */}
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
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth={1.8} width={16} height={16}>
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Pipeline Health</span>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20 }}>
                            {[
                                { label: 'Approval Rate', value: stats.total > 0 ? `${Math.round(((stats.approved + stats.posted) / stats.total) * 100)}%` : '0%', color: '#10b981' },
                                { label: 'Pending Review', value: String(stats.evaluated), color: 'var(--accent-light)' },
                                { label: 'In Progress', value: String(stats.evaluating), color: '#f59e0b' },
                                { label: 'Post Success', value: stats.approved + stats.posted > 0 ? `${Math.round((stats.posted / (stats.approved + stats.posted)) * 100)}%` : '0%', color: '#3b82f6' },
                            ].map((m) => (
                                <div key={m.label} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 28, fontWeight: 800, color: m.color, letterSpacing: '-0.04em' }}>{m.value}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{m.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
