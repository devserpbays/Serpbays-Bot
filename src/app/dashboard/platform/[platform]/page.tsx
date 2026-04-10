'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/apiBase';
import type { IPost, SocialAccount } from '@/lib/types';

/* ── Platform metadata ─────────────────────────────────────── */
const PLATFORM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    twitter: {
        label: 'Twitter / X', color: '#1d9bf0',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    reddit: {
        label: 'Reddit', color: '#3b82f6',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    facebook: {
        label: 'Facebook', color: '#1877f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    quora: {
        label: 'Quora', color: '#2563eb',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    youtube: {
        label: 'YouTube', color: '#0ea5e9',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    pinterest: {
        label: 'Pinterest', color: '#60a5fa',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
    skool: {
        label: 'Skool', color: '#5865f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    },
};

const TIME_FILTERS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days', label: '7 Days' },
    { value: '15days', label: '15 Days' },
    { value: '30days', label: '30 Days' },
    { value: 'all', label: 'All Time' },
];

function getDateRange(filter: string): { from?: Date; to?: Date } {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (filter) {
        case 'today': return { from: startOfToday };
        case 'yesterday': {
            const from = new Date(startOfToday); from.setDate(from.getDate() - 1);
            return { from, to: startOfToday };
        }
        case '7days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 6); return { from: d }; }
        case '15days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 14); return { from: d }; }
        case '30days': { const d = new Date(startOfToday); d.setDate(d.getDate() - 29); return { from: d }; }
        default: return {};
    }
}

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scoreColor(score: number): string {
    if (score >= 80) return '#34d399';
    if (score >= 60) return '#fbbf24';
    return '#f87171';
}

const REPLY_LABEL: Record<string, string> = { twitter: 'Reply', quora: 'Answer' };

/* ── Log display helpers ──────────────────────────────────── */
const LOG_TITLES: Record<string, string> = {
    post: 'Reply posted', original_tweet: 'Original tweet posted',
    react: 'Reacted to a post', engage: 'Engaged with content',
    automation_block: 'Automation detected — backing off',
    auth_error: 'Session expired', overlay_blocked: 'Blocked by overlay',
    account_paused: 'Account paused', cron_start: 'Session started',
    cron_end: 'Session finished', skip: 'Skipped — no candidates',
    share: 'Shared a post', upvote_post: 'Upvoted a post',
    shadow_removed: 'Comment shadow-removed', post_rejected: 'Comment rejected',
    post_failed: 'Comment failed', limit: 'Daily limit reached',
    not_connected: 'No account connected', health_recovery: 'Health recovery mode',
};

function logTitle(entry: { action: string; message: string }): string {
    return LOG_TITLES[entry.action] || entry.message?.slice(0, 60) || entry.action.replace(/_/g, ' ');
}

function logLevelColor(level: string): string {
    if (level === 'error') return '#ef4444';
    if (level === 'warn') return '#f59e0b';
    if (level === 'success') return '#10b981';
    return '#6b7280';
}

function logLevelIcon(level: string): string {
    if (level === 'error') return '✕';
    if (level === 'warn') return '!';
    if (level === 'success') return '✓';
    return '•';
}
const LIMIT = 10;
const POLL_MS = 15_000;

interface PostsResponse { posts: IPost[]; total: number; page: number; limit: number; }

export default function PlatformPage() {
    const params = useParams();
    const router = useRouter();
    const platformId = params.platform as string;
    const meta = PLATFORM_META[platformId];

    const [posts, setPosts] = useState<IPost[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    type ActiveTab = 'keyword' | 'liked' | 'reacted' | 'shared' | 'quora_upvoted' | 'quora_followed' | 'quora_browsed' | 'reddit_upvoted' | 'reddit_joined' | 'reddit_crossposted' | 'reddit_browsed' | 'pinterest_liked' | 'pinterest_commented' | 'youtube_liked' | 'youtube_shorts';
    const [activeTab, setActiveTab] = useState<ActiveTab>('keyword');
    const [timeFilter, setTimeFilter] = useState('today');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [cookieStatus, setCookieStatus] = useState<{ checked: boolean; expired: boolean; error?: string }>({ checked: false, expired: false });
    const [resumingPlatform, setResumingPlatform] = useState<string | null>(null);
    const [platformSettings, setPlatformSettings] = useState<Record<string, any>>({});
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Facebook engagement stats
    const [fbStats, setFbStats] = useState<{
        totalComments: number; totalReacted: number; totalShared: number; todayComments: number; groupsConfigured: number;
    } | null>(null);
    const [reactedPosts, setReactedPosts] = useState<IPost[]>([]);
    const [reactedTotal, setReactedTotal] = useState(0);
    const [reactedPage, setReactedPage] = useState(1);
    const [reactedLoading, setReactedLoading] = useState(false);
    const [sharedPosts, setSharedPosts] = useState<IPost[]>([]);
    const [sharedTotal, setSharedTotal] = useState(0);
    const [sharedPage, setSharedPage] = useState(1);
    const [sharedLoading, setSharedLoading] = useState(false);

    // YouTube liked videos + shorts
    const [ytLikedPosts, setYtLikedPosts] = useState<IPost[]>([]);
    const [ytLikedTotal, setYtLikedTotal] = useState(0);
    const [ytShortsCount, setYtShortsCount] = useState(0);
    const [ytShortsLogs, setYtShortsLogs] = useState<Array<{ message: string; urls: string[]; likedUrls: string[]; watched: number; liked: number; timestamp: string }>>([]);

    // Reddit upvoted posts (from DB, not logs)
    const [redditUpvotedPosts, setRedditUpvotedPosts] = useState<IPost[]>([]);
    const [redditUpvotedTotal, setRedditUpvotedTotal] = useState(0);

    // Pinterest saved + liked pins
    const pinterestSavedTotal = 0; // Save disabled — Pinterest silently rejects saves from automated sessions
    const [pinterestLikedPosts, setPinterestLikedPosts] = useState<IPost[]>([]);
    const [pinterestLikedTotal, setPinterestLikedTotal] = useState(0);

    // Reddit engagement
    const [redditStats, setRedditStats] = useState<{ upvoted: number; joined: number; crossposted: number; threadUpvotes: number } | null>(null);
    const [redditEngageLogs, setRedditEngageLogs] = useState<Array<{ action: string; message: string; meta: Record<string, unknown>; timestamp: string }>>([]);
    const [redditEngageLoading, setRedditEngageLoading] = useState(false);

    // Quora engagement
    const [quoraStats, setQuoraStats] = useState<{ upvoted: number; followed: number; browsed: number } | null>(null);
    const [quoraEngageLogs, setQuoraEngageLogs] = useState<Array<{ action: string; message: string; meta: Record<string, unknown>; timestamp: string }>>([]);
    const [quoraEngageLoading, setQuoraEngageLoading] = useState(false);

    // Today's activity logs for this platform
    const [todayLogs, setTodayLogs] = useState<Array<{ _id: string; level: string; action: string; message: string; meta?: Record<string, unknown>; timestamp: string }>>([]);

    const fetchFbStats = useCallback(async () => {
        if (platformId !== 'facebook') return;
        try {
            const { from, to } = getDateRange(timeFilter);
            const dateParams = (from ? `&from=${from.toISOString()}` : '') + (to ? `&to=${to.toISOString()}` : '');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const [totalRes, reactedRes, sharedRes, todayRes] = await Promise.all([
                fetch(`${API_BASE}/api/posts?platform=facebook&status=posted&limit=1${dateParams}`),
                fetch(`${API_BASE}/api/posts?platform=facebook&likedByBot=true&limit=1${dateParams}`),
                fetch(`${API_BASE}/api/posts?platform=facebook&sharedByBot=true&limit=1${dateParams}`),
                fetch(`${API_BASE}/api/posts?platform=facebook&status=posted&limit=1&from=${today.toISOString()}`),
            ]);
            const [totalData, reactedData, sharedData, todayData] = await Promise.all([totalRes.json(), reactedRes.json(), sharedRes.json(), todayRes.json()]);
            setFbStats({
                totalComments: totalData.total ?? 0,
                totalReacted: reactedData.total ?? 0,
                totalShared: sharedData.total ?? 0,
                todayComments: todayData.total ?? 0,
                groupsConfigured: 0,
            });
        } catch { /* silent */ }
    }, [platformId, timeFilter]);

    const fetchReactedPosts = useCallback(async () => {
        if (platformId !== 'facebook') return;
        setReactedLoading(true);
        try {
            const p = new URLSearchParams({ platform: 'facebook', likedByBot: 'true', limit: String(LIMIT), page: String(reactedPage) });
            const { from, to } = getDateRange(timeFilter);
            if (from) p.set('from', from.toISOString());
            if (to) p.set('to', to.toISOString());
            const res = await fetch(`${API_BASE}/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setReactedPosts(data.posts ?? []);
            setReactedTotal(data.total ?? 0);
        } catch { /* silent */ }
        setReactedLoading(false);
    }, [platformId, timeFilter, reactedPage]);

    const fetchSharedPosts = useCallback(async () => {
        if (platformId !== 'facebook') return;
        setSharedLoading(true);
        try {
            const p = new URLSearchParams({ platform: 'facebook', sharedByBot: 'true', limit: String(LIMIT), page: String(sharedPage) });
            const { from, to } = getDateRange(timeFilter);
            if (from) p.set('from', from.toISOString());
            if (to) p.set('to', to.toISOString());
            const res = await fetch(`${API_BASE}/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setSharedPosts(data.posts ?? []);
            setSharedTotal(data.total ?? 0);
        } catch { /* silent */ }
        setSharedLoading(false);
    }, [platformId, timeFilter, sharedPage]);

    const fetchPinterestSaved = useCallback(async () => {
        if (platformId !== 'pinterest') return;
        try {
            const { from, to } = getDateRange(timeFilter);
            const dateParams = (from ? `&from=${from.toISOString()}` : '') + (to ? `&to=${to.toISOString()}` : '');
            const likedRes = await fetch(`${API_BASE}/api/posts?platform=pinterest&pinterestHeartLiked=true&limit=${LIMIT}&page=1${dateParams}`);
            const likedData: PostsResponse = await likedRes.json();
            setPinterestLikedPosts(likedData.posts ?? []);
            setPinterestLikedTotal(likedData.total ?? 0);
        } catch { /* silent */ }
    }, [platformId, timeFilter]);

    const fetchYouTubeLiked = useCallback(async () => {
        if (platformId !== 'youtube') return;
        try {
            const { from, to } = getDateRange(timeFilter);
            const dateParams = (from ? `&from=${from.toISOString()}` : '') + (to ? `&to=${to.toISOString()}` : '');
            const [likedRes, logsRes] = await Promise.all([
                fetch(`${API_BASE}/api/posts?platform=youtube&likedByBot=true&limit=${LIMIT}&page=1${dateParams}`),
                fetch(`${API_BASE}/api/logs?platform=youtube&limit=500`),
            ]);
            const likedData: PostsResponse = await likedRes.json();
            setYtLikedPosts(likedData.posts ?? []);
            setYtLikedTotal(likedData.total ?? 0);
            const logsData = await logsRes.json();
            const shortsLogs = (logsData.logs ?? []).filter((l: { action: string }) => l.action === 'shorts_watched');
            setYtShortsCount(shortsLogs.length);
            setYtShortsLogs(shortsLogs.map((l: { message: string; meta?: Record<string, unknown>; timestamp: string }) => ({
                message: l.message,
                urls: (l.meta?.urls as string[]) || [],
                likedUrls: (l.meta?.likedUrls as string[]) || [],
                watched: (l.meta?.watched as number) || 0,
                liked: (l.meta?.liked as number) || 0,
                timestamp: l.timestamp,
            })));
        } catch { /* silent */ }
    }, [platformId, timeFilter]);

    const fetchRedditUpvoted = useCallback(async () => {
        if (platformId !== 'reddit') return;
        try {
            const { from, to } = getDateRange(timeFilter);
            const dateParams = (from ? `&from=${from.toISOString()}` : '') + (to ? `&to=${to.toISOString()}` : '');
            const res = await fetch(`${API_BASE}/api/posts?platform=reddit&likedByBot=true&limit=${LIMIT}&page=1${dateParams}`);
            const data: PostsResponse = await res.json();
            setRedditUpvotedPosts(data.posts ?? []);
            setRedditUpvotedTotal(data.total ?? 0);
        } catch { /* silent */ }
    }, [platformId, timeFilter]);

    const fetchRedditEngagement = useCallback(async () => {
        if (platformId !== 'reddit') return;
        setRedditEngageLoading(true);
        try {
            const { from, to } = getDateRange(timeFilter);
            const res = await fetch(`${API_BASE}/api/logs?platform=reddit&limit=500`);
            const data = await res.json();
            const allLogs: Array<{ action: string; message: string; meta: Record<string, unknown>; timestamp: string }> =
                Array.isArray(data.logs) ? data.logs : [];
            const inRange = allLogs.filter(l => {
                const ts = new Date(l.timestamp);
                if (from && ts < from) return false;
                if (to && ts >= to) return false;
                return true;
            });
            const engageActions = new Set(['upvote_post', 'join_subreddit', 'crosspost', 'upvote_comments', 'browse_feed', 'visit_profile', 'read_rules']);
            setRedditEngageLogs(inRange.filter(l => engageActions.has(l.action)));
            setRedditStats({
                upvoted:      inRange.filter(l => l.action === 'upvote_post' || l.action === 'upvote_comments').length,
                joined:       inRange.filter(l => l.action === 'join_subreddit' || l.action === 'read_rules').length,
                crossposted:  inRange.filter(l => l.action === 'crosspost').length,
                threadUpvotes: inRange.filter(l => l.action === 'upvote_comments').reduce((acc, l) => acc + ((l.meta?.count as number) || 0), 0),
            });
        } catch { /* silent */ }
        setRedditEngageLoading(false);
    }, [platformId, timeFilter]);

    const fetchQuoraEngagement = useCallback(async () => {
        if (platformId !== 'quora') return;
        setQuoraEngageLoading(true);
        try {
            const { from, to } = getDateRange(timeFilter);
            const res = await fetch(`${API_BASE}/api/logs?platform=quora&limit=500`);
            const data = await res.json();
            const allLogs: Array<{ action: string; message: string; meta: Record<string, unknown>; timestamp: string }> =
                Array.isArray(data.logs) ? data.logs : [];
            const inRange = allLogs.filter(l => {
                const ts = new Date(l.timestamp);
                if (from && ts < from) return false;
                if (to && ts >= to) return false;
                return true;
            });
            const engageActions = new Set(['upvote_answer', 'follow_question', 'follow_topic', 'browse_feed', 'visit_profile']);
            setQuoraEngageLogs(inRange.filter(l => engageActions.has(l.action)));
            setQuoraStats({
                upvoted: inRange.filter(l => l.action === 'upvote_answer').length,
                followed: inRange.filter(l => l.action === 'follow_question' || l.action === 'follow_topic').length,
                browsed: inRange.filter(l => l.action === 'browse_feed' || l.action === 'visit_profile').length,
            });
        } catch { /* silent */ }
        setQuoraEngageLoading(false);
    }, [platformId, timeFilter]);

    // Twitter engagement stats (likes, retweets, bookmarks, follows)
    const [engageStats, setEngageStats] = useState<{
        totalLiked: number; todayLiked: number;
        totalRetweeted: number; todayRetweeted: number;
        totalBookmarked: number;
    } | null>(null);

    const fetchEngageStats = useCallback(async () => {
        if (platformId !== 'twitter') return;
        try {
            const res = await fetch(`${API_BASE}/api/twitter-engagement`);
            if (res.ok) setEngageStats(await res.json());
        } catch { /* silent */ }
    }, [platformId]);

    // Engagement list browser (liked / retweeted / bookmarked / followed)
    type EngageTab = 'liked';
    const [engageTimeFilter, setEngageTimeFilter] = useState('today');
    const [engageListPage, setEngageListPage] = useState(1);
    const [engageListData, setEngageListData] = useState<{
        total: number; pages: number; page: number;
        posts?: { id: string; url: string; content: string; author: string; score: number | null; updatedAt: string; liked: boolean; retweeted: boolean; bookmarked: boolean }[];
    } | null>(null);
    const [engageListLoading, setEngageListLoading] = useState(false);

    const fetchEngageList = useCallback(async (tab: EngageTab, pg: number, filter: string) => {
        if (platformId !== 'twitter') return;
        setEngageListLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/twitter-engagement?list=${tab}&page=${pg}&filter=${filter}`);
            if (res.ok) setEngageListData(await res.json());
        } catch { /* silent */ }
        setEngageListLoading(false);
    }, [platformId]);

    useEffect(() => { if (!meta) router.replace('/dashboard'); }, [meta, router]);

    const fetchAccounts = useCallback(async () => {
        try {
            const requests: Promise<Response>[] = [
                fetch(`${API_BASE}/api/social-accounts`),
                fetch(`${API_BASE}/api/settings`),
            ];
            const statusEndpoints: Record<string, string> = {
                twitter: '/api/twitter-status',
                facebook: '/api/fb-status',
                reddit: '/api/reddit-status',
                quora: '/api/quora-status',
                pinterest: '/api/pinterest-status',
            };
            if (statusEndpoints[platformId]) requests.push(fetch(`${API_BASE}${statusEndpoints[platformId]}`));
            const [accRes, setRes, statusRes] = await Promise.all(requests);
            const accData = await accRes.json();
            setAccounts((accData.accounts ?? []).filter((a: SocialAccount) => a.platform === platformId));
            if (setRes.ok) {
                const setData = await setRes.json();
                setPlatformSettings(setData.settings ?? {});
            }
            if (statusRes && statusRes.ok) {
                const statusData = await statusRes.json();
                const expired = statusData.loggedIn === false || statusData.configured === false;
                setCookieStatus({
                    checked: true,
                    expired,
                    error: statusData.error || (!statusData.loggedIn ? statusData.message : undefined) || undefined,
                });
            }
        } catch { /* silent */ }
    }, [platformId]);

    const handleResumeAccount = useCallback(async (platform: string) => {
        setResumingPlatform(platform);
        try {
            await fetch(`${API_BASE}/api/social-accounts/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            await fetchAccounts();
        } catch { /* silent */ } finally {
            setResumingPlatform(null);
        }
    }, [fetchAccounts]);

    const fetchPosts = useCallback(async () => {
        const p = new URLSearchParams({ status: 'posted', platform: platformId, limit: String(LIMIT), page: String(page) });
        const { from, to } = getDateRange(timeFilter);
        if (from) p.set('from', from.toISOString());
        if (to) p.set('to', to.toISOString());
        // For Twitter: only fetch keyword posts in main section
        if (platformId === 'twitter') p.set('source', 'keyword');
        try {
            const res = await fetch(`${API_BASE}/api/posts?${p}`);
            const data: PostsResponse = await res.json();
            setPosts(data.posts ?? []);
            setTotal(data.total ?? 0);
        } catch { /* silent */ }
        setLoading(false);
    }, [platformId, timeFilter, page]);

    const fetchTodayLogs = useCallback(async () => {
        try {
            // Use UTC midnight so it aligns with server-side timestamps
            const now = new Date();
            const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const res = await fetch(`${API_BASE}/api/logs?platform=${platformId}&limit=10`);
            const data = await res.json();
            setTodayLogs(Array.isArray(data.logs) ? data.logs : []);
        } catch { /* silent */ }
    }, [platformId]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
    useEffect(() => { fetchTodayLogs(); }, [fetchTodayLogs]);
    useEffect(() => { setLoading(true); fetchPosts(); }, [fetchPosts]);
    useEffect(() => { fetchEngageStats(); }, [fetchEngageStats]);
    useEffect(() => { fetchFbStats(); }, [fetchFbStats]);
    useEffect(() => { if (platformId === 'facebook' && activeTab === 'reacted') fetchReactedPosts(); }, [fetchReactedPosts, activeTab, platformId]);
    useEffect(() => { if (platformId === 'facebook' && activeTab === 'shared') fetchSharedPosts(); }, [fetchSharedPosts, activeTab, platformId]);
    useEffect(() => { if (platformId === 'youtube') fetchYouTubeLiked(); }, [fetchYouTubeLiked, platformId]);
    useEffect(() => { if (platformId === 'reddit') fetchRedditUpvoted(); }, [fetchRedditUpvoted, platformId]);
    useEffect(() => { if (platformId === 'pinterest') fetchPinterestSaved(); }, [fetchPinterestSaved, platformId]);
    useEffect(() => { fetchRedditEngagement(); }, [fetchRedditEngagement]);
    useEffect(() => { fetchQuoraEngagement(); }, [fetchQuoraEngagement]);
    useEffect(() => {
        const isEngage = (['liked', 'retweeted', 'bookmarked'] as const).includes(activeTab as EngageTab);
        if (isEngage) fetchEngageList(activeTab as EngageTab, engageListPage, engageTimeFilter);
    }, [activeTab, engageListPage, engageTimeFilter, fetchEngageList]);
    useEffect(() => {
        pollRef.current = setInterval(() => { fetchPosts(); fetchEngageStats(); fetchQuoraEngagement(); fetchTodayLogs(); }, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchPosts, fetchEngageStats, fetchQuoraEngagement, fetchTodayLogs]);

    if (!meta) return null;

    const { label, color, icon } = meta;
    const replyLabel = REPLY_LABEL[platformId] || 'Comment';
    const showEngageList = (['liked', 'retweeted', 'bookmarked'] as const).includes(activeTab as EngageTab);
    const showReactedList = platformId === 'facebook' && activeTab === 'reacted';
    const showSharedList = platformId === 'facebook' && activeTab === 'shared';
    const showQuoraEngage = platformId === 'quora' && (activeTab === 'quora_upvoted' || activeTab === 'quora_followed' || activeTab === 'quora_browsed');
    const showRedditEngage = platformId === 'reddit' && (activeTab === 'reddit_joined' || activeTab === 'reddit_crossposted' || activeTab === 'reddit_browsed');
    const showRedditUpvoted = platformId === 'reddit' && activeTab === 'reddit_upvoted';
    const showYoutubeLiked = platformId === 'youtube' && activeTab === 'youtube_liked';
    const showYoutubeShorts = platformId === 'youtube' && activeTab === 'youtube_shorts';
    const showPinterestSaved = false;
    const showPinterestLiked = platformId === 'pinterest' && activeTab === 'pinterest_liked';
    const [showLogsView, setShowLogsView] = useState(false);
    const engageTab = activeTab as EngageTab;
    const activePosts = posts;
    const activeTotal = total;
    const activePage = page;
    const setActivePage = setPage;
    const activeLoading = loading;
    const totalPages = Math.ceil(activeTotal / LIMIT);
    const startItem = (activePage - 1) * LIMIT + 1;
    const endItem = Math.min(activePage * LIMIT, activeTotal);

    /* page numbers to show */
    const pageNumbers: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, activePage - delta); i <= Math.min(totalPages, activePage + delta); i++) pageNumbers.push(i);

    return (
        <div className="animate-fade-in" style={{ minHeight: '100vh' }}>

            {/* ══ Hero Header ══════════════════════════════════════════ */}
            <div style={{
                background: `linear-gradient(135deg, ${color}18 0%, transparent 60%)`,
                borderBottom: '1px solid var(--border-subtle)',
                padding: '24px 28px 20px',
            }}>
                {/* Breadcrumb */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                    <button onClick={() => router.back()} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 12, padding: 0,
                        transition: 'color 150ms',
                    }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                            <polyline points="15,18 9,12 15,6" />
                        </svg>
                        Overview
                    </button>
                    <span>/</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>

                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: `${color}20`, border: `1px solid ${color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color,
                        }}>
                            {icon}
                        </div>
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                                {platformId === 'facebook'
                                    ? `${fbStats?.totalComments ?? total} comment${(fbStats?.totalComments ?? total) !== 1 ? 's' : ''} published · ${fbStats?.totalReacted ?? 0} reacted · ${fbStats?.totalShared ?? 0} shared`
                                    : platformId === 'pinterest'
                                    ? `${total} comment${total !== 1 ? 's' : ''} · ${pinterestLikedTotal} liked`
                                    : platformId === 'youtube'
                                    ? `${total} comment${total !== 1 ? 's' : ''} · ${ytLikedTotal} liked · ${ytShortsCount} Shorts sessions`
                                    : `${total} comment${total !== 1 ? 's' : ''} published · Via browser extension`}
                            </p>
                        </div>
                    </div>

                    {/* Extension status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, color: '#34d399' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                        Via browser extension
                    </div>
                </div>

                {/* Account cards, cookie banners, health banners removed — extension mode */}
                {false && (
                    <div style={{ display: 'none' }}>
                        {accounts.map((acc) => {
                            const displayLabel = acc.displayName || acc.username || label + ' Account';
                            const handle = acc.username ? `@${acc.username}` : acc.id;
                            const cookieOk = true;
                            const verifiedAgo = '';
                            const health = 100;
                            const paused = false;
                            const healthColor = '#22c55e';
                            const healthLabel = 'Healthy';
                            const borderColor = color + '35';
                            return (
                                <div key={acc.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    background: 'var(--bg-card)',
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12, padding: '10px 16px',
                                    minWidth: 220,
                                }}>
                                    {/* Avatar with health ring */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: `${color}22`, color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 14,
                                            outline: `2px solid ${healthColor}`,
                                            outlineOffset: 2,
                                        }}>
                                            {displayLabel[0].toUpperCase()}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {displayLabel}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {handle}
                                        </div>
                                        {verifiedAgo && (
                                            <div style={{ fontSize: 10, color: cookieOk ? '#34d399' : '#f87171', marginTop: 2 }}>
                                                {cookieOk ? '✓' : '✗'} Cookies verified {verifiedAgo}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status + health */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                            background: cookieOk ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                                            color: cookieOk ? '#34d399' : '#f87171',
                                        }}>
                                            {cookieOk ? 'Active' : 'Expired'}
                                        </span>
                                        {/* Health score badge */}
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                            background: `${healthColor}18`,
                                            color: healthColor,
                                        }}>
                                            {paused ? 'Paused' : `${healthLabel} ${health}/100`}
                                        </span>
                                        {acc.totalPosts != null && (
                                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 }}>
                                                {acc.totalPosts} posts · {acc.totalErrors ?? 0} errors
                                            </span>
                                        )}
                                        {/* Resume button — only shown when auto-paused */}
                                        {paused && (
                                            <button
                                                onClick={() => handleResumeAccount(acc.platform)}
                                                disabled={resumingPlatform === acc.platform}
                                                style={{
                                                    marginTop: 2, fontSize: 10, fontWeight: 700,
                                                    padding: '3px 10px', borderRadius: 6, border: 'none',
                                                    background: resumingPlatform === acc.platform ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.85)',
                                                    color: resumingPlatform === acc.platform ? '#6366f1' : '#fff',
                                                    cursor: resumingPlatform === acc.platform ? 'default' : 'pointer',
                                                }}
                                            >
                                                {resumingPlatform === acc.platform ? 'Resuming…' : 'Resume'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}



                {/* ── Bot config summary bar ── */}
                {(() => {
                    const brandRate = platformSettings[`${platformId}BrandMentionRate`] ?? 25;
                    const cooldown = platformSettings[`${platformId}CooldownMinutes`];
                    const dailyLimit = platformSettings[`${platformId}DailyLimit`];
                    const threshold = platformSettings[`${platformId}AutoPostThreshold`];

                    const riskColor = platformId === 'facebook'
                        ? (brandRate >= 70 ? '#818cf8' : brandRate <= 25 ? '#22c55e' : '#f59e0b')
                        : (brandRate <= 25 ? '#22c55e' : brandRate <= 50 ? '#f59e0b' : brandRate <= 75 ? '#f97316' : '#ef4444');
                    const riskLabel = platformId === 'facebook'
                        ? (brandRate >= 70 ? 'Social Mgr' : brandRate <= 25 ? 'Low' : 'Moderate')
                        : (brandRate <= 25 ? 'Safe' : brandRate <= 50 ? 'Moderate' : brandRate <= 75 ? 'High Risk' : 'Ban Risk');

                    const fbGroups: string[] = platformSettings['facebookGroups'] ?? [];
                    const chips: { label: string; value: string; accent: string }[] = [
                        { label: 'Daily limit', value: dailyLimit != null ? `${dailyLimit}/day` : '—', accent: color },
                        { label: 'Auto-post', value: threshold != null ? `≥${threshold}%` : '—', accent: color },
                        { label: 'Brand rate', value: `${brandRate}% · ${riskLabel}`, accent: riskColor },
                        ...(cooldown != null ? [{ label: 'Cooldown', value: cooldown >= 60 ? `${Math.floor(cooldown / 60)}h${cooldown % 60 ? ` ${cooldown % 60}m` : ''}` : `${cooldown}m`, accent: color }] : []),
                        ...(platformId === 'facebook' && fbGroups.length > 0 ? [{ label: 'Groups', value: `${fbGroups.length} monitored`, accent: '#1877f2' }] : []),
                        ...(platformId === 'facebook' ? [
                            { label: 'Passive sessions', value: '40% browse-only', accent: '#34d399' },
                            { label: 'Warmup', value: 'Active — auto-ramps to limit', accent: '#fbbf24' },
                        ] : []),
                        ...(platformId === 'quora' ? [
                            { label: 'Mode', value: 'Answer → Brand Comment', accent: '#818cf8' },
                            ...(quoraStats ? [
                                { label: 'Upvoted', value: `${quoraStats.upvoted} answers`, accent: '#22c55e' },
                                { label: 'Followed', value: `${quoraStats.followed} q/topics`, accent: '#0ea5e9' },
                                { label: 'Browsed', value: `${quoraStats.browsed} sessions`, accent: '#94a3b8' },
                            ] : []),
                        ] : []),
                        ...(platformId === 'reddit' ? [
                            { label: 'Warmup', value: 'Join sub → read rules → upvote thread', accent: '#fbbf24' },
                            ...(redditStats ? [
                                { label: 'Upvoted', value: `${redditStats.upvoted} post${redditStats.upvoted !== 1 ? 's' : ''}`, accent: '#22c55e' },
                                { label: 'Joined', value: `${redditStats.joined} subreddit${redditStats.joined !== 1 ? 's' : ''}`, accent: '#0ea5e9' },
                                ...(redditStats.crossposted > 0 ? [{ label: 'Crossposted', value: `${redditStats.crossposted}`, accent: '#a78bfa' }] : []),
                                ...(redditStats.threadUpvotes > 0 ? [{ label: 'Thread upvotes', value: `${redditStats.threadUpvotes} comment${redditStats.threadUpvotes !== 1 ? 's' : ''}`, accent: '#34d399' }] : []),
                            ] : []),
                        ] : []),
                    ];

                    return (
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                            {chips.map(chip => (
                                <div key={chip.label} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '5px 12px', borderRadius: 8,
                                    background: `${chip.accent}10`, border: `1px solid ${chip.accent}28`,
                                    fontSize: 11,
                                }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{chip.label}:</span>
                                    <span style={{ color: chip.accent, fontWeight: 700 }}>{chip.value}</span>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>

            {/* ══ Body ════════════════════════════════════════════════ */}
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Facebook tab bar ── */}
                {platformId === 'facebook' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const, label: 'Comments', count: fbStats?.totalComments ?? total, tc: '#1877f2' },
                            { key: 'reacted' as const, label: 'Reacted', count: fbStats?.totalReacted ?? 0, tc: '#f43f5e' },
                            { key: 'shared' as const, label: 'Shared', count: fbStats?.totalShared ?? 0, tc: '#34d399' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => { setActiveTab(key); setExpandedId(null); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Quora tab bar ── */}
                {platformId === 'quora' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const,         label: 'Answers',          count: total,                             tc: color },
                            { key: 'quora_upvoted' as const,   label: 'Upvoted',          count: quoraStats?.upvoted ?? 0,          tc: '#22c55e' },
                            { key: 'quora_followed' as const,  label: 'Followed',         count: quoraStats?.followed ?? 0,         tc: '#0ea5e9' },
                            { key: 'quora_browsed' as const,   label: 'Browsed',          count: quoraStats?.browsed ?? 0,          tc: '#94a3b8' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => { setActiveTab(key); setExpandedId(null); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Reddit tab bar ── */}
                {platformId === 'reddit' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const,           label: 'Comments',    count: total,                                 tc: color },
                            { key: 'reddit_upvoted' as const,    label: 'Upvoted',     count: redditUpvotedTotal || (redditStats?.upvoted ?? 0), tc: '#22c55e' },
                            { key: 'reddit_joined' as const,     label: 'Joined Subs', count: redditStats?.joined ?? 0,              tc: '#0ea5e9' },
                            { key: 'reddit_crossposted' as const,label: 'Crossposted', count: redditStats?.crossposted ?? 0,         tc: '#a78bfa' },
                            { key: 'reddit_browsed' as const,    label: 'Browsed',     count: redditEngageLogs.filter(l => l.action === 'browse_feed').length, tc: '#94a3b8' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => { setActiveTab(key); setExpandedId(null); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── YouTube tab bar ── */}
                {platformId === 'youtube' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const, label: 'Comments', count: total, tc: color },
                            { key: 'youtube_liked' as const, label: 'Liked', count: ytLikedTotal, tc: '#f43f5e' },
                            { key: 'youtube_shorts' as const, label: 'Shorts', count: ytShortsCount, tc: '#a855f7' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => { setActiveTab(key); setExpandedId(null); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Pinterest tab bar ── */}
                {platformId === 'pinterest' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const, label: 'Comments', count: total, tc: color },
                            { key: 'pinterest_liked' as const, label: 'Liked', count: pinterestLikedTotal, tc: '#f43f5e' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => { setActiveTab(key); setExpandedId(null); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Twitter tab bar ── */}
                {platformId === 'twitter' && (
                    <div style={{
                        display: 'flex', gap: 0,
                        borderBottom: '1px solid var(--border-subtle)',
                        marginBottom: 4, overflowX: 'auto',
                    }}>
                        {([
                            { key: 'keyword' as const, label: 'Replies', count: total, tc: color },
                            { key: 'liked' as const, label: 'Liked', count: engageStats?.totalLiked ?? 0, tc: '#f43f5e' },
                        ]).map(({ key, label: lbl, count, tc }) => {
                            const isActive = activeTab === key;
                            return (
                                <button key={key} onClick={() => {
                                    setActiveTab(key);
                                    setExpandedId(null);
                                    setEngageListPage(1);
                                    setEngageListData(null);
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', border: 'none',
                                    borderBottom: isActive ? `2px solid ${tc}` : '2px solid transparent',
                                    background: 'none', cursor: 'pointer',
                                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? tc : 'var(--text-muted)',
                                    transition: 'all 150ms', whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}>
                                    {lbl}
                                    {count > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '1px 6px', borderRadius: 8,
                                            background: isActive ? `${tc}18` : 'var(--bg-input)',
                                            color: isActive ? tc : 'var(--text-muted)',
                                        }}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Toolbar: time filters + result count ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                        {/* Tab-style time filters */}
                        <div style={{
                            display: 'flex', gap: 2,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 10, padding: 3,
                        }}>
                            {TIME_FILTERS.map(({ value, label: lbl }) => {
                                const activeFilter = showEngageList ? engageTimeFilter : timeFilter;
                                return (
                                    <button key={value} onClick={() => {
                                        setShowLogsView(false);
                                        if (showEngageList) { setEngageTimeFilter(value); setEngageListPage(1); }
                                        else { setTimeFilter(value); setPage(1); }
                                    }} style={{
                                        padding: '6px 14px', borderRadius: 8, border: 'none',
                                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        background: !showLogsView && activeFilter === value ? color : 'transparent',
                                        color: !showLogsView && activeFilter === value ? '#fff' : 'var(--text-muted)',
                                        transition: 'all 150ms',
                                    }}>
                                        {lbl}
                                    </button>
                                );
                            })}
                            <button onClick={() => setShowLogsView(v => !v)} style={{
                                padding: '6px 14px', borderRadius: 8, border: 'none',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: showLogsView ? color : 'transparent',
                                color: showLogsView ? '#fff' : 'var(--text-muted)',
                                transition: 'all 150ms',
                            }}>
                                Logs
                            </button>
                        </div>
                    </div>

                    {/* Result count */}
                    {showEngageList ? (
                        engageListData && engageListData.total > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Showing <strong style={{ color: 'var(--text-secondary)' }}>{(engageListData.page - 1) * 15 + 1}–{Math.min(engageListData.page * 15, engageListData.total)}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{engageListData.total}</strong> {engageTab}
                            </span>
                        )
                    ) : showReactedList ? (
                        reactedTotal > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Showing <strong style={{ color: 'var(--text-secondary)' }}>{(reactedPage - 1) * LIMIT + 1}–{Math.min(reactedPage * LIMIT, reactedTotal)}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{reactedTotal}</strong> reacted posts
                            </span>
                        )
                    ) : showSharedList ? (
                        sharedTotal > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Showing <strong style={{ color: 'var(--text-secondary)' }}>{(sharedPage - 1) * LIMIT + 1}–{Math.min(sharedPage * LIMIT, sharedTotal)}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{sharedTotal}</strong> shared posts
                            </span>
                        )
                    ) : showQuoraEngage ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>{quoraEngageLogs.filter(l =>
                                activeTab === 'quora_upvoted' ? l.action === 'upvote_answer' :
                                activeTab === 'quora_followed' ? (l.action === 'follow_question' || l.action === 'follow_topic') :
                                (l.action === 'browse_feed' || l.action === 'visit_profile')
                            ).length}</strong> events in selected period
                        </span>
                    ) : showRedditUpvoted ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>{redditUpvotedTotal}</strong> upvoted posts
                        </span>
                    ) : showRedditEngage ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>{redditEngageLogs.filter(l =>
                                activeTab === 'reddit_joined'    ? (l.action === 'join_subreddit' || l.action === 'read_rules') :
                                activeTab === 'reddit_browsed'   ? (l.action === 'browse_feed' || l.action === 'visit_profile') :
                                                                   l.action === 'crosspost'
                            ).length}</strong> events in selected period
                        </span>
                    ) : (
                        activeTotal > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Showing <strong style={{ color: 'var(--text-secondary)' }}>{startItem}–{endItem}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{activeTotal}</strong> comments
                            </span>
                        )
                    )}
                </div>

                {/* ── Logs view (when Logs tab is active) ── */}
                {showLogsView ? (
                    <div>
                        {todayLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                                No activity logged today yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {todayLogs.map((log, idx) => {
                                    const lc = logLevelColor(log.level);
                                    const ts = new Date(log.timestamp);
                                    const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                                    return (
                                        <div key={log._id} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                            padding: '10px 14px',
                                            background: idx % 2 === 0 ? 'var(--bg-card)' : 'transparent',
                                            borderRadius: 8,
                                        }}>
                                            <div style={{
                                                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                background: `${lc}18`, color: lc, marginTop: 1,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, fontWeight: 700, border: `1px solid ${lc}35`,
                                            }}>
                                                {logLevelIcon(log.level)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 13, fontWeight: 600,
                                                    color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : 'var(--text-primary)',
                                                }}>
                                                    {logTitle(log)}
                                                </div>
                                                {log.message && log.message !== logTitle(log) && (
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                                                        {log.message}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap' }}>
                                                {timeStr}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <a
                            href="/dashboard/logs"
                            style={{
                                display: 'block', textAlign: 'center', marginTop: 16,
                                padding: '10px 0', fontSize: 13, fontWeight: 600,
                                color: color, textDecoration: 'none',
                                background: `${color}10`, borderRadius: 8,
                                border: `1px solid ${color}25`,
                                transition: 'all 150ms',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${color}20`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${color}10`; }}
                        >
                            View all logs →
                        </a>
                    </div>
                ) : (<>

                {/* ── Post list / Engage list ── */}
                {showEngageList && platformId === 'twitter' ? (
                    <div>
                        {engageListLoading ? (
                            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
                        ) : !engageListData || (engageListData.posts?.length ?? 0) === 0 ? (
                            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                                    No {engageTab} activity yet
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {engageListData.posts!.map((p) => (
                                    <div key={p.id} style={{
                                        padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
                                        display: 'flex', gap: 14, alignItems: 'flex-start',
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                                            {p.liked && <span title="Liked"><svg viewBox="0 0 24 24" fill="#f43f5e" width="14" height="14"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg></span>}
                                            {p.retweeted && <span title="Retweeted"><svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.2} width="14" height="14"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg></span>}
                                            {p.bookmarked && <span title="Bookmarked"><svg viewBox="0 0 24 24" fill="#fbbf24" width="14" height="14"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></span>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{p.author || 'Unknown'}</span>
                                                {p.score != null && (
                                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: `${scoreColor(p.score)}18`, color: scoreColor(p.score) }}>Score {p.score}</span>
                                                )}
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(new Date(p.updatedAt))}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {p.content}
                                            </p>
                                            <a href={p.url} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: 11, color: '#1d9bf0', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>
                                                View on X →
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {engageListData && engageListData.pages > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Page {engageListData.page} of {engageListData.pages} · {engageListData.total} total
                                </span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setEngageListPage(p => Math.max(1, p - 1))} disabled={engageListData.page <= 1} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: engageListData.page <= 1 ? 'default' : 'pointer', opacity: engageListData.page <= 1 ? 0.4 : 1 }}>Prev</button>
                                    <button onClick={() => setEngageListPage(p => Math.min(engageListData.pages, p + 1))} disabled={engageListData.page >= engageListData.pages} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: engageListData.page >= engageListData.pages ? 'default' : 'pointer', opacity: engageListData.page >= engageListData.pages ? 0.4 : 1 }}>Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : !showReactedList && !showSharedList && !showQuoraEngage && !showRedditEngage && !showRedditUpvoted && !showYoutubeLiked && !showYoutubeShorts && !showPinterestSaved && !showPinterestLiked && (activeLoading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Loading…
                    </div>
                ) : activePosts.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '64px 20px',
                        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                        borderRadius: 14,
                    }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: `${color}12`, border: `1px solid ${color}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px', color,
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                            No comments yet
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                            No posted comments found for this time period.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
                        {activePosts.map((post, idx) => {
                            const expanded = expandedId === post._id;
                            const reply = post.editedReply || post.aiReply || '';
                            const postedAt = post.postedAt ? new Date(post.postedAt) : null;
                            const score = post.aiRelevanceScore;
                            const isLast = idx === activePosts.length - 1;

                            return (
                                <div key={post._id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
                                    {/* ── Row (always visible) ── */}
                                    <div
                                        onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 14,
                                            padding: '14px 18px', cursor: 'pointer',
                                            background: expanded ? `${color}08` : 'transparent',
                                            transition: 'background 150ms',
                                        }}
                                        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                        {/* Left accent bar */}
                                        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: expanded ? color : 'transparent', flexShrink: 0, minHeight: 20 }} />

                                        {/* Avatar */}
                                        <div style={{
                                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                            background: `${color}20`, color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 700, marginTop: 1,
                                        }}>
                                            {post.postedByAccount
                                                ? post.postedByAccount[0].toUpperCase()
                                                : (post.author ? post.author[0].toUpperCase() : '?')}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* Top meta line */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                {post.postedByAccount && (
                                                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{post.postedByAccount}</span>
                                                )}
                                                {post.author && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>on thread by {post.author}</span>
                                                )}
                                                {post.keywordsMatched?.length ? (() => {
                                                    const kw = post.keywordsMatched[0];
                                                    const isCommunity = kw.startsWith('community:');
                                                    return (
                                                        <span style={{
                                                            fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600,
                                                            background: isCommunity ? 'rgba(29,155,240,0.12)' : 'var(--accent-bg)',
                                                            color: isCommunity ? '#1d9bf0' : 'var(--accent)',
                                                            border: isCommunity ? '1px solid rgba(29,155,240,0.25)' : undefined,
                                                        }}>
                                                            {isCommunity ? `Community ${kw.replace('community:', '')}` : kw}{post.keywordsMatched.length > 1 ? ` +${post.keywordsMatched.length - 1}` : ''}
                                                        </span>
                                                    );
                                                })() : null}
                                            </div>

                                            {/* Post content preview */}
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {post.content}
                                            </p>

                                            {/* Reply preview */}
                                            {reply && !expanded && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                        <polyline points="9,17 4,12 9,7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
                                                    </svg>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                                                        {reply.slice(0, 100)}{reply.length > 100 ? '…' : ''}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Inline links — visible without expanding */}
                                            {!expanded && (post.replyUrl || post.url) && (
                                                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                                    {post.replyUrl && (
                                                        <a href={post.replyUrl} target="_blank" rel="noopener noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ fontSize: 11, color, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="10" height="10"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            View reply
                                                        </a>
                                                    )}
                                                    {post.url && (
                                                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="10" height="10"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            {platformId === 'quora' ? 'View question' : platformId === 'reddit' ? 'View on Reddit' : 'View post'}
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Right: score + time + chevron */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                            {score != null && (
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    minWidth: 38,
                                                }}>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
                                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
                                                </div>
                                            )}
                                            {postedAt && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {timeAgo(postedAt)}
                                                </span>
                                            )}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                                style={{ width: 16, height: 16, color: 'var(--text-muted)', transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }}>
                                                <polyline points="6,9 12,15 18,9" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* ── Expanded detail ── */}
                                    {expanded && (
                                        <div style={{ padding: '0 18px 18px 69px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                                            {/* Original post bubble */}
                                            <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                                    Original Post{post.author ? ` · by ${post.author}` : ''}
                                                </div>
                                                <div style={{
                                                    background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                                                    borderRadius: 10, padding: '12px 16px',
                                                    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
                                                }}>
                                                    {post.content}
                                                </div>
                                                {post.url && (
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 12, color: 'var(--accent)', marginTop: 6, textDecoration: 'none',
                                                    }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                            <polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" />
                                                        </svg>
                                                        View original thread
                                                    </a>
                                                )}
                                            </div>

                                            {/* Bot reply bubble */}
                                            {reply && (
                                                <div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, marginBottom: 8 }}>
                                                        {replyLabel} Published
                                                        {post.postedByAccount && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>· @{post.postedByAccount}</span>}
                                                    </div>
                                                    <div style={{
                                                        background: `${color}0d`,
                                                        border: `1px solid ${color}30`,
                                                        borderRadius: 10, padding: '12px 16px',
                                                        fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65,
                                                        position: 'relative',
                                                    }}>
                                                        <div style={{
                                                            position: 'absolute', top: 12, right: 12,
                                                            width: 6, height: 6, borderRadius: '50%', background: color,
                                                        }} />
                                                        {reply}
                                                    </div>
                                                    {post.replyUrl && (
                                                        <a href={post.replyUrl} target="_blank" rel="noopener noreferrer" style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            fontSize: 12, color, marginTop: 6, textDecoration: 'none',
                                                        }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12">
                                                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                                <polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" />
                                                            </svg>
                                                            View {replyLabel.toLowerCase()} on {label}
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {/* Metadata chips */}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {postedAt && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                                                        {postedAt.toLocaleString()}
                                                    </span>
                                                )}
                                                {post.aiTone && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', textTransform: 'capitalize' }}>
                                                        Tone: {post.aiTone}
                                                    </span>
                                                )}
                                                {post.keywordsMatched?.length ? (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                                                        {post.keywordsMatched.join(' · ')}
                                                    </span>
                                                ) : null}
                                                {score != null && (
                                                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${scoreColor(score)}14`, color: scoreColor(score), border: `1px solid ${scoreColor(score)}30` }}>
                                                        Score: {score}%
                                                    </span>
                                                )}
                                            </div>

                                            {/* AI Reasoning */}
                                            {post.aiReasoning && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, borderLeft: `2px solid var(--border-default)`, paddingLeft: 12 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>AI reasoning: </span>
                                                    {post.aiReasoning}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* ── Quora engagement list ── */}
                {showQuoraEngage && (() => {
                    const filteredLogs = quoraEngageLogs.filter(l =>
                        activeTab === 'quora_upvoted'  ? l.action === 'upvote_answer' :
                        activeTab === 'quora_followed' ? (l.action === 'follow_question' || l.action === 'follow_topic') :
                                                         (l.action === 'browse_feed' || l.action === 'visit_profile')
                    );

                    const ACTION_ICON: Record<string, React.ReactNode> = {
                        upvote_answer: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} width={18} height={18}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                        ),
                        follow_question: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={18} height={18}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                        ),
                        follow_topic: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={18} height={18}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                        ),
                        browse_feed: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={18} height={18}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        ),
                        visit_profile: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={18} height={18}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ),
                    };

                    const ACTION_LABEL: Record<string, string> = {
                        upvote_answer:  'Upvoted an answer',
                        follow_question: 'Followed a question',
                        follow_topic:    'Followed a topic',
                        browse_feed:     'Browsed Quora feed',
                        visit_profile:   'Visited a profile',
                    };

                    const tc = activeTab === 'quora_upvoted' ? '#22c55e' : activeTab === 'quora_followed' ? '#0ea5e9' : '#94a3b8';

                    return quoraEngageLoading ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
                    ) : filteredLogs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${tc}12`, border: `1px solid ${tc}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: tc }}>
                                {ACTION_ICON[activeTab === 'quora_upvoted' ? 'upvote_answer' : activeTab === 'quora_followed' ? 'follow_question' : 'browse_feed']}
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No activity yet</p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                {activeTab === 'quora_upvoted'  ? 'The bot upvotes answers before posting. Run the Quora cron to see upvotes here.' :
                                 activeTab === 'quora_followed' ? 'The bot follows questions and topics before answering. Run the Quora cron to see follows here.' :
                                                                  'The bot browses the feed and visits profiles each session. Run the Quora cron to see activity here.'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: `1px solid ${tc}25`, borderRadius: 14, overflow: 'hidden' }}>
                            {filteredLogs.map((log, idx) => {
                                const isLast = idx === filteredLogs.length - 1;
                                const ts = new Date(log.timestamp);
                                const icon = ACTION_ICON[log.action];
                                const label = ACTION_LABEL[log.action] ?? log.action.replace(/_/g, ' ');
                                // Extra detail from meta
                                const topic   = log.meta?.topic as string | undefined;
                                const username = log.meta?.username as string | undefined;
                                const count   = log.meta?.count as number | undefined;
                                const detail =
                                    log.action === 'follow_topic'   && topic    ? `Topic: ${topic}` :
                                    log.action === 'visit_profile'  && username ? `@${username}` :
                                    log.action === 'upvote_answer'  && count    ? `${count} answer${count !== 1 ? 's' : ''} upvoted` :
                                    log.message || '';

                                const logUrl = log.meta?.url as string | undefined;
                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '12px 18px',
                                        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                                    }}>
                                        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: `${tc}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {icon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                                            {detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>}
                                            {logUrl && (
                                                <a href={logUrl} target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: 11, color: tc, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="10" height="10"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                    View on Quora
                                                </a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(ts)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* ── YouTube Liked list ── */}
                {showYoutubeLiked && (
                    <div>
                        {ytLikedPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#f43f5e' }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No liked videos yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot likes relevant videos as part of natural engagement (10-15/day).</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {ytLikedPosts.map((post) => (
                                    <div key={post._id} style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                                        borderRadius: 12, padding: '14px 18px',
                                        display: 'flex', alignItems: 'flex-start', gap: 12,
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                            background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '1px solid rgba(244,63,94,0.3)',
                                        }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {post.content?.slice(0, 80) || 'Liked video'}
                                            </div>
                                            {post.author && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{post.author}{post.aiRelevanceScore ? ` · score: ${post.aiRelevanceScore}` : ''}</div>
                                            )}
                                            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                                {post.url && (
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                        style={{ fontSize: 11, color: '#f43f5e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={10} height={10}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                        Watch on YouTube
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                            {(post as any).updatedAt ? timeAgo(new Date((post as any).updatedAt)) : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── YouTube Shorts activity ── */}
                {showYoutubeShorts && (
                    <div>
                        {ytShortsLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#a855f7' }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><path d="M17.77 10.32l-1.2-.5L18 9.06c1.84-.96 2.53-3.23 1.56-5.06s-3.24-2.53-5.07-1.56L6 6.94c-1.29.68-2.07 2.04-2 3.49.07 1.42.93 2.67 2.22 3.25.03.01 1.2.5 1.2.5L6 14.93c-1.83.97-2.53 3.24-1.56 5.07.97 1.83 3.24 2.53 5.07 1.56l8.5-4.5c1.29-.68 2.06-2.04 1.99-3.49-.07-1.42-.94-2.68-2.23-3.25zM10 14.65v-5.3L15 12l-5 2.65z"/></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No Shorts watched yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot watches 2-4 keyword-relevant Shorts per session, liking ~50%.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {ytShortsLogs.map((log, idx) => (
                                    <div key={idx} style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                                        borderRadius: 12, padding: '14px 18px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(168,85,247,0.12)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(168,85,247,0.3)' }}>
                                                    <svg viewBox="0 0 24 24" fill="currentColor" width={12} height={12}><path d="M10 14.65v-5.3L15 12l-5 2.65z"/></svg>
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    Watched {log.watched} Short{log.watched !== 1 ? 's' : ''}, liked {log.liked}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(new Date(log.timestamp))}</span>
                                        </div>
                                        {log.urls.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Watched:</span>
                                                    {log.urls.map((url, i) => {
                                                        const isLiked = log.likedUrls.includes(url);
                                                        return (
                                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                                style={{
                                                                    fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                                                                    padding: '3px 8px', borderRadius: 6,
                                                                    color: isLiked ? '#f43f5e' : '#a855f7',
                                                                    background: isLiked ? 'rgba(244,63,94,0.08)' : 'rgba(168,85,247,0.08)',
                                                                    border: isLiked ? '1px solid rgba(244,63,94,0.2)' : '1px solid rgba(168,85,247,0.2)',
                                                                }}>
                                                                {isLiked && <svg viewBox="0 0 24 24" fill="currentColor" width={9} height={9}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={10} height={10}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                                Short #{i + 1}
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Reddit Upvoted list (from DB) ── */}
                {showRedditUpvoted && (
                    <div>
                        {redditUpvotedPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#22c55e' }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No upvoted posts yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot upvotes relevant posts as part of natural engagement.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {redditUpvotedPosts.map((post) => {
                                    const subMatch = post.url?.match(/reddit\.com\/r\/([^/]+)/);
                                    const subreddit = subMatch ? subMatch[1] : '';
                                    return (
                                        <div key={post._id} style={{
                                            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                                            borderRadius: 12, padding: '14px 18px',
                                            display: 'flex', alignItems: 'flex-start', gap: 12,
                                        }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: '1px solid rgba(34,197,94,0.3)',
                                            }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {post.content?.slice(0, 80) || 'Upvoted post'}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {subreddit && `r/${subreddit}`}{post.author && post.author !== 'Unknown' ? ` · u/${post.author}` : ''}{post.aiRelevanceScore ? ` · score: ${post.aiRelevanceScore}` : ''}
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                                    {post.url && (
                                                        <a href={post.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                            style={{ fontSize: 11, color: '#22c55e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={10} height={10}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                            View on Reddit
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                {(post as any).updatedAt ? timeAgo(new Date((post as any).updatedAt)) : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Reddit engagement list (joined/crossposted/browsed) ── */}
                {showRedditEngage && (() => {
                    const filteredLogs = redditEngageLogs.filter(l =>
                        activeTab === 'reddit_joined'     ? (l.action === 'join_subreddit' || l.action === 'read_rules') :
                        activeTab === 'reddit_browsed'    ? (l.action === 'browse_feed' || l.action === 'visit_profile') :
                                                           l.action === 'crosspost'
                    );

                    const REDDIT_ICON: Record<string, React.ReactNode> = {
                        upvote_post: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} width={18} height={18}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                        ),
                        join_subreddit: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={18} height={18}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                        ),
                        crosspost: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2} width={18} height={18}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                        ),
                        browse_feed: (
                            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} width={18} height={18}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                        ),
                    };

                    const REDDIT_LABEL: Record<string, string> = {
                        upvote_post:    'Upvoted a post',
                        join_subreddit: 'Joined a subreddit',
                        crosspost:      'Crossposted to subreddit',
                        browse_feed:    'Browsed subreddit',
                        upvote_comments: 'Upvoted comments in thread',
                        visit_profile:  'Visited author profile',
                        read_rules:     'Read subreddit rules',
                    };

                    const tc = activeTab === 'reddit_joined' ? '#0ea5e9' : activeTab === 'reddit_browsed' ? '#94a3b8' : '#a78bfa';
                    const actionKey = activeTab === 'reddit_joined' ? 'join_subreddit' : activeTab === 'reddit_browsed' ? 'browse_feed' : 'crosspost';
                    const emptyIcon = REDDIT_ICON[actionKey];

                    return redditEngageLoading ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
                    ) : filteredLogs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${tc}12`, border: `1px solid ${tc}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: tc }}>
                                {emptyIcon}
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No activity yet</p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                {
                                 activeTab === 'reddit_joined'    ? 'The bot joins the subreddit and reads rules before posting a comment.' :
                                                                    'The bot occasionally crossposts relevant threads to other subreddits.'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: `1px solid ${tc}25`, borderRadius: 14, overflow: 'hidden' }}>
                            {filteredLogs.map((log, idx) => {
                                const isLast = idx === filteredLogs.length - 1;
                                const ts = new Date(log.timestamp);
                                const logIcon = REDDIT_ICON[log.action] || REDDIT_ICON.upvote_post;
                                const logLabel = REDDIT_LABEL[log.action] ?? log.action.replace(/_/g, ' ');
                                const logUrl = log.meta?.url as string | undefined;
                                const subreddit = log.meta?.subreddit as string | undefined;
                                const targetSubreddit = log.meta?.targetSubreddit as string | undefined;
                                const score = log.meta?.score as number | undefined;
                                const count = log.meta?.count as number | undefined;
                                const author = log.meta?.author as string | undefined;
                                const username = log.meta?.username as string | undefined;

                                // Build detail line based on action type
                                const subreddits = log.meta?.subreddits as string[] | undefined;
                                const details: string[] = [];

                                if (log.action === 'browse_feed') {
                                    // Browse: show which subreddits were visited
                                    if (subreddits?.length) details.push(subreddits.map(s => `r/${s}`).join(', '));
                                    else if (subreddit) details.push(`r/${subreddit}`);
                                    else if (count) details.push(`${count} subreddit(s)`);
                                } else if (log.action === 'upvote_post') {
                                    // Upvote: show score and subreddit from URL
                                    if (logUrl) {
                                        const subMatch = logUrl.match(/reddit\.com\/r\/([^/]+)/);
                                        if (subMatch) details.push(`r/${subMatch[1]}`);
                                    }
                                    if (score != null) details.push(`relevance: ${score}/100`);
                                } else if (log.action === 'crosspost') {
                                    if (subreddit) details.push(`r/${subreddit}`);
                                    if (targetSubreddit) details.push(`→ r/${targetSubreddit}`);
                                } else if (log.action === 'join_subreddit') {
                                    if (subreddit) details.push(`r/${subreddit}`);
                                } else if (log.action === 'upvote_comments') {
                                    if (count != null) details.push(`${count} comment(s)`);
                                } else if (log.action === 'visit_profile') {
                                    if (author || username) details.push(`u/${author || username}`);
                                } else {
                                    if (subreddit) details.push(`r/${subreddit}`);
                                    if (log.message) details.push(log.message.slice(0, 60));
                                }
                                const detail = details.join(' · ');

                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '12px 18px',
                                        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                                    }}>
                                        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: `${tc}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {logIcon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{logLabel}</div>
                                            {detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>}
                                            {logUrl && (
                                                <a
                                                    href={logUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    style={{
                                                        display: 'inline-block', marginTop: 4,
                                                        fontSize: 11, fontWeight: 600, color: tc,
                                                        textDecoration: 'none',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                                                >
                                                    View on Reddit →
                                                </a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(ts)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* ── Reacted list (Facebook) ── */}
                {showReactedList && (
                    <div>
                        {reactedLoading ? (
                            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
                        ) : reactedPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#f43f5e' }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No reacted posts yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot reacts to posts before commenting. Run the Facebook cron to see reactions here.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 14, overflow: 'hidden' }}>
                                {reactedPosts.map((post, idx) => {
                                    const expanded = expandedId === post._id;
                                    const postedAt = post.postedAt ? new Date(post.postedAt) : post.scrapedAt ? new Date(post.scrapedAt) : null;
                                    const isLast = idx === reactedPosts.length - 1;
                                    const score = post.aiRelevanceScore;
                                    return (
                                        <div key={post._id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
                                            <div onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                                style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', cursor: 'pointer', background: expanded ? 'rgba(244,63,94,0.05)' : 'transparent', transition: 'background 150ms' }}
                                                onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                                onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                            >
                                                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: expanded ? '#f43f5e' : 'transparent', flexShrink: 0, minHeight: 20 }} />
                                                {/* Reaction icon — emoji matches the actual reaction used */}
                                                <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, fontSize: 16 }}>
                                                    {post.botReaction === 'Love' ? '❤️' : post.botReaction === 'Care' ? '🤗' : post.botReaction === 'Haha' ? '😆' : post.botReaction === 'Wow' ? '😮' : post.botReaction === 'Sad' ? '😢' : post.botReaction === 'Angry' ? '😡' : '👍'}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                        {post.author && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{post.author}</span>}
                                                        {post.keywordsMatched?.filter(k => !k.startsWith('community:')).slice(0, 1).map(kw => (
                                                            <span key={kw} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600, background: 'var(--accent-bg)', color: 'var(--accent)' }}>{kw}</span>
                                                        ))}
                                                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600, background: 'rgba(244,63,94,0.1)', color: '#f43f5e', marginLeft: 'auto', flexShrink: 0 }}>
                                                            {post.botReaction || 'Like'} reaction
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{post.content}</p>
                                                    {post.url && !expanded && (
                                                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ fontSize: 11, color: '#1877f2', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="10" height="10"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            View on Facebook →
                                                        </a>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                                    {score != null && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 38 }}>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
                                                            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
                                                        </div>
                                                    )}
                                                    {postedAt && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(postedAt)}</span>}
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: 'var(--text-muted)', transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }}>
                                                        <polyline points="6,9 12,15 18,9" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {expanded && (
                                                <div style={{ padding: '0 18px 18px 69px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                    <div>
                                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                                            Post{post.author ? ` · by ${post.author}` : ''}
                                                        </div>
                                                        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                                            {post.content}
                                                        </div>
                                                        {post.url && (
                                                            <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', marginTop: 6, textDecoration: 'none' }}>
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                                View on Facebook
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        {postedAt && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>{postedAt.toLocaleString()}</span>}
                                                        {score != null && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${scoreColor(score)}14`, color: scoreColor(score), border: `1px solid ${scoreColor(score)}30` }}>Score: {score}%</span>}
                                                        {post.aiTone && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', textTransform: 'capitalize' }}>Tone: {post.aiTone}</span>}
                                                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)' }}>
                                                            {post.botReaction === 'Love' ? '❤️' : post.botReaction === 'Care' ? '🤗' : post.botReaction === 'Haha' ? '😆' : post.botReaction === 'Wow' ? '😮' : '👍'} {post.botReaction || 'Like'} reaction
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {/* Reacted pagination */}
                        {Math.ceil(reactedTotal / LIMIT) > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Page {reactedPage} of {Math.ceil(reactedTotal / LIMIT)}</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setReactedPage(p => Math.max(1, p - 1))} disabled={reactedPage <= 1} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: reactedPage <= 1 ? 'default' : 'pointer', opacity: reactedPage <= 1 ? 0.4 : 1 }}>Prev</button>
                                    <button onClick={() => setReactedPage(p => Math.min(Math.ceil(reactedTotal / LIMIT), p + 1))} disabled={reactedPage >= Math.ceil(reactedTotal / LIMIT)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: reactedPage >= Math.ceil(reactedTotal / LIMIT) ? 'default' : 'pointer', opacity: reactedPage >= Math.ceil(reactedTotal / LIMIT) ? 0.4 : 1 }}>Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Shared list (Facebook) ── */}
                {showSharedList && (
                    <div>
                        {sharedLoading ? (
                            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
                        ) : sharedPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-card)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#34d399' }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="22" height="22"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No shared posts yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot occasionally shares posts to the timeline (~10% chance per session, max 1/day). Run the Facebook cron to see shares here.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg-card)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 14, overflow: 'hidden' }}>
                                {sharedPosts.map((post, idx) => {
                                    const expanded = expandedId === post._id;
                                    const postedAt = post.postedAt ? new Date(post.postedAt) : post.scrapedAt ? new Date(post.scrapedAt) : null;
                                    const isLast = idx === sharedPosts.length - 1;
                                    const score = post.aiRelevanceScore;
                                    return (
                                        <div key={post._id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
                                            <div onClick={() => setExpandedId(expanded ? null : (post._id ?? null))}
                                                style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', cursor: 'pointer', background: expanded ? 'rgba(52,211,153,0.05)' : 'transparent', transition: 'background 150ms' }}
                                                onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                                onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                            >
                                                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: expanded ? '#34d399' : 'transparent', flexShrink: 0, minHeight: 20 }} />
                                                <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2} width="16" height="16"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                        {post.author && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{post.author}</span>}
                                                        {post.keywordsMatched?.filter(k => !k.startsWith('community:')).slice(0, 1).map(kw => (
                                                            <span key={kw} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600, background: 'var(--accent-bg)', color: 'var(--accent)' }}>{kw}</span>
                                                        ))}
                                                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 600, background: 'rgba(52,211,153,0.1)', color: '#34d399', marginLeft: 'auto', flexShrink: 0 }}>
                                                            Shared to timeline
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{post.content}</p>
                                                    {post.url && !expanded && (
                                                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ fontSize: 11, color: '#1877f2', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="10" height="10"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            View on Facebook →
                                                        </a>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                                    {score != null && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 38 }}>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
                                                            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
                                                        </div>
                                                    )}
                                                    {postedAt && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(postedAt)}</span>}
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: 'var(--text-muted)', transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }}>
                                                        <polyline points="6,9 12,15 18,9" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {expanded && (
                                                <div style={{ padding: '0 18px 18px 69px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                    <div>
                                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                                            Shared Post{post.author ? ` · by ${post.author}` : ''}
                                                        </div>
                                                        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                                            {post.content}
                                                        </div>
                                                        {post.url && (
                                                            <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', marginTop: 6, textDecoration: 'none' }}>
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                                View original post on Facebook
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        {postedAt && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>{postedAt.toLocaleString()}</span>}
                                                        {score != null && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${scoreColor(score)}14`, color: scoreColor(score), border: `1px solid ${scoreColor(score)}30` }}>Score: {score}%</span>}
                                                        {post.aiTone && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', textTransform: 'capitalize' }}>Tone: {post.aiTone}</span>}
                                                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                                                            Shared to timeline
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {Math.ceil(sharedTotal / LIMIT) > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Page {sharedPage} of {Math.ceil(sharedTotal / LIMIT)}</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setSharedPage(p => Math.max(1, p - 1))} disabled={sharedPage <= 1} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: sharedPage <= 1 ? 'default' : 'pointer', opacity: sharedPage <= 1 ? 0.4 : 1 }}>Prev</button>
                                    <button onClick={() => setSharedPage(p => Math.min(Math.ceil(sharedTotal / LIMIT), p + 1))} disabled={sharedPage >= Math.ceil(sharedTotal / LIMIT)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: sharedPage >= Math.ceil(sharedTotal / LIMIT) ? 'default' : 'pointer', opacity: sharedPage >= Math.ceil(sharedTotal / LIMIT) ? 0.4 : 1 }}>Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Pinterest Liked list ── */}
                {showPinterestLiked && (
                    <div>
                        {pinterestLikedPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#f43f5e' }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No liked pins yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>The bot likes (hearts) pins to build natural engagement.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {pinterestLikedPosts.map((post) => (
                                    <div key={post._id} style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                                        borderRadius: 12, padding: '14px 18px',
                                        display: 'flex', alignItems: 'flex-start', gap: 12,
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                            background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '1px solid rgba(244,63,94,0.3)',
                                        }}>
                                            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {post.content?.slice(0, 80) || 'Liked pin'}
                                            </div>
                                            {post.author && post.author !== 'pinterest_user' && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>by {post.author}</div>
                                            )}
                                            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                                {post.url && (
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                        style={{ fontSize: 11, color: '#f43f5e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={10} height={10}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                        View on Pinterest
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                            {(post as any).updatedAt ? timeAgo(new Date((post as any).updatedAt)) : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Pagination ── */}
                {!showEngageList && !showReactedList && !showSharedList && !showQuoraEngage && !showRedditEngage && !showRedditUpvoted && !showYoutubeLiked && !showYoutubeShorts && !showPinterestSaved && !showPinterestLiked && totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Page {activePage} of {totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button disabled={activePage === 1} onClick={() => setActivePage(p => Math.max(1, p - 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: activePage === 1 ? 'not-allowed' : 'pointer', opacity: activePage === 1 ? 0.35 : 1, transition: 'all 150ms' }}>←</button>
                            {pageNumbers[0] > 1 && (
                                <>
                                    <button onClick={() => setActivePage(1)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>1</button>
                                    {pageNumbers[0] > 2 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                </>
                            )}
                            {pageNumbers.map(n => (
                                <button key={n} onClick={() => setActivePage(n)} style={{ padding: '6px 11px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 150ms', border: n === activePage ? `1px solid ${color}` : '1px solid var(--border-subtle)', background: n === activePage ? `${color}18` : 'var(--bg-card)', color: n === activePage ? (color) : 'var(--text-secondary)', fontWeight: n === activePage ? 700 : 400 }}>{n}</button>
                            ))}
                            {pageNumbers[pageNumbers.length - 1] < totalPages && (
                                <>
                                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>…</span>}
                                    <button onClick={() => setActivePage(totalPages)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>{totalPages}</button>
                                </>
                            )}
                            <button disabled={activePage === totalPages} onClick={() => setActivePage(p => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: activePage === totalPages ? 'not-allowed' : 'pointer', opacity: activePage === totalPages ? 0.35 : 1, transition: 'all 150ms' }}>→</button>
                        </div>
                    </div>
                )}

                </>)}

            </div>
        </div>
    );
}
