'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/apiBase';
import type { IPost, SocialAccount } from '@/lib/types';

/* ── Platform metadata ─────────────────────────────────────── */
const PLATFORM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    twitter: {
        label: 'Twitter / X', color: '#1d9bf0',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    reddit: {
        label: 'Reddit', color: '#3b82f6',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    facebook: {
        label: 'Facebook', color: '#1877f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    quora: {
        label: 'Quora', color: '#2563eb',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    youtube: {
        label: 'YouTube', color: '#0ea5e9',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    pinterest: {
        label: 'Pinterest', color: '#60a5fa',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
};

const TIME_FILTERS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days', label: '7 Days' },
    { value: '15days', label: '15 Days' },
    { value: '30days', label: '30 Days' },
    { value: 'all', label: 'All Time' },
];

function getDateRange(filter: string): { from?: Date; to?: Date } {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (filter) {
        case 'today': return { from: startOfToday };
        case 'yesterday': {
            const from = new Date(startOfToday); from.setDate(from.getDate() - 1);
            return { from, to: startOfToday };
        }
        case '7days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 6); return { from: d }; }
        case '15days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 14); return { from: d }; }
        case '30days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 29); return { from: d }; }
        default: return {};
    }
}

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scoreColor(score: number): string {
    if (score >= 80) return '#34d399';
    if (score >= 60) return '#fbbf24';
    return '#f87171';
}

const REPLY_LABEL: Record<string, string> = { twitter: 'Reply', quora: 'Answer' };
const LIMIT = 10;
const POLL_MS = 15_000;

interface PostsResponse { posts: IPost[]; total: number; page: number; limit: number; }

export default function PlatformPage() {
    const params = useParams();
    const router = useRouter();
    const platformId = params.platform as string;
    const meta = PLATFORM_META[platformId];

    const [posts, setPosts] = useState<IPost[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [communityPosts, setCommunityPosts] = useState<IPost[]>([]);
    const [communityTotal, setCommunityTotal] = useState(0);
    const [communityPage, setCommunityPage] = useState(1);
    const [viewMode, setViewMode] = useState<'keyword' | 'community'>('keyword');
    const [timeFilter, setTimeFilter] = useState('today');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [communityLoading, setCommunityLoading] = useState(true);
    const [platformSettings, setPlatformSettings] = useState<Record<string, any>>({});
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Twitter engagement stats (likes, retweets, bookmarks, follows)
    const [engageStats, setEngageStats] = useState<{
        totalLiked: number; todayLiked: number;
        totalRetweeted: number; todayRetweeted: number;
        totalBookmarked: number;
        currentlyFollowing: number; totalUnfollowed: number;
        recentFollows: { handle: string; followedAt: string }[];
    } | null>(null);

    const fetchEngageStats = useCallback(async () => {
        if (platformId !== 'twitter') return;
        try {
            const res = await fetch(`${API_BASE}/api/twitter-engagement`);
            if (res.ok) setEngageStats(await res.json());
        } catch { /* silent */ }
    }, [platformId]);

    // Engagement list browser (liked / retweeted / bookmarked / followed)
    type EngageTab = 'liked' | 'retweeted' | 'bookmarked' | 'followed';
    const [engageTab, setEngageTab] = useState<EngageTab>('liked');
    const [engageListPage, setEngageListPage] = useState(1);
    const [engageListData, setEngageListData] = useState<{
        total: number; pages: number; page: number;
        posts?: { id: string; url: string; content: string; author: string; score: number | null; updatedAt: string; liked: boolean; retweeted: boolean; bookmarked: boolean }[];
        follows?: { id: string; handle: string; followedAt: string; unfollowedAt: string | null; isFollowing: boolean }[];
    } | null>(null);
    const [engageListLoading, setEngageListLoading] = useState(false);

    const fetchEngageList = useCallback(async (tab: EngageTab, pg: number) => {
        if (platformId !== 'twitter') return;
        setEngageListLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/twitter-engagement?list=${tab}&page=${pg}`);
            if (res.ok) setEngageListData(await res.json());
        } catch { /* silent */ }
        setEngageListLoading(false);
    }, [platformId]);

    useEffect(() => { if (!meta) router.replace('/dashboard'); }, [meta, router]);

    const fetchAccounts = useCallback(async () => {
        try {
            const [accRes, setRes] = await Promise.all([
                fetch(`${API_BASE}/api/social-accounts`),
                fetch(`${API_BASE}/api/settings`),
            ]);
            const accData = await accRes.json();
            setAccounts((accData.accounts ?? []).filter((a: SocialAccount) => a.platform === platformId));
            if (setRes.ok) {
                const setData = await setRes.json();
                setPlatformSettings(setData.settings ?? {});
            }
        } catch { /* silent */ }
    }, [platformId]);

    const fetchPosts = useCallback(async () => {
        const p = new URLSearchParams({ status: 'posted', platform: platformId, limit: String(LIMIT), page: String(page) });
        const { from, to } = getDateRange(timeFilter);
        if (from) p.set('from', from.toISOString());
        if (to) p.set('to', to.toISOString());
        // For Twitter: only fetch keyword posts in main section
        if (platformId === 'twitter') p.set('source', 'keyword');
        try {
            const res = await fetch(`${API_BASE}/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setPosts(data.posts ?? []);
            setTotal(data.total ?? 0);
        } catch { /* silent */ }
        setLoading(false);
    }, [platformId, timeFilter, page]);

    const fetchCommunityPosts = useCallback(async () => {
        if (platformId !== 'twitter') { setCommunityLoading(false); return; }
        const p = new URLSearchParams({ status: 'posted', platform: 'twitter', source: 'community', limit: String(LIMIT), page: String(communityPage) });
        const { from, to } = getDateRange(timeFilter);
        if (from) p.set('from', from.toISOString());
        if (to) p.set('to', to.toISOString());
        try {
            const res = await fetch(`${API_BASE}/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setCommunityPosts(data.posts ?? []);
            setCommunityTotal(data.total ?? 0);
        } catch { /* silent */ }
        setCommunityLoading(false);
    }, [platformId, timeFilter, communityPage]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
    useEffect(() => { setLoading(true); fetchPosts(); }, [fetchPosts]);
    useEffect(() => { setCommunityLoading(true); fetchCommunityPosts(); }, [fetchCommunityPosts]);
    useEffect(() => { fetchEngageStats(); }, [fetchEngageStats]);
    useEffect(() => {
        setEngageListPage(1);
        fetchEngageList(engageTab, 1);
    }, [engageTab, fetchEngageList]);
    useEffect(() => { fetchEngageList(engageTab, engageListPage); }, [engageListPage, engageTab, fetchEngageList]);
    useEffect(() => {
        pollRef.current = setInterval(() => { fetchPosts(); fetchCommunityPosts(); fetchEngageStats(); }, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts, fetchCommunityPosts, fetchEngageStats]);

    if (!meta) return null;

    const { label, color, icon } = meta;
    const replyLabel = REPLY_LABEL[platformId] || 'Comment';
    const isCommunityView = platformId === 'twitter' && viewMode === 'community';
    const activePosts = isCommunityView ? communityPosts : posts;
    const activeTotal = isCommunityView ? communityTotal : total;
    const activePage = isCommunityView ? communityPage : page;
    const setActivePage = isCommunityView ? setCommunityPage : setPage;
    const activeLoading = isCommunityView ? communityLoading : loading;
    const totalPages = Math.ceil(activeTotal / LIMIT);
    const startItem = (activePage - 1) * LIMIT + 1;
    const endItem = Math.min(activePage * LIMIT, activeTotal);

    /* page numbers to show */
    const pageNumbers: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, activePage - delta); i <= Math.min(totalPages, activePage + delta); i++) pageNumbers.push(i);

    return (
        <div className="animate-fade-in" style={{ minHeight: '100vh' }}>

            {/* ══ Hero Header ══════════════════════════════════════════ */}
            <div style={{
                background: `linear-gradient(135deg, ${color}18 0%, transparent 60%)`,
                borderBottom: '1px solid var(--border-subtle)',
                padding: '24px 28px 20px',
            }}>
                {/* Breadcrumb */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                    <button onClick={() => router.back()} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 12, padding: 0,
                        transition: 'color 150ms',
                    }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                            <polyline points="15,18 9,12 15,6" />
                        </svg>
                        Overview
                    </button>
                    <span>/</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>

                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: `${color}20`, border: `1px solid ${color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color,
                        }}>
                            {icon}
                        </div>
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                                {accounts.length > 0
                                    ? `${accounts.length} connected account${accounts.length > 1 ? 's' : ''} · ${total} comment${total !== 1 ? 's' : ''} published`
                                    : 'No accounts connected'}
                            </p>
                        </div>
                    </div>

                    {/* Live indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 6px #34d399' }} />
                        Live
                    </div>
                </div>

                {/* ── Account cards ── */}
                {accounts.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
                        {accounts.map((acc) => {
                            const displayLabel = acc.displayName || acc.username || label + ' Account';
                            const handle = acc.username ? `@${acc.username}` : acc.id;
                            const cookieOk = acc.cookieVerified !== false;
                            const verifiedAgo = acc.verifiedAt
                                ? timeAgo(new Date(acc.verifiedAt))
                                : (acc.addedAt ? timeAgo(new Date(acc.addedAt)) : null);
                            return (
                                <div key={acc.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    background: 'var(--bg-card)',
                                    border: `1px solid ${cookieOk ? color + '35' : 'rgba(239,68,68,0.3)'}`,
                                    borderRadius: 12, padding: '10px 16px',
                                    minWidth: 220,
                                }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                        background: `${color}22`, color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: 14,
                                    }}>
                                        {displayLabel[0].toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {displayLabel}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {handle}
                                        </div>
                                        {verifiedAgo && (
                                            <div style={{ fontSize: 10, color: cookieOk ? '#34d399' : '#f87171', marginTop: 2 }}>
                                                {cookieOk ? '✓' : '✗'} Cookies verified {verifiedAgo}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status badge */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                            background: cookieOk ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                                            color: cookieOk ? '#34d399' : '#f87171',
                                        }}>
                                            {cookieOk ? 'Active' : 'Expired'}
                                        </span>
                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 }}>
                                            #{acc.accountIndex + 1}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {accounts.length === 0 && (
                    <div style={{
                        marginTop: 16, padding: '10px 16px',
                        background: 'rgba(239,68,68,0.06)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 10, fontSize: 12, color: '#f87171',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        No account connected — go to <strong style={{ marginLeft: 4 }}>Social Accounts</strong> to add cookies.
                    </div>
                )}

                {/* ── Bot config summary bar ── */}
                {(() => {
                    const brandRate = platformSettings[`${platformId}BrandMentionRate`] ?? 25;
                    const cooldown = platformSettings[`${platformId}CooldownMinutes`];
                    const communities: string[] = platformSettings['twitterCommunityIds'] ?? [];
                    const dailyLimit = platformSettings[`${platformId}DailyLimit`];
                    const threshold = platformSettings[`${platformId}AutoPostThreshold`];

                    const riskColor = brandRate <= 25 ? '#22c55e' : brandRate <= 50 ? '#f59e0b' : brandRate <= 75 ? '#f97316' : '#ef4444';
                    const riskLabel = brandRate <= 25 ? 'Safe' : brandRate <= 50 ? 'Moderate' : brandRate <= 75 ? 'High Risk' : 'Ban Risk';

                    const chips: { label: string; value: string; accent: string }[] = [
                        { label: 'Daily limit', value: dailyLimit != null ? `${dailyLimit}/day` : '—', accent: color },
                        { label: 'Auto-post', value: threshold != null ? `≥${threshold}%` : '—', accent: color },
                        { label: 'Brand rate', value: `${brandRate}% · ${riskLabel}`, accent: riskColor },
                        ...(cooldown != null ? [{ label: 'Cooldown', value: cooldown >= 60 ? `${Math.floor(cooldown / 60)}h${cooldown % 60 ? ` ${cooldown % 60}m` : ''}` : `${cooldown}m`, accent: color }] : []),
                        ...(platformId === 'twitter' && communities.length > 0 ? [{ label: 'Communities', value: `${communities.length} monitored`, accent: '#1d9bf0' }] : []),
                        ...(platformId === 'quora' ? [{ label: 'Mode', value: 'Answer → Brand Comment', accent: '#818cf8' }] : []),
                    ];

                    return (
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                            {chips.map(chip => (
                                <div key={chip.label} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '5px 12px', borderRadius: 8,
                                    background: `${chip.accent}10`, border: `1px solid ${chip.accent}28`,
                                    fontSize: 11,
                                }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{chip.label}:</span>
                                    <span style={{ color: chip.accent, fontWeight: 700 }}>{chip.value}</span>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>

            {/* ══ Twitter Engagement Stats ════════════════════════════ */}
            {platformId === 'twitter' && engageStats && (
                <div style={{
                    padding: '16px 28px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                        Bot Engagement Activity
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

                        {/* Likes */}
                        <div style={{
                            flex: '1 1 130px', minWidth: 130,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: '12px 16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <svg viewBox="0 0 24 24" fill="#f43f5e" width="15" height="15">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Liked</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#f43f5e', lineHeight: 1 }}>{engageStats.totalLiked}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                +{engageStats.todayLiked} today
                            </div>
                        </div>

                        {/* Retweets */}
                        <div style={{
                            flex: '1 1 130px', minWidth: 130,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: '12px 16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.2} width="15" height="15">
                                    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                    <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Retweeted</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{engageStats.totalRetweeted}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                +{engageStats.todayRetweeted} today
                            </div>
                        </div>

                        {/* Bookmarks */}
                        <div style={{
                            flex: '1 1 130px', minWidth: 130,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: '12px 16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <svg viewBox="0 0 24 24" fill="#fbbf24" width="15" height="15">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Bookmarked</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>{engageStats.totalBookmarked}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>all time</div>
                        </div>

                        {/* Following */}
                        <div style={{
                            flex: '1 1 130px', minWidth: 130,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: '12px 16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2} width="15" height="15">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Following</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#818cf8', lineHeight: 1 }}>{engageStats.currentlyFollowing}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                {engageStats.totalUnfollowed} unfollowed
                            </div>
                        </div>

                        {/* Recent follows list */}
                        {engageStats.recentFollows.length > 0 && (
                            <div style={{
                                flex: '2 1 220px', minWidth: 220,
                                background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                                borderRadius: 12, padding: '12px 16px',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Recently Followed</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {engageStats.recentFollows.map((f) => (
                                        <div key={f.handle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1d9bf0' }}>@{f.handle}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                {timeAgo(new Date(f.followedAt))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ Twitter Engagement List Browser ═════════════════════ */}
            {platformId === 'twitter' && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {/* Tab bar */}
                    <div style={{ display: 'flex', gap: 0, padding: '0 28px', borderBottom: '1px solid var(--border-subtle)' }}>
                        {([
                            { key: 'liked',      label: 'Liked',      color: '#f43f5e' },
                            { key: 'retweeted',  label: 'Retweeted',  color: '#34d399' },
                            { key: 'bookmarked', label: 'Bookmarked', color: '#fbbf24' },
                            { key: 'followed',   label: 'Follows',    color: '#818cf8' },
                        ] as const).map(({ key, label, color: c }) => (
                            <button key={key} onClick={() => setEngageTab(key)} style={{
                                padding: '12px 18px', border: 'none', background: 'none',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                color: engageTab === key ? c : 'var(--text-muted)',
                                borderBottom: engageTab === key ? `2px solid ${c}` : '2px solid transparent',
                                transition: 'all 150ms', marginBottom: -1,
                            }}>
                                {label}
                                {engageStats && (
                                    <span style={{
                                        marginLeft: 6, fontSize: 10, fontWeight: 700,
                                        padding: '1px 6px', borderRadius: 8,
                                        background: engageTab === key ? `${c}20` : 'var(--bg-card)',
                                        color: engageTab === key ? c : 'var(--text-muted)',
                                    }}>
                                        {key === 'liked' ? engageStats.totalLiked
                                            : key === 'retweeted' ? engageStats.totalRetweeted
                                            : key === 'bookmarked' ? engageStats.totalBookmarked
                                            : engageStats.currentlyFollowing + engageStats.totalUnfollowed}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* List content */}
                    <div style={{ padding: '0 28px 16px' }}>
                        {engageListLoading ? (
                            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
                        ) : !engageListData || (engageTab !== 'followed' ? (engageListData.posts?.length ?? 0) === 0 : (engageListData.follows?.length ?? 0) === 0) ? (
                            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                                No {engageTab} activity yet — run the engage cron to start
                            </div>
                        ) : engageTab === 'followed' ? (
                            /* ── Follows table ── */
                            <div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            {['Account', 'Followed', 'Status', 'Unfollowed'].map(h => (
                                                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {engageListData.follows!.map((f) => (
                                            <tr key={f.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <a href={`https://x.com/${f.handle}`} target="_blank" rel="noopener noreferrer"
                                                        style={{ color: '#1d9bf0', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>
                                                        @{f.handle}
                                                    </a>
                                                </td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{timeAgo(new Date(f.followedAt))}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                                        background: f.isFollowing ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.12)',
                                                        color: f.isFollowing ? '#34d399' : 'var(--text-muted)',
                                                    }}>{f.isFollowing ? 'Following' : 'Unfollowed'}</span>
                                                </td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                                    {f.unfollowedAt ? timeAgo(new Date(f.unfollowedAt)) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* ── Post rows (liked / retweeted / bookmarked) ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {engageListData.posts!.map((p) => (
                                    <div key={p.id} style={{
                                        padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
                                        display: 'flex', gap: 14, alignItems: 'flex-start',
                                    }}>
                                        {/* Engagement badges */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                                            {p.liked && (
                                                <span title="Liked" style={{ fontSize: 14 }}>
                                                    <svg viewBox="0 0 24 24" fill="#f43f5e" width="14" height="14"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                                                </span>
                                            )}
                                            {p.retweeted && (
                                                <span title="Retweeted">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.2} width="14" height="14"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                                </span>
                                            )}
                                            {p.bookmarked && (
                                                <span title="Bookmarked">
                                                    <svg viewBox="0 0 24 24" fill="#fbbf24" width="14" height="14"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                                                </span>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{p.author || 'Unknown'}</span>
                                                {p.score != null && (
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                                                        background: `${scoreColor(p.score)}18`, color: scoreColor(p.score),
                                                    }}>Score {p.score}</span>
                                                )}
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(new Date(p.updatedAt))}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {p.content}
                                            </p>
                                            <a href={p.url} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: 11, color: '#1d9bf0', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>
                                                View on X →
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {engageListData && engageListData.pages > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Page {engageListData.page} of {engageListData.pages} · {engageListData.total} total
                                </span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setEngageListPage(p => Math.max(1, p - 1))} disabled={engageListData.page <= 1} style={{
                                        padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)',
                                        background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12,
                                        cursor: engageListData.page <= 1 ? 'default' : 'pointer', opacity: engageListData.page <= 1 ? 0.4 : 1,
                                    }}>Prev</button>
                                    <button onClick={() => setEngageListPage(p => Math.min(engageListData.pages, p + 1))} disabled={engageListData.page >= engageListData.pages} style={{
                                        padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)',
                                        background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12,
                                        cursor: engageListData.page >= engageListData.pages ? 'default' : 'pointer', opacity: engageListData.page >= engageListData.pages ? 0.4 : 1,
                                    }}>Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ Body ════════════════════════════════════════════════ */}
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Toolbar: source toggle (Twitter) + time filters + result count ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Source toggle — Twitter only */}
                        {platformId === 'twitter' && (
                            <div style={{
                                display: 'flex', gap: 2,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 10, padding: 3,
                            }}>
                                {([
                                    { value: 'keyword', label: 'Keyword Replies' },
                                    { value: 'community', label: 'Communities' },
                                ] as const).map(({ value, label: lbl }) => (
                                    <button key={value} onClick={() => { setViewMode(value); setExpandedId(null); }} style={{
                                        padding: '6px 14px', borderRadius: 8, border: 'none',
                                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        background: viewMode === value ? (value === 'community' ? '#1d9bf0' : color) : 'transparent',
                                        color: viewMode === value ? '#fff' : 'var(--text-muted)',
                                        transition: 'all 150ms',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                        {value === 'community' && (
                                            <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
                                                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z" />
                                            </svg>
                                        )}
                                        {lbl}
                                        {value === 'community' && communityTotal > 0 && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, lineHeight: 1,
                                                padding: '2px 6px', borderRadius: 10,
                                                background: viewMode === 'community' ? 'rgba(255,255,255,0.25)' : 'rgba(29,155,240,0.15)',
                                                color: viewMode === 'community' ? '#fff' : '#1d9bf0',
                                            }}>{communityTotal}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Tab-style time filters */}
                        <div style={{
                            display: 'flex', gap: 2,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 10, padding: 3,
                        }}>
                            {TIME_FILTERS.map(({ value, label: lbl }) => (
                                <button key={value} onClick={() => { setTimeFilter(value); setPage(1); setCommunityPage(1); }} style={{
                                    padding: '6px 14px', borderRadius: 8, border: 'none',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    background: timeFilter === value ? color : 'transparent',
                                    color: timeFilter === value ? '#fff' : 'var(--text-muted)',
                                    transition: 'all 150ms',
                                }}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Result count */}
                    {activeTotal > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Showing <strong style={{ color: 'var(--text-secondary)' }}>{startItem}–{endItem}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{activeTotal}</strong> {isCommunityView ? 'replies' : 'comments'}
                        </span>
                    )}
                </div>

                {/* ── Post list ── */}
                {activeLoading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Loading…
                    </div>
                ) : activePosts.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '64px 20px',
                        background: 'var(--bg-card)', border: `1px solid ${isCommunityView ? 'rgba(29,155,240,0.15)' : 'var(--border-subtle)'}`,
                        borderRadius: 14,
                    }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: `${isCommunityView ? '#1d9bf0' : color}12`, border: `1px solid ${isCommunityView ? '#1d9bf0' : color}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px', color: isCommunityView ? '#1d9bf0' : color,
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                            {isCommunityView ? 'No community replies yet' : 'No comments yet'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                            {isCommunityView
                                ? 'Add community IDs in Settings → Twitter → Communities, or click Sync to auto-detect.'
                                : 'No posted comments found for this time period.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: `1px solid ${isCommunityView ? 'rgba(29,155,240,0.2)' : 'var(--border-subtle)'}`, borderRadius: 14, overflow: 'hidden' }}>
                        {activePosts.map((post, idx) => {
                            const expanded = expandedId === post._id;
                            const reply = post.editedReply || post.aiReply || '';
                            const postedAt = post.postedAt ? new Date(post.postedAt) : null;
                            const score = post.aiRelevanceScore;
                            const isLast = idx === activePosts.length - 1;

                            return (
                                <div key={post._id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
                                    {/* ── Row (always visible) ── */}
                                    <div
                                        onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 14,
                                            padding: '14px 18px', cursor: 'pointer',
                                            background: expanded ? `${color}08` : 'transparent',
                                            transition: 'background 150ms',
                                        }}
                                        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                        {/* Left accent bar */}
                                        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: expanded ? color : 'transparent', flexShrink: 0, minHeight: 20 }} />

                                        {/* Avatar */}
                                        <div style={{
                                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                            background: `${color}20`, color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 700, marginTop: 1,
                                        }}>
                                            {post.postedByAccount
                                                ? post.postedByAccount[0].toUpperCase()
                                                : (post.author ? post.author[0].toUpperCase() : '?')}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* Top meta line */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                {post.postedByAccount && (
                                                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{post.postedByAccount}</span>
                                                )}
                                                {post.author && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>on thread by {post.author}</span>
                                                )}
                                                {post.keywordsMatched?.length ? (() => {
                                                    const kw = post.keywordsMatched[0];
                                                    const isCommunity = kw.startsWith('community:');
                                                    return (
                                                        <span style={{
                                                            fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600,
                                                            background: isCommunity ? 'rgba(29,155,240,0.12)' : 'var(--accent-bg)',
                                                            color: isCommunity ? '#1d9bf0' : 'var(--accent)',
                                                            border: isCommunity ? '1px solid rgba(29,155,240,0.25)' : undefined,
                                                        }}>
                                                            {isCommunity ? `Community ${kw.replace('community:', '')}` : kw}{post.keywordsMatched.length > 1 ? ` +${post.keywordsMatched.length - 1}` : ''}
                                                        </span>
                                                    );
                                                })() : null}
                                            </div>

                                            {/* Post content preview */}
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {post.content}
                                            </p>

                                            {/* Reply preview */}
                                            {reply && !expanded && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                        <polyline points="9,17 4,12 9,7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
                                                    </svg>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                                                        {reply.slice(0, 100)}{reply.length > 100 ? '…' : ''}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right: score + time + chevron */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                            {score != null && (
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    minWidth: 38,
                                                }}>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
                                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
                                                </div>
                                            )}
                                            {postedAt && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {timeAgo(postedAt)}
                                                </span>
                                            )}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                                style={{ width: 16, height: 16, color: 'var(--text-muted)', transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }}>
                                                <polyline points="6,9 12,15 18,9" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* ── Expanded detail ── */}
                                    {expanded && (
                                        <div style={{ padding: '0 18px 18px 69px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                                            {/* Original post bubble */}
                                            <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                                    Original Post{post.author ? ` · by ${post.author}` : ''}
                                                </div>
                                                <div style={{
                                                    background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                                                    borderRadius: 10, padding: '12px 16px',
                                                    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
                                                }}>
                                                    {post.content}
                                                </div>
                                                {post.url && (
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 12, color: 'var(--accent)', marginTop: 6, textDecoration: 'none',
                                                    }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                            <polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" />
                                                        </svg>
                                                        View original thread
                                                    </a>
                                                )}
                                            </div>

                                            {/* Bot reply bubble */}
                                            {reply && (
                                                <div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, marginBottom: 8 }}>
                                                        {replyLabel} Published
                                                        {post.postedByAccount && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>· @{post.postedByAccount}</span>}
                                                    </div>
                                                    <div style={{
                                                        background: `${color}0d`,
                                                        border: `1px solid ${color}30`,
                                                        borderRadius: 10, padding: '12px 16px',
                                                        fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65,
                                                        position: 'relative',
                                                    }}>
                                                        <div style={{
                                                            position: 'absolute', top: 12, right: 12,
                                                            width: 6, height: 6, borderRadius: '50%', background: color,
                                                        }} />
                                                        {reply}
                                                    </div>
                                                    {post.replyUrl && (
                                                        <a href={post.replyUrl} target="_blank" rel="noopener noreferrer" style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            fontSize: 12, color, marginTop: 6, textDecoration: 'none',
                                                        }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                                <polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" />
                                                            </svg>
                                                            View {replyLabel.toLowerCase()} on {label}
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {/* Metadata chips */}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {postedAt && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                                                        {postedAt.toLocaleString()}
                                                    </span>
                                                )}
                                                {post.aiTone && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', textTransform: 'capitalize' }}>
                                                        Tone: {post.aiTone}
                                                    </span>
                                                )}
                                                {post.keywordsMatched?.length ? (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                                                        {post.keywordsMatched.join(' · ')}
                                                    </span>
                                                ) : null}
                                                {score != null && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${scoreColor(score)}14`, color: scoreColor(score), border: `1px solid ${scoreColor(score)}30` }}>
                                                        Score: {score}%
                                                    </span>
                                                )}
                                            </div>

                                            {/* AI Reasoning */}
                                            {post.aiReasoning && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, borderLeft: `2px solid var(--border-default)`, paddingLeft: 12 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>AI reasoning: </span>
                                                    {post.aiReasoning}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Page {activePage} of {totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button disabled={activePage === 1} onClick={() => setActivePage(p => Math.max(1, p - 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: activePage === 1 ? 'not-allowed' : 'pointer', opacity: activePage === 1 ? 0.35 : 1, transition: 'all 150ms' }}>←</button>
                            {pageNumbers[0] > 1 && (
                                <>
                                    <button onClick={() => setActivePage(1)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>1</button>
                                    {pageNumbers[0] > 2 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                </>
                            )}
                            {pageNumbers.map(n => (
                                <button key={n} onClick={() => setActivePage(n)} style={{ padding: '6px 11px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 150ms', border: n === activePage ? `1px solid ${isCommunityView ? '#1d9bf0' : color}` : '1px solid var(--border-subtle)', background: n === activePage ? `${isCommunityView ? '#1d9bf0' : color}18` : 'var(--bg-card)', color: n === activePage ? (isCommunityView ? '#1d9bf0' : color) : 'var(--text-secondary)', fontWeight: n === activePage ? 700 : 400 }}>{n}</button>
                            ))}
                            {pageNumbers[pageNumbers.length - 1] < totalPages && (
                                <>
                                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                    <button onClick={() => setActivePage(totalPages)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>{totalPages}</button>
                                </>
                            )}
                            <button disabled={activePage === totalPages} onClick={() => setActivePage(p => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: activePage === totalPages ? 'not-allowed' : 'pointer', opacity: activePage === totalPages ? 0.35 : 1, transition: 'all 150ms' }}>→</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
