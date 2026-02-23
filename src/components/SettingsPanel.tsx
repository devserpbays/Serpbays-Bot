'use client';

import { useState, useEffect } from 'react';
import type { ISettings, SocialAccount } from '@/lib/types';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// ── Platform config ──────────────────────────────────────────────────────────

interface PlatformConfig {
  id: string;
  label: string;
  cookieEndpoint: string;
  cookiePlaceholder: string;
  accentCls: string;
  iconBg: string;
  icon: React.ReactNode;
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: 'twitter',
    label: 'Twitter / X',
    cookieEndpoint: '/api/set-twitter-cookies',
    cookiePlaceholder: 'Paste cookies as JSON array (from Cookie Editor extension) or key=value; format...',
    accentCls: 'border-sky-300 bg-sky-50',
    iconBg: 'bg-black',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    cookieEndpoint: '/api/set-reddit-cookies',
    cookiePlaceholder: 'Paste Reddit cookies as JSON array or key=value; format...',
    accentCls: 'border-orange-300 bg-orange-50',
    iconBg: 'bg-orange-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    cookieEndpoint: '/api/set-fb-cookies',
    cookiePlaceholder: 'Paste Facebook cookies as JSON array or key=value; format...',
    accentCls: 'border-blue-300 bg-blue-50',
    iconBg: 'bg-blue-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    cookieEndpoint: '/api/set-linkedin-cookies',
    cookiePlaceholder: 'Paste LinkedIn cookies as JSON array or key=value; format...',
    accentCls: 'border-blue-400 bg-blue-50',
    iconBg: 'bg-[#0077B5]',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: 'quora',
    label: 'Quora',
    cookieEndpoint: '/api/set-quora-cookies',
    cookiePlaceholder: 'Paste Quora cookies as JSON array or key=value; format...',
    accentCls: 'border-red-300 bg-red-50',
    iconBg: 'bg-red-600',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
        <path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0zm-1.595 17.624c.263-.01.526-.022.786-.022h.026l-.803-1.523c.598-.861.941-2.083.941-3.578 0-3.022-1.73-4.697-4.689-4.697-2.97 0-4.7 1.675-4.7 4.697 0 3.031 1.73 4.706 4.7 4.706.575 0 1.127-.056 1.739-.183z" />
      </svg>
    ),
  },
];

// ── Account chip ──────────────────────────────────────────────────────────────

function AccountChip({
  account,
  onRemove,
}: {
  account: SocialAccount;
  onRemove: (id: string) => void;
}) {
  const initial = (account.displayName || account.username || '?')[0].toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-full shadow-sm">
      <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        {initial}
      </span>
      <span className="font-medium">
        {account.displayName || account.username || account.id}
      </span>
      {account.username && account.displayName && account.username !== account.displayName && (
        <span className="text-gray-400">@{account.username}</span>
      )}
      <button
        onClick={() => onRemove(account.id)}
        className="text-gray-300 hover:text-red-500 transition-colors ml-0.5 leading-none"
        title="Remove account"
      >
        &times;
      </button>
    </span>
  );
}

// ── Add account inline form ────────────────────────────────────────────────────

