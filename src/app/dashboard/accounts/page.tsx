'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/apiBase';
import type { SocialAccount } from '@/lib/types';

/* ── Platform config ─────────────────────────────────────────────── */
interface PlatformConfig {
    id: string;
    label: string;
    cookieEndpoint: string;
    cookiePlaceholder: string;
    color: string;
    icon: React.ReactNode;
}

const PLATFORMS: PlatformConfig[] = [
    {
        id: 'twitter', label: 'Twitter / X',
        cookieEndpoint: '/api/set-twitter-cookies',
        cookiePlaceholder: 'Paste Twitter cookies JSON…',
        color: '#a0a0a0',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    {
        id: 'reddit', label: 'Reddit',
        cookieEndpoint: '/api/set-reddit-cookies',
        cookiePlaceholder: 'Paste Reddit cookies JSON…',
        color: '#ff4500',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    {
        id: 'facebook', label: 'Facebook',
        cookieEndpoint: '/api/set-fb-cookies',
        cookiePlaceholder: 'Paste Facebook cookies JSON…',
        color: '#1877f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    {
        id: 'quora', label: 'Quora',
        cookieEndpoint: '/api/set-quora-cookies',
        cookiePlaceholder: 'Paste Quora cookies JSON…',
        color: '#b92b27',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    {
        id: 'youtube', label: 'YouTube',
        cookieEndpoint: '/api/set-youtube-cookies',
        cookiePlaceholder: 'Paste YouTube cookies JSON…',
        color: '#ff0000',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    {
        id: 'pinterest', label: 'Pinterest',
        cookieEndpoint: '/api/set-pinterest-cookies',
        cookiePlaceholder: 'Paste Pinterest cookies JSON…',
        color: '#e60023',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
];

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);
    const [addingFor, setAddingFor] = useState<string | null>(null);
    const [cookieInput, setCookieInput] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const fetchSettings = useCallback(async () => {
        try {
            const [accRes, settRes] = await Promise.all([
                fetch(`${API_BASE}/api/social-accounts`),
                fetch(`${API_BASE}/api/settings`),
            ]);
            const accData = await accRes.json();
            const settData = await settRes.json();
            setAccounts(accData.accounts ?? []);
            setEnabledPlatforms(settData.settings?.platforms ?? []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const accountsFor = (pid: string) => accounts.filter((a) => a.platform === pid);

    const handleAddAccount = async (platform: PlatformConfig) => {
        if (!cookieInput.trim()) return;
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch(platform.cookieEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cookies: cookieInput.trim(),
                    username: usernameInput.trim() || undefined,
                    accountIndex: accountsFor(platform.id).length,
                }),
            });
            const data = await res.json();
            if (data.error) {
                setMessage(`Error: ${data.error}`);
            } else {
                setMessage(`Account added successfully`);
                setCookieInput('');
                setUsernameInput('');
                setAddingFor(null);
                fetchSettings();
            }
        } catch {
            setMessage('Failed to add account');
        }
        setSaving(false);
    };

    const handleRemoveAccount = async (accountId: string) => {
        try {
            await fetch(`${API_BASE}/api/social-accounts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId }),
            });
            fetchSettings();
        } catch { /* silent */ }
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h2>Connected Accounts</h2>
                <p>Manage social media accounts linked to the bot</p>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {PLATFORMS.map((platform) => {
                    const platAccounts = accountsFor(platform.id);
                    const isEnabled = enabledPlatforms.includes(platform.id);

                    return (
                        <div key={platform.id} className="card">
                            <div className="card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ color: platform.color }}>{platform.icon}</span>
                                    <span className="card-title">{platform.label}</span>
                                    {isEnabled ? (
                                        <span className="badge badge-approved">Enabled</span>
                                    ) : (
                                        <span className="badge badge-posted">Disabled</span>
                                    )}
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => { setAddingFor(addingFor === platform.id ? null : platform.id); setMessage(''); setCookieInput(''); setUsernameInput(''); }}
                                >
                                    {addingFor === platform.id ? 'Cancel' : '+ Add Account'}
                                </button>
                            </div>

                            <div className="card-body">
                                {/* Existing accounts */}
                                {platAccounts.length === 0 && addingFor !== platform.id && (
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No accounts connected</p>
                                )}

                                {platAccounts.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: addingFor === platform.id ? 20 : 0 }}>
                                        {platAccounts.map((acc) => (
                                            <div key={acc.id} className="account-card">
                                                <div
                                                    className="account-avatar"
                                                    style={{ background: `${platform.color}22`, color: platform.color }}
                                                >
                                                    {(acc.displayName || acc.username || '?')[0].toUpperCase()}
                                                </div>
                                                <div className="account-info">
                                                    <div className="account-name">{acc.displayName || acc.username || 'Unknown'}</div>
                                                    <div className="account-username">@{acc.username || acc.id}</div>
                                                </div>
                                                {acc.active !== false && (
                                                    <span className="badge badge-approved" style={{ fontSize: 10 }}>Active</span>
                                                )}
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleRemoveAccount(acc.id)}
                                                    style={{ color: 'var(--status-rejected)' }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add account form */}
                                {addingFor === platform.id && (
                                    <div style={{
                                        background: 'var(--bg-input)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: 20,
                                        border: '1px solid var(--border-subtle)',
                                    }}>
                                        <div style={{ marginBottom: 12 }}>
                                            <label className="label">Username (optional)</label>
                                            <input
                                                className="input"
                                                placeholder="Account username"
                                                value={usernameInput}
                                                onChange={(e) => setUsernameInput(e.target.value)}
                                            />
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <label className="label">Cookies</label>
                                            <textarea
                                                className="input textarea"
                                                placeholder={platform.cookiePlaceholder}
                                                value={cookieInput}
                                                onChange={(e) => setCookieInput(e.target.value)}
                                                style={{ minHeight: 100, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                disabled={saving || !cookieInput.trim()}
                                                onClick={() => handleAddAccount(platform)}
                                            >
                                                {saving ? 'Adding…' : 'Add Account'}
                                            </button>
                                            {message && (
                                                <span style={{
                                                    fontSize: 12,
                                                    color: message.startsWith('Error') ? 'var(--status-rejected)' : 'var(--status-approved)',
                                                }}>
                                                    {message}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
