'use client';

import { useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  { id: 1, label: 'Welcome', desc: 'Get started' },
  { id: 2, label: 'Company', desc: 'Brand details' },
  { id: 3, label: 'Platforms', desc: 'Connect channels' },
  { id: 4, label: 'Keywords', desc: 'Target topics' },
  { id: 5, label: 'All done!', desc: 'Launch' },
];

const AVAILABLE_PLATFORMS = [
  { id: 'twitter', name: 'Twitter / X', color: 'var(--twitter)', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', mockPost: 'Looking for the best tool for...', mockAuthor: '@marketer_pro' },
  { id: 'reddit', name: 'Reddit', color: 'var(--reddit)', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.65 0-6.63-2.07-6.63-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.22 9.57 9.97 9 11.88 9l1.39-4.35.03-.01 2.84.67c.23-.53.75-.9 1.36-.9.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5c-.62 0-1.15-.38-1.38-.92l-2.3-.54-1.11 3.49c1.85.04 3.55.6 4.98 1.56.36-.33.84-.53 1.36-.53 1.1 0 2 .9 2 2 0 .78-.45 1.45-1.1 1.78zM8.5 12c-.83 0-1.5.67-1.5 1.5S7.67 15 8.5 15s1.5-.67 1.5-1.5S9.33 12 8.5 12zm7 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm-3.5 5.5c-1.38 0-2.63-.56-3.54-1.47.18.05.37.07.56.07h5.96c.19 0 .38-.02.56-.07-.91.91-2.16 1.47-3.54 1.47z', mockPost: 'r/marketing · What do you recommend for...', mockAuthor: 'u/growth_hacker' },
  { id: 'facebook', name: 'Facebook', color: 'var(--facebook)', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z', mockPost: 'Anyone tried a good solution for...', mockAuthor: 'Sarah M.' },
  { id: 'quora', name: 'Quora', color: 'var(--quora)', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.36-.44 4.78-1.22l-1.5-2.08c-.96.42-2.02.65-3.13.65-4.14 0-7.5-3.36-7.5-7.5s3.36-7.5 7.5-7.5 7.5 3.36 7.5 7.5c0 1.47-.42 2.84-1.15 4l1.62 2.25C20.82 16.47 22 14.35 22 12c0-5.52-4.48-10-10-10z', mockPost: 'What is the best approach for...', mockAuthor: 'Tech Enthusiast' },
  { id: 'youtube', name: 'YouTube', color: 'var(--youtube)', icon: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z', mockPost: 'Review: Top tools for growing your...', mockAuthor: 'TechReviews' },
  { id: 'pinterest', name: 'Pinterest', color: 'var(--pinterest)', icon: 'M12 0a12 12 0 0 0-4.373 23.178c-.07-.633-.133-1.604.028-2.295.145-.624.938-3.977.938-3.977s-.239-.479-.239-1.187c0-1.113.645-1.943 1.448-1.943.683 0 1.012.512 1.012 1.127 0 .687-.437 1.712-.663 2.663-.188.796.4 1.446 1.185 1.446 1.422 0 2.515-1.5 2.515-3.664 0-1.915-1.377-3.254-3.342-3.254-2.276 0-3.612 1.707-3.612 3.471 0 .688.265 1.425.595 1.826a.24.24 0 0 1 .056.23c-.061.252-.196.796-.222.907-.035.146-.116.177-.268.107-1-.465-1.624-1.926-1.624-3.1 0-2.523 1.834-4.84 5.286-4.84 2.775 0 4.932 1.977 4.932 4.62 0 2.757-1.739 4.976-4.151 4.976-.811 0-1.573-.421-1.834-.919l-.498 1.902c-.181.695-.669 1.566-.995 2.097A12 12 0 1 0 12 0z', mockPost: 'Pin: Best tips for boosting your...', mockAuthor: 'DesignInspo' },
];

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 10, padding: '11px 14px',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  transition: 'border-color 160ms, box-shadow 160ms',
};

function focusIn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'rgba(14,165,233,0.6)';
  e.target.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.12)';
}
function focusOut(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'rgba(255,255,255,0.09)';
  e.target.style.boxShadow = 'none';
}

/* Social feed card wrapper */
function FeedCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-elevated)',
      overflow: 'hidden',
    }}>
      {/* Card header — social post style */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0,
        }}>G</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>GetMention</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Just now</div>
        </div>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="var(--text-muted)">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </div>

      {/* Card body */}
      <div style={{ padding: '28px 24px' }}>
        {children}
      </div>

      {/* Card footer — decorative social actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24,
        padding: '12px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {[
          { label: 'Like', path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
          { label: 'Reply', path: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
          { label: 'Share', path: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13' },
        ].map(a => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d={a.path}/>
            </svg>
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [direction, setDirection] = useState<'right' | 'left'>('right');

  // Form state
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedOk, setExtractedOk] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [promptTemplate, setPromptTemplate] = useState('');

  async function extractFromWebsite() {
    const url = websiteUrl.trim();
    if (!url) return;
    setExtracting(true);
    setExtractError('');
    setExtractedOk(false);
    try {
      const res = await fetch('/api/extract-company-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error || 'Could not extract info from website');
      } else {
        if (data.companyName) setCompanyName(data.companyName);
        if (data.companyDescription) setCompanyDescription(data.companyDescription);
        setExtractedOk(true);
      }
    } catch {
      setExtractError('Failed to reach the website. Please fill in manually.');
    } finally {
      setExtracting(false);
    }
  }

  function addKeyword(raw: string) {
    const kw = raw.trim();
    if (kw && !keywords.includes(kw)) setKeywords(prev => [...prev, kw]);
    setKeywordInput('');
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(keywordInput);
    }
  }

  const FAKE_NAMES = /^(xyz|test|abc|foo|bar|company|mycompany|acme|demo|example|asdf|qwerty|placeholder|unknown|n\/a|na|tbd|none)$/i;

  function canProceed() {
    if (step === 2) {
      const name = companyName.trim();
      if (!name || !companyDescription.trim()) return false;
      if (name.length < 2 || FAKE_NAMES.test(name)) return false;
      return true;
    }
    if (step === 3) return selectedPlatforms.length > 0;
    return true;
  }

  function step2Warning(): string {
    const name = companyName.trim();
    if (!name) return '';
    if (name.length < 2) return 'Company name is too short.';
    if (FAKE_NAMES.test(name)) return 'Please enter your real company name — generic names produce poor AI replies.';
    return '';
  }

  function togglePlatform(id: string) {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function goNext() {
    setDirection('right');
    setStep(step + 1);
  }

  function goBack() {
    setDirection('left');
    setStep(step - 1);
  }

  async function handleFinish() {
    if (keywords.length === 0) {
      setError('Add at least one keyword so the bot knows what to search for.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, companyDescription, keywords, promptTemplate, platforms: selectedPlatforms }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setDirection('right');
      setStep(5);
    } catch {
      setError('Something went wrong, please try again.');
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    setDone(true);
    window.location.replace('/dashboard/accounts');
  }

  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  const companyInitial = companyName.trim() ? companyName.trim()[0].toUpperCase() : '?';
  const previewKeyword = keywords.length > 0 ? keywords[keywords.length - 1] : 'your keyword';
  const previewPlatform = selectedPlatforms.length > 0 ? selectedPlatforms[0] : 'twitter';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(14,165,233,0.08) 0%, transparent 60%)',
    }}>

      {/* ── Top progress bar ─────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,14,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Gradient progress line */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, #0ea5e9, #0ea5e9, #10b981)',
            transition: 'width 400ms ease',
          }} />
        </div>
        {/* Step dots */}
        <div style={{
          maxWidth: 640, margin: '0 auto',
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {STEPS.map((s, i) => {
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: isDone ? 'var(--accent)' : isActive ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${isDone ? 'var(--accent)' : isActive ? 'rgba(14,165,233,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: isDone || isActive ? 'white' : 'var(--text-muted)',
                  transition: 'all 250ms',
                }}>
                  {isDone ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} width={11} height={11}>
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                  ) : s.id}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
                  transition: 'color 200ms',
                  display: i === 0 || i === STEPS.length - 1 || isActive ? 'inline' : 'none',
                }}>
                  {s.label}
                </span>
                {/* connector line */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    display: 'none',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────── */}
      <div style={{
        maxWidth: 640, margin: '0 auto',
        padding: '32px 20px 60px',
      }}>
        <div key={step} style={{
          animation: `${direction === 'right' ? 'slideRight' : 'slideLeft'} 300ms ease forwards`,
        }}>

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <FeedCard>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
                <h1 style={{
                  color: 'var(--text-primary)', fontSize: 26, fontWeight: 700,
                  margin: 0, letterSpacing: '-0.5px',
                }}>
                  Start getting mentioned
                </h1>
                <p style={{
                  color: 'var(--text-secondary)', fontSize: 14.5, lineHeight: 1.65,
                  maxWidth: 420, margin: 0,
                }}>
                  Set up your AI engagement bot in 2 minutes. We'll craft authentic replies across social platforms that naturally mention your brand.
                </p>

                {/* Glass stat pills */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { label: '6 Platforms', icon: '◎' },
                    { label: 'AI Replies', icon: '✦' },
                    { label: '2 min setup', icon: '⚡' },
                  ].map(pill => (
                    <div key={pill.label} style={{
                      padding: '10px 20px',
                      background: 'rgba(14,165,233,0.06)',
                      border: '1px solid rgba(14,165,233,0.15)',
                      borderRadius: 28,
                      backdropFilter: 'blur(8px)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13.5, fontWeight: 600,
                      color: 'var(--accent)',
                    }}>
                      <span style={{ fontSize: 15 }}>{pill.icon}</span>
                      {pill.label}
                    </div>
                  ))}
                </div>

                {/* Platform icons row */}
                <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                  {AVAILABLE_PLATFORMS.map((p, i) => (
                    <div key={p.id} style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: `float 3s ease-in-out ${i * 0.3}s infinite`,
                    }}>
                      <svg viewBox="0 0 24 24" width={16} height={16} fill={p.color}>
                        <path d={p.icon}/>
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            </FeedCard>
          )}

          {/* ── Step 2: Company Info ── */}
          {step === 2 && (
            <FeedCard>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Compose-style header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: companyName.trim()
                      ? 'linear-gradient(135deg, #0ea5e9, #38bdf8)'
                      : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${companyName.trim() ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 700, color: 'white',
                    transition: 'all 300ms',
                  }}>
                    {companyInitial}
                  </div>
                  <div>
                    <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                      Compose your brand
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: 0 }}>
                      The AI uses this to write authentic mentions
                    </p>
                  </div>
                </div>

                {/* ── Website URL auto-fill ── */}
                <div style={{
                  background: extractedOk ? 'rgba(52,211,153,0.05)' : 'rgba(14,165,233,0.04)',
                  border: `1px solid ${extractedOk ? 'rgba(52,211,153,0.2)' : 'rgba(14,165,233,0.15)'}`,
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 7 }}>
                    {extractedOk ? '✓ Info extracted from website' : 'Auto-fill from your website'}
                  </label>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.5 }}>
                    {extractedOk
                      ? 'Company name and description were filled automatically. Review and edit below.'
                      : 'Enter your website URL and we\'ll extract your company info automatically.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="url"
                      value={websiteUrl}
                      onChange={e => { setWebsiteUrl(e.target.value); setExtractedOk(false); setExtractError(''); }}
                      onKeyDown={e => e.key === 'Enter' && extractFromWebsite()}
                      placeholder="https://yourcompany.com"
                      style={{ ...inputBase, flex: 1 }}
                      onFocus={focusIn}
                      onBlur={focusOut}
                      disabled={extracting}
                    />
                    <button
                      type="button"
                      onClick={extractFromWebsite}
                      disabled={extracting || !websiteUrl.trim()}
                      style={{
                        padding: '0 18px',
                        background: extracting ? 'rgba(14,165,233,0.3)' : 'var(--accent)',
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 13, fontWeight: 600, cursor: extracting || !websiteUrl.trim() ? 'not-allowed' : 'pointer',
                        opacity: !websiteUrl.trim() ? 0.5 : 1,
                        whiteSpace: 'nowrap', minWidth: 90,
                        transition: 'all 160ms',
                      }}
                    >
                      {extracting ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg style={{ animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                          Scanning…
                        </span>
                      ) : extractedOk ? '✓ Re-scan' : 'Auto-fill'}
                    </button>
                  </div>
                  {extractError && (
                    <p style={{ color: '#f87171', fontSize: 12, marginTop: 8, marginBottom: 0 }}>{extractError}</p>
                  )}
                </div>

                {/* Company name as display name */}
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 7 }}>
                    Company name <span style={{ color: '#f87171', fontWeight: 700, textTransform: 'none' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g. SerpBays — use your real company name"
                    style={inputBase}
                    autoFocus
                    onFocus={focusIn}
                    onBlur={focusOut}
                  />
                  {step2Warning() ? (
                    <p style={{ color: '#fb923c', fontSize: 12, marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      {step2Warning()}
                    </p>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
                      Use your real company name — generic names like &quot;xyz&quot; or &quot;test&quot; produce poor AI replies.
                    </p>
                  )}
                </div>

                {/* Description as post body */}
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 7 }}>
                    What does your company do? <span style={{ color: '#f87171', fontWeight: 700, textTransform: 'none' }}>*</span>
                  </label>
                  <textarea
                    value={companyDescription}
                    onChange={e => setCompanyDescription(e.target.value)}
                    placeholder="e.g. SerpBays is an SEO link-building platform that helps agencies and freelancers get high-quality backlinks through guest posts and niche edits."
                    rows={5}
                    style={{ ...inputBase, resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
                    onFocus={focusIn}
                    onBlur={focusOut}
                  />
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                    Be specific — mention your niche, audience, and what sets you apart. The AI uses this to write authentic mentions.
                  </p>
                </div>

              </div>
            </FeedCard>
          )}

          {/* ── Step 3: Platforms ── */}
          {step === 3 && (
            <FeedCard>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                    Where should we engage?
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: 0 }}>
                    Pick the platforms where your audience hangs out
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {AVAILABLE_PLATFORMS.map(p => {
                    const isSelected = selectedPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        style={{
                          position: 'relative',
                          display: 'flex', flexDirection: 'column', gap: 8,
                          padding: '14px 14px 12px',
                          background: isSelected ? `rgba(255,255,255,0.04)` : 'rgba(255,255,255,0.02)',
                          border: `1.5px solid ${isSelected ? p.color : 'rgba(255,255,255,0.07)'}`,
                          borderRadius: 14,
                          cursor: 'pointer',
                          transition: 'all 200ms',
                          textAlign: 'left',
                          boxShadow: isSelected ? `0 0 20px ${p.color}22, 0 0 40px ${p.color}11` : 'none',
                        }}
                      >
                        {/* Checkmark badge */}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: p.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'fadeIn 200ms ease',
                          }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} width={12} height={12}>
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          </div>
                        )}

                        {/* Platform header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <svg viewBox="0 0 24 24" width={16} height={16}
                            fill={isSelected ? p.color : 'var(--text-muted)'}
                            style={{ transition: 'fill 200ms', flexShrink: 0 }}
                          >
                            <path d={p.icon}/>
                          </svg>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            transition: 'color 150ms',
                          }}>
                            {p.name}
                          </span>
                        </div>

                        {/* Mock post snippet */}
                        <div style={{
                          fontSize: 11.5, lineHeight: 1.4,
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 8,
                          borderLeft: `2px solid ${isSelected ? p.color : 'rgba(255,255,255,0.06)'}`,
                          transition: 'border-color 200ms',
                        }}>
                          <span style={{ fontSize: 10, opacity: 0.7 }}>{p.mockAuthor}</span>
                          <br/>
                          {p.mockPost}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0, textAlign: 'center' }}>
                  Select at least one platform. Connect accounts later from the Accounts page.
                </p>
              </div>
            </FeedCard>
          )}

          {/* ── Step 4: Keywords & Prompt ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FeedCard>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                      What should we search for?
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: 0 }}>
                      Add keywords the bot uses to find relevant posts to reply to
                    </p>
                  </div>

                  {/* Search-bar styled keyword input */}
                  <div>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 12, padding: '10px 14px',
                      minHeight: 52,
                      display: 'flex', flexDirection: 'column', gap: 8,
                      transition: 'border-color 160ms, box-shadow 160ms',
                    }}
                      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="var(--text-muted)" strokeWidth={2} style={{ flexShrink: 0 }}>
                          <circle cx="11" cy="11" r="8"/>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                          type="text"
                          value={keywordInput}
                          onChange={e => setKeywordInput(e.target.value)}
                          onKeyDown={handleKeywordKeyDown}
                          onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
                          placeholder={keywords.length === 0 ? 'Type a keyword and press Enter...' : 'Add another keyword...'}
                          style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            color: 'var(--text-primary)', fontSize: 14,
                            width: '100%', padding: '2px 0',
                          }}
                        />
                      </div>
                      {keywords.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {keywords.map(kw => (
                            <span key={kw} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '5px 10px',
                              background: 'rgba(14,165,233,0.15)',
                              border: '1px solid rgba(14,165,233,0.3)',
                              borderRadius: 20, fontSize: 12.5, fontWeight: 500,
                              color: 'var(--accent)',
                            }}>
                              {kw}
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setKeywords(prev => prev.filter(k => k !== kw)); }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: 'rgba(14,165,233,0.7)', padding: 0, lineHeight: 1,
                                  fontSize: 15, display: 'flex', alignItems: 'center',
                                }}
                                aria-label={`Remove ${kw}`}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                      Press Enter or comma after each. e.g. "link building", "SEO tools"
                    </p>
                  </div>

                  {/* Tone of voice / Custom prompt */}
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 7 }}>
                      Tone of voice{' '}
                      <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 11 }}>(optional)</span>
                    </label>
                    <textarea
                      value={promptTemplate}
                      onChange={e => setPromptTemplate(e.target.value)}
                      placeholder="Leave blank for default. Or try: 'Always mention our 30-day free trial. Keep replies concise and friendly.'"
                      rows={3}
                      style={{ ...inputBase, resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
                      onFocus={focusIn}
                      onBlur={focusOut}
                    />
                  </div>

                  {error && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(248,113,113,0.08)',
                      border: '1px solid rgba(248,113,113,0.22)',
                      borderRadius: 9, padding: '10px 14px',
                      color: '#f87171', fontSize: 13,
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {error}
                    </div>
                  )}
                </div>
              </FeedCard>

              {/* Live mock preview */}
              {keywords.length > 0 && (
                <div style={{ animation: 'fadeIn 300ms ease' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, paddingLeft: 4 }}>
                    Live preview
                  </p>
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 16,
                    overflow: 'hidden',
                  }}>
                    {/* Fake post */}
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: 'var(--text-muted)',
                        }}>U</div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Someone on {previewPlatform}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· 2h ago</span>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                        Looking for recommendations on <strong style={{ color: 'var(--accent)' }}>{previewKeyword}</strong>. Has anyone found a good solution?
                      </p>
                    </div>
                    {/* AI reply */}
                    <div style={{ padding: '14px 18px', background: 'rgba(14,165,233,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'white',
                        }}>{companyInitial}</div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                          {companyName.trim() || 'Your Brand'} · AI Reply
                        </span>
                        <span style={{
                          fontSize: 10, padding: '2px 6px',
                          background: 'rgba(14,165,233,0.15)',
                          borderRadius: 10, color: 'var(--accent)',
                        }}>AI</span>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                        Great question! We've been working on exactly this at <strong style={{ color: 'var(--text-primary)' }}>{companyName.trim() || 'Your Brand'}</strong>. For <strong style={{ color: 'var(--accent)' }}>{previewKeyword}</strong>, our platform offers...
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 5 && (
            <FeedCard>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
                {/* Success notification style */}
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'rgba(52,211,153,0.12)',
                  border: '2px solid rgba(52,211,153,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'pulse-glow 2s ease-in-out infinite',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.5} width={32} height={32}>
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                </div>

                <div>
                  <h2 style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                    You're all set!
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                    Your AI engagement bot is configured and ready to go. Here's what's coming:
                  </p>
                </div>

                {/* Next steps guide */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>
                    Next steps to start auto-commenting
                  </div>
                  {[
                    { num: 1, title: 'Connect your social accounts', desc: 'Paste browser cookies for platforms you want to post on', color: '#0ea5e9' },
                    { num: 2, title: 'Review your settings', desc: 'Adjust daily limits, AI confidence, and posting schedule', color: '#8b5cf6' },
                    { num: 3, title: 'Run your first pipeline', desc: 'Find relevant posts and generate AI replies automatically', color: '#10b981' },
                  ].map((item, i) => (
                    <div key={item.num} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      animation: `fadeIn 400ms ease ${i * 150}ms both`,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: `${item.color}18`, border: `1.5px solid ${item.color}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: item.color, flexShrink: 0,
                      }}>
                        {item.num}
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FeedCard>
          )}

          {/* ── Navigation buttons ── */}
          <div style={{
            display: 'flex',
            justifyContent: step === 1 || step === 5 ? 'center' : 'space-between',
            alignItems: 'center',
            marginTop: 24, gap: 12,
            ...(step === 5 ? { flexDirection: 'column' as const } : {}),
          }}>
            {step > 1 && step < 5 && (
              <button
                type="button"
                onClick={goBack}
                style={{
                  padding: '11px 26px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)';
                  (e.target as HTMLButtonElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
                  (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }}
              >
                ← Back
              </button>
            )}

            {step < 4 && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                style={{
                  padding: '11px 32px',
                  background: canProceed()
                    ? 'linear-gradient(135deg, #0ea5e9, #38bdf8)'
                    : 'rgba(14,165,233,0.3)',
                  border: 'none', borderRadius: 10,
                  color: 'white', fontSize: 14, fontWeight: 600,
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  boxShadow: canProceed() ? '0 4px 16px rgba(14,165,233,0.35)' : 'none',
                  transition: 'all 160ms',
                }}
              >
                Continue →
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading}
                style={{
                  padding: '11px 32px',
                  background: loading ? 'rgba(14,165,233,0.4)' : 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                  border: 'none', borderRadius: 10,
                  color: 'white', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(14,165,233,0.35)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 160ms',
                }}
              >
                {loading && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity={0.3}/>
                    <path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                )}
                {loading ? 'Saving...' : 'Finish setup →'}
              </button>
            )}

            {step === 5 && (
              <button
                type="button"
                onClick={goToDashboard}
                disabled={done}
                style={{
                  padding: '14px 48px',
                  background: 'linear-gradient(135deg, #10b981, #34d399)',
                  border: 'none', borderRadius: 12,
                  color: 'white', fontSize: 15, fontWeight: 700,
                  cursor: done ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 24px rgba(52,211,153,0.35)',
                  letterSpacing: '-0.2px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 160ms',
                }}
              >
                {done ? 'Redirecting...' : 'Connect Accounts →'}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
