'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/apiBase';

interface CronLogEntry {
    id: string;
    platform: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    exitCode: number | null;
    message: string;
    status: string;
}

interface PostedComment {
    _id?: string;
    platform: string;
    url: string;
    content: string;
    aiRelevanceScore?: number;
    aiReply?: string;
    editedReply?: string;
    postedAt: string;
    replyUrl?: string;
    postedByAccount?: string;
    author?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
    twitter: 'Twitter / X',
    reddit: 'Reddit',
    facebook: 'Facebook',
    quora: 'Quora',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
};

const PLATFORM_ICONS: Record<string, string> = {
    twitter: '𝕏',
    reddit: '🔴',
    facebook: '🔵',
    quora: '🅀',
    youtube: '▶',
    pinterest: '📌',
};

function timeAgo(dateStr: string): string {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatDuration(start: string, end: string | null): string {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
}

export default function LogsPage() {
    const [activeTab, setActiveTab] = useState<'cron' | 'posted'>('cron');
    const [cronLogs, setCronLogs] = useState<CronLogEntry[]>([]);
    const [postedComments, setPostedComments] = useState<PostedComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [expandedComment, setExpandedComment] = useState<string | null>(null);

    const fetchCronLogs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/cron-log`);
            const data = await res.json();
            setCronLogs(Array.isArray(data) ? data : data.log ?? data.logs ?? []);
        } catch { /* silent */ }
    }, []);

    const fetchPostedComments = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/posted-comments`);
            const data = await res.json();
            setPostedComments(Array.isArray(data) ? data : data.posts ?? data.comments ?? []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchCronLogs(), fetchPostedComments()]).finally(() => setLoading(false));
    }, [fetchCronLogs, fetchPostedComments]);

    // Auto-refresh every 30s
    useEffect(() => {
        const interval = setInterval(() => { fetchCronLogs(); fetchPostedComments(); }, 30000);
        return () => clearInterval(interval);
    }, [fetchCronLogs, fetchPostedComments]);

    // Filters
    const filteredCronLogs = cronLogs.filter(entry => {
        if (platformFilter !== 'all' && entry.platform !== platformFilter) return false;
        if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
        return true;
    });

    const filteredPosted = postedComments.filter(c => {
        if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
        return true;
    });

    // Summary stats for cron logs
    const cronSummary = {
        total: cronLogs.length,
        ok: cronLogs.filter(l => l.status === 'ok').length,
        failed: cronLogs.filter(l => l.status === 'failed').length,
        running: cronLogs.filter(l => l.status === 'running').length,
    };

    // Unique platforms in logs
    const logPlatforms = [...new Set(cronLogs.map(l => l.platform))];

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Logs</h2>
                <p>View cron execution history and posted comment records</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Tab Switcher */}
                <div className="chip-group" style={{ flexWrap: 'wrap' }}>
                    <button className={`chip ${activeTab === 'cron' ? 'active' : ''}`} onClick={() => setActiveTab('cron')}>
                        ⏱ Cron Logs
                        {cronSummary.total > 0 && (
                            <span style={{
                                marginLeft: 6, fontSize: 10, padding: '1px 6px',
                                borderRadius: 10, background: 'rgba(255,255,255,0.1)',
                            }}>{cronSummary.total}</span>
                        )}
                    </button>
                    <button className={`chip ${activeTab === 'posted' ? 'active' : ''}`} onClick={() => setActiveTab('posted')}>
                        💬 Posted Comments
                        {postedComments.length > 0 && (
                            <span style={{
                                marginLeft: 6, fontSize: 10, padding: '1px 6px',
                                borderRadius: 10, background: 'rgba(255,255,255,0.1)',
                            }}>{postedComments.length}</span>
                        )}
                    </button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Platform filter */}
                        <select
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            style={{
                                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)', cursor: 'pointer',
                            }}
                        >
                            <option value="all">All Platforms</option>
                            {logPlatforms.map(p => (
                                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                            ))}
                        </select>
                        {activeTab === 'cron' && (
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{
                                    fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                    background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-primary)', cursor: 'pointer',
                                }}
                            >
                                <option value="all">All Status</option>
                                <option value="ok">✓ OK</option>
                                <option value="failed">✗ Failed</option>
                                <option value="running">⟳ Running</option>
                            </select>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); Promise.all([fetchCronLogs(), fetchPostedComments()]).finally(() => setLoading(false)); }}>
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                {/* Cron summary strip */}
                {activeTab === 'cron' && !loading && cronSummary.total > 0 && (
                    <div style={{
                        display: 'flex', gap: 16, padding: '10px 16px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                        fontSize: 12,
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>Total: <strong>{cronSummary.total}</strong></span>
                        <span style={{ color: 'var(--status-approved)' }}>✓ OK: <strong>{cronSummary.ok}</strong></span>
                        <span style={{ color: 'var(--status-rejected)' }}>✗ Failed: <strong>{cronSummary.failed}</strong></span>
                        {cronSummary.running > 0 && (
                            <span style={{ color: 'var(--accent)' }}>⟳ Running: <strong>{cronSummary.running}</strong></span>
                        )}
                    </div>
                )}

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
                    filteredCronLogs.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14,2 14,8 20,8" />
                            </svg>
                            <h3>No cron logs{platformFilter !== 'all' || statusFilter !== 'all' ? ' matching filter' : ' yet'}</h3>
                            <p>{platformFilter !== 'all' || statusFilter !== 'all'
                                ? 'Try adjusting your filters to see more results.'
                                : 'Cron logs will appear here after the first scheduled job runs.'}</p>
                        </div>
                    ) : (
                        <div className="card" style={{ overflow: 'hidden' }}>
                            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                                            <th style={thStyle}>Platform</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={thStyle}>Started</th>
                                            <th style={thStyle}>Duration</th>
                                            <th style={thStyle}>Trigger</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCronLogs.map((entry, i) => (
                                            <tr key={entry.id || i} style={{
                                                borderBottom: '1px solid var(--border-subtle)',
                                                background: entry.status === 'failed' ? 'rgba(239,68,68,0.04)' : entry.status === 'running' ? 'rgba(59,130,246,0.04)' : 'transparent',
                                            }}>
                                                <td style={tdStyle}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span>{PLATFORM_ICONS[entry.platform] ?? '●'}</span>
                                                        <span>{PLATFORM_LABELS[entry.platform] ?? entry.platform}</span>
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                        background: entry.status === 'ok' ? 'var(--status-approved-bg)'
                                                            : entry.status === 'failed' ? 'var(--status-rejected-bg)'
                                                                : 'rgba(59,130,246,0.15)',
                                                        color: entry.status === 'ok' ? 'var(--status-approved)'
                                                            : entry.status === 'failed' ? 'var(--status-rejected)'
                                                                : 'var(--accent)',
                                                    }}>
                                                        {entry.status === 'ok' ? '✓ OK' : entry.status === 'failed' ? '✗ Failed' : '⟳ Running'}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                                                    {timeAgo(entry.startedAt)}
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                                                    {formatDuration(entry.startedAt, entry.finishedAt)}
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                                        background: 'rgba(255,255,255,0.06)',
                                                    }}>{entry.trigger}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                ) : (
                    /* ── Posted Comments ── */
                    filteredPosted.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }}>
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                            <h3>No posted comments{platformFilter !== 'all' ? ' matching filter' : ' yet'}</h3>
                            <p>{platformFilter !== 'all'
                                ? 'Try selecting a different platform.'
                                : 'Comments posted by the bot will be recorded here.'}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {filteredPosted.map((comment, i) => {
                                const isExpanded = expandedComment === (comment._id || String(i));
                                return (
                                    <div key={comment._id || i} className="card" style={{
                                        overflow: 'hidden', cursor: 'pointer',
                                        border: '1px solid var(--border-subtle)',
                                        transition: 'border-color 0.2s',
                                    }}
                                        onClick={() => setExpandedComment(
                                            isExpanded ? null : (comment._id || String(i))
                                        )}
                                    >
                                        {/* Comment header */}
                                        <div style={{
                                            padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ fontSize: 18 }}>{PLATFORM_ICONS[comment.platform] ?? '●'}</span>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                                                        {PLATFORM_LABELS[comment.platform] ?? comment.platform}
                                                        {comment.postedByAccount && (
                                                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                                                                via {comment.postedByAccount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                        {comment.content?.slice(0, 80)}{(comment.content?.length ?? 0) > 80 ? '…' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {comment.aiRelevanceScore !== undefined && (
                                                    <span style={{
                                                        fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                                        fontWeight: 600,
                                                        background: comment.aiRelevanceScore >= 80 ? 'var(--status-approved-bg)'
                                                            : comment.aiRelevanceScore >= 50 ? 'var(--status-pending-bg, rgba(234,179,8,0.15))'
                                                                : 'var(--status-rejected-bg)',
                                                        color: comment.aiRelevanceScore >= 80 ? 'var(--status-approved)'
                                                            : comment.aiRelevanceScore >= 50 ? 'var(--status-pending, #eab308)'
                                                                : 'var(--status-rejected)',
                                                    }}>
                                                        {comment.aiRelevanceScore}%
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {timeAgo(comment.postedAt)}
                                                </span>
                                                <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                                            </div>
                                        </div>

                                        {/* Expanded content */}
                                        {isExpanded && (
                                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {/* Original content */}
                                                <div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Original Post</div>
                                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6 }}>
                                                        {comment.content}
                                                    </p>
                                                </div>

                                                {/* Bot reply */}
                                                {(comment.editedReply || comment.aiReply) && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                                            Bot Reply {comment.editedReply ? '(edited)' : '(AI)'}
                                                        </div>
                                                        <p style={{
                                                            fontSize: 13, color: 'var(--status-approved)', lineHeight: 1.6,
                                                            background: 'rgba(34,197,94,0.05)', padding: 10, borderRadius: 6,
                                                            borderLeft: '3px solid var(--status-approved)',
                                                        }}>
                                                            {comment.editedReply || comment.aiReply}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Links */}
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    {comment.url && (
                                                        <a href={comment.url} target="_blank" rel="noopener noreferrer"
                                                            style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                            onClick={(e) => e.stopPropagation()}>
                                                            🔗 Original Post →
                                                        </a>
                                                    )}
                                                    {comment.replyUrl && (
                                                        <a href={comment.replyUrl} target="_blank" rel="noopener noreferrer"
                                                            style={{ fontSize: 12, color: 'var(--status-approved)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                            onClick={(e) => e.stopPropagation()}>
                                                            💬 View Reply →
                                                        </a>
                                                    )}
                                                </div>

                                                {/* Metadata */}
                                                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                                    {comment.author && <span>Author: {comment.author}</span>}
                                                    <span>Posted: {new Date(comment.postedAt).toLocaleString()}</span>
                                                    {comment.aiRelevanceScore !== undefined && <span>Score: {comment.aiRelevanceScore}%</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
