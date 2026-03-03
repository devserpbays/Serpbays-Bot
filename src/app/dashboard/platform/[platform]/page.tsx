'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { IPost, SocialAccount } from '@/lib/types';

/* ── Platform metadata ─────────────────────────────────────── */
const PLATFORM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    twitter: {
        label: 'Twitter / X', color: '#1d9bf0',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    reddit: {
        label: 'Reddit', color: '#ff4500',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    facebook: {
        label: 'Facebook', color: '#1877f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    quora: {
        label: 'Quora', color: '#b92b27',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    youtube: {
        label: 'YouTube', color: '#ff0000',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    pinterest: {
        label: 'Pinterest', color: '#e60023',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
};

const TIME_FILTERS = [
    { value: 'today',    label: 'Today' },
    { value: 'yesterday',label: 'Yesterday' },
    { value: '7days',    label: '7 Days' },
    { value: '15days',   label: '15 Days' },
    { value: '30days',   label: '30 Days' },
    { value: 'all',      label: 'All Time' },
];

function getDateRange(filter: string): { from?: Date; to?: Date } {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (filter) {
        case 'today':     return { from: startOfToday };
        case 'yesterday': {
            const from = new Date(startOfToday); from.setDate(from.getDate() - 1);
            return { from, to: startOfToday };
        }
        case '7days':  { const d = new Date(startOfToday); d.setDate(d.getDate() - 6);  return { from: d }; }
        case '15days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 14); return { from: d }; }
        case '30days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 29); return { from: d }; }
        default:       return {};
    }
}

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7)  return `${d}d ago`;
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
    const params  = useParams();
    const router  = useRouter();
    const platformId = params.platform as string;
    const meta    = PLATFORM_META[platformId];

    const [posts, setPosts]           = useState<IPost[]>([]);
    const [total, setTotal]           = useState(0);
    const [page, setPage]             = useState(1);
    const [timeFilter, setTimeFilter] = useState('today');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [accounts, setAccounts]     = useState<SocialAccount[]>([]);
    const [loading, setLoading]       = useState(true);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => { if (!meta) router.replace('/dashboard'); }, [meta, router]);

    const fetchAccounts = useCallback(async () => {
        try {
            const res  = await fetch('/api/social-accounts');
            const data = await res.json();
            setAccounts((data.accounts ?? []).filter((a: SocialAccount) => a.platform === platformId));
        } catch { /* silent */ }
    }, [platformId]);

    const fetchPosts = useCallback(async () => {
        const p = new URLSearchParams({ status: 'posted', platform: platformId, limit: String(LIMIT), page: String(page) });
        const { from, to } = getDateRange(timeFilter);
        if (from) p.set('from', from.toISOString());
        if (to)   p.set('to',   to.toISOString());
        try {
            const res  = await fetch(`/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setPosts(data.posts ?? []);
            setTotal(data.total ?? 0);
        } catch { /* silent */ }
        setLoading(false);
    }, [platformId, timeFilter, page]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
    useEffect(() => { setLoading(true); fetchPosts(); }, [fetchPosts]);
    useEffect(() => {
        pollRef.current = setInterval(fetchPosts, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts]);

    if (!meta) return null;

    const { label, color, icon } = meta;
    const totalPages  = Math.ceil(total / LIMIT);
    const replyLabel  = REPLY_LABEL[platformId] || 'Comment';
    const startItem   = (page - 1) * LIMIT + 1;
    const endItem     = Math.min(page * LIMIT, total);

    /* page numbers to show */
    const pageNumbers: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) pageNumbers.push(i);

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
                                    ? `${accounts.length} connected account${accounts.length > 1 ? 's' : ''} · ${total} total posts`
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

                {/* ── Account pills ── */}
                {accounts.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                        {accounts.map((acc) => (
                            <div key={acc.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'var(--bg-card)',
                                border: `1px solid ${color}30`,
                                borderRadius: 10, padding: '7px 14px',
                            }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: `${color}22`, color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: 12, flexShrink: 0,
                                }}>
                                    {(acc.displayName || acc.username || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                        {acc.displayName || acc.username}
                                    </div>
                                    {acc.username && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>@{acc.username}</div>
                                    )}
                                </div>
                                <span style={{
                                    marginLeft: 4, fontSize: 10, fontWeight: 600,
                                    padding: '2px 7px', borderRadius: 6,
                                    background: 'rgba(52,211,153,0.12)', color: '#34d399',
                                }}>
                                    Active
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══ Body ════════════════════════════════════════════════ */}
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Toolbar: time filters + result count ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    {/* Tab-style time filters */}
                    <div style={{
                        display: 'flex', gap: 2,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 10, padding: 3,
                    }}>
                        {TIME_FILTERS.map(({ value, label: lbl }) => (
                            <button key={value} onClick={() => { setTimeFilter(value); setPage(1); }} style={{
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

                    {/* Result count */}
                    {total > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Showing <strong style={{ color: 'var(--text-secondary)' }}>{startItem}–{endItem}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{total}</strong> comments
                        </span>
                    )}
                </div>

                {/* ── Post list ── */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Loading…
                    </div>
                ) : posts.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '64px 20px',
                        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                        borderRadius: 14,
                    }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: `${color}12`, border: `1px solid ${color}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px', color,
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No comments yet</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No posted comments found for this time period.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
                        {posts.map((post, idx) => {
                            const expanded  = expandedId === post._id;
                            const reply     = post.editedReply || post.aiReply || '';
                            const postedAt  = post.postedAt ? new Date(post.postedAt) : null;
                            const score     = post.aiRelevanceScore;
                            const isLast    = idx === posts.length - 1;

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
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>on post by {post.author}</span>
                                                )}
                                                {post.keywordsMatched?.length ? (
                                                    <span style={{
                                                        fontSize: 10, padding: '1px 7px', borderRadius: 6,
                                                        background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 600,
                                                    }}>
                                                        {post.keywordsMatched[0]}{post.keywordsMatched.length > 1 ? ` +${post.keywordsMatched.length - 1}` : ''}
                                                    </span>
                                                ) : null}
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
                                                        View original post
                                                    </a>
                                                )}
                                            </div>

                                            {/* Bot reply bubble */}
                                            {reply && (
                                                <div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, marginBottom: 8 }}>
                                                        {replyLabel} Posted
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
                                                        🕐 {postedAt.toLocaleString()}
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
                            Page {page} of {totalPages}
                        </span>

                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {/* Prev */}
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                style={{
                                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                                    fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer',
                                    opacity: page === 1 ? 0.35 : 1, transition: 'all 150ms',
                                }}
                            >
                                ←
                            </button>

                            {/* First page if not in range */}
                            {pageNumbers[0] > 1 && (
                                <>
                                    <button onClick={() => setPage(1)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>1</button>
                                    {pageNumbers[0] > 2 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                </>
                            )}

                            {/* Page number buttons */}
                            {pageNumbers.map(n => (
                                <button key={n} onClick={() => setPage(n)} style={{
                                    padding: '6px 11px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 150ms',
                                    border: n === page ? `1px solid ${color}` : '1px solid var(--border-subtle)',
                                    background: n === page ? `${color}18` : 'var(--bg-card)',
                                    color: n === page ? color : 'var(--text-secondary)',
                                    fontWeight: n === page ? 700 : 400,
                                }}>
                                    {n}
                                </button>
                            ))}

                            {/* Last page if not in range */}
                            {pageNumbers[pageNumbers.length - 1] < totalPages && (
                                <>
                                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                    <button onClick={() => setPage(totalPages)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>{totalPages}</button>
                                </>
                            )}

                            {/* Next */}
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                style={{
                                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                                    fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer',
                                    opacity: page === totalPages ? 0.35 : 1, transition: 'all 150ms',
                                }}
                            >
                                →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
