'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { API_BASE } from '@/lib/apiBase';
import type { ISettings } from '@/lib/types';
import UpgradeBanner from '@/components/UpgradeBanner';

const PLATFORM_OPTIONS = [
    { id: 'twitter', label: 'Twitter / X', color: '#1d9bf0' },
    { id: 'reddit', label: 'Reddit', color: '#3b82f6' },
    { id: 'facebook', label: 'Facebook', color: '#1877f2' },
    { id: 'quora', label: 'Quora', color: '#2563eb' },
    { id: 'youtube', label: 'YouTube', color: '#0ea5e9' },
    { id: 'pinterest', label: 'Pinterest', color: '#60a5fa' },
];

// Minimum recommended cooldowns per platform (in minutes)
const PLATFORM_COOLDOWN_MIN: Record<string, number> = {
    twitter: 15, reddit: 30, facebook: 30, quora: 60, youtube: 90, pinterest: 30,
};
const PLATFORM_COOLDOWN_DEFAULT: Record<string, number> = {
    twitter: 60, reddit: 90, facebook: 90, quora: 120, youtube: 180, pinterest: 90,
};

function getBrandRisk(rate: number) {
    if (rate <= 25) return { label: 'Safe', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', desc: 'Low risk — less than 1 in 4 comments promotes your brand.' };
    if (rate <= 50) return { label: 'Moderate Risk', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', desc: 'Moderate risk — frequent brand mentions may trigger spam filters over time.' };
    if (rate <= 75) return { label: 'High Risk', color: '#f97316', bg: 'rgba(249,115,22,0.1)', desc: 'High risk — most platforms will flag this as spam. Account may get restricted.' };
    return { label: 'Ban Risk', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', desc: 'Very high risk — almost all comments promote your brand. Your account is likely to get banned.' };
}

function formatMinutes(m: number) {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60); const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
}

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

const DAYS_OF_WEEK = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`,
}));

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
        facebookBrandMentionRate: 25,
        facebookCooldownMinutes: 90,
        twitterKeywords: [],
        twitterCommunityIds: [],
        twitterDailyLimit: 10,
        twitterAutoPostThreshold: 70,
        twitterBrandMentionRate: 25,
        twitterCooldownMinutes: 60,
        redditKeywords: [],
        redditDailyLimit: 5,
        redditAutoPostThreshold: 70,
        redditBrandMentionRate: 25,
        redditCooldownMinutes: 90,
        quoraKeywords: [],
        quoraDailyLimit: 3,
        quoraAutoPostThreshold: 70,
        quoraBrandMentionRate: 25,
        quoraCooldownMinutes: 120,
        youtubeKeywords: [],
        youtubeDailyLimit: 5,
        youtubeAutoPostThreshold: 70,
        youtubeBrandMentionRate: 25,
        youtubeCooldownMinutes: 180,
        pinterestKeywords: [],
        pinterestDailyLimit: 5,
        pinterestAutoPostThreshold: 70,
        pinterestBrandMentionRate: 25,
        pinterestCooldownMinutes: 90,
        cronTimezone: '',
        cronStartHour: 9,
        cronEndHour: 18,
        cronDays: [0, 1, 2, 3, 4, 5, 6],
        cronIntervalMinutes: 15,
        notificationEmail: '',
        notifyViaEmail: true,
    });

    const { user } = useUser();
    const clerkEmail = user?.emailAddresses?.[0]?.emailAddress || '';

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [upgradeMessage, setUpgradeMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [newKeyword, setNewKeyword] = useState('');
    const [newPlatformKeyword, setNewPlatformKeyword] = useState<Record<string, string>>({});
    const [newCommunityId, setNewCommunityId] = useState('');
    const [syncingCommunities, setSyncingCommunities] = useState(false);
    const [newSubreddit, setNewSubreddit] = useState('');
    const [newFbGroup, setNewFbGroup] = useState('');
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
    const [expandedCron, setExpandedCron] = useState<string | null>(null);

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

    const toggleDay = (day: number) => {
        const current = settings.cronDays ?? [0, 1, 2, 3, 4, 5, 6];
        const updated = current.includes(day)
            ? current.filter(d => d !== day)
            : [...current, day].sort((a, b) => a - b);
        setSettings(prev => ({ ...prev, cronDays: updated }));
    };

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/settings`);
            const data = await res.json();
            if (data.settings) {
                setSettings((prev) => ({ ...prev, ...data.settings }));
                settingsLoaded.current = true;
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    // Auto-save: debounce settings changes by 1.2s
    // settingsLoaded is set true only after fetch completes — prevents save-on-mount race
    const settingsLoaded = useRef(false);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!settingsLoaded.current) return;

        setUpgradeMessage('');
        setErrorMessage('');

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        // Validate cron hours
        const startHour = settings.cronStartHour ?? 9;
        const endHour = settings.cronEndHour ?? 18;
        if (startHour >= endHour) {
            setErrorMessage('Cron start hour must be before end hour');
            setSaveStatus('error');
            return;
        }

        setSaveStatus('saving');

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                // Strip fields managed elsewhere (socialAccounts) and DB internals (_id)
                // to avoid accidentally overwriting connected account credentials
                const { socialAccounts: _sa, _id, ...settingsToSave } = settings as ISettings & { _id?: unknown };
                const res = await fetch(`${API_BASE}/api/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settingsToSave),
                });
                if (res.status === 403) {
                    const data = await res.json();
                    if (data.upgrade) {
                        setUpgradeMessage(data.error);
                        setSaveStatus('idle');
                        return;
                    }
                    setErrorMessage(data.error);
                    setSaveStatus('error');
                    return;
                }
                const data = await res.json();
                if (data.error) {
                    setErrorMessage(data.error);
                    setSaveStatus('error');
                } else {
                    setSaveStatus('saved');
                    setTimeout(() => setSaveStatus('idle'), 2000);
                }
            } catch {
                setErrorMessage('Failed to save');
                setSaveStatus('error');
            }
        }, 1200);

        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]);

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saveStatus === 'saving' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }}>
                                <path d="M21 12a9 9 0 11-6.2-8.6" />
                            </svg>
                            Saving...
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--status-approved, #22c55e)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <polyline points="20,6 9,17 4,12" />
                            </svg>
                            Saved
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--status-rejected, #ef4444)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {errorMessage || 'Error'}
                        </span>
                    )}
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {upgradeMessage && <UpgradeBanner message={upgradeMessage} />}

                {/* ── Company Info ── */}
                <div id="company-info" className="form-section" style={{ scrollMarginTop: 80 }}>
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
                <div id="platforms" className="form-section" style={{ scrollMarginTop: 80 }}>
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
                <div id="keywords" className="form-section" style={{ scrollMarginTop: 80 }}>
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
                    <div id="subreddits" className="form-section" style={{ scrollMarginTop: 80 }}>
                        <div className="form-section-title" style={{ color: '#3b82f6' }}>
                            <svg viewBox="0 0 24 24" fill="#3b82f6" style={{ width: 18, height: 18 }}>
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
                    <div id="facebook-groups" className="form-section" style={{ scrollMarginTop: 80 }}>
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
                <div id="post-limits" className="form-section" style={{ scrollMarginTop: 80 }}>
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <path d="M12 20V10M18 20V4M6 20v-4" />
                        </svg>
                        Auto-Post Limits &amp; Thresholds
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        {PLATFORM_OPTIONS.filter((p) => settings.platforms.includes(p.id)).map((p, idx, arr) => {
                            const kwKey = `${p.id}Keywords` as keyof ISettings;
                            const limitKey = `${p.id}DailyLimit` as keyof ISettings;
                            const threshKey = `${p.id}AutoPostThreshold` as keyof ISettings;
                            const platformKws = (settings[kwKey] as string[]) || [];
                            const pkInput = newPlatformKeyword[p.id] || '';
                            const isExpanded = expandedPlatform === p.id;
                            return (
                                <div key={p.id} style={{
                                    borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                }}>
                                    {/* Compact row header */}
                                    <div
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '14px 18px',
                                            background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s',
                                        }}
                                        onClick={() => setExpandedPlatform(isExpanded ? null : p.id)}
                                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {/* Platform dot + name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 120 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</span>
                                        </div>

                                        {/* Inline stats */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, justifyContent: 'flex-end' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Limit</span>
                                                <input
                                                    className="input"
                                                    type="number"
                                                    min={1}
                                                    value={(settings[limitKey] as number) ?? 5}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={(e) => setSettings((prev) => ({ ...prev, [limitKey]: Number(e.target.value) }))}
                                                    style={{ width: 56, padding: '4px 8px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Threshold</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <input
                                                        className="input"
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={(settings[threshKey] as number) ?? 70}
                                                        onClick={e => e.stopPropagation()}
                                                        onChange={(e) => setSettings((prev) => ({ ...prev, [threshKey]: Number(e.target.value) }))}
                                                        style={{ width: 56, padding: '4px 8px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}
                                                    />
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ fontSize: 11, color: p.color }}>{platformKws.length || '0'} kw</span>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                    <polyline points="6,9 12,15 18,9" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expandable panel: keywords + brand rate + cooldown */}
                                    {isExpanded && (() => {
                                        const brandRateKey = `${p.id}BrandMentionRate` as keyof ISettings;
                                        const cooldownKey = `${p.id}CooldownMinutes` as keyof ISettings;
                                        const brandRate = (settings[brandRateKey] as number) ?? 25;
                                        const cooldown = (settings[cooldownKey] as number) ?? PLATFORM_COOLDOWN_DEFAULT[p.id];
                                        const minCooldown = PLATFORM_COOLDOWN_MIN[p.id];
                                        const risk = getBrandRisk(brandRate);
                                        return (
                                            <div style={{
                                                padding: '0 18px 20px',
                                                background: 'rgba(255,255,255,0.015)',
                                                borderTop: '1px solid var(--border-subtle)',
                                                display: 'flex', flexDirection: 'column', gap: 20,
                                            }}>
                                                {/* Keywords */}
                                                <div style={{ paddingTop: 14 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 8 }}>Keywords</div>
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
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
                                                        <div className="tag-list" style={{ gap: 6 }}>
                                                            {platformKws.map((k) => (
                                                                <span key={k} className="tag" style={{ background: p.color + '12', color: p.color, fontSize: 11, padding: '3px 8px' }}>
                                                                    {k}
                                                                    <button className="tag-remove" onClick={() => removeFromList(kwKey, k)}>×</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                                                            No platform-specific keywords — using default keywords
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Twitter Communities (Twitter only) */}
                                                {p.id === 'twitter' && (() => {
                                                    const communityIds: string[] = (settings.twitterCommunityIds as string[]) || [];
                                                    return (
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Twitter Communities</div>
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                                                                    disabled={syncingCommunities}
                                                                    onClick={async () => {
                                                                        setSyncingCommunities(true);
                                                                        try {
                                                                            const res = await fetch('/api/twitter-communities', { method: 'POST' });
                                                                            const data = await res.json();
                                                                            if (data.communities?.length) {
                                                                                // Reload settings to pick up new IDs
                                                                                const setRes = await fetch('/api/settings');
                                                                                const setData = await setRes.json();
                                                                                if (setData.settings) setSettings(setData.settings);
                                                                            }
                                                                        } catch { /* silent */ }
                                                                        setSyncingCommunities(false);
                                                                    }}
                                                                >
                                                                    {syncingCommunities ? (
                                                                        <>
                                                                            <span style={{ width: 10, height: 10, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
                                                                            Syncing…
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="11" height="11">
                                                                                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                                                                                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                                                                            </svg>
                                                                            Sync from Account
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                                                                Click "Sync from Account" to auto-detect communities you've joined, or add IDs manually.<br />
                                                                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#c084fc' }}>x.com/i/communities/<strong>1234567890</strong></code>
                                                            </p>
                                                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                                                <input
                                                                    className="input"
                                                                    style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}
                                                                    placeholder="Community ID (numeric)"
                                                                    value={newCommunityId}
                                                                    onChange={(e) => setNewCommunityId(e.target.value.replace(/\D/g, ''))}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && newCommunityId.trim()) {
                                                                            addToList('twitterCommunityIds' as keyof ISettings, newCommunityId.trim(), () => setNewCommunityId(''));
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 12, padding: '6px 12px' }}
                                                                    onClick={() => {
                                                                        if (newCommunityId.trim()) {
                                                                            addToList('twitterCommunityIds' as keyof ISettings, newCommunityId.trim(), () => setNewCommunityId(''));
                                                                        }
                                                                    }}
                                                                >Add</button>
                                                            </div>
                                                            {communityIds.length > 0 ? (
                                                                <div className="tag-list" style={{ gap: 6 }}>
                                                                    {communityIds.map((id) => (
                                                                        <span key={id} className="tag" style={{ background: '#1d9bf022', color: '#1d9bf0', fontSize: 11, padding: '3px 8px', fontFamily: 'var(--font-mono)' }}>
                                                                            {id}
                                                                            <button className="tag-remove" onClick={() => removeFromList('twitterCommunityIds' as keyof ISettings, id)}>×</button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>No communities added — click "Sync from Account" or add manually</p>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Brand Mention Rate */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                        <div>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Brand Mention Rate</span>
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>— how often comments promote your brand</span>
                                                        </div>
                                                        <div style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                            padding: '3px 10px', borderRadius: 20,
                                                            background: risk.bg, border: `1px solid ${risk.color}44`,
                                                        }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: risk.color }} />
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: risk.color }}>{risk.label}</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <input
                                                            type="range" min={0} max={100} step={5}
                                                            value={brandRate}
                                                            onChange={e => setSettings(prev => ({ ...prev, [brandRateKey]: Number(e.target.value) }))}
                                                            style={{ flex: 1, accentColor: risk.color }}
                                                        />
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: risk.color, minWidth: 36, textAlign: 'right' }}>{brandRate}%</span>
                                                    </div>
                                                    {/* Risk precaution banner */}
                                                    <div style={{
                                                        marginTop: 8, padding: '8px 12px',
                                                        borderRadius: 6, background: risk.bg,
                                                        border: `1px solid ${risk.color}33`,
                                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke={risk.color} strokeWidth={2} width={14} height={14} style={{ flexShrink: 0, marginTop: 1 }}>
                                                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                                        </svg>
                                                        <span style={{ fontSize: 11, color: risk.color, lineHeight: 1.5 }}>{risk.desc}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                        <span style={{ fontSize: 10, color: '#22c55e' }}>0% — Never mention brand</span>
                                                        <span style={{ fontSize: 10, color: '#ef4444' }}>100% — Always mention brand</span>
                                                    </div>
                                                </div>

                                                {/* Cooldown between posts */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                        <div>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Post Cooldown</span>
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>— minimum gap between auto-posts</span>
                                                        </div>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: p.color, fontFamily: 'var(--font-mono)' }}>{formatMinutes(cooldown)}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={minCooldown} max={360} step={15}
                                                        value={cooldown}
                                                        onChange={e => setSettings(prev => ({ ...prev, [cooldownKey]: Number(e.target.value) }))}
                                                        style={{ width: '100%', accentColor: p.color }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatMinutes(minCooldown)} (min recommended)</span>
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>6h</span>
                                                    </div>
                                                    {cooldown < 60 && (
                                                        <div style={{
                                                            marginTop: 6, padding: '6px 10px', borderRadius: 6,
                                                            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                                                            display: 'flex', gap: 6, alignItems: 'center',
                                                        }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} width={13} height={13} style={{ flexShrink: 0 }}>
                                                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                            </svg>
                                                            <span style={{ fontSize: 11, color: '#f59e0b' }}>Short cooldowns increase spam detection risk. 60+ minutes is recommended.</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Cron Schedule ── */}
                <div id="cron-schedule" className="form-section" style={{ scrollMarginTop: 80 }}>
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
                        </svg>
                        Cron Schedule
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>

                        {/* ─ Row 1: Frequency ─ */}
                        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                                    cursor: 'pointer', background: expandedCron === 'freq' ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onClick={() => setExpandedCron(expandedCron === 'freq' ? null : 'freq')}
                                onMouseEnter={e => { if (expandedCron !== 'freq') e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                onMouseLeave={e => { if (expandedCron !== 'freq') e.currentTarget.style.background = 'transparent'; }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Run Frequency</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                                        {(() => {
                                            const mins = settings.cronIntervalMinutes ?? 15;
                                            if (mins < 60) return `${mins}m`;
                                            const h = Math.floor(mins / 60);
                                            const m = mins % 60;
                                            return m ? `${h}h ${m}m` : `${h}h`;
                                        })()}
                                    </span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                        style={{ transform: expandedCron === 'freq' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                        <polyline points="6,9 12,15 18,9" />
                                    </svg>
                                </div>
                            </div>
                            {expandedCron === 'freq' && (
                                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.015)' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 14 }}>
                                        {[
                                            { label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '45m', value: 45 },
                                            { label: '1h', value: 60 }, { label: '1.5h', value: 90 }, { label: '2h', value: 120 },
                                            { label: '3h', value: 180 }, { label: '4h', value: 240 }, { label: '6h', value: 360 },
                                        ].map(opt => {
                                            const isActive = (settings.cronIntervalMinutes ?? 15) === opt.value;
                                            return (
                                                <button key={opt.value} type="button"
                                                    onClick={() => setSettings(p => ({ ...p, cronIntervalMinutes: opt.value }))}
                                                    style={{
                                                        padding: '6px 14px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                                                        borderRadius: 6, cursor: 'pointer',
                                                        border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                                                        background: isActive ? 'rgba(14,165,233,0.15)' : 'transparent',
                                                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                                        transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
                                                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                                                >{opt.label}</button>
                                            );
                                        })}
                                    </div>
                                    <div style={{ marginTop: 12 }}>
                                        <input type="range" min={15} max={360} step={15}
                                            value={settings.cronIntervalMinutes ?? 15}
                                            onChange={e => setSettings(p => ({ ...p, cronIntervalMinutes: parseInt(e.target.value, 10) }))}
                                            style={{ width: '100%', accentColor: 'var(--accent)' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>15 min</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>6 hours</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ─ Row 2: Timezone ─ */}
                        <div ref={tzRef} style={{ borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                                    cursor: 'pointer', background: expandedCron === 'tz' ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onClick={() => { setExpandedCron(expandedCron === 'tz' ? null : 'tz'); setTzOpen(false); setTzSearch(''); }}
                                onMouseEnter={e => { if (expandedCron !== 'tz') e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                onMouseLeave={e => { if (expandedCron !== 'tz') e.currentTarget.style.background = 'transparent'; }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                                </svg>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Timezone</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: settings.cronTimezone ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        {settings.cronTimezone ? (ALL_TIMEZONES.find(t => t.value === settings.cronTimezone)?.label || settings.cronTimezone) : 'Not set'}
                                    </span>
                                    {settings.cronTimezone && (
                                        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                                            {getLiveTime(settings.cronTimezone)}
                                        </span>
                                    )}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                        style={{ transform: expandedCron === 'tz' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                        <polyline points="6,9 12,15 18,9" />
                                    </svg>
                                </div>
                            </div>
                            {expandedCron === 'tz' && (
                                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.015)' }}>
                                    <div style={{ paddingTop: 14, position: 'relative' }}>
                                        <button type="button"
                                            onClick={() => { setTzOpen(!tzOpen); setTzSearch(''); }}
                                            style={{
                                                width: '100%', padding: '10px 14px', fontSize: 13, fontWeight: 500,
                                                background: 'var(--bg-input)', border: `1px solid ${tzOpen ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                                borderRadius: 'var(--radius-sm)', color: settings.cronTimezone ? 'var(--text-primary)' : 'var(--text-muted)',
                                                cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                transition: 'border-color 0.15s',
                                            }}
                                        >
                                            <span>{selectedTzLabel}</span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                                style={{ transform: tzOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                <polyline points="6,9 12,15 18,9" />
                                            </svg>
                                        </button>
                                        {tzOpen && (
                                            <div style={{
                                                position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
                                                zIndex: 50, background: '#1a1a1f', border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-md)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <input autoFocus placeholder="Search city or region..."
                                                        value={tzSearch} onChange={e => setTzSearch(e.target.value)}
                                                        style={{
                                                            width: '100%', padding: '8px 10px', fontSize: 13,
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)',
                                                            borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none',
                                                        }}
                                                        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                                        onBlur={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                                                    />
                                                </div>
                                                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                                    {filteredTimezones.length === 0 ? (
                                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No timezones found</div>
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
                                                                            <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>{tz.region}</div>
                                                                        )}
                                                                        <button type="button"
                                                                            onClick={() => { setSettings(p => ({ ...p, cronTimezone: tz.value })); setTzOpen(false); setTzSearch(''); }}
                                                                            style={{
                                                                                width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                                background: isSelected ? 'rgba(14,165,233,0.15)' : 'transparent',
                                                                                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                                                                fontSize: 13, fontWeight: isSelected ? 600 : 400, transition: 'background 0.1s',
                                                                            }}
                                                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                                        >
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5} width={14} height={14}><polyline points="20,6 9,17 4,12" /></svg>}
                                                                                {tz.label}
                                                                            </span>
                                                                            {liveTime && <span style={{ fontSize: 12, color: isSelected ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{liveTime}</span>}
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
                                </div>
                            )}
                        </div>

                        {/* ─ Row 3: Active Hours ─ */}
                        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                                    cursor: 'pointer', background: expandedCron === 'hours' ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onClick={() => setExpandedCron(expandedCron === 'hours' ? null : 'hours')}
                                onMouseEnter={e => { if (expandedCron !== 'hours') e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                onMouseLeave={e => { if (expandedCron !== 'hours') e.currentTarget.style.background = 'transparent'; }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
                                </svg>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Active Hours</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                                        {HOURS.find(h => h.value === (settings.cronStartHour ?? 9))?.label}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>to</span>
                                    <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                                        {HOURS.find(h => h.value === (settings.cronEndHour ?? 18))?.label}
                                    </span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                        style={{ transform: expandedCron === 'hours' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                        <polyline points="6,9 12,15 18,9" />
                                    </svg>
                                </div>
                            </div>
                            {expandedCron === 'hours' && (
                                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.015)' }}>
                                    <div style={{ paddingTop: 14 }}>
                                        {/* Timeline bar */}
                                        {(() => {
                                            const start = settings.cronStartHour ?? 9;
                                            const end = settings.cronEndHour ?? 18;
                                            const leftPct = (start / 24) * 100;
                                            const widthPct = ((end - start) / 24) * 100;
                                            return (
                                                <div style={{ marginBottom: 16 }}>
                                                    <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                                                        <div style={{
                                                            position: 'absolute', top: 0, bottom: 0,
                                                            left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%`,
                                                            background: 'linear-gradient(90deg, #f59e0b, #38bdf8)',
                                                            borderRadius: 4, transition: 'all 0.3s ease',
                                                        }} />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                        {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
                                                            <span key={i} style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Start / End selectors side by side */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                                                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#f59e0b' }}>Start</span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                                                    {HOURS.map(h => {
                                                        const isSelected = (settings.cronStartHour ?? 9) === h.value;
                                                        const inRange = h.value >= (settings.cronStartHour ?? 9) && h.value < (settings.cronEndHour ?? 18);
                                                        return (
                                                            <button key={h.value} type="button"
                                                                onClick={() => setSettings(p => ({ ...p, cronStartHour: h.value }))}
                                                                style={{
                                                                    padding: '5px 0', fontSize: 10, fontWeight: isSelected ? 700 : 500,
                                                                    border: isSelected ? '1.5px solid #f59e0b' : '1px solid transparent',
                                                                    borderRadius: 4, cursor: 'pointer',
                                                                    background: isSelected ? 'rgba(245,158,11,0.15)' : inRange ? 'rgba(245,158,11,0.04)' : 'transparent',
                                                                    color: isSelected ? '#fbbf24' : inRange ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                                    transition: 'all 0.1s',
                                                                }}
                                                            >
                                                                {h.value === 0 ? '12a' : h.value < 12 ? `${h.value}a` : h.value === 12 ? '12p' : `${h.value - 12}p`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                                                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#38bdf8' }}>End</span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                                                    {HOURS.map(h => {
                                                        const isSelected = (settings.cronEndHour ?? 18) === h.value;
                                                        const inRange = h.value >= (settings.cronStartHour ?? 9) && h.value <= (settings.cronEndHour ?? 18);
                                                        return (
                                                            <button key={h.value} type="button"
                                                                onClick={() => setSettings(p => ({ ...p, cronEndHour: h.value }))}
                                                                style={{
                                                                    padding: '5px 0', fontSize: 10, fontWeight: isSelected ? 700 : 500,
                                                                    border: isSelected ? '1.5px solid #38bdf8' : '1px solid transparent',
                                                                    borderRadius: 4, cursor: 'pointer',
                                                                    background: isSelected ? 'rgba(14,165,233,0.15)' : inRange ? 'rgba(14,165,233,0.04)' : 'transparent',
                                                                    color: isSelected ? '#a5b4fc' : inRange ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                                    transition: 'all 0.1s',
                                                                }}
                                                            >
                                                                {h.value === 0 ? '12a' : h.value < 12 ? `${h.value}a` : h.value === 12 ? '12p' : `${h.value - 12}p`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ─ Row 4: Active Days ─ */}
                        <div>
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                                    cursor: 'pointer', background: expandedCron === 'days' ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onClick={() => setExpandedCron(expandedCron === 'days' ? null : 'days')}
                                onMouseEnter={e => { if (expandedCron !== 'days') e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                onMouseLeave={e => { if (expandedCron !== 'days') e.currentTarget.style.background = 'transparent'; }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} width={16} height={16}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Active Days</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                                        {(() => {
                                            const days = settings.cronDays ?? [0,1,2,3,4,5,6];
                                            if (days.length === 7) return 'Every day';
                                            if (days.length === 5 && [1,2,3,4,5].every(d => days.includes(d))) return 'Weekdays';
                                            if (days.length === 2 && [0,6].every(d => days.includes(d))) return 'Weekends';
                                            return `${days.length} days`;
                                        })()}
                                    </span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={14} height={14}
                                        style={{ transform: expandedCron === 'days' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                        <polyline points="6,9 12,15 18,9" />
                                    </svg>
                                </div>
                            </div>
                            {expandedCron === 'days' && (
                                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.015)' }}>
                                    <div style={{ paddingTop: 14 }}>
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                            {[
                                                { label: 'All', days: [0,1,2,3,4,5,6] },
                                                { label: 'Weekdays', days: [1,2,3,4,5] },
                                                { label: 'Weekends', days: [0,6] },
                                            ].map(preset => (
                                                <button key={preset.label} type="button"
                                                    onClick={() => setSettings(p => ({ ...p, cronDays: preset.days }))}
                                                    style={{
                                                        fontSize: 11, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                                                        border: '1px solid var(--border-subtle)', background: 'transparent',
                                                        color: 'var(--text-muted)', fontWeight: 600, transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                >{preset.label}</button>
                                            ))}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                                            {DAYS_OF_WEEK.map(day => {
                                                const active = (settings.cronDays ?? [0,1,2,3,4,5,6]).includes(day.value);
                                                return (
                                                    <button key={day.value} type="button"
                                                        onClick={() => toggleDay(day.value)}
                                                        style={{
                                                            padding: '10px 0', borderRadius: 6,
                                                            fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                                                            border: active ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                                                            background: active ? 'rgba(14,165,233,0.15)' : 'transparent',
                                                            color: active ? 'var(--accent)' : 'var(--text-muted)',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >{day.label}</button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* ── Notification Preferences ── */}
                <div id="notifications" className="form-section" style={{ position: 'relative', overflow: 'hidden', scrollMarginTop: 80 }}>
                    <div style={{
                        position: 'absolute', top: 0, right: 0, width: 200, height: 200,
                        background: 'radial-gradient(circle at top right, rgba(14,165,233,0.08), transparent 70%)',
                        pointerEvents: 'none',
                    }} />
                    <div className="form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 01-3.46 0" />
                        </svg>
                        Notification Preferences
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
                        Get notified via email when your platform cookies expire or accounts disconnect.
                    </p>

                    {/* Email notification */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                Email Notifications
                            </label>
                            <button
                                type="button"
                                onClick={() => setSettings(p => ({ ...p, notifyViaEmail: !p.notifyViaEmail }))}
                                style={{
                                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                    background: settings.notifyViaEmail ? '#0ea5e9' : 'rgba(255,255,255,0.1)',
                                    position: 'relative', transition: 'background 200ms',
                                }}
                            >
                                <div style={{
                                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: 3,
                                    left: settings.notifyViaEmail ? 23 : 3,
                                    transition: 'left 200ms',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }} />
                            </button>
                        </div>
                        {/* Show Clerk email as auto-detected */}
                        {clerkEmail && settings.notifyViaEmail && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', marginBottom: 8,
                                background: 'rgba(14,165,233,0.06)',
                                border: '1px solid rgba(14,165,233,0.15)',
                                borderRadius: 8, fontSize: 13,
                            }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={1.8} width="16" height="16" style={{ flexShrink: 0 }}>
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span style={{ color: 'var(--text-primary)' }}>{clerkEmail}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(from your account)</span>
                            </div>
                        )}
                        <input
                            className="input"
                            type="email"
                            placeholder={clerkEmail ? 'Override email (optional)' : 'your@email.com'}
                            value={settings.notificationEmail || ''}
                            onChange={(e) => setSettings(p => ({ ...p, notificationEmail: e.target.value }))}
                            style={{ opacity: settings.notifyViaEmail ? 1 : 0.4, pointerEvents: settings.notifyViaEmail ? 'auto' : 'none' }}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', opacity: 0.7 }}>
                            {clerkEmail
                                ? 'Alerts go to your account email. Enter a different email above to override.'
                                : 'Receive alerts when cookies expire for 3+ hours.'
                            } Max 1 email every 12 hours.
                        </p>
                    </div>

                </div>

                {/* ── Prompt Template ── */}
                <div id="prompt-template" className="form-section" style={{ scrollMarginTop: 80 }}>
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

                <div style={{ paddingBottom: 40 }} />

            </div>
        </div>
    );
}
