'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IPost } from '@/lib/types';

const PLATFORM_FILTERS = [
    { value: '', label: 'All Platforms' },
    { value: 'twitter', label: 'Twitter / X' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'reddit', label: 'Reddit' },
    { value: 'quora', label: 'Quora' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'pinterest', label: 'Pinterest' },
];

const TIME_FILTERS = [
    { value: 'today',   label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days',   label: 'Last 7 days' },
    { value: '15days',  label: 'Last 15 days' },
    { value: '30days',  label: 'Last 30 days' },
    { value: 'all',     label: 'All time' },
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

const PLATFORM_COLORS: Record<string, string> = {
    twitter: '#1d9bf0', facebook: '#1877f2', reddit: '#ff4500',
    quora: '#b92b27', youtube: '#ff0000', pinterest: '#e60023',
};

const PLATFORM_LABELS: Record<string, string> = {
    twitter: 'Twitter / X', facebook: 'Facebook', reddit: 'Reddit',
    quora: 'Quora', youtube: 'YouTube', pinterest: 'Pinterest',
};

const REPLY_LABEL: Record<string, string> = {
    twitter: 'Reply', quora: 'Answer',
};

interface PostsResponse { posts: IPost[]; total: number; page: number; limit: number; }

const LIMIT = 20;
const POLL_MS = 15_000;

export default function PostsPage() {
    const [posts, setPosts]               = useState<IPost[]>([]);
    const [total, setTotal]               = useState(0);
    const [page, setPage]                 = useState(1);
    const [platform, setPlatform]         = useState('');
    const [timeFilter, setTimeFilter]     = useState('today');
    const [expandedId, setExpandedId]     = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchPosts = useCallback(async () => {
        const params = new URLSearchParams({ status: 'posted', limit: String(LIMIT), page: String(page) });
        if (platform) params.set('platform', platform);

        const { from, to } = getDateRange(timeFilter);
        if (from) params.set('from', from.toISOString());
        if (to) params.set('to', to.toISOString());

        try {
            const res = await fetch(`/api/posts?${params}`);
            const data: PostsResponse = await res.json();
            setPosts(data.posts ?? []);
            setTotal(data.total ?? 0);
        } catch { /* silent */ }
    }, [platform, timeFilter, page]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);
    useEffect(() => {
        pollRef.current = setInterval(fetchPosts, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts]);

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h2>Posted Comments</h2>
                    <p>All comments and replies successfully posted across platforms</p>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {total} post{total !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── Filters ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Time filter */}
                    <div className="chip-group">
                        {TIME_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                className={`chip ${timeFilter === value ? 'active' : ''}`}
                                onClick={() => { setTimeFilter(value); setPage(1); }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Platform filter */}
                    <div className="chip-group">
                        {PLATFORM_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                className={`chip ${platform === value ? 'active' : ''}`}
                                style={platform === value && value ? { background: PLATFORM_COLORS[value], borderColor: PLATFORM_COLORS[value], color: '#fff' } : undefined}
                                onClick={() => { setPlatform(value); setPage(1); }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Post List ── */}
                {posts.length === 0 ? (
                    <div className="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.4 }}>
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        <h3>No posted comments</h3>
                        <p>No comments found for the selected filters.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {posts.map((post) => {
                            const expanded = expandedId === post._id;
                            const reply = post.editedReply || post.aiReply || '';
                            const color = PLATFORM_COLORS[post.platform] || 'var(--accent)';
                            const replyLabel = REPLY_LABEL[post.platform] || 'Comment';
                            const postedAt = post.postedAt ? new Date(post.postedAt).toLocaleString() : '';

                            return (
                                <div key={post._id} className="post-card" style={{ borderLeft: `3px solid ${color}` }}>
                                    {/* Header row */}
                                    <div
                                        className="post-card-header"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                            <span
                                                className={`platform-chip platform-${post.platform}`}
                                                style={{ fontSize: 11, background: color + '22', color, border: `1px solid ${color}44`, flexShrink: 0 }}
                                            >
                                                {PLATFORM_LABELS[post.platform] || post.platform}
                                            </span>
                                            <span style={{
                                                fontSize: 13, color: 'var(--text-secondary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {post.content.slice(0, 120)}{post.content.length > 120 ? '…' : ''}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                            {post.aiRelevanceScore != null && (
                                                <span style={{ fontSize: 12, fontWeight: 700, color }}>
                                                    {post.aiRelevanceScore}%
                                                </span>
                                            )}
                                            {postedAt && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {postedAt}
                                                </span>
                                            )}
                                            <svg
                                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                                style={{ width: 16, height: 16, color: 'var(--text-muted)', transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : undefined }}
                                            >
                                                <polyline points="6,9 12,15 18,9" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Expanded */}
                                    {expanded && (
                                        <div className="post-card-body">
                                            {/* Original post */}
                                            <div style={{ marginBottom: 14 }}>
                                                <div className="label">Original Post{post.author ? ` by ${post.author}` : ''}</div>
                                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '6px 0 0' }}>
                                                    {post.content}
                                                </p>
                                                {post.url && (
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                        style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6, display: 'inline-block' }}>
                                                        View original →
                                                    </a>
                                                )}
                                            </div>

                                            {/* Posted reply */}
                                            {reply && (
                                                <div style={{ marginBottom: 14 }}>
                                                    <div className="label">{replyLabel} Posted</div>
                                                    <div style={{
                                                        background: color + '11', border: `1px solid ${color}33`,
                                                        borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                                                        fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginTop: 6,
                                                    }}>
                                                        {reply}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Meta row */}
                                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
                                                {post.postedByAccount && <span>Account: <strong style={{ color: 'var(--text-secondary)' }}>{post.postedByAccount}</strong></span>}
                                                {post.keywordsMatched?.length ? <span>Keywords: <strong style={{ color: 'var(--text-secondary)' }}>{post.keywordsMatched.join(', ')}</strong></span> : null}
                                                {post.replyUrl && (
                                                    <a href={post.replyUrl} target="_blank" rel="noopener noreferrer"
                                                        style={{ color: 'var(--accent)', marginLeft: 'auto' }}>
                                                        View reply →
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div className="pagination">
                        <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                            ← Previous
                        </button>
                        <span className="pagination-info">Page {page} of {totalPages}</span>
                        <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                            Next →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
