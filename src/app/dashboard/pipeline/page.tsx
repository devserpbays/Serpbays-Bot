'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/apiBase';
import UpgradeBanner from '@/components/UpgradeBanner';

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
    lastStarted: string | null;
    lastFinished: string | null;
    lastExitCode: number | null;
    lastMessage: string;
    lastTrigger: 'auto' | 'manual' | null;
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

const ALL_PLATFORMS = [
    { id: 'twitter', label: 'Twitter / X', icon: 'X' },
    { id: 'reddit', label: 'Reddit', icon: 'R' },
    { id: 'facebook', label: 'Facebook', icon: 'f' },
    { id: 'quora', label: 'Quora', icon: 'Q' },
    { id: 'youtube', label: 'YouTube', icon: 'Y' },
    { id: 'pinterest', label: 'Pinterest', icon: 'P' },
];

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

const PLATFORM_ICONS: Record<string, string> = {
    twitter: '𝕏',
    reddit: '🔴',
    facebook: '🔵',
    quora: '🅀',
    youtube: '▶',
    pinterest: '📌',
};

const PLATFORM_LABELS: Record<string, string> = {
    twitter: 'Twitter / X',
    reddit: 'Reddit',
    facebook: 'Facebook',
    quora: 'Quora',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
};

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

    const [cronStatuses, setCronStatuses] = useState<Record<string, CronPlatformStatus>>({});
    const [runningPlatforms, setRunningPlatforms] = useState<Set<string>>(new Set());
    const [stoppingPlatforms, setStoppingPlatforms] = useState<Set<string>>(new Set());
    const [nextRunAt, setNextRunAt] = useState<string | null>(null);
    const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
    const [upgradeMessage, setUpgradeMessage] = useState('');

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/settings`);
            const data = await res.json();
            if (data.settings?.socialAccounts) {
                const connected = data.settings.socialAccounts
                    .filter((a: any) => a.active !== false)
                    .map((a: any) => a.platform);
                setConnectedPlatforms([...new Set(connected)] as string[]);
            }
        } catch { /* silent */ }
    }, []);

    const fetchCronControl = useCallback(async () => {
        try {
            const [controlRes, statusRes] = await Promise.all([
                fetch('/api/cron-control'),
                fetch('/api/cron-status'),
            ]);
            const controlData = await controlRes.json();
            const statusData = await statusRes.json();
            setCronPaused(controlData.paused ?? false);
            setCronStatuses(statusData.crons ?? {});
            setNextRunAt(statusData.nextRunAt ?? null);

            // Track which platforms are currently running
            const running = new Set<string>();
            for (const [platform, status] of Object.entries(statusData.crons ?? {})) {
                if ((status as CronPlatformStatus).running) running.add(platform);
            }
            setRunningPlatforms(running);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchSettings();
        fetchCronControl();
        // Poll cron status every 5s
        pollingRef.current = setInterval(fetchCronControl, 5000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchSettings, fetchCronControl]);

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

    const handleRunPlatform = async (platform: string) => {
        setRunningPlatforms(prev => new Set(prev).add(platform));
        try {
            const res = await fetch('/api/run-cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            if (res.status === 403) {
                const data = await res.json();
                if (data.upgrade) {
                    setUpgradeMessage(data.error);
                    setRunningPlatforms(prev => { const next = new Set(prev); next.delete(platform); return next; });
                    return;
                }
            }
        } catch { /* silent */ }
        // Poll will pick up the running state
        setTimeout(fetchCronControl, 1000);
    };

    const handleStopPlatform = async (platform: string) => {
        setStoppingPlatforms(prev => new Set(prev).add(platform));
        try {
            await fetch('/api/stop-cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
        } catch { /* silent */ }
        // Refresh status and clear stopping state
        setTimeout(async () => {
            await fetchCronControl();
            setRunningPlatforms(prev => { const next = new Set(prev); next.delete(platform); return next; });
            setStoppingPlatforms(prev => { const next = new Set(prev); next.delete(platform); return next; });
        }, 1000);
    };

    const handlePipeline = async () => {
        setPipelineRunning(true);
        setPipelineResult(null);
        setUpgradeMessage('');
        setPipelineStep('Queuing pipeline…');
        try {
            const res = await fetch('/api/run-pipeline', { method: 'POST' });
            if (res.status === 403) {
                const data = await res.json();
                if (data.upgrade) {
                    setUpgradeMessage(data.error);
                    setPipelineStep('');
                    setPipelineRunning(false);
                    return;
                }
            }
            const data = await res.json();

            // Route now returns 202 with jobId — poll until complete
            if (res.status === 202 && data.jobId) {
                setPipelineStep('Scraping all platforms…');
                const jobId = data.jobId;
                const maxAttempts = 90; // 2s * 90 = 180s max
                for (let i = 0; i < maxAttempts; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    try {
                        const statusRes = await fetch(`/api/job-status/${jobId}`);
                        const statusData = await statusRes.json();

                        // Show progressive status
                        if (statusData.progress && typeof statusData.progress === 'string') {
                            setPipelineStep(statusData.progress);
                        } else if (statusData.state === 'active') {
                            setPipelineStep('Pipeline running…');
                        }

                        if (statusData.state === 'completed') {
                            const result = statusData.result || {};
                            setPipelineResult({
                                scraped: result.totalScraped ?? 0,
                                newPosts: result.newPosts ?? 0,
                                evaluated: 0,
                                skipped: 0,
                                autoApproved: 0,
                                errors: result.errors ?? [],
                                startedAt: statusData.timestamp ? new Date(statusData.timestamp).toISOString() : '',
                                finishedAt: statusData.finishedOn ? new Date(statusData.finishedOn).toISOString() : '',
                                duration: statusData.finishedOn && statusData.timestamp
                                    ? `${Math.round((statusData.finishedOn - statusData.timestamp) / 1000)}s`
                                    : '',
                            });
                            setPipelineStep('');
                            fetchCronControl();
                            break;
                        }
                        if (statusData.state === 'failed') {
                            setPipelineResult({
                                scraped: 0, newPosts: 0, evaluated: 0, skipped: 0, autoApproved: 0,
                                errors: [statusData.failedReason || 'Pipeline failed'],
                                startedAt: '', finishedAt: '', duration: '',
                            });
                            setPipelineStep('');
                            break;
                        }
                    } catch {
                        // Network glitch — keep polling
                    }
                }
            } else {
                // Fallback: old-style synchronous response
                const result = data as PipelineResult;
                setPipelineResult(result);
                setPipelineStep('');
                fetchCronControl();
            }
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

    const handleRunAll = async () => {
        const platforms = connectedPlatforms.length > 0
            ? connectedPlatforms
            : ALL_PLATFORMS.map(p => p.id);
        for (const p of platforms) {
            await handleRunPlatform(p);
            // Small stagger
            await new Promise(r => setTimeout(r, 300));
        }
    };

    const anyPlatformRunning = runningPlatforms.size > 0;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Pipeline</h2>
                <p>Run jobs, manage automation, and monitor the evaluate → post workflow</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {upgradeMessage && <UpgradeBanner message={upgradeMessage} />}

                {/* ── Automation Status ── */}
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
                            {nextRunAt && !cronPaused && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Next run: {new Date(nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            <button
                                className={`btn btn-sm ${cronPaused ? 'btn-success' : 'btn-danger'}`}
                                disabled={cronToggling}
                                onClick={handleToggleCron}
                            >
                                {cronToggling ? 'Updating…' : cronPaused ? 'Resume All' : 'Pause All'}
                            </button>
                        </div>
                    </div>
                    <div className="card-body">
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            {cronPaused
                                ? 'All cron jobs are paused. No automatic scraping or posting will occur.'
                                : 'Cron jobs are active. Posts are automatically scraped, evaluated, and posted on schedule.'}
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

                {/* ── Per-Platform Cron Controls ── */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Platform Cron Jobs</span>
                        <button
                            className="btn btn-sm btn-primary"
                            disabled={anyPlatformRunning || cronPaused}
                            onClick={handleRunAll}
                            title={cronPaused ? 'Resume automation first' : 'Run all platform crons'}
                        >
                            <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                            </svg>
                            {' '}Run All
                        </button>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Run</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ALL_PLATFORMS.map(({ id, label, icon }) => {
                                    const status = cronStatuses[id];
                                    const isRunning = runningPlatforms.has(id) || status?.running;
                                    const isConnected = connectedPlatforms.includes(id);
                                    const lastExit = status?.lastExitCode;
                                    const lastFinished = status?.lastFinished;

                                    let statusBadge: { text: string; color: string; bg: string };
                                    if (isRunning) {
                                        statusBadge = { text: 'Running', color: 'var(--status-evaluating)', bg: 'var(--status-evaluating-bg)' };
                                    } else if (!isConnected) {
                                        statusBadge = { text: 'Not Connected', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.03)' };
                                    } else if (cronPaused) {
                                        statusBadge = { text: 'Paused', color: 'var(--status-rejected)', bg: 'var(--status-rejected-bg)' };
                                    } else if (lastExit === 0) {
                                        statusBadge = { text: 'Idle', color: 'var(--status-approved)', bg: 'var(--status-approved-bg)' };
                                    } else if (lastExit !== null && lastExit !== undefined && lastExit !== 0) {
                                        statusBadge = { text: 'Error', color: 'var(--status-rejected)', bg: 'var(--status-rejected-bg)' };
                                    } else {
                                        statusBadge = { text: 'Ready', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.04)' };
                                    }

                                    return (
                                        <tr key={id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{
                                                        width: 28, height: 28, borderRadius: 6,
                                                        background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 13, fontWeight: 700, color: 'var(--accent-light)',
                                                    }}>
                                                        {icon}
                                                    </span>
                                                    <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    fontSize: 11, fontWeight: 500, padding: '3px 10px',
                                                    borderRadius: 20, color: statusBadge.color, background: statusBadge.bg,
                                                }}>
                                                    {isRunning && (
                                                        <svg className="animate-spin" style={{ width: 10, height: 10 }} fill="none" viewBox="0 0 24 24">
                                                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                        </svg>
                                                    )}
                                                    {statusBadge.text}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                {lastFinished ? (
                                                    <span title={new Date(lastFinished).toLocaleString()}>
                                                        {timeAgo(lastFinished)}
                                                        {status?.lastTrigger === 'manual' && (
                                                            <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}>(manual)</span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    {isRunning ? (
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            disabled={stoppingPlatforms.has(id)}
                                                            onClick={() => handleStopPlatform(id)}
                                                            style={{ minWidth: 70 }}
                                                        >
                                                            {stoppingPlatforms.has(id) ? (
                                                                <><svg className="animate-spin" style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24">
                                                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                                </svg> Stopping…</>
                                                            ) : (
                                                                <><svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <rect x="6" y="6" width="12" height="12" rx="1" />
                                                                </svg> Stop</>
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            disabled={!isConnected && id !== 'twitter'}
                                                            onClick={() => handleRunPlatform(id)}
                                                            style={{ minWidth: 70 }}
                                                        >
                                                            <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                                                            </svg> Run
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Full Pipeline (Scrape + Evaluate) ── */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <span className="card-title">Scrape & Evaluate Pipeline</span>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Scrapes all connected platforms for new posts, then evaluates each with AI.
                            </p>
                        </div>
                        <button
                            className="btn btn-primary"
                            disabled={pipelineRunning}
                            onClick={handlePipeline}
                        >
                            {pipelineRunning ? (
                                <><svg className="animate-spin" style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Running…</>
                            ) : (
                                <><svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Scrape & Evaluate</>
                            )}
                        </button>
                    </div>

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
                                    Pipeline Complete
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

            </div>
        </div>
    );
}
