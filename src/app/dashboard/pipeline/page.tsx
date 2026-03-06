'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/apiBase';

interface PipelineResult {
    scraped: number;
    newPosts: number;
    evaluated: number;
    skipped: number;
    autoApproved: number;
    errors: string[];
    startedAt: string;
    finishedAt: string;
    duration: string;
}

interface CronPlatformStatus {
    running: boolean;
    lastStarted: string;
    lastFinished: string;
    lastExitCode: number;
    lastMessage: string;
    lastTrigger: string;
}

interface CronStatusData {
    crons: Record<string, CronPlatformStatus>;
    nextRunAt: string;
    serverTime: string;
}

interface StatsData {
    total: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
    postedByPlatform: Record<string, number>;
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
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatDuration(start: string, end: string): string {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
}

export default function PipelinePage() {
    const [cronPaused, setCronPaused] = useState(false);
    const [cronToggling, setCronToggling] = useState(false);
    const [cronStatus, setCronStatus] = useState<CronStatusData | null>(null);
    const [stats, setStats] = useState<StatsData | null>(null);

    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineStep, setPipelineStep] = useState('');
    const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

    const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);

    const isAnyRunning = pipelineRunning;

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/settings`);
            const data = await res.json();
            if (data.settings) setEnabledPlatforms(data.settings.platforms ?? []);
        } catch { /* silent */ }
    }, []);

    const fetchCronControl = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/cron-control`);
            const data = await res.json();
            setCronPaused(data.paused ?? false);
        } catch { /* silent */ }
    }, []);

    const fetchCronStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/cron-status`);
            const data = await res.json();
            setCronStatus(data);
        } catch { /* silent */ }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/stats`);
            const data = await res.json();
            setStats(data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchSettings(); fetchCronControl(); fetchCronStatus(); fetchStats();
        const interval = setInterval(() => { fetchCronStatus(); fetchStats(); }, 30000);
        return () => clearInterval(interval);
    }, [fetchSettings, fetchCronControl, fetchCronStatus, fetchStats]);

    /* ── Handlers ── */
    const handleToggleCron = async () => {
        setCronToggling(true);
        try {
            const res = await fetch(`${API_BASE}/api/cron-control`, { method: 'POST' });
            const data = await res.json();
            setCronPaused(data.paused ?? false);
        } catch { /* silent */ }
        setCronToggling(false);
    };

    const handlePipeline = async () => {
        setPipelineRunning(true);
        setPipelineResult(null);
        const names = enabledPlatforms.length
            ? enabledPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')
            : 'all platforms';
        setPipelineStep(`Processing ${names}…`);
        try {
            const res = await fetch(`${API_BASE}/api/run-pipeline`, { method: 'POST' });
            const data: PipelineResult = await res.json();
            setPipelineResult(data);
            setPipelineStep('');
            fetchStats();
            fetchCronStatus();
        } catch {
            setPipelineStep('');
            setPipelineResult({
                scraped: 0, newPosts: 0, evaluated: 0, skipped: 0, autoApproved: 0,
                errors: ['Pipeline request failed — check server logs'],
                startedAt: '', finishedAt: '', duration: '',
            });
        }
        setPipelineRunning(false);
    };

    const anyPlatformRunning = cronStatus
        ? Object.values(cronStatus.crons).some(c => c.running)
        : false;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Pipeline</h2>
                <p>Run jobs, manage automation, and monitor the evaluate → post workflow</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ── Quick Stats Strip ── */}
                {stats && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: 12,
                    }}>
                        {[
                            { label: 'Total Posts', value: stats.total, color: 'var(--accent)' },
                            { label: 'Evaluated', value: stats.byStatus.evaluated ?? 0, color: 'var(--text-secondary)' },
                            { label: 'Posted', value: stats.byStatus.posted ?? 0, color: 'var(--status-approved)' },
                            { label: 'Pending', value: (stats.byStatus.new ?? 0) + (stats.byStatus.evaluating ?? 0), color: 'var(--status-pending)' },
                            { label: 'Rejected', value: stats.byStatus.rejected ?? 0, color: 'var(--status-rejected)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="card" style={{ padding: '16px 14px', textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Cron Status ── */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={cronPaused ? 'pulse-dot-red' : 'pulse-dot'} />
                            Automation Status
                            {anyPlatformRunning && (
                                <span style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 12,
                                    background: 'var(--accent)', color: '#fff', fontWeight: 600,
                                    animation: 'pulse 2s ease-in-out infinite',
                                }}>RUNNING</span>
                            )}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {cronStatus?.nextRunAt && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Next run: {new Date(cronStatus.nextRunAt).toLocaleTimeString()}
                                </span>
                            )}
                            <button
                                className={`btn btn-sm ${cronPaused ? 'btn-danger' : 'btn-success'}`}
                                disabled={cronToggling}
                                onClick={handleToggleCron}
                            >
                                {cronToggling ? 'Updating…' : cronPaused ? 'Resume Cron' : 'Pause Cron'}
                            </button>
                        </div>
                    </div>
                    <div className="card-body">
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            {cronPaused
                                ? 'Cron jobs are currently paused. No automatic posting will occur.'
                                : 'Cron jobs are active and running on schedule. Posts will be automatically processed.'}
                        </p>

                        {/* Per-platform status grid */}
                        {cronStatus && (
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: 10,
                            }}>
                                {Object.entries(cronStatus.crons).map(([platform, info]) => (
                                    <div key={platform} style={{
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)',
                                        padding: '12px 14px', border: '1px solid var(--border-subtle)',
                                        display: 'flex', flexDirection: 'column', gap: 6,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                                                {PLATFORM_ICONS[platform] ?? '●'} {PLATFORM_LABELS[platform] ?? platform}
                                            </span>
                                            <span style={{
                                                fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                background: info.running
                                                    ? 'var(--accent)'
                                                    : info.lastExitCode === 0 ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
                                                color: info.running
                                                    ? '#fff'
                                                    : info.lastExitCode === 0 ? 'var(--status-approved)' : 'var(--status-rejected)',
                                            }}>
                                                {info.running ? 'Running' : info.lastExitCode === 0 ? 'OK' : 'Failed'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Last: {timeAgo(info.lastFinished)}</span>
                                            <span>{info.lastStarted && info.lastFinished ? formatDuration(info.lastStarted, info.lastFinished) : '—'}</span>
                                        </div>
                                        {/* Posted count from stats */}
                                        {stats?.postedByPlatform?.[platform] !== undefined && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                Posted: <strong style={{ color: 'var(--status-approved)' }}>{stats.postedByPlatform[platform]}</strong>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Full Pipeline ── */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <span className="card-title">Run Full Job</span>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Evaluates {enabledPlatforms.length > 0
                                    ? enabledPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')
                                    : 'all platforms'}, then processes every new post with AI.
                            </p>
                        </div>
                        <button
                            className="btn btn-primary btn-lg"
                            disabled={isAnyRunning}
                            onClick={handlePipeline}
                        >
                            {pipelineRunning ? (
                                <><svg className="animate-spin" style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Running…</>
                            ) : (
                                <><svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg> Start Job</>
                            )}
                        </button>
                    </div>

                    {/* Progress */}
                    {pipelineStep && (
                        <div className="card-body" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, paddingBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                                <svg className="animate-spin" style={{ width: 16, height: 16, color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                {pipelineStep}
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {pipelineResult && !pipelineRunning && (
                        <div className="card-body" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                            <div style={{
                                background: pipelineResult.errors.length ? 'var(--status-rejected-bg)' : 'var(--status-approved-bg)',
                                borderRadius: 'var(--radius-sm)',
                                padding: 16,
                            }}>
                                <p style={{
                                    fontWeight: 600, fontSize: 14, marginBottom: 12,
                                    color: pipelineResult.errors.length ? 'var(--status-rejected)' : 'var(--status-approved)',
                                }}>
                                    Job Complete{pipelineResult.duration ? ` — ${pipelineResult.duration}` : ''}
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                                    {[
                                        { label: 'Scraped', value: pipelineResult.scraped },
                                        { label: 'New Posts', value: pipelineResult.newPosts },
                                        { label: 'Evaluated', value: pipelineResult.evaluated },
                                        { label: 'Auto-Approved', value: pipelineResult.autoApproved },
                                        { label: 'Skipped', value: pipelineResult.skipped },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 8px' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                                        </div>
                                    ))}
                                </div>
                                {pipelineResult.errors.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        {pipelineResult.errors.map((e, i) => (
                                            <p key={i} style={{ fontSize: 12, color: 'var(--status-rejected)', marginBottom: 2 }}>• {e}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Posts by Platform ── */}
                {stats && (
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Posts by Platform</span>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {Object.entries(stats.byPlatform).map(([platform, count]) => {
                                    const posted = stats.postedByPlatform?.[platform] ?? 0;
                                    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                                    return (
                                        <div key={platform}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 13, fontWeight: 500 }}>
                                                    {PLATFORM_ICONS[platform] ?? '●'} {PLATFORM_LABELS[platform] ?? platform}
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {count} scraped · <span style={{ color: 'var(--status-approved)' }}>{posted} posted</span>
                                                </span>
                                            </div>
                                            <div style={{
                                                height: 6, background: 'rgba(255,255,255,0.06)',
                                                borderRadius: 3, overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', width: `${pct}%`,
                                                    background: 'linear-gradient(90deg, var(--accent), var(--status-approved))',
                                                    borderRadius: 3, transition: 'width 0.5s ease',
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
