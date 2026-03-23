'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
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
        color: '#1d9bf0',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
    },
    {
        id: 'reddit', label: 'Reddit',
        cookieEndpoint: '/api/set-reddit-cookies',
        cookiePlaceholder: 'Paste Reddit cookies JSON…',
        color: '#3b82f6',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg>,
    },
    {
        id: 'facebook', label: 'Facebook',
        cookieEndpoint: '/api/set-fb-cookies',
        cookiePlaceholder: 'Paste Facebook cookies JSON…',
        color: '#1877f2',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>,
    },
    {
        id: 'quora', label: 'Quora',
        cookieEndpoint: '/api/set-quora-cookies',
        cookiePlaceholder: 'Paste Quora cookies JSON…',
        color: '#2563eb',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg>,
    },
    {
        id: 'youtube', label: 'YouTube',
        cookieEndpoint: '/api/set-youtube-cookies',
        cookiePlaceholder: 'Paste YouTube cookies JSON…',
        color: '#0ea5e9',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
    },
    {
        id: 'pinterest', label: 'Pinterest',
        cookieEndpoint: '/api/set-pinterest-cookies',
        cookiePlaceholder: 'Paste Pinterest cookies JSON…',
        color: '#60a5fa',
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg>,
    },
];

/* ── Disconnect Confirmation Modal ──────────────────────────────── */
function DisconnectModal({
    acc,
    platformLabel,
    color,
    onConfirm,
    onCancel,
}: {
    acc: SocialAccount;
    platformLabel: string;
    color: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const [removing, setRemoving] = useState(false);
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 150ms ease',
        }} onClick={onCancel}>
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)', padding: '28px 32px',
                maxWidth: 420, width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }} onClick={e => e.stopPropagation()}>
                {/* Warning icon */}
                <div style={{
                    width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
                    background: 'rgba(239,68,68,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} width={24} height={24}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </div>

                <h3 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Disconnect {platformLabel}?
                </h3>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 6px' }}>
                    This will remove <strong style={{ color: 'var(--text-primary)' }}>@{acc.username || acc.displayName || acc.id}</strong> and delete all saved cookies and browser data from the server.
                </p>
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', margin: '0 0 24px' }}>
                    You&apos;ll need to re-paste cookies to reconnect this account.
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                        onClick={onCancel}
                        disabled={removing}
                        style={{
                            padding: '9px 22px', borderRadius: 'var(--radius-sm)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: '1px solid var(--border-default)',
                            background: 'transparent', color: 'var(--text-secondary)',
                        }}
                    >
                        No, Keep it
                    </button>
                    <button
                        onClick={async () => {
                            setRemoving(true);
                            onConfirm();
                        }}
                        disabled={removing}
                        style={{
                            padding: '9px 22px', borderRadius: 'var(--radius-sm)',
                            fontSize: 13, fontWeight: 600,
                            cursor: removing ? 'not-allowed' : 'pointer',
                            border: 'none',
                            background: removing ? 'rgba(239,68,68,0.3)' : '#ef4444',
                            color: '#fff',
                            boxShadow: '0 2px 10px rgba(239,68,68,0.3)',
                        }}
                    >
                        {removing ? 'Removing...' : 'Yes, Disconnect'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Connected account pill ──────────────────────────────────────── */
function AccountPill({
    acc,
    color,
    onRemove,
}: {
    acc: SocialAccount;
    color: string;
    onRemove: (id: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const initials = (acc.displayName || acc.username || '?')[0].toUpperCase();
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: `${color}10`,
            border: `1px solid ${color}25`,
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            transition: 'background var(--transition-fast), border-color var(--transition-fast)',
            ...(hovered ? { background: `${color}18`, borderColor: `${color}40` } : {}),
        }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Avatar */}
            <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: `${color}25`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
            }}>
                {initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.displayName || acc.username || 'Connected'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    @{acc.username || acc.id}
                </div>
            </div>

            {/* Warm-up badge or active dot */}
            {(acc as SocialAccount & { warmup?: { isWarmingUp: boolean; daysRemaining: number; dailyLimit: number | null; progressPct: number } }).warmup?.isWarmingUp ? (() => {
                const w = (acc as SocialAccount & { warmup: { isWarmingUp: boolean; daysRemaining: number; dailyLimit: number | null; progressPct: number } }).warmup;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                        <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
                            border: '1px solid rgba(251,191,36,0.25)', letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                        }}>Warming up · {w.daysRemaining}d left</span>
                        <div style={{ width: 80, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${w.progressPct}%`, height: '100%', background: '#fbbf24', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{w.dailyLimit} posts/day max</span>
                    </div>
                );
            })() : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: acc.active !== false ? 'var(--status-approved)' : 'var(--text-muted)',
                        boxShadow: acc.active !== false ? '0 0 6px rgba(52,211,153,0.6)' : 'none',
                    }} />
                    <span style={{ fontSize: 10, color: acc.active !== false ? 'var(--status-approved)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {acc.active !== false ? 'Active' : 'Inactive'}
                    </span>
                </div>
            )}

            {/* Health score badge */}
            {(() => {
                const health = (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean }).healthScore ?? 100;
                const paused = (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean }).autoPaused ?? false;
                if (paused) return (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                        background: 'rgba(239,68,68,0.12)', color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.25)', letterSpacing: '0.05em',
                        textTransform: 'uppercase', flexShrink: 0 }}>Auto-Paused</span>
                );
                if (health < 50) return (
                    <span title={`Health score: ${health}/100`} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                        background: health < 25 ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)',
                        color: health < 25 ? '#f87171' : '#fbbf24',
                        border: `1px solid ${health < 25 ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.25)'}`,
                        letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
                    }}>Health {health}</span>
                );
                return null;
            })()}

            {/* Disconnect button */}
            <button
                onClick={() => onRemove(acc.id)}
                title="Disconnect account"
                style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: '1px solid transparent', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'all var(--transition-fast)',
                    flexShrink: 0, fontSize: 11, fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--status-rejected)';
                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                    e.currentTarget.style.background = 'rgba(239,68,68,0.06)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = 'none';
                }}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}>
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Disconnect
            </button>
        </div>
    );
}

