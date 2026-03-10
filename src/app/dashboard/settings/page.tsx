'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ISettings } from '@/lib/types';
import UpgradeBanner from '@/components/UpgradeBanner';

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
        cronTimezone: '',
        cronStartHour: 9,
        cronEndHour: 18,
        cronDays: [0, 1, 2, 3, 4, 5, 6],
        cronIntervalMinutes: 15,
    });

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [upgradeMessage, setUpgradeMessage] = useState('');
    const [newKeyword, setNewKeyword] = useState('');
    const [newPlatformKeyword, setNewPlatformKeyword] = useState<Record<string, string>>({});
    const [newSubreddit, setNewSubreddit] = useState('');
    const [newFbGroup, setNewFbGroup] = useState('');

    // Timezone combobox state
    const [tzSearch, setTzSearch] = useState('');
    const [tzOpen, setTzOpen] = useState(false);
    const tzRef = useRef<HTMLDivElement>(null);

    // Close timezone dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const ALL_TIMEZONES = [
        { value: '', label: 'Not set (run anytime)', region: '' },
        { value: 'America/New_York', label: 'New York', region: 'Americas' },
        { value: 'America/Chicago', label: 'Chicago', region: 'Americas' },
        { value: 'America/Denver', label: 'Denver', region: 'Americas' },
        { value: 'America/Los_Angeles', label: 'Los Angeles', region: 'Americas' },
        { value: 'America/Toronto', label: 'Toronto', region: 'Americas' },
        { value: 'America/Vancouver', label: 'Vancouver', region: 'Americas' },
        { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
        { value: 'America/Sao_Paulo', label: 'Sao Paulo', region: 'Americas' },
        { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', region: 'Americas' },
        { value: 'America/Bogota', label: 'Bogota', region: 'Americas' },
        { value: 'Europe/London', label: 'London', region: 'Europe' },
        { value: 'Europe/Paris', label: 'Paris', region: 'Europe' },
        { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
        { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe' },
        { value: 'Europe/Rome', label: 'Rome', region: 'Europe' },
        { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
        { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
        { value: 'Europe/Istanbul', label: 'Istanbul', region: 'Europe' },
        { value: 'Europe/Warsaw', label: 'Warsaw', region: 'Europe' },
        { value: 'Asia/Dubai', label: 'Dubai', region: 'Middle East' },
        { value: 'Asia/Riyadh', label: 'Riyadh', region: 'Middle East' },
        { value: 'Asia/Tehran', label: 'Tehran', region: 'Middle East' },
        { value: 'Asia/Kolkata', label: 'Mumbai / Delhi', region: 'Asia' },
        { value: 'Asia/Dhaka', label: 'Dhaka', region: 'Asia' },
        { value: 'Asia/Bangkok', label: 'Bangkok', region: 'Asia' },
        { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia' },
        { value: 'Asia/Shanghai', label: 'Shanghai / Beijing', region: 'Asia' },
        { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia' },
        { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia' },
        { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia' },
        { value: 'Asia/Jakarta', label: 'Jakarta', region: 'Asia' },
        { value: 'Australia/Sydney', label: 'Sydney', region: 'Pacific' },
        { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Pacific' },
        { value: 'Pacific/Auckland', label: 'Auckland', region: 'Pacific' },
        { value: 'Africa/Lagos', label: 'Lagos', region: 'Africa' },
        { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa' },
        { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa' },
    ];

    const getLiveTime = (tz: string) => {
        if (!tz) return '';
        try {
            return new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
            }).format(new Date());
        } catch { return ''; }
    };

    const filteredTimezones = useMemo(() => {
        if (!tzSearch.trim()) return ALL_TIMEZONES;
        const q = tzSearch.toLowerCase();
        return ALL_TIMEZONES.filter(tz =>
            tz.label.toLowerCase().includes(q) ||
            tz.value.toLowerCase().includes(q) ||
            tz.region.toLowerCase().includes(q)
        );
    }, [tzSearch]);

    const selectedTzLabel = ALL_TIMEZONES.find(t => t.value === (settings.cronTimezone ?? ''))?.label || 'Select timezone...';

    const DAYS_OF_WEEK = [
        { value: 0, label: 'Sun' },
        { value: 1, label: 'Mon' },
        { value: 2, label: 'Tue' },
        { value: 3, label: 'Wed' },
        { value: 4, label: 'Thu' },
        { value: 5, label: 'Fri' },
        { value: 6, label: 'Sat' },
    ];

    const toggleDay = (day: number) => {
        const current = settings.cronDays ?? [0, 1, 2, 3, 4, 5, 6];
        const updated = current.includes(day)
            ? current.filter(d => d !== day)
            : [...current, day].sort((a, b) => a - b);
        setSettings(prev => ({ ...prev, cronDays: updated }));
    };

    const HOURS = Array.from({ length: 24 }, (_, i) => ({
        value: i,
        label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`,
    }));

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/settings`);
            const data = await res.json();
            if (data.settings) {
                setSettings((prev) => ({ ...prev, ...data.settings }));
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    // Clear upgrade banner when user modifies settings
    const settingsLoadedRef = useRef(false);
    useEffect(() => {
        if (!settingsLoadedRef.current) { settingsLoadedRef.current = true; return; }
        setUpgradeMessage('');
    }, [settings]);

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        setUpgradeMessage('');
        try {
            const res = await fetch(`${API_BASE}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (res.status === 403) {
                const data = await res.json();
                if (data.upgrade) {
                    setUpgradeMessage(data.error);
                    setSaving(false);
                    return;
                }
                setMessage(`Error: ${data.error}`);
                setSaving(false);
                return;
            }
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

                {upgradeMessage && <UpgradeBanner message={upgradeMessage} />}

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

                {/* ── Default Keywords ── */}
                <div className="form-section">
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        Default Keywords
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                        Used as fallback when a platform has no specific keywords set below.
                    </p>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        {PLATFORM_OPTIONS.filter((p) => settings.platforms.includes(p.id)).map((p) => {
                            const kwKey = `${p.id}Keywords` as keyof ISettings;
                            const limitKey = `${p.id}DailyLimit` as keyof ISettings;
                            const threshKey = `${p.id}AutoPostThreshold` as keyof ISettings;
                            const platformKws = (settings[kwKey] as string[]) || [];
                            const pkInput = newPlatformKeyword[p.id] || '';
                            return (
                                <div key={p.id} style={{
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: 16,
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: p.color }}>{p.label}</div>
                                    <div className="form-group">
                                        <label className="label">Keywords</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input
                                                className="input"
                                                style={{ fontSize: 13 }}
                                                placeholder={`Add ${p.label} keyword…`}
                                                value={pkInput}
                                                onChange={(e) => setNewPlatformKeyword((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        addToList(kwKey, pkInput, () => setNewPlatformKeyword((prev) => ({ ...prev, [p.id]: '' })));
                                                    }
                                                }}
                                            />
                                            <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: 12, padding: '6px 12px' }}
                                                onClick={() => addToList(kwKey, pkInput, () => setNewPlatformKeyword((prev) => ({ ...prev, [p.id]: '' })))}
                                            >Add</button>
                                        </div>
                                        {platformKws.length > 0 ? (
                                            <div className="tag-list" style={{ marginTop: 6 }}>
                                                {platformKws.map((k) => (
                                                    <span key={k} className="tag" style={{ background: p.color + '15', color: p.color, fontSize: 12 }}>
                                                        {k}
                                                        <button className="tag-remove" onClick={() => removeFromList(kwKey, k)}>×</button>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                                                Using default keywords
                                            </p>
                                        )}
                                    </div>
                                    <div className="form-row" style={{ gap: 12 }}>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="label">Daily Limit</label>
                                            <input
                                                className="input"
                                                type="number"
                                                min={1}
                                                value={(settings[limitKey] as number) ?? 5}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, [limitKey]: Number(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label className="label">Threshold (%)</label>
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
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Cron Schedule ── */}
                <div className="form-section" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                        position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none',
                    }} />

                    <div className="form-section-title" style={{ position: 'relative' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                                <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
                            </svg>
                        </div>
                        <div>
                            <span>Cron Schedule</span>
                            <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                                Control when the bot runs — set your timezone, active hours, and days
                            </div>
                        </div>
                    </div>

                    {/* Schedule summary */}
                    {(() => {
                        const tz = settings.cronTimezone ?? '';
                        const start = settings.cronStartHour ?? 9;
                        const end = settings.cronEndHour ?? 18;
                        const days = settings.cronDays ?? [0, 1, 2, 3, 4, 5, 6];
                        const startLabel = HOURS.find(h => h.value === start)?.label || `${start}:00`;
                        const endLabel = HOURS.find(h => h.value === end)?.label || `${end}:00`;
                        const activeDayNames = DAYS_OF_WEEK.filter(d => days.includes(d.value)).map(d => d.label);
                        const allDays = days.length === 7;
                        const weekdaysOnly = days.length === 5 && [1,2,3,4,5].every(d => days.includes(d));

                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                                padding: '16px 20px', marginBottom: 20,
                                background: tz
                                    ? 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(99,102,241,0.06))'
                                    : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${tz ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)'}`,
                                borderRadius: 'var(--radius-md)',
                            }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                    background: tz ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {tz ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} width={22} height={22}>
                                            <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
                                        </svg>
                                    ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} width={22} height={22}>
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    {tz ? (
                                        <>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {startLabel} — {endLabel}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                                                {ALL_TIMEZONES.find(t => t.value === tz)?.label || tz}
                                                {' '}&middot;{' '}
                                                {allDays ? 'Every day' : weekdaysOnly ? 'Weekdays' : activeDayNames.join(', ')}
                                                {' '}&middot;{' '}
                                                {(() => {
                                                    const mins = settings.cronIntervalMinutes ?? 15;
                                                    if (mins < 60) return `Every ${mins}m`;
                                                    const h = Math.floor(mins / 60);
                                                    const m = mins % 60;
                                                    return m ? `Every ${h}h ${m}m` : `Every ${h}h`;
                                                })()}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No schedule set</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Bot runs anytime. Set a timezone below to control active hours.</div>
                                        </>
                                    )}
                                </div>
                                {tz && (
                                    <div style={{
                                        padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                                        background: 'rgba(34,197,94,0.12)', color: '#22c55e', letterSpacing: '0.3px',
                                    }}>ACTIVE</div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Cron Interval */}
                    <div style={{
                        padding: '16px 20px', marginBottom: 16,
                        background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Run Frequency</label>
                            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                                {(() => {
                                    const mins = settings.cronIntervalMinutes ?? 15;
                                    if (mins < 60) return `Every ${mins}m`;
                                    const h = Math.floor(mins / 60);
                                    const m = mins % 60;
                                    return m ? `Every ${h}h ${m}m` : `Every ${h}h`;
                                })()}
                            </span>
                        </div>

                        {/* Preset buttons */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                            {[
                                { label: '15m', value: 15 },
                                { label: '30m', value: 30 },
                                { label: '45m', value: 45 },
                                { label: '1h', value: 60 },
                                { label: '1.5h', value: 90 },
                                { label: '2h', value: 120 },
                                { label: '3h', value: 180 },
                                { label: '4h', value: 240 },
                                { label: '6h', value: 360 },
                            ].map(opt => {
                                const isActive = (settings.cronIntervalMinutes ?? 15) === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setSettings(p => ({ ...p, cronIntervalMinutes: opt.value }))}
                                        style={{
                                            padding: '7px 14px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                                            borderRadius: 8, cursor: 'pointer',
                                            border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                                            background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
                                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Slider */}
                        <div>
                            <input
                                type="range"
                                min={15}
                                max={360}
                                step={15}
                                value={settings.cronIntervalMinutes ?? 15}
                                onChange={e => setSettings(p => ({ ...p, cronIntervalMinutes: parseInt(e.target.value, 10) }))}
                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>15 min</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>6 hours</span>
                            </div>
                        </div>

                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                            How often the bot scrapes, evaluates, and posts. Shorter intervals mean faster engagement but higher resource usage.
                        </p>
                    </div>

                    {/* Timezone combobox */}
                    <div ref={tzRef} style={{
                        padding: '16px 20px', marginBottom: 16,
                        background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)', position: 'relative',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                            </svg>
                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Your Timezone</label>
                            {settings.cronTimezone && (
                                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                                    {getLiveTime(settings.cronTimezone)}
                                </span>
                            )}
                        </div>

                        {/* Trigger button */}
                        <button
                            type="button"
                            onClick={() => { setTzOpen(!tzOpen); setTzSearch(''); }}
                            style={{
                                width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 500,
                                background: 'var(--bg-input)', border: `1px solid ${tzOpen ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                borderRadius: 'var(--radius-sm)', color: settings.cronTimezone ? 'var(--text-primary)' : 'var(--text-muted)',
                                cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                transition: 'border-color 0.15s',
                            }}
                        >
                            <span>{selectedTzLabel}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={16} height={16}
                                style={{ transform: tzOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                <polyline points="6,9 12,15 18,9" />
                            </svg>
                        </button>

                        {/* Dropdown */}
                        {tzOpen && (
                            <div style={{
                                position: 'absolute', left: 20, right: 20, top: '100%', marginTop: -8,
                                zIndex: 50, background: '#1a1a1f', border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                                overflow: 'hidden',
                            }}>
                                {/* Search input */}
                                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <input
                                        autoFocus
                                        placeholder="Search city or region..."
                                        value={tzSearch}
                                        onChange={e => setTzSearch(e.target.value)}
                                        style={{
                                            width: '100%', padding: '8px 10px', fontSize: 13,
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)',
                                            borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                                            outline: 'none',
                                        }}
                                        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                        onBlur={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                                    />
                                </div>

                                {/* Results list */}
                                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                                    {filteredTimezones.length === 0 ? (
                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                            No timezones found
                                        </div>
                                    ) : (
                                        (() => {
                                            let lastRegion = '';
                                            return filteredTimezones.map(tz => {
                                                const showRegion = tz.region && tz.region !== lastRegion;
                                                if (tz.region) lastRegion = tz.region;
                                                const isSelected = (settings.cronTimezone ?? '') === tz.value;
                                                const liveTime = getLiveTime(tz.value);
                                                return (
                                                    <div key={tz.value}>
                                                        {showRegion && (
                                                            <div style={{
                                                                padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                                                                textTransform: 'uppercase', letterSpacing: '0.8px',
                                                                color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)',
                                                            }}>{tz.region}</div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSettings(p => ({ ...p, cronTimezone: tz.value }));
                                                                setTzOpen(false);
                                                                setTzSearch('');
                                                            }}
                                                            style={{
                                                                width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                background: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent',
                                                                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                                                fontSize: 13, fontWeight: isSelected ? 600 : 400,
                                                                transition: 'background 0.1s',
                                                            }}
                                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                {isSelected && (
                                                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5} width={14} height={14}>
                                                                        <polyline points="20,6 9,17 4,12" />
                                                                    </svg>
                                                                )}
                                                                {tz.label}
                                                            </span>
                                                            {liveTime && (
                                                                <span style={{
                                                                    fontSize: 12, color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                                                                    fontFamily: 'var(--font-mono)', fontWeight: 500,
                                                                }}>{liveTime}</span>
                                                            )}
                                                        </button>
                                                    </div>
                                                );
                                            });
                                        })()
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Hour grid time picker */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16,
                    }}>
                        {/* Start time */}
                        <div style={{
                            padding: '16px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
                                    boxShadow: '0 0 8px rgba(245,158,11,0.4)',
                                }} />
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#f59e0b' }}>
                                    Start Time
                                </span>
                                <span style={{
                                    marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: '#fbbf24',
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    {HOURS.find(h => h.value === (settings.cronStartHour ?? 9))?.label}
                                </span>
                            </div>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                            }}>
                                {HOURS.map(h => {
                                    const isSelected = (settings.cronStartHour ?? 9) === h.value;
                                    const inRange = h.value >= (settings.cronStartHour ?? 9) && h.value < (settings.cronEndHour ?? 18);
                                    return (
                                        <button
                                            key={h.value} type="button"
                                            onClick={() => setSettings(p => ({ ...p, cronStartHour: h.value }))}
                                            style={{
                                                padding: '6px 2px', fontSize: 11, fontWeight: isSelected ? 700 : 500,
                                                border: isSelected ? '1.5px solid #f59e0b' : '1px solid transparent',
                                                borderRadius: 6, cursor: 'pointer',
                                                background: isSelected ? 'rgba(245,158,11,0.15)' : inRange ? 'rgba(245,158,11,0.04)' : 'transparent',
                                                color: isSelected ? '#fbbf24' : inRange ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                transition: 'all 0.1s',
                                            }}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; }}
                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = inRange ? 'rgba(245,158,11,0.04)' : 'transparent'; }}
                                        >
                                            {h.value === 0 ? '12a' : h.value < 12 ? `${h.value}a` : h.value === 12 ? '12p' : `${h.value - 12}p`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* End time */}
                        <div style={{
                            padding: '16px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%', background: '#818cf8',
                                    boxShadow: '0 0 8px rgba(129,140,248,0.4)',
                                }} />
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#818cf8' }}>
                                    End Time
                                </span>
                                <span style={{
                                    marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: '#a5b4fc',
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    {HOURS.find(h => h.value === (settings.cronEndHour ?? 18))?.label}
                                </span>
                            </div>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                            }}>
                                {HOURS.map(h => {
                                    const isSelected = (settings.cronEndHour ?? 18) === h.value;
                                    const inRange = h.value >= (settings.cronStartHour ?? 9) && h.value <= (settings.cronEndHour ?? 18);
                                    return (
                                        <button
                                            key={h.value} type="button"
                                            onClick={() => setSettings(p => ({ ...p, cronEndHour: h.value }))}
                                            style={{
                                                padding: '6px 2px', fontSize: 11, fontWeight: isSelected ? 700 : 500,
                                                border: isSelected ? '1.5px solid #818cf8' : '1px solid transparent',
                                                borderRadius: 6, cursor: 'pointer',
                                                background: isSelected ? 'rgba(99,102,241,0.15)' : inRange ? 'rgba(99,102,241,0.04)' : 'transparent',
                                                color: isSelected ? '#a5b4fc' : inRange ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                transition: 'all 0.1s',
                                            }}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = inRange ? 'rgba(99,102,241,0.04)' : 'transparent'; }}
                                        >
                                            {h.value === 0 ? '12a' : h.value < 12 ? `${h.value}a` : h.value === 12 ? '12p' : `${h.value - 12}p`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Visual hour timeline bar */}
                    {(() => {
                        const start = settings.cronStartHour ?? 9;
                        const end = settings.cronEndHour ?? 18;
                        const leftPct = (start / 24) * 100;
                        const widthPct = ((end - start) / 24) * 100;
                        return (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{
                                    position: 'relative', height: 10, borderRadius: 5,
                                    background: 'rgba(255,255,255,0.04)', overflow: 'hidden',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 0, bottom: 0,
                                        left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%`,
                                        background: 'linear-gradient(90deg, #f59e0b, #818cf8)',
                                        borderRadius: 5, transition: 'all 0.3s ease',
                                        boxShadow: '0 0 12px rgba(129,140,248,0.3)',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                    {['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'].map((t, i) => (
                                        <span key={i} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{t}</span>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Days of week */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={1.8} width={15} height={15}>
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Active Days</label>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                {[
                                    { label: 'All', days: [0,1,2,3,4,5,6] },
                                    { label: 'Weekdays', days: [1,2,3,4,5] },
                                    { label: 'Weekends', days: [0,6] },
                                ].map(preset => (
                                    <button key={preset.label} type="button"
                                        onClick={() => setSettings(p => ({ ...p, cronDays: preset.days }))}
                                        style={{
                                            fontSize: 10, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                                            border: '1px solid var(--border-subtle)', background: 'transparent',
                                            color: 'var(--text-muted)', fontWeight: 600, transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    >{preset.label}</button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                            {DAYS_OF_WEEK.map(day => {
                                const active = (settings.cronDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(day.value);
                                const isWeekend = day.value === 0 || day.value === 6;
                                return (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDay(day.value)}
                                        style={{
                                            padding: '12px 0',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 13, fontWeight: 700,
                                            cursor: 'pointer',
                                            border: active
                                                ? '1.5px solid var(--accent)'
                                                : `1px solid ${isWeekend ? 'rgba(239,68,68,0.15)' : 'var(--border-subtle)'}`,
                                            background: active
                                                ? 'rgba(99,102,241,0.15)'
                                                : isWeekend ? 'rgba(239,68,68,0.04)' : 'var(--bg-input)',
                                            color: active ? 'var(--accent)' : isWeekend ? 'rgba(239,68,68,0.5)' : 'var(--text-muted)',
                                            transition: 'all 0.15s ease',
                                            textAlign: 'center',
                                            position: 'relative',
                                        }}
                                    >
                                        {day.label}
                                        {active && (
                                            <div style={{
                                                position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                                                width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)',
                                            }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
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
