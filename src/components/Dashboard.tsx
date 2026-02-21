'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IPost, PostStatus } from '@/lib/types';
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
  byPlatform?: { facebook: number; twitter: number; reddit: number };
  postedByPlatform?: { facebook: number; twitter: number; reddit: number };
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
    postedByPlatform: { facebook: 0, twitter: 0, reddit: 0 },
  });

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
        total:           data.total ?? 0,
        new:             data.byStatus?.new ?? 0,
        evaluating:      data.byStatus?.evaluating ?? 0,
        evaluated:       data.byStatus?.evaluated ?? 0,
        approved:        data.byStatus?.approved ?? 0,
        rejected:        data.byStatus?.rejected ?? 0,
        posted:          data.byStatus?.posted ?? 0,
        byPlatform:      data.byPlatform,
        postedByPlatform: data.postedByPlatform,
      });
    } catch {/* silent — polling will retry */}
  }, []);

  // Initial load
  useEffect(() => {
    fetchPosts();
    fetchStats();
  }, [fetchPosts, fetchStats]);

  // Auto-polling every 10s
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchStats();
      fetchPosts();
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStats, fetchPosts]);

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
    setPipelineStep('Scraping Twitter, Reddit & Facebook…');

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Social Engagement Bot</h1>
            {/* Live indicator */}
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

        {/* Platform breakdown — click to filter */}
        {stats.byPlatform && (
          <div className="flex gap-3 flex-wrap">
            {[
              { key: 'facebook', label: 'Facebook',  total: stats.byPlatform.facebook, posted: stats.postedByPlatform?.facebook ?? 0, activeCls: 'bg-blue-600 text-white border-blue-600',   inactiveCls: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
              { key: 'twitter',  label: 'Twitter/X', total: stats.byPlatform.twitter,  posted: stats.postedByPlatform?.twitter  ?? 0, activeCls: 'bg-sky-600 text-white border-sky-600',    inactiveCls: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' },
              { key: 'reddit',   label: 'Reddit',    total: stats.byPlatform.reddit,   posted: stats.postedByPlatform?.reddit   ?? 0, activeCls: 'bg-orange-600 text-white border-orange-600', inactiveCls: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
            ].map(({ key, label, total, posted, activeCls, inactiveCls }) => {
              const active = platformFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => { setPlatformFilter(active ? '' : key); setPage(1); }}
                  className={`border rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors ${active ? activeCls : inactiveCls}`}
                >
                  <span>{label}</span>
                  <span className="font-bold">{total}</span>
                  {posted > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                      {posted} posted
                    </span>
                  )}
                </button>
              );
            })}
            {platformFilter && (
              <button
                onClick={() => { setPlatformFilter(''); setPage(1); }}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 underline"
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
                Scrapes all platforms, then evaluates every new post in one click.
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

        {/* ── Filters ── */}
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

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
