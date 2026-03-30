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
    likedByPlatform: Record<string, number>;
    evaluatedByPlatform: Record<string, number>;
    approvedByPlatform: Record<string, number>;
    totalLikes: number;
    postedByAccount: Record<string, number>;
    likedByAccount: Record<string, number>;
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
    termFound: string;   // e.g. "Tweets", "Questions", "Pins"
    termPosted: string;  // e.g. "Replied", "Answered", "Commented"
    termEngaged: string; // e.g. "Liked", "Reacted", "Upvoted", "Ready"
    hasLikes: boolean;   // true if likedByBot is tracked for this platform
}

const PLATFORM_META: PlatformMeta[] = [
    {
        id: 'twitter', label: 'Twitter / X', color: '#1d9bf0',
        keywordsKey: 'twitterKeywords', dailyLimitKey: 'twitterDailyLimit', thresholdKey: 'twitterAutoPostThreshold',
        termFound: 'Tweets', termPosted: 'Replied', termEngaged: 'Liked', hasLikes: true,
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    {
        id: 'reddit', label: 'Reddit', color: '#3b82f6',
        keywordsKey: 'redditKeywords', dailyLimitKey: 'redditDailyLimit', thresholdKey: 'redditAutoPostThreshold',
        termFound: 'Posts', termPosted: 'Commented', termEngaged: 'Upvoted', hasLikes: true,
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    {
        id: 'facebook', label: 'Facebook', color: '#1877f2',
        keywordsKey: 'facebookKeywords', dailyLimitKey: 'facebookDailyLimit', thresholdKey: 'facebookAutoPostThreshold',
        termFound: 'Posts', termPosted: 'Commented', termEngaged: 'Reacted', hasLikes: true,
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    {
        id: 'quora', label: 'Quora', color: '#2563eb',
        keywordsKey: 'quoraKeywords', dailyLimitKey: 'quoraDailyLimit', thresholdKey: 'quoraAutoPostThreshold',
        termFound: 'Questions', termPosted: 'Answered', termEngaged: 'Upvoted', hasLikes: true,
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    {
        id: 'youtube', label: 'YouTube', color: '#0ea5e9',
        keywordsKey: 'youtubeKeywords', dailyLimitKey: 'youtubeDailyLimit', thresholdKey: 'youtubeAutoPostThreshold',
        termFound: 'Videos', termPosted: 'Commented', termEngaged: 'Liked', hasLikes: true,
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    {
        id: 'pinterest', label: 'Pinterest', color: '#6366f1',
        keywordsKey: 'pinterestKeywords', dailyLimitKey: 'pinterestDailyLimit', thresholdKey: 'pinterestAutoPostThreshold',
        termFound: 'Pins', termPosted: 'Commented', termEngaged: 'Queued', hasLikes: false,
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
        byPlatform: {}, postedByPlatform: {}, likedByPlatform: {}, evaluatedByPlatform: {}, approvedByPlatform: {}, totalLikes: 0,
        postedByAccount: {}, likedByAccount: {},
    });
    const [settings, setSettings] = useState<ISettings | null>(null);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null);
    const [stoppingPlatforms, setStoppingPlatforms] = useState<Set<string>>(new Set());
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('gm_welcomed') && onboardingDone) {
            setShowWelcome(true);
        }
    }, [onboardingDone]);

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
                likedByPlatform: data.likedByPlatform ?? {},
                evaluatedByPlatform: data.evaluatedByPlatform ?? {},
                approvedByPlatform: data.approvedByPlatform ?? {},
                totalLikes: data.totalLikes ?? 0,
                postedByAccount: data.postedByAccount ?? {},
                likedByAccount: data.likedByAccount ?? {},
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

                {/* ── Welcome Banner ── */}
                {showWelcome && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(139,92,246,0.06) 100%)',
                        border: '1px solid rgba(14,165,233,0.2)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '20px 24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(14,165,233,0.15)', border: '1.5px solid rgba(14,165,233,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={20} height={20}>
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                    Welcome to GetMention!
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    Follow the steps below to connect your accounts and start auto-commenting.
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { setShowWelcome(false); localStorage.setItem('gm_welcomed', '1'); }}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: 4, flexShrink: 0,
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                )}

                {/* ── Getting Started Guide ── */}
                {!allDone && (
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

                {/* ── Summary Metrics ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {[
                        { label: 'Total Posts', value: stats.posted, color: '#10b981' },
                        { label: 'Engaged', value: stats.totalLikes, color: '#f59e0b' },
                        { label: 'Platforms', value: accounts.length > 0 ? [...new Set(accounts.map(a => a.platform))].length : 0, color: '#3b82f6' },
                        { label: 'Scraped', value: stats.total, color: '#8b5cf6' },
                    ].map(m => (
                        <div key={m.label} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)', padding: '16px 20px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: m.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{m.value}</div>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginTop: 6 }}>{m.label}</div>
                        </div>
                    ))}
                </div>

                {/* ── Platform Cards (Grid with Color Accent) ── */}
                <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.02em' }}>Channels</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        {PLATFORM_META.map((p) => {
                            const platAccounts = accountsFor(p.id);
                            const isConnected = platAccounts.length > 0;
                            const posted = stats.postedByPlatform[p.id] ?? 0;
                            const liked = stats.likedByPlatform[p.id] ?? 0;
                            const engagedValue = p.hasLikes ? liked : (stats.approvedByPlatform[p.id] ?? 0);
                            const isRunning = cronStatus?.crons[p.id]?.running;
                            const hasExpiredCookies = platAccounts.some((a) => a.cookieVerified === false);
                            const cronMsg = cronStatus?.crons[p.id]?.lastMessage ?? '';
                            const cronAuthFailed = !isRunning && (cronStatus?.crons[p.id]?.lastExitCode ?? 0) !== 0 && /cookie|auth|expired|session|login|not logged/i.test(cronMsg);
                            const hasIssue = hasExpiredCookies || cronAuthFailed;
                            const dotColor = isRunning ? '#3b82f6' : hasIssue ? '#ef4444' : isConnected ? '#10b981' : '#6b7280';
                            const statusLabel = isRunning ? 'Running' : hasIssue ? 'Expired' : isConnected ? 'Active' : 'Not connected';
                            const acc = platAccounts[0];
                            const handle = acc ? (acc.username ? `@${acc.username}` : acc.displayName || acc.id.slice(0, 18)) : '';

                            return (
                                <Link key={p.id} href={`/dashboard/platform/${p.id}`} style={{
                                    textDecoration: 'none', display: 'block',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                    transition: 'all 200ms',
                                    opacity: isConnected ? 1 : 0.55,
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${p.color}18`; e.currentTarget.style.borderColor = `${p.color}40`; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                                >
                                    {/* Colored top accent bar */}
                                    <div style={{ height: 4, background: p.color }} />

                                    <div style={{ padding: '16px 20px' }}>
                                        {/* Header: icon + name + status dot */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                            <div style={{
                                                width: 38, height: 38, borderRadius: 10,
                                                background: `${p.color}15`, color: p.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, border: `1px solid ${p.color}25`,
                                            }}>
                                                {p.icon}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{p.label}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{
                                                    width: 8, height: 8, borderRadius: '50%', background: dotColor,
                                                    boxShadow: isRunning ? '0 0 8px #3b82f680' : dotColor === '#10b981' ? '0 0 6px #10b98150' : 'none',
                                                }} />
                                                <span style={{ fontSize: 11, fontWeight: 600, color: dotColor }}>{statusLabel}</span>
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        {isConnected ? (
                                            <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                                                <div>
                                                    <div style={{ fontSize: 26, fontWeight: 800, color: p.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{posted}</div>
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginTop: 4 }}>{p.termPosted}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.04em', lineHeight: 1 }}>{engagedValue}</div>
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginTop: 4 }}>{p.termEngaged}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginBottom: 14, padding: '12px 0' }}>
                                                <Link href="/dashboard/accounts" onClick={e => e.stopPropagation()} style={{
                                                    fontSize: 12, fontWeight: 700, color: p.color,
                                                    textDecoration: 'none', padding: '6px 14px',
                                                    background: `${p.color}12`, borderRadius: 8,
                                                    border: `1px solid ${p.color}25`,
                                                }}>
                                                    Connect account &rarr;
                                                </Link>
                                            </div>
                                        )}

                                        {/* Footer: account handle + session status */}
                                        {isConnected && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
                                            }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {handle}
                                                </span>
                                                {hasIssue ? (
                                                    <Link href="/dashboard/accounts" onClick={e => e.stopPropagation()} style={{
                                                        fontSize: 10, fontWeight: 700, color: '#ef4444',
                                                        textDecoration: 'none', padding: '2px 8px',
                                                        background: 'rgba(239,68,68,0.1)', borderRadius: 6,
                                                        border: '1px solid rgba(239,68,68,0.25)',
                                                    }}>
                                                        Reconnect
                                                    </Link>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        {acc?.cookieVerified !== false ? 'Session active' : 'Session expired'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* ── Engagement Summary ── */}
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Engagement Summary</span>
                        <Link href="/dashboard/logs" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', textDecoration: 'none' }}>
                            View logs &rarr;
                        </Link>
                    </div>
                    <div style={{ padding: '8px 16px' }}>
                        {PLATFORM_META.filter(p => (stats.postedByPlatform[p.id] ?? 0) > 0 || (stats.likedByPlatform[p.id] ?? 0) > 0).length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                No engagement data yet. Activity will appear here once the bot starts posting.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {PLATFORM_META.filter(p => (stats.postedByPlatform[p.id] ?? 0) > 0 || (stats.likedByPlatform[p.id] ?? 0) > 0).map((p, idx, arr) => (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 4px',
                                        borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                    }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{p.label}</span>
                                        <span style={{ fontSize: 13, color: p.color, fontWeight: 700 }}>{stats.postedByPlatform[p.id] ?? 0}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60 }}>{p.termPosted}</span>
                                        <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>{stats.likedByPlatform[p.id] ?? 0}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60 }}>{p.termEngaged}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
