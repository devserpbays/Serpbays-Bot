'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { API_BASE } from '@/lib/apiBase';

/**
 * Shared extension install card — used in:
 *  - Dashboard → Accounts page (theme: 'dark')
 *  - Dashboard → Settings page, near the API key (theme: 'dark')
 *  - Onboarding → Step 5, "You're all set" (theme: 'light')
 *
 * Features:
 *  - Shows the current built extension version (fetched via HEAD /api/download)
 *  - Download button that calls auth'd /api/download and triggers a browser save
 *  - Optional inline "Copy API key" button when apiKey prop is passed
 *  - Expandable 8-step install guide
 *  - Theme-aware styling (dark for dashboard, light for onboarding)
 */

type Theme = 'dark' | 'light';
type Variant = 'full' | 'compact';

interface Props {
  theme?: Theme;
  variant?: Variant;
  apiKey?: string;           // if provided, shows an inline "Copy API key" button
  showSteps?: boolean;       // default true; set false to hide the install steps accordion
  defaultExpanded?: boolean; // default false
  title?: string;            // override the default heading
  subtitle?: string;         // override the default subheading
  // Inline API key management — when provided, the card shows the full key
  // with a Copy + Regenerate row, so the card can stand in for the entire
  // "Browser Extension" settings section.
  showKeyField?: boolean;
  onRegenerateKey?: () => void | Promise<void>;
  onGenerateKey?: () => void | Promise<void>;
  regenerating?: boolean;
}

