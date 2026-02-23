'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IPost, SocialAccount } from '@/lib/types';
import PostCard from './PostCard';
import SettingsPanel from './SettingsPanel';

interface PostsResponse {
  posts: IPost[];
  total: number;
  page: number;
  limit: number;
}

interface Stats {
  total: number;
  new: number;
  evaluating: number;
  evaluated: number;
  approved: number;
  rejected: number;
  posted: number;
  byPlatform: Record<string, number>;
  postedByPlatform: Record<string, number>;
}

interface PipelineResult {
  scraped: number;
  newPosts: number;
  evaluated: number;
  skipped: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

// ── Platform config (same as SettingsPanel) ──────────────────────────────────

interface PlatformMeta {
  id: string;
  label: string;
  activeCls: string;
  inactiveCls: string;
  iconBg: string;
  icon: React.ReactNode;
}

const PLATFORM_META: PlatformMeta[] = [
  {
    id: 'twitter',
    label: 'Twitter/X',
    activeCls: 'bg-black text-white border-black',
    inactiveCls: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
    iconBg: 'bg-black',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    activeCls: 'bg-orange-600 text-white border-orange-600',
    inactiveCls: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
    iconBg: 'bg-orange-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    activeCls: 'bg-blue-600 text-white border-blue-600',
    inactiveCls: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    iconBg: 'bg-blue-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'quora',
    label: 'Quora',
    activeCls: 'bg-red-600 text-white border-red-600',
    inactiveCls: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    iconBg: 'bg-red-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
        <path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0zm-1.595 17.624c.263-.01.526-.022.786-.022h.026l-.803-1.523c.598-.861.941-2.083.941-3.578 0-3.022-1.73-4.697-4.689-4.697-2.97 0-4.7 1.675-4.7 4.697 0 3.031 1.73 4.706 4.7 4.706.575 0 1.127-.056 1.739-.183z" />
      </svg>
    ),
  },
];

const statusFilters: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'evaluated', label: 'Evaluated' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'posted', label: 'Posted' },
];

const POLL_INTERVAL_MS = 10_000;

