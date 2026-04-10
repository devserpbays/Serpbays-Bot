'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/apiBase';

interface ReviewPost {
    id: string;
    url: string;
    platform: string;
    content: string;
    author: string;
    aiReply: string;
    aiRelevanceScore: number;
    scrapedAt: string;
}

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
    twitter: { label: 'Twitter / X', color: '#1d9bf0', icon: '𝕏' },
    facebook: { label: 'Facebook', color: '#1877f2', icon: 'f' },
    quora: { label: 'Quora', color: '#b92b27', icon: 'Q' },
    reddit: { label: 'Reddit', color: '#ff4500', icon: 'R' },
    youtube: { label: 'YouTube', color: '#ff0000', icon: '▶' },
    pinterest: { label: 'Pinterest', color: '#e60023', icon: 'P' },
    skool:     { label: 'Skool',     color: '#5865f2', icon: 'S' },
};

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export default function ReviewPage() {
    const [platforms, setPlatforms] = useState<Record<string, ReviewPost[]>>({});
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activePlatform, setActivePlatform] = useState<string>('all');

    const fetchPosts = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/extension/review`);
            const data = await res.json();
            setPlatforms(data.platforms || {});
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchPosts, 30000);
        return () => clearInterval(interval);
    }, [fetchPosts]);

    const handleAction = async (postId: string, action: string, editedReply?: string) => {
        setActionLoading(postId);
        try {
            const res = await fetch(`${API_BASE}/api/extension/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId, action, editedReply }),
            });
            const data = await res.json();

            if (action === 'approve' && data.task?.url) {
                // Open the post URL with gm_task in hash — SPAs don't strip hash fragments
                window.open(`${data.task.url}#gm_task=${data.task.id}`, '_blank');
            }

            setEditingId(null);
            await fetchPosts();
        } catch { /* silent */ }
        setActionLoading(null);
    };

    const totalPosts = Object.values(platforms).reduce((sum, posts) => sum + posts.length, 0);

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Review Queue</h2>
                <p>Approve, edit, or reject AI-generated replies before they&apos;re posted</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Platform tabs */}
                {Object.keys(platforms).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setActivePlatform('all')}
                            style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                border: `1px solid ${activePlatform === 'all' ? '#0ea5e9' : 'rgba(255,255,255,0.1)'}`,
                                background: activePlatform === 'all' ? 'rgba(14,165,233,0.1)' : 'transparent',
                                color: activePlatform === 'all' ? '#0ea5e9' : 'var(--text-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            All ({totalPosts})
                        </button>
                        {Object.entries(platforms).map(([pid, posts]) => {
                            const meta = PLATFORM_META[pid] || { label: pid, color: '#888' };
                            const isActive = activePlatform === pid;
                            return (
                                <button
                                    key={pid}
                                    onClick={() => setActivePlatform(pid)}
                                    style={{
                                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                        border: `1px solid ${isActive ? meta.color : 'rgba(255,255,255,0.1)'}`,
                                        background: isActive ? `${meta.color}15` : 'transparent',
                                        color: isActive ? meta.color : 'var(--text-muted)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {meta.label} ({posts.length})
                                </button>
                            );
                        })}
                    </div>
                )}

                {loading && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
                )}

                {!loading && totalPosts === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '40px 20px',
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>&#10003;</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>All caught up!</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                            No posts pending review. New posts will appear here as they&apos;re scraped and evaluated.
                        </div>
                    </div>
                )}

                {Object.entries(platforms)
                    .filter(([pid]) => activePlatform === 'all' || activePlatform === pid)
                    .map(([platformId, posts]) => {
                    if (posts.length === 0) return null;
                    const meta = PLATFORM_META[platformId] || { label: platformId, color: '#888', icon: '?' };

                    return (
                        <div key={platformId}>
                            {/* Platform header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                            }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: `${meta.color}15`, color: meta.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: 15,
                                }}>
                                    {meta.icon}
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Top {posts.length} most relevant</div>
                                </div>
                            </div>

                            {/* Post cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {posts.map((post, idx) => (
                                    <div key={post.id} style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 16,
                                        position: 'relative',
                                    }}>
                                        {/* Score badge */}
                                        <div style={{
                                            position: 'absolute', top: 12, right: 12,
                                            background: post.aiRelevanceScore >= 90 ? 'rgba(34,197,94,0.15)' : post.aiRelevanceScore >= 70 ? 'rgba(14,165,233,0.15)' : 'rgba(245,158,11,0.15)',
                                            color: post.aiRelevanceScore >= 90 ? '#22c55e' : post.aiRelevanceScore >= 70 ? '#0ea5e9' : '#f59e0b',
                                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                                        }}>
                                            {post.aiRelevanceScore}%
                                        </div>

                                        {/* Original post */}
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                            {post.author !== 'Unknown' ? `@${post.author}` : ''} &middot; {timeAgo(post.scrapedAt)}
                                        </div>
                                        <div style={{
                                            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                                            marginBottom: 12, maxHeight: 80, overflow: 'hidden',
                                        }}>
                                            {post.content}
                                        </div>

                                        {/* AI Reply */}
                                        <div style={{
                                            background: 'rgba(14,165,233,0.05)',
                                            border: '1px solid rgba(14,165,233,0.1)',
                                            borderRadius: 10, padding: 12, marginBottom: 12,
                                        }}>
                                            <div style={{ fontSize: 10, color: '#0ea5e9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                                AI Reply
                                            </div>
                                            {editingId === post.id ? (
                                                <textarea
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    style={{
                                                        width: '100%', minHeight: 80, padding: 8,
                                                        background: 'var(--bg-base)', border: '1px solid var(--border)',
                                                        borderRadius: 8, color: 'var(--text-primary)',
                                                        fontSize: 13, resize: 'vertical', outline: 'none',
                                                    }}
                                                />
                                            ) : (
                                                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                    {post.aiReply}
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            {editingId === post.id ? (
                                                <>
                                                    <button
                                                        onClick={() => handleAction(post.id, 'approve', editText)}
                                                        disabled={actionLoading === post.id}
                                                        style={{
                                                            padding: '6px 16px', borderRadius: 8, border: 'none',
                                                            background: '#22c55e', color: '#fff', fontSize: 12,
                                                            fontWeight: 600, cursor: 'pointer', opacity: actionLoading === post.id ? 0.5 : 1,
                                                        }}
                                                    >
                                                        Save &amp; Approve
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        style={{
                                                            padding: '6px 16px', borderRadius: 8,
                                                            border: '1px solid var(--border)', background: 'transparent',
                                                            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleAction(post.id, 'approve')}
                                                        disabled={actionLoading === post.id}
                                                        style={{
                                                            padding: '6px 16px', borderRadius: 8, border: 'none',
                                                            background: '#22c55e', color: '#fff', fontSize: 12,
                                                            fontWeight: 600, cursor: 'pointer', opacity: actionLoading === post.id ? 0.5 : 1,
                                                        }}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingId(post.id); setEditText(post.aiReply); }}
                                                        style={{
                                                            padding: '6px 16px', borderRadius: 8,
                                                            border: '1px solid rgba(14,165,233,0.3)', background: 'transparent',
                                                            color: '#0ea5e9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(post.id, 'reject')}
                                                        disabled={actionLoading === post.id}
                                                        style={{
                                                            padding: '6px 16px', borderRadius: 8,
                                                            border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                                                            color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                            opacity: actionLoading === post.id ? 0.5 : 1,
                                                        }}
                                                    >
                                                        Reject
                                                    </button>
                                                    <a
                                                        href={post.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)',
                                                            textDecoration: 'none',
                                                        }}
                                                    >
                                                        View original &#8599;
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