function useVersionProbe() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/download`, { method: 'HEAD', credentials: 'include' })
      .then(r => {
        if (cancelled) return;
        const v = r.headers.get('X-Extension-Version') || '';
        if (v) setVersion(v);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);
  return version;
}

async function downloadExtension(
  version: string,
  setDownloading: (v: boolean) => void,
) {
  setDownloading(true);
  try {
    const res = await fetch(`${API_BASE}/api/download`, { credentials: 'include' });
    if (!res.ok) {
      toast.error(res.status === 401 ? 'Please sign in to download' : 'Download failed');
      setDownloading(false);
      return;
    }
    const blob = await res.blob();
    const v = res.headers.get('X-Extension-Version') || version || 'latest';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `getmention-${v}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Extension v${v} downloaded`);
  } catch {
    toast.error('Download failed');
  }
  setDownloading(false);
}

/* ── Theme tokens ────────────────────────────────────────────────────── */

const DARK = {
  surface: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(14,165,233,0.06) 100%)',
  surfaceGlow: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderSubtle: '1px solid rgba(99,102,241,0.15)',
  iconBg: 'rgba(99,102,241,0.15)',
  iconBorder: '1px solid rgba(99,102,241,0.25)',
  iconColor: '#a5b4fc',
  titleColor: 'var(--text-primary)',
  bodyColor: 'var(--text-secondary)',
  mutedColor: 'var(--text-muted)',
  pillBg: 'rgba(99,102,241,0.15)',
  pillColor: '#a5b4fc',
  primaryBg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
  primaryBgHover: 'linear-gradient(135deg, #4f46e5, #4338ca)',
  primaryShadow: '0 4px 18px rgba(99,102,241,0.45)',
  primaryTextColor: '#fff',
  secondaryBg: 'rgba(255,255,255,0.04)',
  secondaryBorder: '1px solid var(--border-default)',
  secondaryColor: 'var(--text-secondary)',
  stepBg: 'rgba(99,102,241,0.15)',
  stepBorder: '1px solid rgba(99,102,241,0.3)',
  stepColor: '#a5b4fc',
  codeBg: 'rgba(255,255,255,0.07)',
  codeColor: 'var(--text-primary)',
  linkColor: 'var(--accent)',
  disabledBg: 'rgba(255,255,255,0.06)',
  disabledColor: 'var(--text-muted)',
};

const LIGHT = {
  surface: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)',
  surfaceGlow: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
  border: '1px solid #c7d2fe',
  borderSubtle: '1px solid #e0e7ff',
  iconBg: '#e0e7ff',
  iconBorder: '1px solid #c7d2fe',
  iconColor: '#4f46e5',
  titleColor: '#0f172a',
  bodyColor: '#475569',
  mutedColor: '#64748b',
  pillBg: '#e0e7ff',
  pillColor: '#4338ca',
  primaryBg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
  primaryBgHover: 'linear-gradient(135deg, #4f46e5, #4338ca)',
  primaryShadow: '0 4px 18px rgba(99,102,241,0.35)',
  primaryTextColor: '#fff',
  secondaryBg: '#ffffff',
  secondaryBorder: '1px solid #cbd5e1',
  secondaryColor: '#475569',
  stepBg: '#e0e7ff',
  stepBorder: '1px solid #c7d2fe',
  stepColor: '#4338ca',
  codeBg: '#f1f5f9',
  codeColor: '#0f172a',
  linkColor: '#4f46e5',
  disabledBg: '#e2e8f0',
  disabledColor: '#94a3b8',
};

/* ── Main component ──────────────────────────────────────────────────── */

export default function ExtensionInstallCard({
  theme = 'dark',
  variant = 'full',
  apiKey,
  showSteps = true,
  defaultExpanded = false,
  title = 'GetMention Chrome Extension',
  subtitle = 'Install the extension to let the bot scrape posts and engage on your behalf.',
  showKeyField = false,
  onRegenerateKey,
  onGenerateKey,
  regenerating = false,
}: Props) {
  const T = theme === 'light' ? LIGHT : DARK;
  const [version, setVersion_] = useState('');
  const probedVersion = useVersionProbe();
  useEffect(() => { if (probedVersion) setVersion_(probedVersion); }, [probedVersion]);
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);

  const handleDownload = () => downloadExtension(version, setDownloading);

  const handleCopyKey = () => {
    if (!apiKey) return;
    try { navigator.clipboard.writeText(apiKey); } catch { /* silent */ }
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1800);
  };

  const handleRegenerate = async () => {
    if (!onRegenerateKey) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Regenerate API key? The old key will stop working in any installed extension.');
      if (!ok) return;
    }
    await onRegenerateKey();
  };

  // Mask all but first 6 + last 4 chars so the key isn't shoulder-surfable by default.
  const maskedKey = apiKey && apiKey.length > 12
    ? `${apiKey.slice(0, 6)}${'•'.repeat(Math.min(24, apiKey.length - 10))}${apiKey.slice(-4)}`
    : apiKey || '';

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: T.surface,
      border: T.border,
      borderRadius: 16,
      boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.04), 0 12px 28px rgba(99,102,241,0.08)' : 'none',
    }}>
      {/* Decorative glow */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 220, height: 220, borderRadius: '50%',
        background: T.surfaceGlow, pointerEvents: 'none', filter: 'blur(20px)',
      }} />

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: variant === 'compact' ? '14px 18px' : '18px 22px',
        position: 'relative',
        flexWrap: 'wrap',
      }}>
        {/* Icon with subtle pulse */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: T.iconBg, border: T.iconBorder,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.iconColor,
          boxShadow: `0 0 0 0 ${T.iconColor}`,
          animation: 'gm-icon-pulse 3s ease-in-out infinite',
        }}>
          {/* Chrome puzzle-piece-ish icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        {/* Title + subtitle */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.titleColor, letterSpacing: '-0.1px' }}>
              {title}
            </span>
            {version && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                background: T.pillBg, color: T.pillColor,
                letterSpacing: '0.4px', textTransform: 'uppercase',
                border: T.iconBorder,
              }}>
                v{version}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: T.mutedColor, marginTop: 3, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {apiKey && (
            <button
              type="button"
              onClick={handleCopyKey}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', borderRadius: 10,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: T.secondaryBorder,
                background: keyCopied
                  ? (theme === 'light' ? '#d1fae5' : 'rgba(34,197,94,0.15)')
                  : T.secondaryBg,
                color: keyCopied
                  ? (theme === 'light' ? '#047857' : '#4ade80')
                  : T.secondaryColor,
                transition: 'all 150ms',
              }}
              title="Copy API key — paste this in the extension popup after install"
            >
              {keyCopied ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={13} height={13}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={13} height={13}>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy API key
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: downloading ? 'wait' : 'pointer',
              border: 'none',
              background: downloading ? T.disabledBg : T.primaryBg,
              color: downloading ? T.disabledColor : T.primaryTextColor,
              transition: 'all 200ms',
              boxShadow: downloading ? 'none' : T.primaryShadow,
              letterSpacing: '-0.1px',
            }}
            onMouseEnter={(e) => {
              if (!downloading) {
                e.currentTarget.style.background = T.primaryBgHover;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!downloading) {
                e.currentTarget.style.background = T.primaryBg;
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {downloading ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}
                  style={{ animation: 'gm-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Downloading…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download .zip
              </>
            )}
          </button>

          {showSteps && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              style={{
                padding: '10px 12px', borderRadius: 10,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: T.secondaryBorder, background: T.secondaryBg, color: T.secondaryColor,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 150ms',
              }}
            >
              {expanded ? 'Hide' : 'Install steps'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Inline API key field — only rendered when showKeyField is true.
          Shows the full key inside the card with copy + regenerate actions,
          so the card can replace the entire "Browser Extension" settings block. */}
      {showKeyField && (
        <div style={{
          borderTop: T.borderSubtle,
          padding: '14px 22px 16px',
          position: 'relative',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, marginBottom: 8,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: T.mutedColor,
            }}>
              Extension API Key
            </div>
            {apiKey && (
              <button
                type="button"
                onClick={() => setKeyRevealed(v => !v)}
                style={{
                  fontSize: 11, fontWeight: 600, color: T.mutedColor,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
                title={keyRevealed ? 'Hide key' : 'Show full key'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}>
                  {keyRevealed
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  }
                </svg>
                {keyRevealed ? 'Hide' : 'Show'}
              </button>
            )}
          </div>

          {apiKey ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={keyRevealed ? apiKey : maskedKey}
                  onClick={(e) => keyRevealed && (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1, minWidth: 0,
                    fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
                    padding: '10px 14px', borderRadius: 10,
                    background: theme === 'light' ? '#ffffff' : 'rgba(0,0,0,0.25)',
                    border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.12)',
                    color: T.titleColor, outline: 'none',
                    letterSpacing: keyRevealed ? 'normal' : '0.08em',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyKey}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 14px', borderRadius: 10,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: 'none',
                    background: keyCopied
                      ? (theme === 'light' ? '#d1fae5' : 'rgba(34,197,94,0.18)')
                      : T.primaryBg,
                    color: keyCopied
                      ? (theme === 'light' ? '#047857' : '#4ade80')
                      : T.primaryTextColor,
                    transition: 'all 150ms',
                    flexShrink: 0,
                  }}
                >
                  {keyCopied ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={13} height={13}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={13} height={13}>
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
              {onRegenerateKey && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 11, color: T.mutedColor, lineHeight: 1.5 }}>
                    Paste this key in the extension popup after install.
                  </p>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    style={{
                      fontSize: 11, fontWeight: 600,
                      color: regenerating ? T.disabledColor : (theme === 'light' ? '#b45309' : '#f59e0b'),
                      background: 'none', border: 'none', padding: 0,
                      cursor: regenerating ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}
                      style={{ animation: regenerating ? 'gm-spin 1s linear infinite' : 'none' }}>
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    {regenerating ? 'Regenerating…' : 'Regenerate key'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: T.mutedColor, lineHeight: 1.5 }}>
                Generate an API key to connect the browser extension to your account.
              </p>
              {onGenerateKey && (
                <button
                  type="button"
                  onClick={() => onGenerateKey()}
                  disabled={regenerating}
                  style={{
                    padding: '10px 20px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                    border: 'none',
                    background: regenerating ? T.disabledBg : T.primaryBg,
                    color: regenerating ? T.disabledColor : T.primaryTextColor,
                    cursor: regenerating ? 'wait' : 'pointer',
                    boxShadow: regenerating ? 'none' : T.primaryShadow,
                    transition: 'all 200ms',
                  }}
                >
                  {regenerating ? 'Generating…' : 'Generate API Key'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Install steps — collapsible */}
      {showSteps && expanded && (
        <div style={{
          borderTop: T.borderSubtle,
          padding: '18px 22px 22px 86px',
          fontSize: 12.5, color: T.bodyColor, lineHeight: 1.7,
          animation: 'gm-step-in 250ms ease-out',
        }}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {([
              <>Click <strong style={{ color: T.titleColor }}>Download .zip</strong> above and save the file to your computer.</>,
              <>Unzip it into a folder you&apos;ll keep (e.g. <code style={{ background: T.codeBg, color: T.codeColor, padding: '2px 7px', borderRadius: 5, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}>~/GetMention</code>).</>,
              <>Open <code style={{ background: T.codeBg, color: T.codeColor, padding: '2px 7px', borderRadius: 5, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}>chrome://extensions</code> in a new Chrome tab.</>,
              <>Turn on <strong style={{ color: T.titleColor }}>Developer mode</strong> using the toggle in the top-right corner.</>,
              <>Click <strong style={{ color: T.titleColor }}>Load unpacked</strong> and select the folder you just unzipped.</>,
              apiKey
                ? <>Click the GetMention icon in Chrome&apos;s toolbar and paste your API key (use <strong style={{ color: T.titleColor }}>Copy API key</strong> above).</>
                : <>Click the GetMention icon in Chrome&apos;s toolbar and paste your API key from <a href="/dashboard/settings" style={{ color: T.linkColor, fontWeight: 600, textDecoration: 'none' }}>Settings</a>.</>,
              <>Log into each platform you want the bot to use (Facebook, X, Reddit, Quora, Pinterest, Skool) in normal Chrome tabs.</>,
              <>Keep Chrome running — the bot works while Chrome is open, even minimized or behind other windows.</>,
            ] as React.ReactNode[]).map((text, i) => (
              <li key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10,
                animation: `gm-fade-up 350ms ease ${i * 50}ms both`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                  background: T.stepBg, border: T.stepBorder,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: T.stepColor,
                }}>
                  {i + 1}
                </div>
                <span style={{ paddingTop: 2 }}>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <style>{`
        @keyframes gm-icon-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${T.iconColor}30; }
          50%      { box-shadow: 0 0 0 6px ${T.iconColor}00; }
        }
        @keyframes gm-spin { to { transform: rotate(360deg); } }
        @keyframes gm-step-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gm-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
