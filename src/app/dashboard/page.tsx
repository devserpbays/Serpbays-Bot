'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { API_BASE } from '@/lib/apiBase';
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

interface CronPlatformStatus {
    running: boolean;
    lastFinished?: string;
    lastExitCode?: number;
    lastMessage?: string;
    lastTrigger?: 'manual' | 'scheduled';
}

interface CronStatusResponse {
    crons: Record<string, CronPlatformStatus>;
    paused: boolean;
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
        id: 'twitter', label: 'Twitter / X', color: '#1d9bf0',
        keywordsKey: 'twitterKeywords', dailyLimitKey: 'twitterDailyLimit', thresholdKey: 'twitterAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    {
        id: 'reddit', label: 'Reddit', color: '#3b82f6',
        keywordsKey: 'redditKeywords', dailyLimitKey: 'redditDailyLimit', thresholdKey: 'redditAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    {
        id: 'facebook', label: 'Facebook', color: '#1877f2',
        keywordsKey: 'facebookKeywords', dailyLimitKey: 'facebookDailyLimit', thresholdKey: 'facebookAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    {
        id: 'quora', label: 'Quora', color: '#2563eb',
        keywordsKey: 'quoraKeywords', dailyLimitKey: 'quoraDailyLimit', thresholdKey: 'quoraAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    {
        id: 'youtube', label: 'YouTube', color: '#0ea5e9',
        keywordsKey: 'youtubeKeywords', dailyLimitKey: 'youtubeDailyLimit', thresholdKey: 'youtubeAutoPostThreshold',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    {
        id: 'pinterest', label: 'Pinterest', color: '#6366f1',
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
    const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null);
    const [stoppingPlatforms, setStoppingPlatforms] = useState<Set<string>>(new Set());

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
            const [settRes, accRes, cronRes] = await Promise.all([
                fetch(`${API_BASE}/api/settings`),
                fetch(`${API_BASE}/api/social-accounts`),
                fetch(`${API_BASE}/api/cron-status`),
            ]);
            const settData = await settRes.json();
            const accData = await accRes.json();
            const cronData = await cronRes.json();
            setSettings(settData.settings ?? null);
            setAccounts(accData.accounts ?? []);
            setCronStatus(cronData);
        } catch { /* silent */ }
    }, []);

    const fetchOnlyCronStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/cron-status`);
            const data = await res.json();
            setCronStatus(data);
        } catch { /* silent */ }
    }, []);

    const handleStopPlatform = async (e: React.MouseEvent, platform: string) => {
        e.preventDefault();
        e.stopPropagation();
        setStoppingPlatforms(prev => new Set(prev).add(platform));
        try {
            await fetch(`${API_BASE}/api/stop-cron`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
        } catch { /* silent */ }
        // Refresh status
        setTimeout(async () => {
            await fetchOnlyCronStatus();
            setStoppingPlatforms(prev => { const next = new Set(prev); next.delete(platform); return next; });
        }, 1000);
    };

    useEffect(() => {
        fetchStats();
        fetchSettings();
        const tick = () => {
            if (!document.hidden) {
                fetchStats();
                fetchOnlyCronStatus();
            }
        };
        const id = setInterval(tick, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchStats, fetchSettings, fetchOnlyCronStatus]);

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
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-xl)',
                        overflow: 'hidden',
                    }}>
                        {/* Header with gradient */}
                        <div style={{
                            padding: '24px 28px 20px',
                            background: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(37,99,235,0.04) 100%)',
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
                            <div style={{ height: 4, borderRadius: 4, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${(completedSteps / steps.length) * 100}%`,
                                    height: '100%', borderRadius: 4,
                                    background: 'linear-gradient(90deg, #0ea5e9, #2563eb)',
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

                            // Cookie expiry warning: any connected account with bad cookies,
                            // or last cron run ended with an auth-related error message
                            const hasExpiredCookies = platAccounts.some((a) => a.cookieVerified === false);
                            const cronMsg = cronStatus?.crons[p.id]?.lastMessage ?? '';
                            const cronAuthFailed = !cronStatus?.crons[p.id]?.running
                                && (cronStatus?.crons[p.id]?.lastExitCode ?? 0) !== 0
                                && /cookie|auth|expired|session|login|not logged/i.test(cronMsg);
                            const showCookieWarning = hasExpiredCookies || cronAuthFailed;

                            return (
                                <Link
                                    key={p.id}
                                    href={`/dashboard/platform/${p.id}`}
                                    style={{
                                        textDecoration: 'none', display: 'block',
                                        background: 'var(--bg-card)',
                                        border: `1px solid ${isEnabled && platAccounts.length > 0 ? `${p.color}30` : 'var(--border-default)'}`,
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '18px 20px',
                                        transition: 'all 200ms',
                                        opacity: isEnabled ? 1 : 0.45,
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${p.color}55`; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 20px ${p.color}15`; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = isEnabled && platAccounts.length > 0 ? `${p.color}30` : 'var(--border-default)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    {/* Platform header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                                            background: `${p.color}22`, color: p.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, border: `1px solid ${p.color}30`,
                                        }}>
                                            {p.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{p.label}</div>
                                        </div>
                                        {cronStatus?.crons[p.id]?.running ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 700, padding: '3px 8px',
                                                    borderRadius: 20, background: 'rgba(59,130,246,0.1)',
                                                    color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                    <svg className="animate-spin" style={{ width: 10, height: 10 }} fill="none" viewBox="0 0 24 24">
                                                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                    </svg>
                                                    Running
                                                </span>
                                                <button
                                                    onClick={(e) => handleStopPlatform(e, p.id)}
                                                    disabled={stoppingPlatforms.has(p.id)}
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                                        border: 'none', borderRadius: 4, padding: '2px 6px',
                                                        fontSize: 10, fontWeight: 700, cursor: 'pointer'
                                                    }}
                                                >
                                                    {stoppingPlatforms.has(p.id) ? 'Stopping…' : 'Stop'}
                                                </button>
                                            </div>
                                        ) : showCookieWarning ? (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '3px 9px',
                                                borderRadius: 20, background: 'rgba(239,68,68,0.12)',
                                                color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={10} height={10}>
                                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                                </svg>
                                                Expired
                                            </span>
                                        ) : platAccounts.length > 0 && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '3px 9px',
                                                borderRadius: 20, background: 'rgba(16,185,129,0.12)',
                                                color: '#34d399', border: '1px solid rgba(16,185,129,0.25)',
                                            }}>
                                                Connected
                                            </span>
                                        )}
                                        {!isEnabled && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, padding: '3px 9px',
                                                borderRadius: 20, background: 'rgba(88,120,200,0.08)',
                                                color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
                                            }}>
                                                Disabled
                                            </span>
                                        )}
                                    </div>

                                    {/* Stats row */}
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{total}</div>
                                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Threads</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: p.color, letterSpacing: '-0.03em' }}>{posted}</div>
                                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Replied</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{pct}%</div>
                                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Rate</div>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{
                                        height: 4, borderRadius: 4,
                                        background: 'rgba(88,120,200,0.15)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${pct}%`, height: '100%',
                                            borderRadius: 4, background: p.color,
                                            transition: 'width 600ms ease',
                                            boxShadow: pct > 0 ? `0 0 6px ${p.color}60` : 'none',
                                        }} />
                                    </div>

                                    {/* Cookie expiry warning banner */}
                                    {showCookieWarning && (
                                        <div style={{
                                            marginTop: 12, padding: '9px 12px',
                                            background: 'rgba(239,68,68,0.07)',
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            borderRadius: 8,
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2} width={13} height={13} style={{ flexShrink: 0 }}>
                                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                                </svg>
                                                <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>
                                                    {cronAuthFailed && !hasExpiredCookies
                                                        ? 'Session expired — bot was blocked on last run'
                                                        : 'Cookies expired — bot cannot post'}
                                                </span>
                                            </div>
                                            <Link
                                                href="/dashboard/accounts"
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                    fontSize: 11, fontWeight: 700, color: '#f87171',
                                                    textDecoration: 'none', padding: '3px 10px',
                                                    background: 'rgba(239,68,68,0.12)', borderRadius: 5,
                                                    border: '1px solid rgba(239,68,68,0.3)',
                                                    whiteSpace: 'nowrap', flexShrink: 0,
                                                }}
                                            >
                                                Reconnect →
                                            </Link>
                                        </div>
                                    )}

                                    {/* Connected accounts — or prompt to connect */}
                                    {platAccounts.length === 0 && isEnabled && (
                                        <div style={{
                                            marginTop: 12, padding: '9px 14px',
                                            background: 'rgba(88,120,200,0.06)',
                                            border: '1px dashed rgba(88,120,200,0.25)',
                                            borderRadius: 8, display: 'flex', alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>No account connected</span>
                                            <Link href="/dashboard/accounts" onClick={e => e.stopPropagation()} style={{
                                                fontSize: 11, fontWeight: 700, color: p.color,
                                                textDecoration: 'none', padding: '3px 10px',
                                                background: `${p.color}20`, borderRadius: 5,
                                                border: `1px solid ${p.color}30`,
                                            }}>Connect →</Link>
                                        </div>
                                    )}
                                    {platAccounts.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                                            {platAccounts.map((acc) => {
                                                const displayLabel = acc.displayName || acc.username || p.label + ' Account';
                                                const handle = acc.username ? `@${acc.username}` : acc.id.slice(0, 20);
                                                const cookieOk = acc.cookieVerified !== false;
                                                return (
                                                    <div key={acc.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        background: `${p.color}12`,
                                                        border: `1px solid ${cookieOk ? p.color + '30' : 'rgba(239,68,68,0.35)'}`,
                                                        borderRadius: 8, padding: '7px 10px',
                                                    }}>
                                                        <div style={{
                                                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                                            background: `${p.color}28`, color: p.color,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontWeight: 700, fontSize: 11, border: `1px solid ${p.color}35`,
                                                        }}>
                                                            {displayLabel[0].toUpperCase()}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {displayLabel}
                                                            </div>
                                                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {handle}
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                            background: cookieOk ? '#10b981' : '#ef4444',
                                                            boxShadow: cookieOk ? '0 0 5px #10b98180' : '0 0 5px #ef444480',
                                                        }} title={cookieOk ? 'Session active' : 'Session expired — reconnect from Accounts'} />
                                                    </div>
                                                );
                                            })}
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
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'linear-gradient(90deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth={1.8} width={16} height={16}>
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Pipeline Health</span>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                            {[
                                { label: 'Approval Rate', value: stats.total > 0 ? `${Math.round(((stats.approved + stats.posted) / stats.total) * 100)}%` : '0%', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                                { label: 'Pending Review', value: String(stats.evaluated), color: 'var(--accent-light)', bg: 'rgba(99,102,241,0.08)' },
                                { label: 'In Progress', value: String(stats.evaluating), color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                                { label: 'Comment Success', value: stats.approved + stats.posted > 0 ? `${Math.round((stats.posted / (stats.approved + stats.posted)) * 100)}%` : '0%', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
                            ].map((m) => (
                                <div key={m.label} style={{
                                    textAlign: 'center', padding: '16px 12px',
                                    background: m.bg, borderRadius: 10,
                                    border: `1px solid ${m.color}20`,
                                }}>
                                    <div style={{ fontSize: 30, fontWeight: 800, color: m.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{m.value}</div>
                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 6 }}>{m.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
