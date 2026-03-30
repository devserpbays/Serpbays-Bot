'use client';

import { useState, KeyboardEvent } from 'react';

/* ─── Data ─────────────────────────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Brand' },
  { id: 3, label: 'Platforms' },
  { id: 4, label: 'Keywords' },
  { id: 5, label: 'Done' },
];

const PLATFORMS = [
  {
    id: 'twitter', name: 'X / Twitter', color: '#000000',
    icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    desc: 'Reply to tweets mentioning your niche',
  },
  {
    id: 'reddit', name: 'Reddit', color: '#ff4500',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.65 0-6.63-2.07-6.63-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.22 9.57 9.97 9 11.88 9l1.39-4.35.03-.01 2.84.67c.23-.53.75-.9 1.36-.9.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5c-.62 0-1.15-.38-1.38-.92l-2.3-.54-1.11 3.49c1.85.04 3.55.6 4.98 1.56.36-.33.84-.53 1.36-.53 1.1 0 2 .9 2 2 0 .78-.45 1.45-1.1 1.78zM8.5 12c-.83 0-1.5.67-1.5 1.5S7.67 15 8.5 15s1.5-.67 1.5-1.5S9.33 12 8.5 12zm7 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm-3.5 5.5c-1.38 0-2.63-.56-3.54-1.47.18.05.37.07.56.07h5.96c.19 0 .38-.02.56-.07-.91.91-2.16 1.47-3.54 1.47z',
    desc: 'Comment on relevant subreddit posts',
  },
  {
    id: 'facebook', name: 'Facebook', color: '#1877f2',
    icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
    desc: 'Engage in groups and public posts',
  },
  {
    id: 'quora', name: 'Quora', color: '#b92b27',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.36-.44 4.78-1.22l-1.5-2.08c-.96.42-2.02.65-3.13.65-4.14 0-7.5-3.36-7.5-7.5s3.36-7.5 7.5-7.5 7.5 3.36 7.5 7.5c0 1.47-.42 2.84-1.15 4l1.62 2.25C20.82 16.47 22 14.35 22 12c0-5.52-4.48-10-10-10z',
    desc: 'Answer questions in your niche',
  },
  {
    id: 'youtube', name: 'YouTube', color: '#ff0000',
    icon: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    desc: 'Comment on relevant videos',
  },
  {
    id: 'pinterest', name: 'Pinterest', color: '#e60023',
    icon: 'M12 0a12 12 0 0 0-4.373 23.178c-.07-.633-.133-1.604.028-2.295.145-.624.938-3.977.938-3.977s-.239-.479-.239-1.187c0-1.113.645-1.943 1.448-1.943.683 0 1.012.512 1.012 1.127 0 .687-.437 1.712-.663 2.663-.188.796.4 1.446 1.185 1.446 1.422 0 2.515-1.5 2.515-3.664 0-1.915-1.377-3.254-3.342-3.254-2.276 0-3.612 1.707-3.612 3.471 0 .688.265 1.425.595 1.826a.24.24 0 0 1 .056.23c-.061.252-.196.796-.222.907-.035.146-.116.177-.268.107-1-.465-1.624-1.926-1.624-3.1 0-2.523 1.834-4.84 5.286-4.84 2.775 0 4.932 1.977 4.932 4.62 0 2.757-1.739 4.976-4.151 4.976-.811 0-1.573-.421-1.834-.919l-.498 1.902c-.181.695-.669 1.566-.995 2.097A12 12 0 1 0 12 0z',
    desc: 'Engage with pins in your niche',
  },
];

/* ─── Theme tokens (light) ──────────────────────────────────────────────────── */
const T = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  text: '#0f172a',
  textSec: '#475569',
  textMuted: '#94a3b8',
  accent: '#0ea5e9',
  accentHover: '#0284c7',
  accentBg: '#f0f9ff',
  accentBorder: '#bae6fd',
  green: '#10b981',
  greenBg: '#f0fdf4',
  greenBorder: '#a7f3d0',
  orange: '#f59e0b',
  red: '#ef4444',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
};

