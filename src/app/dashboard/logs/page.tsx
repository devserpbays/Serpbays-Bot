'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ActivityLogEntry {
    _id: string;
    platform: string;
    level: 'info' | 'warn' | 'error' | 'success';
    action: string;
    message: string;
    meta?: Record<string, unknown>;
    timestamp: string;
}

interface PostedComment {
    _id?: string;
    platform: string;
    url: string;
    postUrl?: string;
    replyUrl?: string;
    editedReply?: string;
    aiReply?: string;
    reply?: string;
    postedAt: string;
    postedByAccount?: string;
    account?: string;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    success: { label: 'Success', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: '✓' },
    info:    { label: 'Info',    color: '#0ea5e9', bg: 'rgba(14,165,233,0.06)', icon: 'i' },
    warn:    { label: 'Warning', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', icon: '!' },
    error:   { label: 'Error',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '✗' },
};

const ACTION_LABELS: Record<string, string> = {
    cron_start: 'Cron Started',
    cron_end: 'Cron Finished',
    config_error: 'Config Issue',
    auth_error: 'Auth Failed',
    scrape: 'Scraping',
    evaluate: 'AI Evaluation',
    post: 'Comment Posted',
    post_failed: 'Post Failed',
    limit: 'Limit Reached',
    skip: 'Skipped',
};

export default function LogsPage() {
    const [activeTab, setActiveTab] = useState<'activity' | 'posted'>('activity');
    const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
    const [postedComments, setPostedComments] = useState<PostedComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams({ limit: '300' });
            if (levelFilter !== 'all') params.set('level', levelFilter);
            if (platformFilter !== 'all') params.set('platform', platformFilter);
            const res = await fetch(`/api/logs?${params}`);
            const data = await res.json();
            setLogs(Array.isArray(data.logs) ? data.logs : []);
        } catch { /* silent */ }
    }, [levelFilter, platformFilter]);

    const fetchPostedComments = useCallback(async () => {
        try {
            const res = await fetch('/api/posted-comments?filter=today');
            const data = await res.json();
            setPostedComments(Array.isArray(data) ? data : data.posts ?? data.comments ?? []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchLogs(), fetchPostedComments()]).finally(() => setLoading(false));
    }, [fetchLogs, fetchPostedComments]);

    // Auto-refresh every 10s when enabled
    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(() => { fetchLogs(); }, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, fetchLogs]);

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            const now = new Date();
            const diff = now.getTime() - d.getTime();
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000 && d.getDate() === now.getDate()) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return ts;
        }
    };

    const formatFullTime = (ts: string) => {
        try { return new Date(ts).toLocaleString(); } catch { return ts; }
    };

    const levelCounts = logs.reduce((acc, l) => {
        acc[l.level] = (acc[l.level] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Activity Logs</h2>
                <p>Track your cron jobs, posts, and platform activity in real-time</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Tab Switcher */}
                <div className="chip-group">
                    <button className={`chip ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                        Activity Log
                    </button>
                    <button className={`chip ${activeTab === 'posted' ? 'active' : ''}`} onClick={() => setActiveTab('posted')}>
                        Today&apos;s Posts
                    </button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {activeTab === 'activity' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                                    style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
                                Auto-refresh
                            </label>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                            setLoading(true);
                            Promise.all([fetchLogs(), fetchPostedComments()]).finally(() => setLoading(false));
                        }}>
                            Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <div className="animate-spin" style={{
                            width: 24, height: 24, border: '2px solid var(--border-subtle)',
                            borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 16px',
                        }} />
                        <p>Loading logs...</p>
                    </div>
                ) : activeTab === 'activity' ? (
                    <>
                        {/* Filters */}
                        <div className="chip-group" style={{ gap: 8, flexWrap: 'wrap' }}>
                            {['all', 'success', 'info', 'warn', 'error'].map(lv => (
                                <button key={lv} className={`chip ${levelFilter === lv ? 'active' : ''}`}
                                    style={{ fontSize: 11, padding: '4px 10px' }}
                                    onClick={() => setLevelFilter(lv)}>
                                    {lv === 'all' ? 'All' : (LEVEL_CONFIG[lv]?.label || lv)}
                                    {lv !== 'all' && levelCounts[lv] ? ` (${levelCounts[lv]})` : ''}
                                </button>
                            ))}
                            <span style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />
                            {['all', 'twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'].map(p => (
                                <button key={p} className={`chip ${platformFilter === p ? 'active' : ''}`}
                                    style={{ fontSize: 11, padding: '4px 10px' }}
                                    onClick={() => setPlatformFilter(p)}>
                                    {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Summary cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                            {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
                                <div key={key} className="card" style={{ padding: '12px 16px', cursor: 'pointer', border: levelFilter === key ? `1px solid ${cfg.color}` : undefined }}
                                    onClick={() => setLevelFilter(levelFilter === key ? 'all' : key)}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: cfg.color }}>{levelCounts[key] || 0}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Log entries */}
                        {logs.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                    <rect x="2" y="3" width="20" height="18" rx="2" />
                                    <path d="M8 7h8M8 11h5M8 15h6" />
                                </svg>
                                <h3>No activity yet</h3>
                                <p>Logs will appear here when cron jobs run. Make sure your platforms and keywords are configured.</p>
                            </div>
                        ) : (
                            <div className="card" style={{ overflow: 'hidden' }}>
                                <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                                    {logs.map((entry) => {
                                        const cfg = LEVEL_CONFIG[entry.level] || LEVEL_CONFIG.info;
                                        return (
                                            <div key={entry._id} style={{
                                                padding: '10px 16px',
                                                background: cfg.bg,
                                                borderBottom: '1px solid var(--border-subtle)',
                                                display: 'flex', gap: 12, alignItems: 'flex-start',
                                            }}>
                                                {/* Level icon */}
                                                <span style={{
                                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 11, fontWeight: 700, color: '#fff',
                                                    background: cfg.color, marginTop: 1,
                                                }}>
                                                    {cfg.icon}
                                                </span>

                                                {/* Content */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                            {ACTION_LABELS[entry.action] || entry.action}
                                                        </span>
                                                        <span className={`platform-chip platform-${entry.platform}`}
                                                            style={{ fontSize: 9, padding: '1px 6px' }}>
                                                            {entry.platform}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}
                                                            title={formatFullTime(entry.timestamp)}>
                                                            {formatTime(entry.timestamp)}
                                                        </span>
                                                    </div>
                                                    <p style={{
                                                        fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0',
                                                        lineHeight: 1.5, wordBreak: 'break-word',
                                                    }}>
                                                        {entry.action === 'post_failed' && entry.message.includes(': ') ? (
                                                            <>
                                                                <span>{entry.message.split(': ')[0]}</span>
                                                                <span style={{
                                                                    display: 'block', marginTop: 4, padding: '6px 10px',
                                                                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                                                                    borderRadius: 6, fontSize: 11, color: '#f87171',
                                                                    lineHeight: 1.6,
                                                                }}>
                                                                    Reason: {entry.message.split(': ').slice(1).join(': ')}
                                                                </span>
                                                            </>
                                                        ) : entry.message}
                                                    </p>
                                                    {entry.meta && Object.keys(entry.meta).length > 0 && (
                                                        <div style={{
                                                            marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap',
                                                        }}>
                                                            {Object.entries(entry.meta).map(([k, v]) => (
                                                                <span key={k} style={{
                                                                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                                                    background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                                                                }}>
                                                                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    /* -- Posted Comments -- */
                    postedComments.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                            <h3>No comments posted today</h3>
                            <p>Comments posted today by the bot will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {postedComments.slice().reverse().map((comment, i) => (
                                <div key={comment._id || i} className="post-card">
                                    <div className="post-card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className={`platform-chip platform-${comment.platform}`} style={{ fontSize: 11 }}>
                                                {comment.platform}
                                            </span>
                                            {(comment.postedByAccount || comment.account) && (
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{comment.postedByAccount || comment.account}</span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {formatFullTime(comment.postedAt)}
                                        </span>
                                    </div>
                                    <div className="post-card-body">
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {comment.editedReply || comment.aiReply || comment.reply || '(no reply text)'}
                                        </p>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                                            {(comment.url || comment.postUrl) && (
                                                <a href={comment.url || comment.postUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
                                                    Original Post
                                                </a>
                                            )}
                                            {comment.replyUrl && (
                                                <a href={comment.replyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--status-approved)' }}>
                                                    View Reply
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
    fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13,
};
