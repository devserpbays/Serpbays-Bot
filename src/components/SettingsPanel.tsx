'use client';

import { useState, useEffect } from 'react';
import type { ISettings } from '@/lib/types';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<ISettings>({
    companyName: '',
    companyDescription: '',
    keywords: [],
    platforms: ['twitter', 'reddit'],
    subreddits: [],
    promptTemplate: '',
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [subredditInput, setSubredditInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      fetch('/api/settings')
        .then((r) => r.json())
        .then((data) => {
          if (data.settings) setSettings(data.settings);
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
      setSettings(data.settings);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        <div className="space-y-4">
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

          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platforms to Monitor</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.platforms?.includes('twitter')}
                  onChange={() => togglePlatform('twitter')}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Twitter / X</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.platforms?.includes('reddit')}
                  onChange={() => togglePlatform('reddit')}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Reddit</span>
              </label>
            </div>
          </div>

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

          {/* Subreddits */}
          {settings.platforms?.includes('reddit') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subreddits to Monitor (optional)</label>
              <p className="text-xs text-gray-500 mb-2">Leave empty to search all of Reddit. Add specific subreddits for focused results.</p>
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

        <div className="flex items-center gap-3">
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
