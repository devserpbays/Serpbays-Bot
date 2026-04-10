'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { API_BASE } from '@/lib/apiBase';

/* ── Types ──────────────────────────────────────────────── */
interface PlatformStats {
    posted: number;
    liked: number;
    limit: number;
    ready: number;
}

interface SettingsData {
    extensionPlatforms?: string[];
    extensionApiKey?: string;
    platformLimits?: Record<string, number>;
    platformPostedToday?: Record<string, number>;
    platformLikedToday?: Record<string, number>;
    companyName?: string;
}

/* ── Platform config ────────────────────────────────────── */
const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
    twitter:   { label: 'Twitter / X', color: '#1d9bf0', icon: '𝕏' },
    facebook:  { label: 'Facebook',    color: '#1877f2', icon: 'f' },
    quora:     { label: 'Quora',       color: '#b92b27', icon: 'Q' },
    reddit:    { label: 'Reddit',      color: '#ff4500', icon: 'R' },
    youtube:   { label: 'YouTube',     color: '#ff0000', icon: '▶' },
    pinterest: { label: 'Pinterest',   color: '#e60023', icon: 'P' },
    skool:     { label: 'Skool',       color: '#5865f2', icon: 'S' },
};

/* ── Carousel hook ──────────────────────────────────────── */
function useCarousel(itemCount: number, visibleCount: number, intervalMs = 4000) {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const maxIndex = Math.max(0, itemCount - visibleCount);

    useEffect(() => {
        if (paused || maxIndex <= 0) return;
        const timer = setInterval(() => {
            setIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
        }, intervalMs);
        return () => clearInterval(timer);
    }, [paused, maxIndex, intervalMs]);

    return { index, setIndex, maxIndex, setPaused };
}

