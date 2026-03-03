'use client';

import { useState, useEffect, useCallback } from 'react';

interface PipelineResult {
    scraped: number;
    newPosts: number;
    evaluated: number;
    skipped: number;
    errors: string[];
    startedAt: string;
    finishedAt: string;
}

const PLATFORM_LABELS: Record<string, string> = {
    twitter: 'Twitter / X',
    reddit: 'Reddit',
    facebook: 'Facebook',
    quora: 'Quora',
};

export default function PipelinePage() {
    const [cronPaused, setCronPaused] = useState(false);
    const [cronToggling, setCronToggling] = useState(false);

    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineStep, setPipelineStep] = useState('');
    const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

    const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);

    const isAnyRunning = pipelineRunning;

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.settings) setEnabledPlatforms(data.settings.platforms ?? []);
        } catch { /* silent */ }
    }, []);

    const fetchCronStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/cron-control');
            const data = await res.json();
            setCronPaused(data.paused ?? false);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchSettings(); fetchCronStatus(); }, [fetchSettings, fetchCronStatus]);

    /* ── Handlers ── */
    const handleToggleCron = async () => {
        setCronToggling(true);
        try {
            const res = await fetch('/api/cron-control', { method: 'POST' });
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
        setPipelineStep(`Scraping ${names}…`);
        try {
            const res = await fetch('/api/run-pipeline', { method: 'POST' });
            const data: PipelineResult = await res.json();
            setPipelineResult(data);
            setPipelineStep('');
        } catch {
            setPipelineStep('');
            setPipelineResult({
                scraped: 0, newPosts: 0, evaluated: 0, skipped: 0,
                errors: ['Pipeline request failed — check server logs'],
                startedAt: '', finishedAt: '',
            });
        }
        setPipelineRunning(false);
    };



    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Pipeline</h2>
                <p>Run jobs, manage automation, and monitor the scrape → evaluate → post workflow</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ── Cron Status ── */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={cronPaused ? 'pulse-dot-red' : 'pulse-dot'} />
                            Automation Status
                        </span>
                        <button
                            className={`btn btn-sm ${cronPaused ? 'btn-danger' : 'btn-success'}`}
                            disabled={cronToggling}
                            onClick={handleToggleCron}
                        >
                            {cronToggling ? 'Updating…' : cronPaused ? 'Resume Cron' : 'Pause Cron'}
                        </button>
                    </div>
                    <div className="card-body">
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {cronPaused
                                ? 'Cron jobs are currently paused. No automatic scraping or posting will occur.'
                                : 'Cron jobs are active and running on schedule. Posts will be automatically processed.'}
                        </p>
                    </div>
                </div>

                {/* ── Full Pipeline ── */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <span className="card-title">Run Full Job</span>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Scrapes {enabledPlatforms.length > 0
                                    ? enabledPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')
                                    : 'all platforms'}, then evaluates every new post.
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
                                    Job Complete
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                                    {[
                                        { label: 'Scraped', value: pipelineResult.scraped },
                                        { label: 'New Posts', value: pipelineResult.newPosts },
                                        { label: 'Evaluated', value: pipelineResult.evaluated },
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