function AddAccountForm({
  platform,
  nextIndex,
  onSuccess,
  onCancel,
}: {
  platform: PlatformConfig;
  nextIndex: number;
  onSuccess: (account: SocialAccount) => void;
  onCancel: () => void;
}) {
  const [cookieText, setCookieText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!cookieText.trim()) {
      setError('Please paste your cookies first.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch(platform.cookieEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieText.trim(), accountIndex: nextIndex }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || data.message || 'Verification failed — check your cookies.');
        setLoading(false);
        return;
      }

      const username = data.username || data.user?.username || '';
      const displayName = data.displayName || data.user?.name || username;
      const accountId = data.accountId || `${platform.id}_${Date.now()}`;

      const newAccount: SocialAccount = {
        id: accountId,
        platform: platform.id,
        username,
        displayName,
        profileDir: data.profileDir || '',
        accountIndex: nextIndex,
        addedAt: new Date().toISOString(),
        active: true,
      };

      // Persist to DB
      await fetch('/api/social-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      });

      onSuccess(newAccount);
    } catch (err) {
      setError((err as Error).message || 'Request failed');
    }
    setLoading(false);
  };

  return (
    <div className="mt-2 p-3 border border-dashed border-gray-300 rounded-lg bg-gray-50 space-y-2">
      <p className="text-xs text-gray-500">
        Export cookies using the{' '}
        <span className="font-medium text-gray-700">Cookie Editor</span> browser extension, then paste them below.
      </p>
      <textarea
        value={cookieText}
        onChange={(e) => setCookieText(e.target.value)}
        className="w-full border border-gray-300 rounded-md p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={4}
        placeholder={platform.cookiePlaceholder}
        disabled={loading}
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Verifying…
            </>
          ) : 'Verify & Connect'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<ISettings>({
    companyName: '',
    companyDescription: '',
    keywords: [],
    platforms: ['twitter', 'reddit'],
    subreddits: [],
    promptTemplate: '',
    socialAccounts: [],
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [subredditInput, setSubredditInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Which platform has its "add account" form open
  const [openForms, setOpenForms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      fetch('/api/settings')
        .then((r) => r.json())
        .then((data) => {
          if (data.settings) setSettings({ ...data.settings, socialAccounts: data.settings.socialAccounts ?? [] });
        });
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.settings) {
      setSettings({ ...data.settings, socialAccounts: data.settings.socialAccounts ?? [] });
      setMessage('Settings saved!');
      setTimeout(() => setMessage(''), 2000);
    }
    setSaving(false);
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !settings.keywords.includes(keywordInput.trim())) {
      setSettings({ ...settings, keywords: [...settings.keywords, keywordInput.trim()] });
      setKeywordInput('');
    }
  };

  const addSubreddit = () => {
    const val = subredditInput.trim().replace(/^\/?(r\/)?/, '');
    if (val && !settings.subreddits.includes(val)) {
      setSettings({ ...settings, subreddits: [...settings.subreddits, val] });
      setSubredditInput('');
    }
  };

  const togglePlatform = (platform: string) => {
    const current = settings.platforms || [];
    if (current.includes(platform)) {
      setSettings({ ...settings, platforms: current.filter((p) => p !== platform) });
    } else {
      setSettings({ ...settings, platforms: [...current, platform] });
    }
  };

  const accountsForPlatform = (platformId: string) =>
    (settings.socialAccounts || []).filter((a) => a.platform === platformId);

  const nextIndexForPlatform = (platformId: string) =>
    accountsForPlatform(platformId).length;

  const handleAccountAdded = (account: SocialAccount) => {
    setSettings((prev) => ({
      ...prev,
      socialAccounts: [...(prev.socialAccounts || []), account],
    }));
    setOpenForms((prev) => ({ ...prev, [account.platform]: false }));
  };

  const handleAccountRemoved = async (accountId: string) => {
    await fetch(`/api/social-accounts?id=${encodeURIComponent(accountId)}`, { method: 'DELETE' });
    setSettings((prev) => ({
      ...prev,
      socialAccounts: (prev.socialAccounts || []).filter((a) => a.id !== accountId),
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        <div className="space-y-5">
          {/* Company info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              placeholder="Your Company Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Description</label>
            <textarea
              value={settings.companyDescription}
              onChange={(e) => setSettings({ ...settings, companyDescription: e.target.value })}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              rows={3}
              placeholder="What does your company do? What problems do you solve?"
            />
          </div>

          {/* ── Platforms & Accounts ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platforms &amp; Connected Accounts</label>
            <p className="text-xs text-gray-500 mb-3">
              Enable platforms to monitor and connect accounts to post replies.
            </p>

            <div className="space-y-2">
              {PLATFORM_CONFIGS.map((platform) => {
                const enabled = settings.platforms?.includes(platform.id) ?? false;
                const accounts = accountsForPlatform(platform.id);
                const formOpen = openForms[platform.id] ?? false;
                const nextIdx = nextIndexForPlatform(platform.id);

                return (
                  <div
                    key={platform.id}
                    className={`border rounded-xl p-3 transition-colors ${enabled ? platform.accentCls : 'border-gray-200 bg-gray-50'}`}
                  >
                    {/* Platform header row */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`platform-${platform.id}`}
                        checked={enabled}
                        onChange={() => togglePlatform(platform.id)}
                        className="rounded border-gray-300 cursor-pointer"
                      />
                      <label
                        htmlFor={`platform-${platform.id}`}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                      >
                        <span className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${platform.iconBg}`}>
                          {platform.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{platform.label}</span>
                      </label>

                      {/* Account chips */}
                      {accounts.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {accounts.map((acc) => (
                            <AccountChip
                              key={acc.id}
                              account={acc}
                              onRemove={handleAccountRemoved}
                            />
                          ))}
                        </div>
                      )}

                      {/* + Add account button */}
                      <button
                        onClick={() => setOpenForms((prev) => ({ ...prev, [platform.id]: !prev[platform.id] }))}
                        className="ml-auto flex-shrink-0 w-7 h-7 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600 flex items-center justify-center transition-colors text-base leading-none"
                        title={`Add ${platform.label} account`}
                      >
                        {formOpen ? '−' : '+'}
                      </button>
                    </div>

                    {/* Inline add account form */}
                    {formOpen && (
                      <AddAccountForm
                        platform={platform}
                        nextIndex={nextIdx}
                        onSuccess={handleAccountAdded}
                        onCancel={() => setOpenForms((prev) => ({ ...prev, [platform.id]: false }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords to Monitor</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                className="flex-1 border border-gray-300 rounded-md p-2 text-sm"
                placeholder="Add a keyword..."
              />
              <button onClick={addKeyword} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Add
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {settings.keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {kw}
                  <button
                    onClick={() => setSettings({ ...settings, keywords: settings.keywords.filter((k) => k !== kw) })}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Subreddits (shown when Reddit is enabled) */}
          {settings.platforms?.includes('reddit') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subreddits to Monitor</label>
              <p className="text-xs text-gray-500 mb-2">Leave empty to search all of Reddit.</p>
              <div className="flex gap-2 mb-2">
                <div className="flex items-center flex-1 border border-gray-300 rounded-md overflow-hidden">
                  <span className="px-2 text-sm text-gray-500 bg-gray-50">r/</span>
                  <input
                    type="text"
                    value={subredditInput}
                    onChange={(e) => setSubredditInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSubreddit()}
                    className="flex-1 p-2 text-sm border-0 outline-none"
                    placeholder="subreddit name"
                  />
                </div>
                <button onClick={addSubreddit} className="px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700">
                  Add
                </button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(settings.subreddits || []).map((sr) => (
                  <span key={sr} className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded">
                    r/{sr}
                    <button
                      onClick={() => setSettings({ ...settings, subreddits: settings.subreddits.filter((s) => s !== sr) })}
                      className="text-orange-400 hover:text-orange-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Prompt Template (optional)</label>
            <textarea
              value={settings.promptTemplate}
              onChange={(e) => setSettings({ ...settings, promptTemplate: e.target.value })}
              className="w-full border border-gray-300 rounded-md p-2 text-sm font-mono"
              rows={5}
              placeholder="Use {postContent}, {companyName}, {companyDescription} as variables..."
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty to use the default prompt.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {message && <span className="text-sm text-green-600">{message}</span>}
        </div>
      </div>
    </div>
  );
}
