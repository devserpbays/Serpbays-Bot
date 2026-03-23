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

// ── Human-readable transformer ─────────────────────────────────────────────
type Category = 'reply' | 'engagement' | 'browsing' | 'issue' | 'system';

interface HumanEntry {
    title: string;
    description: string;
    category: Category;
    link?: { href: string; label: string };
    score?: number;
    isIssue?: boolean;
}

const ACTION_WORDS: Record<string, string> = {
    reply: 'reply to a tweet',
    like: 'like tweets',
    retweet: 'retweet',
    bookmark: 'save bookmarks',
    follow: 'follow someone',
    browse: 'scroll the feed',
    original_tweet: 'post an original tweet',
};

function actionsToEnglish(actions: string[]): string {
    return actions.map(a => ACTION_WORDS[a] || a).join(', then ');
}

function hourLabel(hour: number): string {
    if (hour >= 7 && hour <= 9)   return 'Morning commute hours';
    if (hour >= 12 && hour <= 13) return 'Lunchtime peak';
    if (hour >= 19 && hour <= 22) return 'Evening peak';
    if (hour >= 0 && hour <= 5)   return 'Late night / quiet period';
    return 'Daytime hours';
}

function humanize(entry: ActivityLogEntry): HumanEntry {
    const meta = entry.meta || {};
    const msg  = entry.message;

    switch (entry.action) {

        case 'cron_start':
            return { category: 'system', title: 'Automation session started', description: 'The bot woke up and is about to check for new activity.' };

        case 'cron_end':
            return { category: 'system', title: 'Session finished', description: 'All tasks for this run are done. Next run scheduled automatically.' };

        case 'cron_error':
            return { category: 'issue', title: 'Session encountered an error', description: msg || 'An unexpected error stopped this run.', isIssue: true };

        case 'session':
            if (meta.passive) {
                const h = meta.hour as number;
                return {
                    category: 'browsing',
                    title: 'Scrolled the feed — no actions this round',
                    description: `${hourLabel(h)} (${h}:00). The bot browsed Twitter naturally without posting or engaging — mimicking a real user taking a break.`,
                };
            }
            const mult = meta.activityMultiplier as number ?? 0.7;
            const h2   = meta.hour as number ?? 0;
            return {
                category: 'system',
                title: 'Checked notifications and opened session',
                description: `${hourLabel(h2)} — ${Math.round(mult * 100)}% activity level at ${h2}:00. Notifications feed visited first, just like a real user.`,
            };

        case 'social':
            if (msg.toLowerCase().includes('passive')) {
                return { category: 'browsing', title: 'Browsed feed — no posts this round', description: msg };
            }
            if (msg.toLowerCase().includes('idle')) {
                return { category: 'system', title: 'Idle cycle — resting this run', description: 'Randomly skipped all actions to avoid predictable patterns.' };
            }
            const acts = (meta.actions as string[]) || [];
            return {
                category: 'system',
                title: `Planned ${acts.length} action${acts.length !== 1 ? 's' : ''} for this session`,
                description: acts.length ? `Going to: ${actionsToEnglish(acts)}` : msg,
            };

        case 'post':
            return {
                category: 'reply',
                title: 'Reply published',
                description: meta.score != null
                    ? `Relevance score ${meta.score}/100 — strong match for your target audience.`
                    : 'Comment posted successfully.',
                score: meta.score as number,
                link: meta.replyUrl ? { href: meta.replyUrl as string, label: `View reply on ${entry.platform}` } : undefined,
            };

        case 'original_tweet':
            return {
                category: 'reply',
                title: 'Original tweet published',
                description: msg,
                link: meta.tweetUrl ? { href: meta.tweetUrl as string, label: 'View tweet' } : undefined,
            };

        case 'post_failed':
            return { category: 'issue', title: 'Reply failed — will retry automatically', description: msg, isIssue: true };

        case 'engage': {
            if (msg.match(/liked?\s+\d+/i)) {
                const ids = (meta.tweetIds as string[]) || [];
                return {
                    category: 'engagement',
                    title: msg,
                    description: ids.length
                        ? `Liked tweets: ${ids.map(id => `#${id.slice(-6)}`).join(', ')}`
                        : 'Engagement recorded.',
                };
            }
            if (msg.toLowerCase().includes('retweet')) {
                const url = msg.match(/https?:\/\/\S+/)?.[0];
                return {
                    category: 'engagement',
                    title: 'Retweeted a tweet',
                    description: 'Shared a relevant tweet with followers.',
                    link: url ? { href: url, label: 'View tweet' } : undefined,
                };
            }
            if (msg.toLowerCase().includes('bookmark')) {
                return { category: 'engagement', title: msg, description: 'Saved for later — adds to your content library.' };
            }
            if (msg.toLowerCase().includes('followed @')) {
                const handle = msg.match(/@[\w]+/)?.[0] ?? '';
                return { category: 'engagement', title: `Followed ${handle}`, description: 'Visited their profile first, then followed — just like a real user would.' };
            }
            if (msg.toLowerCase().includes('skipped') || msg.toLowerCase().includes('deleted')) {
                return { category: 'issue', title: 'Post no longer available', description: `${msg} — marked to skip in future runs.`, isIssue: false };
            }
            if (msg.toLowerCase().includes('failed')) {
                return { category: 'issue', title: 'Engagement action failed', description: msg, isIssue: true };
            }
            return { category: 'engagement', title: 'Engagement activity', description: msg };
        }

        case 'cooldown':
            return {
                category: 'system',
                title: 'Reply on hold — cooldown active',
                description: meta.remainingMinutes
                    ? `${meta.remainingMinutes} min${Number(meta.remainingMinutes) !== 1 ? 's' : ''} until next reply allowed. This spacing looks natural and avoids spam detection.`
                    : msg,
            };

        case 'automation_block':
            return {
                category: 'issue',
                title: 'Platform flagged activity as automated',
                description: 'Posting paused automatically to protect your account. The bot will retry on the next run.',
                isIssue: true,
            };

        case 'auth_error':
            return {
                category: 'issue',
                title: 'Account session expired — action needed',
                description: 'Your login cookies have expired. Go to Social Accounts and re-upload your cookies to resume.',
                isIssue: true,
            };

        case 'account_suspended':
            return { category: 'issue', title: 'Account suspended', description: msg, isIssue: true };

        case 'scrape': {
            const tf = meta.totalFound as number;
            const np = meta.newPostCount as number;
            return {
                category: 'system',
                title: 'Searched for relevant content',
                description: tf != null
                    ? `Scanned ${tf} tweets — found ${np} new ${np === 1 ? 'opportunity' : 'opportunities'} to engage with.`
                    : msg,
            };
        }

        case 'evaluate':
            return {
                category: 'system',
                title: 'AI reviewed content for relevance',
                description: msg.replace(/Evaluated (\d+) posts?/, 'Reviewed $1 posts and scored each one for relevance to your brand.'),
            };

        case 'skip':
            if (msg.toLowerCase().includes('idle') || msg.toLowerCase().includes('score-based')) {
                return { category: 'browsing', title: 'Idle cycle — resting this run', description: 'Randomly skipped this opportunity to avoid a predictable posting pattern — mimics a real user not always responding.' };
            }
            if (msg.toLowerCase().includes('threshold')) {
                return { category: 'system', title: 'No high-score content found this run', description: 'No posts crossed the relevance threshold — nothing to reply to yet. Try lowering the auto-post threshold in Settings.' };
            }
            return { category: 'system', title: 'Skipped this run', description: msg };

        case 'session_start':
            return {
                category: 'system',
                title: `Facebook session: ${msg.replace('Session type: ', '')}`,
                description: msg.includes('full')
                    ? 'Peak hours — will browse, react, and comment this session.'
                    : msg.includes('react_only')
                    ? 'Evening hours — reacting to posts only, no commenting.'
                    : msg.includes('browse_only')
                    ? 'Off-peak hours — light browsing only, no actions taken.'
                    : msg,
            };

        case 'limit':
            return {
                category: 'system',
                title: 'Daily comment limit reached',
                description: msg + ' — The account will resume posting comments tomorrow.',
                isIssue: false,
            };

        case 'passive_session':
            return {
                category: 'browsing',
                title: 'Passive session complete',
                description: msg.includes('reacted')
                    ? msg + ' — React-only session keeps the account active during off-peak hours.'
                    : 'Browse-only session — visited the feed without taking any actions.',
            };

        case 'react':
            return {
                category: 'engagement',
                title: `Reacted to a Facebook post`,
                description: meta.url
                    ? `Added a ${msg.match(/(Like|Love|Haha|Wow|Care|Sad|Angry)/)?.[0] ?? 'reaction'} reaction before commenting — just like a real user would engage first.`
                    : msg,
                link: meta.url ? { href: meta.url as string, label: 'View post' } : undefined,
            };

        case 'stories_viewed':
            return {
                category: 'browsing',
                title: `Checked ${meta.count ?? ''} Facebook ${Number(meta.count) === 1 ? 'story' : 'stories'}`,
                description: 'Browsed stories at session start — a natural behavior pattern that boosts the account\'s trust score with Facebook.',
            };

        case 'author_dedup':
            return {
                category: 'system',
                title: 'Avoiding repeat authors',
                description: `Skipping ${meta.count ?? 'some'} author(s) already engaged with in the last 7 days — prevents over-targeting the same people.`,
            };

        case 'overlay_blocked':
            return {
                category: 'issue',
                title: 'Facebook showed a warning — paused automatically',
                description: `${msg} — The bot stopped immediately to protect the account. Check your Facebook account and re-verify cookies if needed.`,
                isIssue: true,
            };

        case 'config_error':
            return { category: 'issue', title: 'Setup incomplete', description: msg, isIssue: true };

        case 'warmup':
            return { category: 'system', title: 'Account warmup mode active', description: msg + ' — Limits are lower while the account is new to avoid detection.' };

        case 'rate_limit':
            return { category: 'issue', title: 'Daily posting limit reached', description: 'The account has hit its daily post limit. It will resume posting tomorrow.', isIssue: false };

        case 'duplicate':
            return { category: 'system', title: 'Duplicate reply skipped', description: 'This tweet was already replied to — moved on to the next one.' };

        default:
            return { category: 'system', title: entry.action.replace(/_/g, ' '), description: msg };
    }
}