/* ─── Shared input style ────────────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#ffffff',
  border: `1.5px solid ${T.border}`,
  borderRadius: 10, padding: '10px 14px',
  color: T.text, fontSize: 14.5, outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 150ms, box-shadow 150ms',
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = T.accent;
  e.target.style.boxShadow = `0 0 0 3px ${T.accentBg}`;
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = T.border;
  e.target.style.boxShadow = 'none';
}

/* ─── Shared card ───────────────────────────────────────────────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── Section heading ───────────────────────────────────────────────────────── */
function StepHeading({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: T.accentBg, border: `1px solid ${T.accentBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>{icon}</div>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.4px' }}>
          {title}
        </h2>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: T.textSec }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

/* ─── Label ─────────────────────────────────────────────────────────────────── */
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'block', fontSize: 13, fontWeight: 600,
      color: T.textSec, marginBottom: 6, letterSpacing: '-0.1px',
    }}>
      {children}
      {required && <span style={{ color: T.red, marginLeft: 3 }}>*</span>}
    </label>
  );
}

/* ─── Hint text ─────────────────────────────────────────────────────────────── */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '5px 0 0', fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════════════════*/
export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Step 2
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractOk, setExtractOk] = useState(false);
  const [extractErr, setExtractErr] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyDesc, setCompanyDesc] = useState('');

  // Step 3
  const [platforms, setPlatforms] = useState<string[]>([]);

  // Step 4
  const [kwInput, setKwInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [promptTemplate, setPromptTemplate] = useState('');

  /* helpers */
  async function extractWebsite() {
    const url = websiteUrl.trim();
    if (!url) return;
    setExtracting(true); setExtractErr(''); setExtractOk(false);
    try {
      const res = await fetch('/api/extract-company-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) { setExtractErr(data.error || 'Could not extract info'); }
      else {
        if (data.companyName) setCompanyName(data.companyName);
        if (data.companyDescription) setCompanyDesc(data.companyDescription);
        setExtractOk(true);
      }
    } catch { setExtractErr('Could not reach that URL. Fill in manually.'); }
    finally { setExtracting(false); }
  }

  function addKeyword(raw: string) {
    const kw = raw.trim();
    if (kw && !keywords.includes(kw)) setKeywords(p => [...p, kw]);
    setKwInput('');
  }
  function handleKwKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwInput); }
  }

  const FAKE = /^(xyz|test|abc|foo|bar|company|mycompany|acme|demo|example|asdf|qwerty|placeholder|unknown|n\/a|na|tbd|none)$/i;
  function nameWarning() {
    const n = companyName.trim();
    if (!n) return '';
    if (n.length < 2) return 'Name is too short.';
    if (FAKE.test(n)) return 'Use your real company name for better AI replies.';
    return '';
  }

  function canProceed() {
    if (step === 2) {
      const n = companyName.trim();
      return !!n && !!companyDesc.trim() && n.length >= 2 && !FAKE.test(n);
    }
    if (step === 3) return platforms.length > 0;
    return true;
  }

  function goNext() { setDir('fwd'); setStep(s => s + 1); }
  function back() { setDir('back'); setStep(s => s - 1); }

  async function finish() {
    if (keywords.length === 0) { setError('Add at least one keyword so the bot knows what to find.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/complete-onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, companyDescription: companyDesc, keywords, promptTemplate, platforms }),
      });
      if (!res.ok) throw new Error('Failed');
      setDir('fwd'); setStep(5);
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  }

  function toDashboard() { setDone(true); window.location.replace('/dashboard/accounts'); }

  const initial = companyName.trim() ? companyName.trim()[0].toUpperCase() : '?';
  const previewKw = keywords[keywords.length - 1] || 'your keyword';
  const previewPlatform = platforms[0] || 'twitter';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Sticky top bar with progress ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Thin progress line */}
        <div style={{ height: 3, background: T.borderLight }}>
          <div style={{
            height: '100%',
            width: `${Math.round(((step - 1) / (STEPS.length - 1)) * 100)}%`,
            background: `linear-gradient(90deg, ${T.accent}, ${T.green})`,
            transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        {/* Step indicators */}
        <div style={{
          maxWidth: 580, margin: '0 auto', padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          {/* connector line behind dots */}
          <div style={{
            position: 'absolute', left: 40, right: 40, top: '50%',
            height: 1, background: T.border, transform: 'translateY(-50%)', zIndex: 0,
          }} />

          {STEPS.map((s) => {
            const active = step === s.id;
            const done2 = step > s.id;
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11.5, fontWeight: 700,
                  background: done2 ? T.accent : active ? T.accent : T.card,
                  border: `2px solid ${done2 ? T.accent : active ? T.accent : T.border}`,
                  color: done2 || active ? '#fff' : T.textMuted,
                  boxShadow: active ? `0 0 0 4px ${T.accentBg}` : 'none',
                  transition: 'all 300ms',
                }}>
                  {done2
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} width={12} height={12}><polyline points="20,6 9,17 4,12"/></svg>
                    : s.id}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: active ? 600 : 400,
                  color: active ? T.accent : done2 ? T.textSec : T.textMuted,
                  transition: 'color 200ms', whiteSpace: 'nowrap',
                }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '36px 20px 80px' }}>
        <div key={step} style={{
          animation: `${dir === 'fwd' ? 'stepIn' : 'stepInBack'} 320ms cubic-bezier(0.4,0,0.2,1) both`,
        }}>

          {/* ════════ Step 1: Welcome ════════ */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Card>
                <div style={{ padding: '40px 32px 36px', textAlign: 'center' }}>
                  {/* Brand mark */}
                  <div style={{
                    width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px',
                    background: `linear-gradient(135deg, ${T.accent}, #38bdf8)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 8px 24px rgba(14,165,233,0.25)`,
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} width={30} height={30}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>

                  <h1 style={{
                    margin: '0 0 10px', fontSize: 28, fontWeight: 800,
                    color: T.text, letterSpacing: '-0.7px', lineHeight: 1.2,
                  }}>
                    Start getting mentioned
                  </h1>
                  <p style={{
                    margin: '0 auto 28px', maxWidth: 400,
                    fontSize: 15, color: T.textSec, lineHeight: 1.65,
                  }}>
                    Your AI engagement bot watches social media 24/7, finds relevant conversations, and replies with authentic mentions of your brand.
                  </p>

                  {/* Feature pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
                    {[
                      { icon: '◎', label: '6 Platforms' },
                      { icon: '✦', label: 'AI-crafted replies' },
                      { icon: '⚡', label: '2-minute setup' },
                      { icon: '🛡', label: 'Anti-ban protection' },
                    ].map(p => (
                      <div key={p.label} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 30,
                        background: T.accentBg, border: `1px solid ${T.accentBorder}`,
                        fontSize: 13, fontWeight: 600, color: T.accent,
                      }}>
                        <span>{p.icon}</span> {p.label}
                      </div>
                    ))}
                  </div>

                  {/* Platform icon row */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
                    {PLATFORMS.map((p, i) => (
                      <div key={p.id} style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: T.card, border: `1.5px solid ${T.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        animation: `float 3.5s ease-in-out ${i * 0.25}s infinite`,
                      }}>
                        <svg viewBox="0 0 24 24" width={18} height={18} fill={p.color}><path d={p.icon}/></svg>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* How it works strip */}
              <Card>
                <div style={{ padding: '20px 24px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textMuted }}>
                    How it works
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {[
                      { num: '1', color: T.accent, title: 'Searches for relevant posts', sub: 'Scans platforms using your keywords every 15 minutes' },
                      { num: '2', color: '#8b5cf6', title: 'AI scores & writes a reply', sub: 'GPT-4 crafts an authentic comment that naturally mentions your brand' },
                      { num: '3', color: T.green, title: 'Posts and logs results', sub: 'Replies automatically — you see every action in the dashboard' },
                    ].map((item, i) => (
                      <div key={item.num} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        padding: '12px 0',
                        borderBottom: i < 2 ? `1px dashed ${T.borderLight}` : 'none',
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                          background: `${item.color}15`, border: `1.5px solid ${item.color}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: item.color,
                        }}>{item.num}</div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{item.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ════════ Step 2: Brand ════════ */}
          {step === 2 && (
            <Card>
              <div style={{ padding: '32px 28px' }}>
                <StepHeading icon="🏢" title="Tell us about your brand" sub="The AI uses this to craft authentic, on-brand replies" />

                {/* Website auto-fill */}
                <div style={{
                  background: extractOk ? T.greenBg : T.accentBg,
                  border: `1.5px solid ${extractOk ? T.greenBorder : T.accentBorder}`,
                  borderRadius: 14, padding: '16px 18px', marginBottom: 20,
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 600, color: extractOk ? T.green : T.accent }}>
                    {extractOk ? '✓ Info auto-filled from your website' : '⚡ Auto-fill from your website'}
                  </p>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: T.textSec, lineHeight: 1.5 }}>
                    {extractOk
                      ? 'Review and adjust the fields below if needed.'
                      : 'Paste your URL and we\'ll extract your company info automatically.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="url" value={websiteUrl}
                      onChange={e => { setWebsiteUrl(e.target.value); setExtractOk(false); setExtractErr(''); }}
                      onKeyDown={e => e.key === 'Enter' && extractWebsite()}
                      placeholder="https://yourcompany.com"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={onFocus} onBlur={onBlur} disabled={extracting}
                    />
                    <button type="button" onClick={extractWebsite}
                      disabled={extracting || !websiteUrl.trim()}
                      style={{
                        padding: '0 18px', height: 42, whiteSpace: 'nowrap',
                        background: extracting ? T.accentBorder : T.accent,
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 13, fontWeight: 600, cursor: extracting || !websiteUrl.trim() ? 'not-allowed' : 'pointer',
                        opacity: !websiteUrl.trim() ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'all 150ms',
                      }}
                    >
                      {extracting
                        ? <><svg style={{ animation: 'spin 0.9s linear infinite' }} viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="white" strokeWidth={2.5}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Scanning</>
                        : extractOk ? '↻ Re-scan' : 'Auto-fill'}
                    </button>
                  </div>
                  {extractErr && <p style={{ margin: '7px 0 0', fontSize: 12, color: T.red }}>{extractErr}</p>}
                </div>

                {/* Company name */}
                <div style={{ marginBottom: 18 }}>
                  <Label required>Company name</Label>
                  <div style={{ position: 'relative' }}>
                    {companyName.trim() && (
                      <div style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        width: 26, height: 26, borderRadius: 8,
                        background: `linear-gradient(135deg, ${T.accent}, #38bdf8)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: 'white', pointerEvents: 'none',
                      }}>{initial}</div>
                    )}
                    <input
                      type="text" value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme — use your real company name"
                      style={{ ...inputStyle, paddingLeft: companyName.trim() ? 46 : 14 }}
                      autoFocus onFocus={onFocus} onBlur={onBlur}
                    />
                  </div>
                  {nameWarning()
                    ? <p style={{ margin: '5px 0 0', fontSize: 12, color: T.orange, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {nameWarning()}
                      </p>
                    : <Hint>Use your real brand name — generic names produce poor AI replies.</Hint>
                  }
                </div>

                {/* Description */}
                <div>
                  <Label required>What does your company do?</Label>
                  <textarea
                    value={companyDesc}
                    onChange={e => setCompanyDesc(e.target.value)}
                    placeholder="e.g. Acme is an SEO platform that helps agencies build high-quality backlinks through guest posts and niche edits. We serve 500+ agencies globally."
                    rows={5}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                    onFocus={onFocus} onBlur={onBlur}
                  />
                  <Hint>Be specific — mention your niche, audience, and what sets you apart. The more detail, the better the AI replies.</Hint>
                </div>
              </div>
            </Card>
          )}

          {/* ════════ Step 3: Platforms ════════ */}
          {step === 3 && (
            <Card>
              <div style={{ padding: '32px 28px' }}>
                <StepHeading icon="🌐" title="Where should we engage?" sub="Pick the platforms where your audience spends time" />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {PLATFORMS.map(p => {
                    const sel = platforms.includes(p.id);
                    return (
                      <button
                        key={p.id} type="button"
                        onClick={() => setPlatforms(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        style={{
                          position: 'relative', display: 'flex', flexDirection: 'column',
                          gap: 8, padding: '14px', textAlign: 'left',
                          background: sel ? `${p.color}08` : T.card,
                          border: `2px solid ${sel ? p.color : T.border}`,
                          borderRadius: 14, cursor: 'pointer',
                          boxShadow: sel ? `0 0 0 3px ${p.color}18` : 'none',
                          transition: 'all 200ms',
                        }}
                        onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; }}
                        onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                      >
                        {/* Checkmark */}
                        {sel && (
                          <div style={{
                            position: 'absolute', top: -8, right: -8,
                            width: 22, height: 22, borderRadius: '50%',
                            background: p.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'popIn 200ms cubic-bezier(0.34,1.56,0.64,1)',
                            boxShadow: `0 2px 8px ${p.color}50`,
                          }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} width={11} height={11}><polyline points="20,6 9,17 4,12"/></svg>
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            background: sel ? `${p.color}15` : '#f8fafc',
                            border: `1px solid ${sel ? `${p.color}30` : T.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 200ms',
                          }}>
                            <svg viewBox="0 0 24 24" width={16} height={16} fill={sel ? p.color : T.textMuted}>
                              <path d={p.icon}/>
                            </svg>
                          </div>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: sel ? T.text : T.textSec, transition: 'color 150ms' }}>
                            {p.name}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: 11.5, color: T.textMuted, lineHeight: 1.4, paddingLeft: 41 }}>
                          {p.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p style={{ margin: '14px 0 0', fontSize: 12, color: T.textMuted, textAlign: 'center' }}>
                  You'll connect accounts with cookies after setup — just pick your platforms for now.
                </p>
              </div>
            </Card>
          )}

          {/* ════════ Step 4: Keywords ════════ */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ padding: '32px 28px' }}>
                  <StepHeading icon="🔍" title="What topics should we watch?" sub="The bot searches these keywords to find relevant posts to reply to" />

                  {/* Tag input */}
                  <div style={{ marginBottom: 20 }}>
                    <Label required>Keywords</Label>
                    <div
                      style={{
                        background: '#fff', border: `1.5px solid ${T.border}`,
                        borderRadius: 10, padding: '10px 12px', minHeight: 56,
                        cursor: 'text', transition: 'border-color 150ms, box-shadow 150ms',
                      }}
                      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
                    >
                      {keywords.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {keywords.map(kw => (
                            <span key={kw} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '4px 10px', borderRadius: 20,
                              background: T.accentBg, border: `1px solid ${T.accentBorder}`,
                              fontSize: 12.5, fontWeight: 500, color: T.accent,
                            }}>
                              {kw}
                              <button type="button"
                                onClick={e => { e.stopPropagation(); setKeywords(p => p.filter(k => k !== kw)); }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: T.accent, padding: 0, fontSize: 16, lineHeight: 1,
                                  display: 'flex', alignItems: 'center', opacity: 0.7,
                                }}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke={T.textMuted} strokeWidth={2} style={{ flexShrink: 0 }}>
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                          type="text" value={kwInput}
                          onChange={e => setKwInput(e.target.value)}
                          onKeyDown={handleKwKey}
                          onBlur={() => kwInput.trim() && addKeyword(kwInput)}
                          placeholder={keywords.length === 0 ? 'Type a keyword and press Enter...' : 'Add another...'}
                          style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 14, width: '100%', padding: '2px 0' }}
                        />
                      </div>
                    </div>
                    <Hint>Press Enter or comma after each. e.g. "link building", "SEO tools", "rank tracker"</Hint>
                  </div>

                  {/* Custom tone */}
                  <div>
                    <Label>
                      Tone of voice{' '}
                      <span style={{ fontWeight: 400, color: T.textMuted, fontSize: 12 }}>(optional)</span>
                    </Label>
                    <textarea
                      value={promptTemplate}
                      onChange={e => setPromptTemplate(e.target.value)}
                      placeholder={`Leave blank for default. Or specify: "Keep replies under 2 sentences. Mention our 30-day free trial when relevant."`}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                      onFocus={onFocus} onBlur={onBlur}
                    />
                  </div>

                  {error && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
                      padding: '10px 14px', borderRadius: 10,
                      background: T.redBg, border: `1px solid ${T.redBorder}`,
                      color: T.red, fontSize: 13,
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {error}
                    </div>
                  )}
                </div>
              </Card>

              {/* Live preview — only when keywords added */}
              {keywords.length > 0 && (
                <div style={{ animation: 'fadeUp 280ms ease both' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted, paddingLeft: 4 }}>
                    Preview — how a reply looks
                  </p>
                  <Card>
                    {/* The original post */}
                    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.borderLight}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: T.textMuted }}>U</div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textSec }}>Someone on {previewPlatform}</span>
                        <span style={{ fontSize: 11.5, color: T.textMuted }}>· 2h ago</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, color: T.textSec, lineHeight: 1.55 }}>
                        Looking for recommendations on <strong style={{ color: T.text }}>{previewKw}</strong>. Has anyone found a good solution?
                      </p>
                    </div>
                    {/* AI reply */}
                    <div style={{ padding: '14px 18px', background: T.accentBg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #38bdf8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white' }}>{initial}</div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.accent }}>{companyName.trim() || 'Your Brand'}</span>
                        <span style={{ padding: '2px 7px', borderRadius: 10, background: T.accentBorder, fontSize: 10.5, fontWeight: 600, color: T.accent }}>AI Reply</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, color: T.textSec, lineHeight: 1.55 }}>
                        I've been using <strong style={{ color: T.text }}>{companyName.trim() || 'our platform'}</strong> for exactly this. For <strong style={{ color: T.accent }}>{previewKw}</strong>, it handles everything automatically — worth checking out.
                      </p>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ════════ Step 5: Done ════════ */}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ padding: '40px 32px 36px', textAlign: 'center' }}>
                  {/* Success ring */}
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
                    background: T.greenBg, border: `2px solid ${T.greenBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'bounceIn 500ms cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5} width={36} height={36}>
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  </div>

                  <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-0.6px' }}>
                    You&apos;re all set!
                  </h2>
                  <p style={{ margin: '0 auto', maxWidth: 380, fontSize: 14.5, color: T.textSec, lineHeight: 1.65 }}>
                    Your AI bot is configured. One last step — connect your social accounts so it can start posting.
                  </p>
                </div>
              </Card>

              {/* Summary of what was configured */}
              <Card>
                <div style={{ padding: '20px 24px' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>
                    Your configuration
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Brand', value: companyName || '—', icon: '🏢' },
                      { label: 'Platforms', value: platforms.length > 0 ? platforms.join(', ') : '—', icon: '🌐' },
                      { label: 'Keywords', value: keywords.length > 0 ? keywords.slice(0,4).join(', ') + (keywords.length > 4 ? ` +${keywords.length-4}` : '') : '—', icon: '🔍' },
                    ].map(row => (
                      <div key={row.label} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: 10, background: T.bg,
                        border: `1px solid ${T.borderLight}`,
                      }}>
                        <span style={{ fontSize: 16 }}>{row.icon}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textMuted, width: 70, flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Next steps */}
              <Card>
                <div style={{ padding: '20px 24px' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>
                    What&apos;s next
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {[
                      { num: '1', color: T.accent, title: 'Connect your social accounts', sub: 'Paste browser cookies for the platforms you selected' },
                      { num: '2', color: '#8b5cf6', title: 'Adjust your settings', sub: 'Set daily limits, posting schedule, and AI confidence threshold' },
                      { num: '3', color: T.green, title: 'Watch the bot work', sub: 'Check the Activity log — replies start appearing within 15 min' },
                    ].map((item, i) => (
                      <div key={item.num} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        padding: '12px 0',
                        borderBottom: i < 2 ? `1px dashed ${T.borderLight}` : 'none',
                        animation: `fadeUp 350ms ease ${i * 120}ms both`,
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                          background: `${item.color}15`, border: `1.5px solid ${item.color}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: item.color,
                        }}>{item.num}</div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{item.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ════════ Navigation ════════ */}
          <div style={{
            display: 'flex',
            justifyContent: step === 1 ? 'center' : step === 5 ? 'center' : 'space-between',
            alignItems: 'center', marginTop: 20, gap: 12,
          }}>
            {/* Back */}
            {step > 1 && step < 5 && (
              <button type="button" onClick={back} style={{
                padding: '11px 24px', background: T.card,
                border: `1.5px solid ${T.border}`, borderRadius: 12,
                color: T.textSec, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', transition: 'all 150ms',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#94a3b8'; (e.currentTarget as HTMLElement).style.color = T.text; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.color = T.textSec; }}
              >
                ← Back
              </button>
            )}

            {/* Next / Finish / Launch */}
            {step < 4 && (
              <button type="button" onClick={goNext} disabled={!canProceed()}
                style={{
                  padding: '12px 32px', borderRadius: 12, border: 'none',
                  background: canProceed() ? `linear-gradient(135deg, ${T.accent}, #38bdf8)` : '#cbd5e1',
                  color: 'white', fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.2px',
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  boxShadow: canProceed() ? '0 4px 16px rgba(14,165,233,0.3)' : 'none',
                  transition: 'all 200ms',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {step === 1 ? 'Get started →' : 'Continue →'}
              </button>
            )}

            {step === 4 && (
              <button type="button" onClick={finish} disabled={loading}
                style={{
                  padding: '12px 32px', borderRadius: 12, border: 'none',
                  background: loading ? '#cbd5e1' : `linear-gradient(135deg, ${T.accent}, #38bdf8)`,
                  color: 'white', fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.2px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(14,165,233,0.3)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 200ms',
                }}
              >
                {loading && <svg style={{ animation: 'spin 0.8s linear infinite' }} viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="white" strokeWidth={2.5}><circle cx="12" cy="12" r="10" strokeOpacity={0.3}/><path d="M12 2a10 10 0 0 1 10 10"/></svg>}
                {loading ? 'Saving...' : 'Finish setup →'}
              </button>
            )}

            {step === 5 && (
              <button type="button" onClick={toDashboard} disabled={done}
                style={{
                  padding: '14px 48px', borderRadius: 14, border: 'none',
                  background: `linear-gradient(135deg, ${T.green}, #34d399)`,
                  color: 'white', fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.3px',
                  cursor: done ? 'not-allowed' : 'pointer',
                  boxShadow: '0 6px 24px rgba(16,185,129,0.3)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 200ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(16,185,129,0.38)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(16,185,129,0.3)'; }}
              >
                {done ? 'Redirecting...' : '→ Connect Social Accounts'}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes stepIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes stepInBack {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes bounceIn {
          from { opacity: 0; transform: scale(0.6); }
          60%  { transform: scale(1.1); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}

