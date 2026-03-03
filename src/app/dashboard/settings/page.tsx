'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ISettings } from '@/lib/types';

const PLATFORM_OPTIONS = [
    { id: 'twitter', label: 'Twitter / X', color: '#a0a0a0' },
    { id: 'reddit', label: 'Reddit', color: '#ff4500' },
    { id: 'facebook', label: 'Facebook', color: '#1877f2' },
    { id: 'quora', label: 'Quora', color: '#b92b27' },
    { id: 'youtube', label: 'YouTube', color: '#ff0000' },
    { id: 'pinterest', label: 'Pinterest', color: '#e60023' },
];

export default function SettingsPage() {
    const [settings, setSettings] = useState<ISettings>({
        companyName: '',
        companyDescription: '',
        keywords: [],
        platforms: [],
        subreddits: [],
        promptTemplate: '',
        facebookGroups: [],
        facebookKeywords: [],
        facebookDailyLimit: 5,
        facebookAutoPostThreshold: 70,
        twitterKeywords: [],
        twitterDailyLimit: 10,
        twitterAutoPostThreshold: 70,
        redditKeywords: [],
        redditDailyLimit: 5,
        redditAutoPostThreshold: 70,
        quoraKeywords: [],
        quoraDailyLimit: 3,
        quoraAutoPostThreshold: 70,
        youtubeKeywords: [],
        youtubeDailyLimit: 5,
        youtubeAutoPostThreshold: 70,
        pinterestKeywords: [],
        pinterestDailyLimit: 5,
        pinterestAutoPostThreshold: 70,
    });

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [newKeyword, setNewKeyword] = useState('');
    const [newSubreddit, setNewSubreddit] = useState('');
    const [newFbGroup, setNewFbGroup] = useState('');

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.settings) {
                setSettings((prev) => ({ ...prev, ...data.settings }));
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.error) {
                setMessage(`Error: ${data.error}`);
            } else {
                setMessage('Settings saved successfully');
                setTimeout(() => setMessage(''), 3000);
            }
        } catch {
            setMessage('Failed to save settings');
        }
        setSaving(false);
    };

    const togglePlatform = (id: string) => {
        setSettings((prev) => ({
            ...prev,
            platforms: prev.platforms.includes(id)
                ? prev.platforms.filter((p) => p !== id)
                : [...prev.platforms, id],
        }));
    };

    const addToList = (key: keyof ISettings, value: string, clearFn: (v: string) => void) => {
        if (!value.trim()) return;
        const current = (settings[key] as string[]) || [];
        if (!current.includes(value.trim())) {
            setSettings((prev) => ({ ...prev, [key]: [...current, value.trim()] }));
        }
        clearFn('');
    };

    const removeFromList = (key: keyof ISettings, value: string) => {
        const current = (settings[key] as string[]) || [];
        setSettings((prev) => ({ ...prev, [key]: current.filter((v) => v !== value) }));
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2>Settings</h2>
                    <p>Configure your bot behavior, platforms, and engagement rules</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {message && (
                        <span style={{
                            fontSize: 13,
                            color: message.startsWith('Error') ? 'var(--status-rejected)' : 'var(--status-approved)',
                        }}>{message}</span>
                    )}
                    <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                        {saving ? 'Saving…' : 'Save Settings'}
                    </button>
                </div>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ── Company Info ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9,22 9,12 15,12 15,22" />
                        </svg>
                        Company Info
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="label">Company Name</label>
                            <input
                                className="input"
                                value={settings.companyName}
                                onChange={(e) => setSettings((p) => ({ ...p, companyName: e.target.value }))}
                                placeholder="Your company name"
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">Company Description</label>
                            <input
                                className="input"
                                value={settings.companyDescription}
                                onChange={(e) => setSettings((p) => ({ ...p, companyDescription: e.target.value }))}
                                placeholder="Brief description of your product/service"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Platform Toggles ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                        </svg>
                        Platforms
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {PLATFORM_OPTIONS.map((p) => {
                            const enabled = settings.platforms.includes(p.id);
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => togglePlatform(p.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '14px 18px',
                                        borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${enabled ? p.color + '55' : 'var(--border-subtle)'}`,
                                        background: enabled ? p.color + '12' : 'var(--bg-input)',
                                        cursor: 'pointer',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    <div style={{
                                        width: 10, height: 10, borderRadius: 5,
                                        background: enabled ? p.color : 'var(--text-muted)',
                                        transition: 'background var(--transition-fast)',
                                    }} />
                                    <span style={{
                                        fontSize: 14, fontWeight: 600,
                                        color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                                    }}>
                                        {p.label}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: 11, color: enabled ? p.color : 'var(--text-muted)' }}>
                                        {enabled ? 'ON' : 'OFF'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Keywords ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        Keywords
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="input"
                            placeholder="Add a keyword…"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addToList('keywords', newKeyword, setNewKeyword); }}
                        />
                        <button className="btn btn-secondary" onClick={() => addToList('keywords', newKeyword, setNewKeyword)}>Add</button>
                    </div>
                    <div className="tag-list">
                        {settings.keywords.map((k) => (
                            <span key={k} className="tag">
                                {k}
                                <button className="tag-remove" onClick={() => removeFromList('keywords', k)}>×</button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Subreddits ── */}
                {settings.platforms.includes('reddit') && (
                    <div className="form-section">
                        <div className="form-section-title" style={{ color: '#ff4500' }}>
                            <svg viewBox="0 0 24 24" fill="#ff4500" style={{ width: 18, height: 18 }}>
                                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0z" />
                            </svg>
                            Subreddits
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className="input"
                                placeholder="r/subreddit"
                                value={newSubreddit}
                                onChange={(e) => setNewSubreddit(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addToList('subreddits', newSubreddit, setNewSubreddit); }}
                            />
                            <button className="btn btn-secondary" onClick={() => addToList('subreddits', newSubreddit, setNewSubreddit)}>Add</button>
                        </div>
                        <div className="tag-list">
                            {settings.subreddits.map((s) => (
                                <span key={s} className="tag" style={{ background: 'rgba(255,69,0,0.1)', color: '#ff6e3a' }}>
                                    {s}
                                    <button className="tag-remove" onClick={() => removeFromList('subreddits', s)}>×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Facebook Groups ── */}
                {settings.platforms.includes('facebook') && (
                    <div className="form-section">
                        <div className="form-section-title" style={{ color: '#1877f2' }}>
                            <svg viewBox="0 0 24 24" fill="#1877f2" style={{ width: 18, height: 18 }}>
                                <circle cx="12" cy="12" r="12" />
                            </svg>
                            Facebook Groups
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className="input"
                                placeholder="Group URL or ID"
                                value={newFbGroup}
                                onChange={(e) => setNewFbGroup(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addToList('facebookGroups', newFbGroup, setNewFbGroup); }}
                            />
                            <button className="btn btn-secondary" onClick={() => addToList('facebookGroups', newFbGroup, setNewFbGroup)}>Add</button>
                        </div>
                        <div className="tag-list">
                            {(settings.facebookGroups ?? []).map((g) => (
                                <span key={g} className="tag" style={{ background: 'rgba(24,119,242,0.1)', color: '#5a9cf5' }}>
                                    {g}
                                    <button className="tag-remove" onClick={() => removeFromList('facebookGroups', g)}>×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Per-Platform Limits ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <path d="M12 20V10M18 20V4M6 20v-4" />
                        </svg>
                        Auto-Post Limits &amp; Thresholds
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        {PLATFORM_OPTIONS.filter((p) => settings.platforms.includes(p.id)).map((p) => {
                            const limitKey = `${p.id}DailyLimit` as keyof ISettings;
                            const threshKey = `${p.id}AutoPostThreshold` as keyof ISettings;
                            return (
                                <div key={p.id} style={{
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: 16,
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: p.color }}>{p.label}</div>
                                    <div className="form-group">
                                        <label className="label">Daily Limit</label>
                                        <input
                                            className="input"
                                            type="number"
                                            min={1}
                                            value={(settings[limitKey] as number) ?? 5}
                                            onChange={(e) => setSettings((prev) => ({ ...prev, [limitKey]: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="label">Auto-Post Threshold (%)</label>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={(settings[threshKey] as number) ?? 70}
                                            onChange={(e) => setSettings((prev) => ({ ...prev, [threshKey]: Number(e.target.value) }))}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Prompt Template ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        Prompt Template
                    </div>
                    <textarea
                        className="input textarea"
                        style={{ minHeight: 150, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        value={settings.promptTemplate}
                        onChange={(e) => setSettings((p) => ({ ...p, promptTemplate: e.target.value }))}
                        placeholder="Custom prompt template for AI evaluation…"
                    />
                </div>

                {/* Save button at bottom */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
                    {message && (
                        <span style={{
                            fontSize: 13, alignSelf: 'center',
                            color: message.startsWith('Error') ? 'var(--status-rejected)' : 'var(--status-approved)',
                        }}>{message}</span>
                    )}
                    <button className="btn btn-primary btn-lg" disabled={saving} onClick={handleSave}>
                        {saving ? 'Saving…' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