// ── Icons ──────────────────────────────────────────────────────────────────
function EntryIcon({ category, level, action }: { category: Category; level: string; action: string }) {
    const size = 18;

    if (level === 'error' || (level === 'warn' && category === 'issue')) {
        const c = level === 'error' ? '#ef4444' : '#f59e0b';
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${c}15`, border: `1.5px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} width={size} height={size}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
        );
    }
    if (level === 'success' || action === 'post' || action === 'original_tweet') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} width={size} height={size}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><polyline points="9,11 12,14 16,9"/></svg>
            </div>
        );
    }
    if (category === 'engagement') {
        if (action === 'engage') {
            const msg_hint = ''; // handled by icon color
        }
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(244,63,94,0.10)', border: '1.5px solid rgba(244,63,94,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="#f43f5e" width={size} height={size}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
        );
    }
    if (category === 'browsing') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(148,163,184,0.10)', border: '1.5px solid rgba(148,163,184,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={size} height={size}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
        );
    }
    if (action === 'cron_start') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.10)', border: '1.5px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2} width={size} height={size}><polygon points="5,3 19,12 5,21 5,3"/></svg>
            </div>
        );
    }
    if (action === 'cron_end') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.08)', border: '1.5px solid rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2} width={size} height={size}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </div>
        );
    }
    if (action === 'cooldown') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,191,36,0.10)', border: '1.5px solid rgba(251,191,36,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={2} width={size} height={size}><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
            </div>
        );
    }
    if (action === 'scrape') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(14,165,233,0.10)', border: '1.5px solid rgba(14,165,233,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={size} height={size}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
        );
    }
    if (action === 'evaluate') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(168,85,247,0.10)', border: '1.5px solid rgba(168,85,247,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth={2} width={size} height={size}><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><path d="M12 6v6l4 2"/></svg>
            </div>
        );
    }
    if (action === 'stories_viewed') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,146,60,0.12)', border: '1.5px solid rgba(251,146,60,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth={2} width={size} height={size}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            </div>
        );
    }
    if (action === 'react') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(244,63,94,0.10)', border: '1.5px solid rgba(244,63,94,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="#f43f5e" width={size} height={size}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
        );
    }
    if (action === 'session_start') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.10)', border: '1.5px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2} width={size} height={size}><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
            </div>
        );
    }
    if (action === 'passive_session') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(148,163,184,0.10)', border: '1.5px solid rgba(148,163,184,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={size} height={size}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
        );
    }
    if (action === 'author_dedup') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(14,165,233,0.10)', border: '1.5px solid rgba(14,165,233,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={size} height={size}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
        );
    }
    if (action === 'overlay_blocked') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} width={size} height={size}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
        );
    }
    if (action === 'limit') {
        return (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,191,36,0.10)', border: '1.5px solid rgba(251,191,36,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={2} width={size} height={size}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
        );
    }
    // default system
    return (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(148,163,184,0.08)', border: '1.5px solid rgba(148,163,184,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={size} height={size}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
    );
}

