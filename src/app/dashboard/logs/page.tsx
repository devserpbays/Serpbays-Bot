'use client';

import { useState, useEffect, useCallback } from 'react';

interface CronLogEntry {
    timestamp: string;
    platform?: string;
    account?: string;
    action?: string;
    result?: string;
    error?: string;
    [key: string]: unknown;
}

interface PostedComment {
    _id?: string;
    platform: string;
    postUrl: string;
    replyUrl?: string;
    reply: string;
    postedAt: string;
    account?: string;
}

export default function LogsPage() {
    const [activeTab, setActiveTab] = useState<'cron' | 'posted'>('cron');
    const [cronLogs, setCronLogs] = useState<CronLogEntry[]>([]);
    const [postedComments, setPostedComments] = useState<PostedComment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCronLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/cron-log');
            const data = await res.json();
            setCronLogs(Array.isArray(data) ? data : data.logs ?? []);
        } catch { /* silent */ }
    }, []);

    const fetchPostedComments = useCallback(async () => {
        try {
            const res = await fetch('/api/posted-comments');
            const data = await res.json();
            setPostedComments(Array.isArray(data) ? data : data.comments ?? []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchCronLogs(), fetchPostedComments()]).finally(() => setLoading(false));
    }, [fetchCronLogs, fetchPostedComments]);

    const formatTime = (ts: string) => {
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return ts;
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Logs</h2>
                <p>View cron execution history and posted comment records</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Tab Switcher */}
                <div className="chip-group">
                    <button className={`chip ${activeTab === 'cron' ? 'active' : ''}`} onClick={() => setActiveTab('cron')}>
                        Cron Logs
                    </button>
                    <button className={`chip ${activeTab === 'posted' ? 'active' : ''}`} onClick={() => setActiveTab('posted')}>
                        Posted Comments
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { fetchCronLogs(); fetchPostedComments(); }}>
                        ↻ Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <div className="animate-spin" style={{
                            width: 24, height: 24, border: '2px solid var(--border-subtle)',
                            borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 16px',
                        }} />
                        <p>Loading logs…</p>
                    </div>
                ) : activeTab === 'cron' ? (
                    /* ── Cron Logs ── */
                    cronLogs.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14,2 14,8 20,8" />
                            </svg>
                            <h3>No cron logs yet</h3>
                            <p>Cron logs will appear here after the first scheduled job runs.</p>
                        </div>
                    ) : (
                        <div className="card" style={{ overflow: 'hidden' }}>
                            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                                {cronLogs.slice().reverse().map((entry, i) => (
                                    <div key={i} className="log-entry">
                                        <span className="log-timestamp">{formatTime(entry.timestamp)}</span>
                                        {entry.platform && (
                                            <span className={`platform-chip platform-${entry.platform}`} style={{ fontSize: 10, padding: '2px 8px', marginRight: 8 }}>
                                                {entry.platform}
                                            </span>
                                        )}
                                        {entry.account && (
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 8 }}>
                                                @{entry.account}
                                            </span>
                                        )}
                                        <span className={entry.error ? 'log-error' : entry.result ? 'log-success' : 'log-info'}>
                                            {entry.error || entry.result || entry.action || JSON.stringify(entry)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    /* ── Posted Comments ── */
                    postedComments.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                            <h3>No posted comments yet</h3>
                            <p>Comments posted by the bot will be recorded here.</p>
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
                                            {comment.account && (
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{comment.account}</span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {formatTime(comment.postedAt)}
                                        </span>
                                    </div>
                                    <div className="post-card-body">
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {comment.reply}
                                        </p>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                                            {comment.postUrl && (
                                                <a href={comment.postUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
                                                    Original Post →
                                                </a>
                                            )}
                                            {comment.replyUrl && (
                                                <a href={comment.replyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--status-approved)' }}>
                                                    View Reply →
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