export default function Dashboard() {
  const [posts, setPosts] = useState<IPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Individual action states
  const [scraping, setScraping] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // Full pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState('');
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

  const [stats, setStats] = useState<Stats>({
    total: 0, new: 0, evaluating: 0, evaluated: 0,
    approved: 0, rejected: 0, posted: 0,
    byPlatform: {},
    postedByPlatform: {},
  });

  // Settings-derived state
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchPosts = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (platformFilter) params.set('platform', platformFilter);
    params.set('page', String(page));
    params.set('limit', '20');
    const res = await fetch(`/api/posts?${params}`);
    const data: PostsResponse = await res.json();
    setPosts(data.posts);
    setTotal(data.total);
  }, [statusFilter, platformFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats({
        total:            data.total ?? 0,
        new:              data.byStatus?.new ?? 0,
        evaluating:       data.byStatus?.evaluating ?? 0,
        evaluated:        data.byStatus?.evaluated ?? 0,
        approved:         data.byStatus?.approved ?? 0,
        rejected:         data.byStatus?.rejected ?? 0,
        posted:           data.byStatus?.posted ?? 0,
        byPlatform:       data.byPlatform ?? {},
        postedByPlatform: data.postedByPlatform ?? {},
      });
    } catch {/* silent — polling will retry */}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.settings) {
        setEnabledPlatforms(data.settings.platforms ?? []);
        setSocialAccounts(data.settings.socialAccounts ?? []);
      }
    } catch {/* silent */}
  }, []);

  // Initial load
  useEffect(() => {
    fetchPosts();
    fetchStats();
    fetchSettings();
  }, [fetchPosts, fetchStats, fetchSettings]);

  // Auto-polling every 10s
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchStats();
      fetchPosts();
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStats, fetchPosts]);

  // Refresh settings whenever settings panel closes
  const handleSettingsClose = () => {
    setSettingsOpen(false);
    fetchSettings();
  };

  // ── Individual actions ─────────────────────────────────────────────────────

  const handleScrape = async () => {
    setScraping(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) {
        setActionMessage(`Error: ${data.error}`);
      } else {
        const errMsg = data.errors?.length ? ` (${data.errors.length} errors)` : '';
        setActionMessage(`Scraped ${data.totalScraped} posts, ${data.newPosts} new${errMsg}`);
        fetchPosts();
        fetchStats();
      }
    } catch {
      setActionMessage('Scrape failed');
    }
    setScraping(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/evaluate', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setActionMessage(`Error: ${data.error}`);
      } else {
        setActionMessage(`Evaluated ${data.evaluated}/${data.total} posts`);
        fetchPosts();
        fetchStats();
      }
    } catch {
      setActionMessage('Evaluation failed');
    }
    setEvaluating(false);
  };

  // ── Full pipeline ──────────────────────────────────────────────────────────

  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    setPipelineResult(null);
    const platformNames = enabledPlatforms.length
      ? enabledPlatforms.map((p) => PLATFORM_META.find((m) => m.id === p)?.label ?? p).join(', ')
      : 'all platforms';
    setPipelineStep(`Scraping ${platformNames}…`);

    try {
      const res = await fetch('/api/run-pipeline', { method: 'POST' });
      const data: PipelineResult = await res.json();
      setPipelineResult(data);
      setPipelineStep('');
      fetchPosts();
      fetchStats();
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

  // ── Post update ────────────────────────────────────────────────────────────

  const handlePostUpdate = async (id: string, data: Record<string, unknown>) => {
    await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    fetchPosts();
    fetchStats();
  };

  const totalPages = Math.ceil(total / 20);
  const isAnyActionRunning = scraping || evaluating || pipelineRunning;

  // Determine which platforms to show in the breakdown.
  // Show platforms that are either enabled in settings OR have posts.
  const visiblePlatforms = PLATFORM_META.filter(
    (p) => enabledPlatforms.includes(p.id) || (stats.byPlatform[p.id] ?? 0) > 0
  );

  const accountsForPlatform = (platformId: string) =>
    socialAccounts.filter((a) => a.platform === platformId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Social Engagement Bot</h1>
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total',      value: stats.total,      color: 'bg-gray-100 text-gray-800' },
            { label: 'New',        value: stats.new,         color: 'bg-blue-100 text-blue-800' },
            { label: 'Evaluating', value: stats.evaluating,  color: 'bg-yellow-100 text-yellow-800' },
            { label: 'Evaluated',  value: stats.evaluated,   color: 'bg-purple-100 text-purple-800' },
            { label: 'Approved',   value: stats.approved,    color: 'bg-green-100 text-green-800' },
            { label: 'Rejected',   value: stats.rejected,    color: 'bg-red-100 text-red-800' },
            { label: 'Posted',     value: stats.posted,      color: 'bg-gray-100 text-gray-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`${color} rounded-lg p-3 text-center`}>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Platform breakdown — click to filter ── */}
        {visiblePlatforms.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {visiblePlatforms.map((p) => {
              const active = platformFilter === p.id;
              const total = stats.byPlatform[p.id] ?? 0;
              const posted = stats.postedByPlatform[p.id] ?? 0;
              const accounts = accountsForPlatform(p.id);

              return (
                <button
                  key={p.id}
                  onClick={() => { setPlatformFilter(active ? '' : p.id); setPage(1); }}
                  className={`border rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors ${active ? p.activeCls : p.inactiveCls}`}
                >
                  {/* Platform icon */}
                  <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${p.iconBg}`}>
                    {p.icon}
                  </span>
                  <span>{p.label}</span>
                  <span className="font-bold">{total}</span>
                  {posted > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                      {posted} posted
                    </span>
                  )}
                  {/* Connected account avatars */}
                  {accounts.length > 0 && (
                    <span className="flex items-center -space-x-1 ml-0.5">
                      {accounts.slice(0, 3).map((acc) => (
                        <span
                          key={acc.id}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${active ? 'border-white/40 bg-white/20 text-white' : 'border-white bg-gray-200 text-gray-600'}`}
                          title={acc.displayName || acc.username}
                        >
                          {(acc.displayName || acc.username || '?')[0].toUpperCase()}
                        </span>
                      ))}
                      {accounts.length > 3 && (
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${active ? 'border-white/40 bg-white/20 text-white' : 'border-white bg-gray-200 text-gray-500'}`}>
                          +{accounts.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
            {platformFilter && (
              <button
                onClick={() => { setPlatformFilter(''); setPage(1); }}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 underline self-center"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* ── Primary Action: Run Full Pipeline ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Run Full Job</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Scrapes{' '}
                {enabledPlatforms.length > 0
                  ? enabledPlatforms.map((p) => PLATFORM_META.find((m) => m.id === p)?.label ?? p).join(', ')
                  : 'all platforms'}
                , then evaluates every new post in one click.
              </p>
            </div>
            <button
              onClick={handleRunPipeline}
              disabled={isAnyActionRunning}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pipelineRunning ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  Start Job
                </>
              )}
            </button>
          </div>

          {/* Pipeline step progress */}
          {pipelineStep && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {pipelineStep}
            </div>
          )}

          {/* Pipeline result */}
          {pipelineResult && !pipelineRunning && (
            <div className={`rounded-lg p-4 text-sm space-y-1 ${
              pipelineResult.errors.length ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
            }`}>
              <p className={`font-semibold ${pipelineResult.errors.length ? 'text-red-700' : 'text-green-700'}`}>
                Job complete
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {[
                  { label: 'Scraped',   value: pipelineResult.scraped },
                  { label: 'New Posts', value: pipelineResult.newPosts },
                  { label: 'Evaluated', value: pipelineResult.evaluated },
                  { label: 'Skipped',   value: pipelineResult.skipped },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/70 rounded p-2 text-center">
                    <div className="text-lg font-bold text-gray-800">{value}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              {pipelineResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pipelineResult.errors.map((e, i) => (
                    <li key={i} className="text-red-600 text-xs">• {e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── Secondary Actions ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Manual steps:</span>
          <button
            onClick={handleScrape}
            disabled={isAnyActionRunning}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {scraping ? 'Scraping…' : 'Scrape Only'}
          </button>
          <button
            onClick={handleEvaluate}
            disabled={isAnyActionRunning}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {evaluating ? 'Evaluating…' : 'Evaluate Only'}
          </button>
          {actionMessage && (
            <span className={`text-sm ${actionMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {actionMessage}
            </span>
          )}
        </div>

        {/* ── Status Filters ── */}
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-md ${
                statusFilter === value
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
              {value === 'evaluating' && stats.evaluating > 0 && (
                <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {stats.evaluating}
                </span>
              )}
              {value === 'approved' && stats.approved > 0 && (
                <span className="ml-1.5 bg-green-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {stats.approved}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Posts ── */}
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
              <p className="text-lg">No posts found</p>
              <p className="text-sm mt-1">
                Configure your settings and click <strong>Start Job</strong> to begin.
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard key={post._id} post={post} onUpdate={handlePostUpdate} />
            ))
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <SettingsPanel open={settingsOpen} onClose={handleSettingsClose} />
    </div>
  );
}
