'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
    {
        id: 'reddit', label: 'Reddit', color: '#ff4500',
        keywordsKey: 'redditKeywords', dailyLimitKey: 'redditDailyLimit', thresholdKey: 'redditAutoPostThreshold',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" />
            </svg>
        ),
    },
    {
        id: 'facebook', label: 'Facebook', color: '#1877f2',
        keywordsKey: 'facebookKeywords', dailyLimitKey: 'facebookDailyLimit', thresholdKey: 'facebookAutoPostThreshold',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
    },
    {
        id: 'quora', label: 'Quora', color: '#b92b27',
        keywordsKey: 'quoraKeywords', dailyLimitKey: 'quoraDailyLimit', thresholdKey: 'quoraAutoPostThreshold',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" />
            </svg>
        ),
    },
    {
        id: 'youtube', label: 'YouTube', color: '#ff0000',
        keywordsKey: 'youtubeKeywords', dailyLimitKey: 'youtubeDailyLimit', thresholdKey: 'youtubeAutoPostThreshold',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
        ),
    },
    {
        id: 'pinterest', label: 'Pinterest', color: '#e60023',
        keywordsKey: 'pinterestKeywords', dailyLimitKey: 'pinterestDailyLimit', thresholdKey: 'pinterestAutoPostThreshold',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" />
            </svg>
        ),
    },
];

const POLL_INTERVAL = 15_000;