// ── Platform badge colours ─────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
    twitter: '#1d9bf0', reddit: '#ff4500', facebook: '#1877f2',
    quora: '#b92b27', youtube: '#ff0000', pinterest: '#e60023',
};

// ── Time helpers ───────────────────────────────────────────────────────────
function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
}

function fmtTime(ts: string): string {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

// ── Score colour ───────────────────────────────────────────────────────────
function scoreColor(s: number) { return s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#f87171'; }

// ── Filter category definition ─────────────────────────────────────────────
const FILTER_TABS: { key: string; label: string; match: (e: ActivityLogEntry, h: HumanEntry) => boolean }[] = [
    { key: 'all',        label: 'All Activity',      match: () => true },
    { key: 'reply',      label: 'Posts & Replies',   match: (_, h) => h.category === 'reply' },
    { key: 'engagement', label: 'Engagement',        match: (_, h) => h.category === 'engagement' },
    { key: 'browsing',   label: 'Browsing',          match: (_, h) => h.category === 'browsing' },
    { key: 'issues',     label: 'Issues',            match: (e, h) => h.category === 'issue' || e.level === 'error' || (e.level === 'warn' && h.isIssue !== false) },
    { key: 'system',     label: 'System',            match: (_, h) => h.category === 'system' },
];

// ── Main page ──────────────────────────────────────────────────────────────
export default function LogsPage() {
    const [activeTab,      setActiveTab]      = useState<'feed' | 'replies'>('feed');
    const [filterKey,      setFilterKey]      = useState('all');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [logs,           setLogs]           = useState<ActivityLogEntry[]>([]);
    const [postedComments, setPostedComments] = useState<PostedComment[]>([]);
    const [loading,        setLoading]        = useState(true);
    const [autoRefresh,    setAutoRefresh]    = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const p = new URLSearchParams({ limit: '400' });
            if (platformFilter !== 'all') p.set('platform', platformFilter);
            const res = await fetch(`/api/logs?${p}`);
            const data = await res.json();
            setLogs(Array.isArray(data.logs) ? data.logs : []);
        } catch { /* silent */ }
    }, [platformFilter]);

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

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(() => { fetchLogs(); }, 12000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, fetchLogs]);

    // ── Derive today's performance snapshot from logs ──────────────────────
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayLogs  = logs.filter(l => new Date(l.timestamp) >= todayStart);

    const repliesPosted  = todayLogs.filter(l => l.action === 'post' && l.level === 'success').length;
    const originalPosted = todayLogs.filter(l => l.action === 'original_tweet').length;
    const sessions       = todayLogs.filter(l => l.action === 'cron_start').length;
    const issues         = todayLogs.filter(l => l.level === 'error' || (l.level === 'warn' && l.action !== 'cooldown')).length;

    const likesLog    = todayLogs.find(l => l.action === 'engage' && /liked?\s+\d+/i.test(l.message));
    const likesMatch  = likesLog?.message.match(/(\d+)/);
    const likesCount  = likesMatch ? parseInt(likesMatch[1]) : 0;
    const retweets    = todayLogs.filter(l => l.action === 'engage' && /retweeted/i.test(l.message)).length;

    // ── Humanize + filter ──────────────────────────────────────────────────
    const humanized = logs.map(e => ({ entry: e, human: humanize(e) }));
    const filterDef = FILTER_TABS.find(f => f.key === filterKey) || FILTER_TABS[0];
    const filtered  = humanized.filter(({ entry, human }) => filterDef.match(entry, human));

    const statusColor = issues > 0 ? '#ef4444' : sessions > 0 ? '#22c55e' : '#94a3b8';
    const statusLabel = issues > 0 ? `${issues} issue${issues > 1 ? 's' : ''} need attention` : sessions > 0 ? 'Running smoothly' : 'No activity today';

    return (
        <div className="animate-fade-in" style={{ minHeight: '100vh', overflow: 'hidden' }}>

            {/* ── Page header ────────────────────────────────────────────── */}
            <div style={{ padding: 'clamp(14px,3vw,24px) clamp(12px,3vw,28px) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Activity Feed</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            Everything your bot has done — in plain English
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {/* Status pill */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20, background: `${statusColor}12`, border: `1px solid ${statusColor}30`, fontSize: 11, fontWeight: 600, color: statusColor, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0 }} />
                            {statusLabel}
                        </div>
                        {/* Auto-refresh */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: autoRefresh ? 'var(--accent-bg)' : 'transparent', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: 13, height: 13, accentColor: 'var(--accent)' }} />
                            Live
                        </label>
                        <button onClick={() => { setLoading(true); Promise.all([fetchLogs(), fetchPostedComments()]).finally(() => setLoading(false)); }}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── Today's performance snapshot ───────────────────────── */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                    {[
                        { label: 'Replies sent',     value: repliesPosted,  color: '#22c55e', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
                        { label: 'Original tweets',  value: originalPosted, color: '#a78bfa', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
                        { label: 'Tweets liked',     value: likesCount,     color: '#f43f5e', icon: <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> },
                        { label: 'Retweets',         value: retweets,       color: '#34d399', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
                        { label: 'Sessions run',     value: sessions,       color: '#6366f1', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><polygon points="5,3 19,12 5,21 5,3"/></svg> },
                        { label: 'Issues',           value: issues,         color: issues > 0 ? '#ef4444' : '#94a3b8', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                    ].map(({ label, value, color, icon }) => (
                        <div key={label} style={{ flex: '1 1 0', minWidth: 90, padding: '12px 14px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span style={{ color }}>{icon}</span>
                                {label}
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: value > 0 ? color : 'var(--text-muted)', lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Today</div>
                        </div>
                    ))}
                </div>

                {/* ── Main tabs ──────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
                    {[
                        { key: 'feed',    label: 'Activity Feed' },
                        { key: 'replies', label: `Posted Replies${postedComments.length ? ` (${postedComments.length})` : ''}` },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setActiveTab(key as 'feed' | 'replies')} style={{
                            padding: '11px 20px', border: 'none', borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === key ? 700 : 500,
                            color: activeTab === key ? 'var(--accent)' : 'var(--text-muted)', transition: 'all 150ms', marginBottom: -1,
                        }}>{label}</button>
                    ))}
                </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────────── */}
            <div style={{ padding: 'clamp(14px,3vw,20px) clamp(12px,3vw,28px)', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
                ) : activeTab === 'feed' ? (
                    <>
                        {/* ── Filter bar ─────────────────────────────────── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, flexShrink: 0, maxWidth: '100%' }}>
                                <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 3, width: 'max-content' }}>
                                    {FILTER_TABS.map(f => {
                                        const count = f.key === 'all' ? logs.length : humanized.filter(({ entry, human }) => f.match(entry, human)).length;
                                        return (
                                            <button key={f.key} onClick={() => setFilterKey(f.key)} style={{
                                                padding: '5px 10px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                background: filterKey === f.key ? 'var(--accent)' : 'transparent',
                                                color: filterKey === f.key ? '#fff' : 'var(--text-muted)', transition: 'all 150ms',
                                                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                                            }}>
                                                {f.label}
                                                {count > 0 && (
                                                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: filterKey === f.key ? 'rgba(255,255,255,0.22)' : 'var(--bg-input)', color: filterKey === f.key ? '#fff' : 'var(--text-muted)' }}>
                                                        {count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Platform filter */}
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, flexShrink: 0, maxWidth: '100%' }}>
                                <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 3, width: 'max-content' }}>
                                    {['all', 'twitter', 'reddit', 'facebook', 'quora'].map(p => (
                                        <button key={p} onClick={() => setPlatformFilter(p)} style={{
                                            padding: '5px 10px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                            background: platformFilter === p ? (PLATFORM_COLORS[p] || 'var(--accent)') : 'transparent',
                                            color: platformFilter === p ? '#fff' : 'var(--text-muted)', transition: 'all 150ms', whiteSpace: 'nowrap',
                                        }}>{p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ── Activity feed ──────────────────────────────── */}
                        {filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
                                No activity in this category yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {filtered.map(({ entry, human }, idx) => {
                                    const pc = PLATFORM_COLORS[entry.platform] || '#94a3b8';
                                    const isFirst = idx === 0;
                                    const showDateSep = isFirst || (
                                        new Date(filtered[idx - 1].entry.timestamp).toDateString() !== new Date(entry.timestamp).toDateString()
                                    );

                                    return (
                                        <div key={entry._id}>
                                            {/* Date separator */}
                                            {showDateSep && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 8px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                                                    {new Date(entry.timestamp).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                                                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                                                </div>
                                            )}

                                            <div style={{
                                                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, minWidth: 0, overflow: 'hidden',
                                                background: entry.level === 'error' ? 'rgba(239,68,68,0.04)'
                                                    : entry.level === 'warn' && human.isIssue ? 'rgba(245,158,11,0.04)'
                                                    : entry.level === 'success' ? 'rgba(34,197,94,0.04)'
                                                    : 'transparent',
                                                border: entry.level === 'error' ? '1px solid rgba(239,68,68,0.12)'
                                                    : entry.level === 'warn' && human.isIssue ? '1px solid rgba(245,158,11,0.12)'
                                                    : entry.level === 'success' ? '1px solid rgba(34,197,94,0.12)'
                                                    : '1px solid transparent',
                                                transition: 'background 150ms',
                                            }}
                                                onMouseEnter={e => { if (entry.level === 'info') (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                                onMouseLeave={e => { if (entry.level === 'info') (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                            >
                                                <EntryIcon category={human.category} level={entry.level} action={entry.action} />

                                                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                                    {/* Title row */}
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                                                        <span style={{
                                                            fontSize: 13, fontWeight: 600, minWidth: 0, wordBreak: 'break-word',
                                                            color: entry.level === 'error' ? '#ef4444'
                                                                : entry.level === 'warn' && human.isIssue ? '#f59e0b'
                                                                : entry.level === 'success' ? '#22c55e'
                                                                : 'var(--text-primary)',
                                                        }}>
                                                            {human.title}
                                                        </span>

                                                        {/* Platform badge */}
                                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${pc}18`, color: pc, border: `1px solid ${pc}30`, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                                                            {entry.platform}
                                                        </span>

                                                        {/* Score badge */}
                                                        {human.score != null && (
                                                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${scoreColor(human.score)}14`, color: scoreColor(human.score), flexShrink: 0 }}>
                                                                {human.score}/100
                                                            </span>
                                                        )}

                                                        {/* Timestamp */}
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} title={new Date(entry.timestamp).toLocaleString()}>
                                                            {fmtTime(entry.timestamp)} · {timeAgo(entry.timestamp)}
                                                        </span>
                                                    </div>

                                                    {/* Description */}
                                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                        {human.description}
                                                    </p>

                                                    {/* Link */}
                                                    {human.link && (
                                                        <a href={human.link.href} target="_blank" rel="noopener noreferrer" style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            fontSize: 11, color: pc, marginTop: 6, textDecoration: 'none', fontWeight: 600,
                                                        }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={11} height={11}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                            {human.link.label}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                ) : (
                    /* ── Posted Replies tab ──────────────────────────────── */
                    postedComments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                            <p style={{ fontWeight: 600, fontSize: 15, margin: '0 0 6px', color: 'var(--text-secondary)' }}>No replies posted today</p>
                            <p style={{ margin: 0 }}>Today&apos;s published replies will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {postedComments.slice().reverse().map((comment, i) => {
                                const pc = PLATFORM_COLORS[comment.platform] || '#94a3b8';
                                const replyText = comment.editedReply || comment.aiReply || comment.reply || '';
                                return (
                                    <div key={comment._id || i} style={{ background: 'var(--bg-card)', border: `1px solid ${pc}25`, borderRadius: 14, overflow: 'hidden' }}>
                                        {/* Card header */}
                                        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${pc}06` }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${pc}18`, color: pc, border: `1px solid ${pc}30`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {comment.platform}
                                                </span>
                                                {(comment.postedByAccount || comment.account) && (
                                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                        via @{comment.postedByAccount || comment.account}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {new Date(comment.postedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        {/* Reply content */}
                                        <div style={{ padding: '14px 18px' }}>
                                            {replyText && (
                                                <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65, margin: '0 0 12px', padding: '12px 14px', background: `${pc}08`, borderRadius: 8, borderLeft: `3px solid ${pc}` }}>
                                                    {replyText}
                                                </p>
                                            )}
                                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                                {(comment.url || comment.postUrl) && (
                                                    <a href={comment.url || comment.postUrl} target="_blank" rel="noopener noreferrer"
                                                        style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={11} height={11}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                        Original post
                                                    </a>
                                                )}
                                                {comment.replyUrl && (
                                                    <a href={comment.replyUrl} target="_blank" rel="noopener noreferrer"
                                                        style={{ fontSize: 12, color: pc, textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={11} height={11}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                        View published reply
                                                    </a>
                                                )}
                                            </div>
                                        </div>
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
