'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IPost, PostStatus } from '@/lib/types';

/* ── Status config ───────────────────────────────────────────────── */
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    new: { label: 'New', cls: 'badge-new' },
    evaluating: { label: 'Evaluating', cls: 'badge-evaluating' },
    evaluated: { label: 'Evaluated', cls: 'badge-evaluated' },
    approved: { label: 'Approved', cls: 'badge-approved' },
    rejected: { label: 'Rejected', cls: 'badge-rejected' },
    posted: { label: 'Posted', cls: 'badge-posted' },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'evaluated', label: 'Evaluated' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'posted', label: 'Posted' },
];

const PLATFORM_FILTERS = [
    { value: '', label: 'All Platforms' },
    { value: 'twitter', label: 'Twitter / X' },
    { value: 'reddit', label: 'Reddit' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'quora', label: 'Quora' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'pinterest', label: 'Pinterest' },
];

interface PostsResponse {
    posts: IPost[];
    total: number;
    page: number;
    limit: number;
}

const POLL_MS = 10_000;

export default function PostsPage() {
    const [posts, setPosts] = useState<IPost[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [platformFilter, setPlatformFilter] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchPosts = useCallback(async () => {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (platformFilter) params.set('platform', platformFilter);
        params.set('page', String(page));
        params.set('limit', '20');
        try {
            const res = await fetch(`/api/posts?${params}`);
            const data: PostsResponse = await res.json();
            setPosts(data.posts);
            setTotal(data.total);
        } catch { /* silent */ }
    }, [statusFilter, platformFilter, page]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    useEffect(() => {
        pollRef.current = setInterval(fetchPosts, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts]);

    const handleUpdate = async (id: string, data: Record<string, unknown>) => {
        setActionLoading((prev) => ({ ...prev, [id]: true }));
        try {
            await fetch('/api/posts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...data }),
            });
            fetchPosts();
        } catch { /* silent */ }
        setActionLoading((prev) => ({ ...prev, [id]: false }));
    };



    const totalPages = Math.ceil(total / 20);

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Posts</h2>
                <p>Manage scraped posts — filter, review, approve, and post replies</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* ── Filters ── */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Status */}
                    <div className="chip-group">
                        {STATUS_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                className={`chip ${statusFilter === value ? 'active' : ''}`}
                                onClick={() => { setStatusFilter(value); setPage(1); }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 4px' }} />

                    {/* Platform */}
                    <select
                        className="input"
                        style={{ width: 'auto', minWidth: 160 }}
                        value={platformFilter}
                        onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}
                    >
                        {PLATFORM_FILTERS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>

                    <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
                        {total} post{total !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* ── Post List ── */}
                {posts.length === 0 ? (
                    <div className="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="empty-state-icon" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" /><path d="M7 8h10M7 12h6" />
                        </svg>
                        <h3>No posts found</h3>
                        <p>Try adjusting your filters or run a pipeline job to scrape new posts.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {posts.map((post) => {
                            const badge = STATUS_BADGE[post.status] || STATUS_BADGE.new;
                            const expanded = expandedId === post._id;
                            const reply = post.editedReply || post.aiReply || '';

                            return (
                                <div key={post._id} className="post-card">
                                    {/* Header */}
                                    <div
                                        className="post-card-header"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                            <span className={`badge ${badge.cls}`}>{badge.label}</span>
                                            <span className={`platform-chip platform-${post.platform}`} style={{ fontSize: 11 }}>
                                                {post.platform}
                                            </span>
                                            <span style={{
                                                fontSize: 13, color: 'var(--text-secondary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {post.content.slice(0, 100)}{post.content.length > 100 ? '…' : ''}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                            {post.aiRelevanceScore != null && (
                                                <span style={{
                                                    fontSize: 12, fontWeight: 700,
                                                    color: post.aiRelevanceScore >= 70 ? 'var(--status-approved)' : post.aiRelevanceScore >= 40 ? 'var(--status-evaluating)' : 'var(--status-rejected)',
                                                }}>
                                                    {post.aiRelevanceScore}%
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

                                    {/* Expanded Body */}
                                    {expanded && (
                                        <>
                                            <div className="post-card-body">
                                                {/* Original post */}
                                                <div style={{ marginBottom: 16 }}>
                                                    <div className="label">Original Post by {post.author}</div>
                                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                        {post.content}
                                                    </p>
                                                    {post.url && (
                                                        <a
                                                            href={post.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6, display: 'inline-block' }}
                                                        >
                                                            View original →
                                                        </a>
                                                    )}
                                                </div>

                                                {/* AI Reply */}
                                                {reply && (
                                                    <div style={{ marginBottom: 16 }}>
                                                        <div className="label">AI Suggested Reply</div>
                                                        <div style={{
                                                            background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
                                                            padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6,
                                                            border: '1px solid var(--border-subtle)',
                                                        }}>
                                                            {reply}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* AI Details */}
                                                {(post.aiTone || post.aiReasoning) && (
                                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                                                        {post.aiTone && <span>Tone: <strong style={{ color: 'var(--text-secondary)' }}>{post.aiTone}</strong></span>}
                                                        {post.aiReasoning && <span>Reasoning: <strong style={{ color: 'var(--text-secondary)' }}>{post.aiReasoning}</strong></span>}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="post-card-footer">
                                                {post.status === 'evaluated' && (
                                                    <>
                                                        <button
                                                            className="btn btn-success btn-sm"
                                                            disabled={!!actionLoading[post._id!]}
                                                            onClick={() => handleUpdate(post._id!, { status: 'approved' })}
                                                        >
                                                            ✓ Approve
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            disabled={!!actionLoading[post._id!]}
                                                            onClick={() => handleUpdate(post._id!, { status: 'rejected' })}
                                                        >
                                                            ✗ Reject
                                                        </button>
                                                    </>
                                                )}
                                                {post.status === 'approved' && (
                                                    <span style={{ fontSize: 12, color: 'var(--status-approved)', fontWeight: 600 }}>
                                                        Queued for auto-posting
                                                    </span>
                                                )}
                                                {post.status === 'posted' && post.replyUrl && (
                                                    <a href={post.replyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                                                        View Reply →
                                                    </a>
                                                )}
                                                {post.status !== 'posted' && (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ marginLeft: 'auto' }}
                                                        disabled={!!actionLoading[post._id!]}
                                                        onClick={() => handleUpdate(post._id!, { status: 'rejected' })}
                                                    >
                                                        Dismiss
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div className="pagination">
                        <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(Math.max(1, page - 1))}>
                            ← Previous
                        </button>
                        <span className="pagination-info">Page {page} of {totalPages}</span>
                        <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>
                            Next →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