/* ── Main page ──────────────────────────────────────────── */
export default function OverviewPage() {
    const { user } = useUser();
    const [settings, setSettings] = useState<SettingsData>({});
    const [platformStats, setPlatformStats] = useState<Record<string, PlatformStats>>({});
    const [logs, setLogs] = useState<Array<{ _id: string; platform: string; level: string; action: string; message: string; timestamp: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [reviewCount, setReviewCount] = useState(0);

    const userName = user?.firstName || user?.fullName || 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const fetchData = useCallback(async () => {
        try {
            const [settingsRes, logsRes, reviewRes] = await Promise.all([
                fetch(`${API_BASE}/api/settings`),
                fetch(`${API_BASE}/api/logs?limit=10`),
                fetch(`${API_BASE}/api/extension/review`),
            ]);
            const sData = await settingsRes.json();
            const lData = await logsRes.json();
            const rData = await reviewRes.json();

            if (sData.settings) {
                setSettings(sData.settings);
                // Fetch extension stats
                if (sData.settings.extensionApiKey) {
                    const extRes = await fetch(`${API_BASE}/api/extension/settings`, {
                        headers: { 'X-Extension-Key': sData.settings.extensionApiKey },
                    });
                    const extData = await extRes.json();
                    const stats: Record<string, PlatformStats> = {};
                    const extP = extData.extensionPlatforms || sData.settings.extensionPlatforms || [];
                    for (const p of extP) {
                        stats[p] = {
                            posted: extData.platformPostedToday?.[p] || 0,
                            liked: extData.platformLikedToday?.[p] || 0,
                            limit: extData.platformLimits?.[p] || 10,
                            ready: 0,
                        };
                    }
                    // Get pending counts
                    try {
                        const pingRes = await fetch(`${API_BASE}/api/extension/ping`, {
                            headers: { 'X-Extension-Key': sData.settings.extensionApiKey },
                        });
                        const pingData = await pingRes.json();
                        for (const p of extP) {
                            if (stats[p]) stats[p].ready = pingData.pendingByPlatform?.[p] || 0;
                        }
                    } catch {}
                    setPlatformStats(stats);
                }
            }
            setLogs((lData.logs || []).slice(0, 8));
            // Count review items
            const platforms = rData.platforms || {};
            let count = 0;
            Object.values(platforms).forEach((posts: unknown) => { count += (posts as unknown[]).length; });
            setReviewCount(count);
        } catch {}
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Platform list (filtered)
    const extPlatforms = settings.extensionPlatforms || [];
    const filteredPlatforms = activeFilter === 'all'
        ? extPlatforms
        : extPlatforms.filter(p => p === activeFilter);

    // Totals
    let totalComments = 0, totalLikes = 0, totalErrors = 0;
    extPlatforms.forEach(p => {
        totalComments += platformStats[p]?.posted || 0;
        totalLikes += platformStats[p]?.liked || 0;
    });
    const errorLogs = logs.filter(l => l.level === 'error');
    totalErrors = errorLogs.length;

    // Carousel for platform cards (3 visible)
    const carousel = useCarousel(filteredPlatforms.length, 3);

    const timeAgo = (ts: string) => {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
                Loading...
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: 1100, margin: '0 auto' }}>

            {/* ── Greeting ── */}
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
                    {greeting}, {userName}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Here&apos;s what GetMention did today
                </p>
            </div>

            {/* ── Hero Stats ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                    { value: totalComments, label: 'Comments Posted', color: '#c4a35a', gradient: 'linear-gradient(135deg, #c4a35a20, #c4a35a08)' },
                    { value: totalLikes, label: 'Likes Given', color: '#7ec4a0', gradient: 'linear-gradient(135deg, #7ec4a020, #7ec4a008)' },
                    { value: extPlatforms.length, label: 'Platforms Active', color: '#a78bdb', gradient: 'linear-gradient(135deg, #a78bdb20, #a78bdb08)' },
                    { value: totalErrors, label: 'Errors Today', color: totalErrors > 0 ? '#d4736c' : 'var(--text-muted)', gradient: totalErrors > 0 ? 'linear-gradient(135deg, #d4736c15, #d4736c05)' : 'none' },
                ].map((stat, i) => (
                    <div key={i} style={{
                        background: stat.gradient, border: '1px solid var(--border-default)', borderRadius: 14,
                        padding: '18px 16px', textAlign: 'center',
                        animation: `gm-slide-up 0.4s ease-out ${i * 0.08}s both`,
                    }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, letterSpacing: '-0.04em', lineHeight: 1 }}>
                            {stat.value}
                        </div>
                        <div style={{ fontSize: 10, color: '#6b6b7b', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Platform Filter Tabs ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Platforms</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                    <button
                        onClick={() => { setActiveFilter('all'); carousel.setIndex(0); }}
                        style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${activeFilter === 'all' ? '#c4a35a' : 'var(--border-subtle)'}`,
                            background: activeFilter === 'all' ? 'rgba(196,163,90,0.1)' : 'transparent',
                            color: activeFilter === 'all' ? '#c4a35a' : 'var(--text-secondary)',
                        }}
                    >
                        All ({extPlatforms.length})
                    </button>
                    {extPlatforms.map(pid => {
                        const meta = PLATFORMS[pid];
                        if (!meta) return null;
                        const isActive = activeFilter === pid;
                        return (
                            <button
                                key={pid}
                                onClick={() => { setActiveFilter(pid); carousel.setIndex(0); }}
                                style={{
                                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: `1px solid ${isActive ? meta.color : 'var(--border-subtle)'}`,
                                    background: isActive ? `${meta.color}15` : 'transparent',
                                    color: isActive ? meta.color : 'var(--text-secondary)',
                                }}
                            >
                                {meta.icon} {meta.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Platform Carousel ── */}
            <div
                style={{ position: 'relative', overflow: 'hidden', marginBottom: 24 }}
                onMouseEnter={() => carousel.setPaused(true)}
                onMouseLeave={() => carousel.setPaused(false)}
            >
                {/* Arrow buttons */}
                {carousel.maxIndex > 0 && (
                    <>
                        <button
                            onClick={() => carousel.setIndex(Math.max(0, carousel.index - 1))}
                            style={{
                                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 14,
                                opacity: carousel.index === 0 ? 0.3 : 1,
                            }}
                            disabled={carousel.index === 0}
                        >
                            ‹
                        </button>
                        <button
                            onClick={() => carousel.setIndex(Math.min(carousel.maxIndex, carousel.index + 1))}
                            style={{
                                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 14,
                                opacity: carousel.index >= carousel.maxIndex ? 0.3 : 1,
                            }}
                            disabled={carousel.index >= carousel.maxIndex}
                        >
                            ›
                        </button>
                    </>
                )}

                {/* Cards track */}
                <div style={{
                    display: 'flex', gap: 14,
                    transform: `translateX(-${carousel.index * (100 / 3 + 1.3)}%)`,
                    transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    padding: '0 36px',
                }}>
                    {filteredPlatforms.map((pid, i) => {
                        const meta = PLATFORMS[pid];
                        const stats = platformStats[pid] || { posted: 0, liked: 0, limit: 10, ready: 0 };
                        if (!meta) return null;
                        const pct = stats.limit > 0 ? Math.min((stats.posted / stats.limit) * 100, 100) : 0;

                        return (
                            <Link
                                key={pid}
                                href={`/dashboard/platform/${pid}`}
                                style={{
                                    minWidth: 'calc(33.333% - 10px)', flex: '0 0 calc(33.333% - 10px)',
                                    textDecoration: 'none', display: 'block',
                                    background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 16,
                                    overflow: 'hidden', transition: 'all 0.3s ease',
                                    animation: `gm-scale-in 0.4s ease-out ${i * 0.1}s both`,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = `0 12px 40px ${meta.color}20`;
                                    e.currentTarget.style.borderColor = `${meta.color}40`;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.borderColor = 'var(--border-default)';
                                }}
                            >
                                {/* Top accent bar */}
                                <div style={{ height: 4, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)` }} />

                                <div style={{ padding: '16px 18px' }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 10,
                                            background: `${meta.color}15`, color: meta.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: 15, border: `1px solid ${meta.color}25`,
                                        }}>
                                            {meta.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
                                        </div>
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: stats.posted > 0 ? '#7ec4a0' : 'var(--text-muted)',
                                            boxShadow: stats.posted > 0 ? '0 0 8px #7ec4a050' : 'none',
                                        }} />
                                    </div>

                                    {/* Stats */}
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
                                        <div>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: meta.color, letterSpacing: '-0.04em', lineHeight: 1 }}>
                                                {stats.posted}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Comments</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: '#7ec4a0', letterSpacing: '-0.04em', lineHeight: 1 }}>
                                                {stats.liked}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Likes</div>
                                        </div>
                                        {stats.ready > 0 && (
                                            <div>
                                                <div style={{ fontSize: 24, fontWeight: 800, color: '#a78bdb', letterSpacing: '-0.04em', lineHeight: 1 }}>
                                                    {stats.ready}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Ready</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, height: 4, background: 'var(--border-default)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 2, width: `${pct}%`,
                                                background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)`,
                                                transition: 'width 0.5s ease',
                                            }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {stats.posted}/{stats.limit}
                                        </span>
                                    </div>

                                    {/* Footer */}
                                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-default)', fontSize: 11, color: 'var(--text-muted)' }}>
                                        Via browser extension
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Dot indicators */}
                {carousel.maxIndex > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
                        {Array.from({ length: carousel.maxIndex + 1 }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => carousel.setIndex(i)}
                                style={{
                                    width: carousel.index === i ? 16 : 6, height: 6, borderRadius: 3,
                                    background: carousel.index === i ? '#c4a35a' : 'var(--border-subtle)',
                                    border: 'none', cursor: 'pointer', transition: 'all 0.3s',
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Quick Actions ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                <Link href="/dashboard/review" style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12,
                    padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.2s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4a35a50'; e.currentTarget.style.background = 'rgba(196,163,90,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(196,163,90,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#c4a35a' }}>✓</div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Review Queue</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{reviewCount} pending</div>
                    </div>
                </Link>
                <Link href="/dashboard/logs" style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12,
                    padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.2s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>📋</div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>View Logs</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Activity history</div>
                    </div>
                </Link>
                <Link href="/dashboard/settings" style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12,
                    padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.2s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>⚙</div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Configure platforms</div>
                    </div>
                </Link>
            </div>

            {/* ── Recent Activity ── */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 16,
                padding: '18px 20px',
                animation: 'gm-slide-up 0.5s ease-out 0.3s both',
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.02em' }}>
                    Recent Activity
                </div>

                {logs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                        No activity yet — extension will start posting soon
                    </div>
                ) : (
                    <div>
                        {logs.slice(0, 6).map((log) => {
                            const meta = PLATFORMS[log.platform];
                            const icon = log.level === 'success' ? '✓' : log.level === 'error' ? '✗' : '→';
                            const iconColor = log.level === 'success' ? '#7ec4a0' : log.level === 'error' ? '#d4736c' : '#c4a35a';
                            const msg = (log.message || '').replace('[Extension] ', '').slice(0, 60);
                            return (
                                <div key={log._id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                    borderBottom: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                        background: `${iconColor}15`, color: iconColor,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 700,
                                    }}>
                                        {icon}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: meta?.color || 'var(--text-secondary)', width: 65, flexShrink: 0 }}>
                                        {log.platform}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {msg}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                        {timeAgo(log.timestamp)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <Link href="/dashboard/logs" style={{
                    display: 'block', textAlign: 'center', marginTop: 12, padding: '8px 0',
                    fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
                    borderTop: '1px solid var(--border-default)',
                }}>
                    View all logs →
                </Link>
            </div>

            {/* ── CSS Animations ── */}
            <style>{`
                @keyframes gm-slide-up {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes gm-scale-in {
                    from { opacity: 0; transform: scale(0.95) translateY(8px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