/* ── Platform card ───────────────────────────────────────────────── */
function PlatformCard({
    platform,
    platAccounts,
    isEnabled,
    addingFor,
    onToggleAdd,
    onAdd,
    onRemove,
}: {
    platform: PlatformConfig;
    platAccounts: SocialAccount[];
    isEnabled: boolean;
    addingFor: string | null;
    onToggleAdd: (id: string | null) => void;
    onAdd: (platform: PlatformConfig, cookies: string, username: string) => Promise<void>;
    onRemove: (id: string) => void;
}) {
    const [cookieInput, setCookieInput] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const isOpen = addingFor === platform.id;
    const isConnected = platAccounts.length > 0;

    const handleSubmit = async () => {
        if (!cookieInput.trim()) return;
        setSaving(true);
        setMessage(null);
        try {
            await onAdd(platform, cookieInput, usernameInput);
            setMessage({ type: 'success', text: 'Account connected successfully' });
            setCookieInput('');
            setUsernameInput('');
            setTimeout(() => {
                setMessage(null);
                onToggleAdd(null);
            }, 1800);
        } catch (err) {
            setMessage({ type: 'error', text: (err as Error).message || 'Failed to connect account' });
        }
        setSaving(false);
    };

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${isConnected ? `${platform.color}30` : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            transition: 'border-color var(--transition-default), box-shadow var(--transition-default)',
            boxShadow: isConnected ? `0 0 0 1px ${platform.color}15, 0 4px 24px rgba(0,0,0,0.2)` : '0 4px 24px rgba(0,0,0,0.2)',
        }}>
            {/* Card header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '18px 20px',
                borderBottom: isOpen || isConnected ? '1px solid var(--border-subtle)' : 'none',
            }}>
                {/* Icon */}
                <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
                    background: isConnected ? `${platform.color}18` : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isConnected ? platform.color : 'var(--text-muted)',
                }}>
                    {platform.icon}
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{platform.label}</span>
                        {isConnected ? (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: 'rgba(52,211,153,0.12)', color: 'var(--status-approved)',
                                letterSpacing: '0.3px',
                            }}>
                                {platAccounts.length} connected
                            </span>
                        ) : (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                letterSpacing: '0.3px',
                            }}>
                                Not connected
                            </span>
                        )}
                        {isEnabled && !isConnected && (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: 'rgba(14,165,233,0.12)', color: '#38bdf8',
                                letterSpacing: '0.3px',
                            }}>
                                Enabled
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {isConnected
                            ? `${platAccounts.length} account${platAccounts.length > 1 ? 's' : ''} — bot will use ${platAccounts.length > 1 ? 'these' : 'this'} to post`
                            : 'Paste browser cookies to connect'}
                    </div>
                </div>

                {/* Action button */}
                <button
                    onClick={() => { onToggleAdd(isOpen ? null : platform.id); setMessage(null); setCookieInput(''); setUsernameInput(''); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: isOpen
                            ? '1px solid var(--border-default)'
                            : isConnected ? `1px solid ${platform.color}40` : '1px solid rgba(14,165,233,0.35)',
                        background: isOpen
                            ? 'rgba(255,255,255,0.04)'
                            : isConnected ? `${platform.color}15` : 'rgba(14,165,233,0.1)',
                        color: isOpen ? 'var(--text-secondary)' : isConnected ? platform.color : '#38bdf8',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                        if (!isOpen) {
                            const c = isConnected ? platform.color : '#0ea5e9';
                            e.currentTarget.style.background = isConnected ? `${c}25` : 'rgba(14,165,233,0.18)';
                            e.currentTarget.style.borderColor = isConnected ? `${c}70` : 'rgba(14,165,233,0.55)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isOpen) {
                            const c = isConnected ? platform.color : '#0ea5e9';
                            e.currentTarget.style.background = isConnected ? `${c}15` : 'rgba(14,165,233,0.1)';
                            e.currentTarget.style.borderColor = isConnected ? `${c}40` : 'rgba(14,165,233,0.35)';
                        }
                    }}
                >
                    {isOpen ? (
                        <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Cancel
                        </>
                    ) : (
                        <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}>
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {isConnected ? 'Add Another' : 'Connect'}
                        </>
                    )}
                </button>
            </div>

            {/* Connected accounts */}
            {isConnected && !isOpen && (
                <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {platAccounts.map((acc) => (
                        <AccountPill key={acc.id} acc={acc} color={platform.color} onRemove={onRemove} />
                    ))}
                </div>
            )}

            {/* Add account form */}
            {isOpen && (
                <div style={{ padding: 20 }}>
                    {/* How-to tip */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)',
                        borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 18,
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Log into {platform.label} in Chrome, then install{' '}
                            <a
                                href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                            >
                                Cookie-Editor
                            </a>{' '}
                            (free Chrome extension). Click it and choose <strong style={{ color: 'var(--text-primary)' }}>Export → Export as JSON</strong>, then paste the result below.
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                                Username <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                            </label>
                            <input
                                className="input"
                                placeholder={`Your ${platform.label} username`}
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                style={{ fontSize: 13 }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                                Cookies JSON
                            </label>
                            <textarea
                                className="input textarea"
                                placeholder={platform.cookiePlaceholder}
                                value={cookieInput}
                                onChange={(e) => setCookieInput(e.target.value)}
                                style={{ minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical', lineHeight: 1.5 }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                                onClick={handleSubmit}
                                disabled={saving || !cookieInput.trim()}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                                    fontSize: 13, fontWeight: 600, cursor: saving || !cookieInput.trim() ? 'not-allowed' : 'pointer',
                                    border: 'none',
                                    background: saving || !cookieInput.trim()
                                        ? 'rgba(255,255,255,0.06)'
                                        : `linear-gradient(135deg, ${platform.color}, ${platform.color}cc)`,
                                    color: saving || !cookieInput.trim() ? 'var(--text-muted)' : '#fff',
                                    transition: 'all var(--transition-fast)',
                                    boxShadow: saving || !cookieInput.trim() ? 'none' : `0 2px 12px ${platform.color}40`,
                                }}
                            >
                                {saving ? (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}
                                            style={{ animation: 'spin 1s linear infinite' }}>
                                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                        </svg>
                                        Verifying…
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}>
                                            <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                        Connect Account
                                    </>
                                )}
                            </button>

                            {message && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                                    color: message.type === 'success' ? 'var(--status-approved)' : 'var(--status-rejected)',
                                    animation: 'fadeIn 200ms ease',
                                }}>
                                    {message.type === 'success' ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}>
                                            <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                    ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                    )}
                                    {message.text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function AccountsPage() {
    const [isSetup, setIsSetup] = useState(false);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);
    const [addingFor, setAddingFor] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState<SocialAccount | null>(null);

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

    useEffect(() => {
        fetchSettings();
        if (typeof window !== 'undefined') {
            setIsSetup(new URLSearchParams(window.location.search).get('setup') === '1');
        }
    }, [fetchSettings]);

    const accountsFor = (pid: string) => accounts.filter((a) => a.platform === pid);
    const totalConnected = PLATFORMS.filter((p) => accountsFor(p.id).length > 0).length;

    const handleAdd = async (platform: PlatformConfig, cookies: string, username: string) => {
        const res = await fetch(platform.cookieEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cookies: cookies.trim(),
                username: username.trim() || undefined,
                accountIndex: accountsFor(platform.id).length,
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Route now returns 202 with jobId — poll until complete
        if (res.status === 202 && data.jobId) {
            const jobId = data.jobId;
            const maxAttempts = 60; // 2s * 60 = 120s max
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const statusRes = await fetch(`/api/job-status/${jobId}`);
                    const statusData = await statusRes.json();
                    if (statusData.state === 'completed') {
                        if (statusData.result?.success === false) {
                            throw new Error(statusData.result.message || 'Cookie validation failed');
                        }
                        await fetchSettings();
                        return;
                    }
                    if (statusData.state === 'failed') {
                        throw new Error(statusData.failedReason || 'Cookie validation failed');
                    }
                } catch (pollErr) {
                    if ((pollErr as Error).message && !(pollErr as Error).message.includes('fetch')) throw pollErr;
                }
            }
            throw new Error('Validation timed out — check the accounts page in a minute');
        }

        await fetchSettings();
    };

    const handleRequestRemove = (accountId: string) => {
        const acc = accounts.find(a => a.id === accountId);
        if (acc) setDisconnecting(acc);
    };

    const handleConfirmRemove = async () => {
        if (!disconnecting) return;
        try {
            const res = await fetch('/api/social-accounts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: disconnecting.id }),
            });
            const data = await res.json();
            if (data.success) {
                const platform = disconnecting.platform.charAt(0).toUpperCase() + disconnecting.platform.slice(1);
                toast.success(`${platform} account @${disconnecting.username || disconnecting.displayName || disconnecting.id} disconnected and cookies removed`);
            } else {
                toast.error(data.error || 'Failed to disconnect account');
            }
            fetchSettings();
        } catch {
            toast.error('Failed to disconnect account');
        }
        setDisconnecting(null);
    };

    return (
        <div className="animate-fade-in">
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h2>Social Accounts</h2>
                    <p>Connect browser sessions so the bot can post on your behalf</p>
                </div>
                {/* Progress indicator */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: '8px 16px',
                }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PLATFORMS.map((p) => {
                            const connected = accountsFor(p.id).length > 0;
                            return (
                                <div
                                    key={p.id}
                                    title={`${p.label}: ${connected ? 'connected' : 'not connected'}`}
                                    style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: connected ? p.color : 'rgba(255,255,255,0.08)',
                                        transition: 'background var(--transition-default)',
                                    }}
                                />
                            );
                        })}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {totalConnected} / {PLATFORMS.length} connected
                    </span>
                </div>
            </div>

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Setup welcome banner */}
                {isSetup && accounts.length === 0 && (
                    <div style={{
                        position: 'relative', overflow: 'hidden',
                        background: 'linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(37,99,235,0.06) 100%)',
                        border: '1px solid rgba(14,165,233,0.25)',
                        borderRadius: 'var(--radius-lg)', padding: '20px 24px',
                    }}>
                        {/* Glow */}
                        <div style={{
                            position: 'absolute', top: -40, right: -40,
                            width: 160, height: 160, borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }} />
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
                                background: 'rgba(14,165,233,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                            }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} width={22} height={22}>
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5, color: 'var(--text-primary)' }}>
                                    Setup complete — now connect your social accounts
                                </div>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                                    Click <strong style={{ color: 'var(--accent)' }}>Connect</strong> on any platform below and follow the on-screen steps.
                                    Once connected, the bot will automatically find and reply to posts matching your keywords.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* How to get cookies — always show when no accounts */}
                {accounts.length === 0 && (
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)', padding: '18px 22px',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={2} width={16} height={16}>
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            How to get your browser cookies
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { step: '1', text: 'Log into the social platform in your browser (Chrome recommended)' },
                                { step: '2', text: 'Install the "Cookie-Editor" extension or open DevTools (F12) > Application > Cookies' },
                                { step: '3', text: 'Export all cookies as JSON and paste them below' },
                            ].map(s => (
                                <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                        background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 700, color: '#0ea5e9',
                                    }}>
                                        {s.step}
                                    </div>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* No accounts at all — prominent empty state */}
                {!isSetup && accounts.length === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '32px 24px',
                        background: 'var(--bg-card)', border: '1px dashed var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                    }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                            background: 'rgba(255,255,255,0.04)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} width={26} height={26}>
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>No accounts connected yet</div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 380, marginInline: 'auto' }}>
                            Choose a platform below and paste your browser cookies to let the bot post on your behalf.
                        </p>
                    </div>
                )}

                {/* Platform grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
                    {PLATFORMS.map((platform) => (
                        <PlatformCard
                            key={platform.id}
                            platform={platform}
                            platAccounts={accountsFor(platform.id)}
                            isEnabled={enabledPlatforms.includes(platform.id)}
                            addingFor={addingFor}
                            onToggleAdd={setAddingFor}
                            onAdd={handleAdd}
                            onRemove={handleRequestRemove}
                        />
                    ))}
                </div>
            </div>

            {/* Disconnect confirmation modal */}
            {disconnecting && (() => {
                const plat = PLATFORMS.find(p => p.id === disconnecting.platform);
                return (
                    <DisconnectModal
                        acc={disconnecting}
                        platformLabel={plat?.label || disconnecting.platform}
                        color={plat?.color || '#888'}
                        onConfirm={handleConfirmRemove}
                        onCancel={() => setDisconnecting(null)}
                    />
                );
            })()}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