/* ── Three-dot menu component ───────────────────────────────────── */
function PlatformMenu({
    platform,
    settings,
    accounts,
    onSave,
}: {
    platform: PlatformMeta;
    settings: ISettings;
    accounts: SocialAccount[];
    onSave: (partial: Partial<ISettings>) => void;
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [localKeywords, setLocalKeywords] = useState('');
    const [localLimit, setLocalLimit] = useState(5);
    const [localThreshold, setLocalThreshold] = useState(70);

    useEffect(() => {
        setLocalKeywords(((settings[platform.keywordsKey] as string[]) ?? []).join(', '));
        setLocalLimit((settings[platform.dailyLimitKey] as number) ?? 5);
        setLocalThreshold((settings[platform.thresholdKey] as number) ?? 70);
    }, [settings, platform]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleSave = () => {
        const kw = localKeywords.split(',').map((s) => s.trim()).filter(Boolean);
        onSave({
            [platform.keywordsKey]: kw,
            [platform.dailyLimitKey]: localLimit,
            [platform.thresholdKey]: localThreshold,
        });
        setOpen(false);
    };

    return (
        <div ref={menuRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--radius-sm)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color 150ms, background 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                title="Platform settings"
            >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                </svg>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 4,
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: 20, minWidth: 300,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: platform.color, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {platform.icon}
                        {platform.label} Settings
                    </div>

                    {/* Connected accounts summary */}
                    <div style={{ marginBottom: 16 }}>
                        <div className="label" style={{ fontSize: 11 }}>Connected Accounts</div>
                        {accounts.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No accounts connected</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {accounts.map((acc) => (
                                    <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                        <div style={{
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: `${platform.color}22`, color: platform.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 10, flexShrink: 0,
                                        }}>
                                            {(acc.displayName || acc.username || '?')[0].toUpperCase()}
                                        </div>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            @{acc.username || acc.id}
                                        </span>
                                        {acc.active !== false && (
                                            <span style={{ fontSize: 9, color: 'var(--status-approved)', marginLeft: 'auto' }}>● Active</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Keywords */}
                    <div style={{ marginBottom: 14 }}>
                        <label className="label" style={{ fontSize: 11 }}>Keywords (comma-separated)</label>
                        <input
                            className="input"
                            style={{ fontSize: 12 }}
                            value={localKeywords}
                            onChange={(e) => setLocalKeywords(e.target.value)}
                            placeholder="keyword1, keyword2…"
                        />
                    </div>

                    {/* Limits row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        <div>
                            <label className="label" style={{ fontSize: 11 }}>Daily Limit</label>
                            <input
                                className="input"
                                type="number"
                                min={1}
                                style={{ fontSize: 12 }}
                                value={localLimit}
                                onChange={(e) => setLocalLimit(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="label" style={{ fontSize: 11 }}>Auto-Post Threshold (%)</label>
                            <input
                                className="input"
                                type="number"
                                min={0}
                                max={100}
                                style={{ fontSize: 12 }}
                                value={localThreshold}
                                onChange={(e) => setLocalThreshold(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Main Overview Page ─────────────────────────────────────────── */
export default function OverviewPage() {
    /* State */
    const [stats, setStats] = useState<Stats>({
        total: 0, new: 0, evaluating: 0, evaluated: 0,
        approved: 0, rejected: 0, posted: 0,
        byPlatform: {}, postedByPlatform: {},
    });
    const [settings, setSettings] = useState<ISettings | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);

    /* Onboarding state */
    const [obCompanyName, setObCompanyName] = useState('');
    const [obDescription, setObDescription] = useState('');
    const [obKeywords, setObKeywords] = useState('');
    const [obSaving, setObSaving] = useState(false);
    const [obDone, setObDone] = useState(false);

    /* Fetchers */
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
        setLoaded(true);
    }, []);

    useEffect(() => {
        fetchStats();
        fetchSettings();
        const id = setInterval(fetchStats, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchStats, fetchSettings]);

    /* Detect first-time user: no settings doc or no companyName */
    const isFirstTime = loaded && (!settings || !settings.companyName);

    /* Onboarding submit */
    const handleOnboardingSubmit = async () => {
        setObSaving(true);
        try {
            const kw = obKeywords.split(',').map((s) => s.trim()).filter(Boolean);
            await fetch(`${API_BASE}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: obCompanyName.trim(),
                    companyDescription: obDescription.trim(),
                    keywords: kw,
                }),
            });
            setObDone(true);
            fetchSettings();
        } catch { /* silent */ }
        setObSaving(false);
    };

    /* Save platform-specific settings */
    const handlePlatformSave = async (partial: Partial<ISettings>) => {
        try {
            await fetch(`${API_BASE}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partial),
            });
            fetchSettings();
        } catch { /* silent */ }
    };

    /* Helpers */
    const accountsFor = (pid: string) => accounts.filter((a) => a.platform === pid);
    const enabledPlatforms = settings?.platforms ?? [];

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Overview</h2>
                <p>Real-time snapshot of your social engagement pipeline</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ══════════════════════════════════════════════════
                    Onboarding Card — shown for first-time users
                   ══════════════════════════════════════════════════ */}
                {isFirstTime && !obDone && (
                    <div className="card" style={{ border: '1px solid var(--accent)', background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.02) 100%)' }}>
                        <div className="card-header">
                            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} style={{ width: 22, height: 22 }}>
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                                Welcome to Serpbays! Let&apos;s get started
                            </span>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 520 }}>
                                Set up your company profile so the bot knows what to promote. You can always change these later in Settings.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                                <div>
                                    <label className="label">Company Name</label>
                                    <input
                                        className="input"
                                        placeholder="e.g. Acme Inc."
                                        value={obCompanyName}
                                        onChange={(e) => setObCompanyName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="label">Keywords (comma-separated)</label>
                                    <input
                                        className="input"
                                        placeholder="e.g. SaaS, marketing, AI"
                                        value={obKeywords}
                                        onChange={(e) => setObKeywords(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label">About Your Company</label>
                                <textarea
                                    className="input textarea"
                                    style={{ minHeight: 80 }}
                                    placeholder="Brief description of what your company does…"
                                    value={obDescription}
                                    onChange={(e) => setObDescription(e.target.value)}
                                />
                            </div>

                            <div>
                                <button
                                    className="btn btn-primary"
                                    disabled={obSaving || !obCompanyName.trim()}
                                    onClick={handleOnboardingSubmit}
                                >
                                    {obSaving ? 'Saving…' : 'Save & Continue'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}



                {/* ══════════════════════════════════════════════════
                    Platform Cards — one per platform
                   ══════════════════════════════════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    {PLATFORM_META.map((p) => {
                        const platAccounts = accountsFor(p.id);
                        const isEnabled = enabledPlatforms.includes(p.id) || platAccounts.length > 0;
                        const total = stats.byPlatform[p.id] ?? 0;
                        const posted = stats.postedByPlatform[p.id] ?? 0;
                        const evaluated = total > 0 ? Math.min(total, stats.evaluated) : 0;
                        const pct = total > 0 ? Math.round((posted / total) * 100) : 0;

                        return (
                            <Link
                                key={p.id}
                                href={`/dashboard/platform/${p.id}`}
                                className="card"
                                style={{ border: `1px solid ${p.color}22`, opacity: isEnabled ? 1 : 0.6, textDecoration: 'none', display: 'block', cursor: 'pointer' }}
                            >
                                {/* Card header */}
                                <div className="card-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ color: p.color }}>{p.icon}</span>
                                        <span className="card-title">{p.label}</span>
                                        {!isEnabled && (
                                            <span style={{
                                                fontSize: 10, padding: '2px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                                                fontWeight: 600,
                                            }}>
                                                Not enabled
                                            </span>
                                        )}
                                        {isEnabled && platAccounts.length > 0 && (
                                            <span style={{
                                                fontSize: 10, padding: '2px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                background: 'rgba(52,211,153,0.1)', color: 'var(--status-approved)',
                                                fontWeight: 600,
                                            }}>
                                                {platAccounts.length} account{platAccounts.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                                        style={{ width: 16, height: 16, color: 'var(--text-muted)', flexShrink: 0 }}>
                                        <polyline points="9,18 15,12 9,6" />
                                    </svg>
                                </div>

                                {/* Stats row */}
                                <div className="card-body">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{total}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Posts</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--status-evaluated)' }}>{evaluated}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Evaluated</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: p.color }}>{posted}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Commented</div>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{
                                        height: 4, borderRadius: 2,
                                        background: 'rgba(255,255,255,0.06)',
                                        overflow: 'hidden', marginBottom: 6,
                                    }}>
                                        <div style={{
                                            width: `${pct}%`, height: '100%',
                                            borderRadius: 2, background: p.color,
                                            transition: 'width 600ms ease',
                                        }} />
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {pct}% commented
                                    </div>

                                    {/* Connected accounts mini list */}
                                    {platAccounts.length > 0 && (
                                        <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                                Accounts
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {platAccounts.map((acc) => (
                                                    <div key={acc.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        background: `${p.color}10`, borderRadius: 'var(--radius-sm)',
                                                        padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary)',
                                                    }}>
                                                        <span style={{
                                                            width: 6, height: 6, borderRadius: 3,
                                                            background: acc.active !== false ? 'var(--status-approved)' : 'var(--status-rejected)',
                                                        }} />
                                                        @{acc.username || acc.id}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>


                {/* ── Pipeline Health ── */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Pipeline Health</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--status-approved)' }}>
                                    {stats.total > 0 ? Math.round(((stats.approved + stats.posted) / stats.total) * 100) : 0}%
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Approval Rate</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--status-evaluated)' }}>
                                    {stats.evaluated}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Pending Review</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--status-evaluating)' }}>
                                    {stats.evaluating}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>In Progress</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>
                                    {stats.approved + stats.posted > 0
                                        ? Math.round((stats.posted / (stats.approved + stats.posted)) * 100)
                                        : 0}%
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Post Success Rate</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
