import Link from 'next/link';

const PLATFORMS = [
  { name: 'Twitter / X', color: '#a1a1aa', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg> },
  { name: 'Reddit', color: '#ff4500', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z" /></svg> },
  { name: 'Facebook', color: '#1877f2', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg> },
  { name: 'Quora', color: '#b92b27', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12.071 0C5.4 0 .001 5.4.001 12.071c0 6.248 4.759 11.41 10.85 12.003-.044-.562-.094-1.407-.094-2.001 0-.666.023-1.406.068-2.028-.447.045-.896.068-1.349.068-3.734 0-5.941-2.162-5.941-5.95 0-3.78 2.207-5.941 5.941-5.941 3.733 0 5.94 2.161 5.94 5.941 0 1.873-.509 3.374-1.407 4.38l1.047 1.986c.423.806.847 1.166 1.336 1.166.888 0 1.406-.949 1.406-2.688V12.07C17.8 6.37 15.292 0 12.071 0z" /></svg> },
  { name: 'YouTube', color: '#ff0000', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg> },
  { name: 'Pinterest', color: '#e60023', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" /></svg> },
];

const FEATURES = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    title: 'AI-Generated Replies',
    description: 'GPT-powered responses that sound natural and relevant, tailored to each post and platform context.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    title: 'Auto-Posting',
    description: 'Set a relevance threshold and let GetMention auto-post replies that score high enough — zero manual work.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
    title: 'Multi-Platform',
    description: 'One dashboard for Twitter, Reddit, Facebook, Quora, YouTube, and Pinterest. Connect once, engage everywhere.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    title: 'Smart Scheduling',
    description: 'Cron-based scheduling scrapes and posts at optimal intervals, keeping your engagement consistent 24/7.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    title: 'Activity Logs',
    description: 'Full visibility into every scrape, evaluation, and posted reply. Track performance and debug with ease.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    title: 'Safe Daily Limits',
    description: 'Set per-platform daily reply limits to keep your accounts safe and avoid triggering spam filters.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Connect Your Accounts',
    description: 'Securely link your social media accounts by importing cookies. Your credentials stay on your server.',
  },
  {
    num: '02',
    title: 'AI Scrapes & Evaluates',
    description: 'GetMention finds trending posts matching your keywords, then scores each for relevance and engagement potential.',
  },
  {
    num: '03',
    title: 'Auto-Posts Replies',
    description: 'High-scoring posts get AI-crafted replies posted automatically. Review the rest from your dashboard.',
  },
];

const PLANS = [
  {
    name: 'Starter', price: 0, period: 'forever', popular: false,
    features: ['2 platforms', '3 posts per day', 'AI-powered replies', '5 keywords', 'Manual posting only'],
  },
  {
    name: 'Pro', price: 49, period: '/month', popular: true,
    features: ['4 social platforms', '15 posts per day', '25 keywords', 'Auto-posting', 'Cron scheduling', 'Activity logs'],
  },
  {
    name: 'Business', price: 149, period: '/month', popular: false,
    features: ['All 6 platforms', '50 posts per day', '100 keywords', 'Auto-posting', 'Cron scheduling', 'Priority support'],
  },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', color: '#fafafa', fontFamily: 'var(--font-sans)' }}>

      {/* ── Nav ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(20px) saturate(1.5)',
        backgroundColor: 'rgba(9, 9, 11, 0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <nav style={{
          maxWidth: 1140, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em',
            color: '#fafafa', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 32, height: 32, borderRadius: 10,
              background: '#7c3aed', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 64 64" width="16" height="16">
                <rect x="4" y="4" width="56" height="46" rx="14" fill="white" />
                <polygon points="18,50 28,50 20,60" fill="white" />
                <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#7c3aed">G</text>
              </svg>
            </span>
            GetMention
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <Link href="#features" style={{ color: '#a1a1aa', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}>Features</Link>
            <Link href="#pricing" style={{ color: '#a1a1aa', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Pricing</Link>
            <Link href="/login" style={{ color: '#a1a1aa', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Login</Link>
            <Link href="/signup" style={{
              padding: '9px 20px', borderRadius: 4,
              background: '#7c3aed', color: '#fff',
              textDecoration: 'none', fontSize: 14, fontWeight: 600, border: 'none',
              transition: 'background 0.15s',
            }}>
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 1140, margin: '0 auto', padding: '120px 24px 100px',
        textAlign: 'center', position: 'relative',
      }}>
        {/* Glow orbs */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.12) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 100, left: '15%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.06) 0%, transparent 70%)',
          pointerEvents: 'none', filter: 'blur(40px)',
        }} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 16px 6px 8px', borderRadius: 9999,
          background: 'rgba(124, 58, 237, 0.1)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          fontSize: 13, fontWeight: 600, color: '#a78bfa',
          marginBottom: 36, position: 'relative',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#10b981',
            boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
          }} />
          Now with 6 platform support
        </div>

        <h1 style={{
          fontSize: 'clamp(40px, 5.5vw, 72px)',
          fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em',
          margin: '0 auto 28px', maxWidth: 780,
          color: '#fff',
        }}>
          AI-Powered Social Engagement on Autopilot
        </h1>

        <p style={{
          fontSize: 18, lineHeight: 1.7, color: '#71717a',
          maxWidth: 560, margin: '0 auto 48px',
        }}>
          GetMention scrapes trending posts, evaluates relevance with AI, and
          posts thoughtful replies across six major platforms — so you grow
          while you sleep.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <Link href="/signup" style={{
            padding: '14px 32px', borderRadius: 4,
            background: '#7c3aed', color: '#fff',
            textDecoration: 'none', fontSize: 16, fontWeight: 600,
            transition: 'background 0.15s, transform 0.15s',
          }}>
            Start Free
          </Link>
          <Link href="#how-it-works" style={{
            padding: '14px 32px', borderRadius: 4,
            background: 'rgba(255,255,255,0.06)', color: '#fafafa',
            textDecoration: 'none', fontSize: 16, fontWeight: 600,
            transition: 'background 0.15s',
          }}>
            How It Works
          </Link>
        </div>

        {/* Platform row */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 32,
          flexWrap: 'wrap', marginTop: 80,
        }}>
          {PLATFORMS.map((p) => (
            <div key={p.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: p.color, transition: 'transform 0.2s, border-color 0.2s',
              }}>
                {p.icon}
              </div>
              <span style={{ fontSize: 12, color: '#52525b', fontWeight: 500 }}>{p.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Features
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12, color: '#fff' }}>
            Everything You Need to Scale
          </h2>
          <p style={{ fontSize: 16, color: '#71717a', maxWidth: 480, margin: '0 auto' }}>
            Powerful features designed to save hours of manual work every single day.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              padding: '28px 24px', borderRadius: 8,
              background: '#131316', transition: 'background 0.15s',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(124, 58, 237, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#7c3aed', marginBottom: 18,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#71717a', margin: 0 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{
        maxWidth: 1140, margin: '0 auto', padding: '80px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            How It Works
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            Three Steps to Autopilot
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24, position: 'relative',
        }}>
          {STEPS.map((s) => (
            <div key={s.num} style={{
              padding: 32, borderRadius: 8,
              background: '#131316', textAlign: 'center',
              position: 'relative',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: '#7c3aed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: '#fff',
                margin: '0 auto 20px',
              }}>
                {s.num}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', marginBottom: 10 }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#71717a', margin: 0 }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Pricing
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12, color: '#fff' }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ fontSize: 16, color: '#71717a', maxWidth: 460, margin: '0 auto' }}>
            Start free. Upgrade when you&apos;re ready to go all-in.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20, alignItems: 'stretch',
        }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{
              padding: 32, borderRadius: 8,
              background: plan.popular ? '#131316' : '#0f0f12',
              border: plan.popular ? '2px solid #7c3aed' : '1px solid rgba(255,255,255,0.04)',
              display: 'flex', flexDirection: 'column',
              position: 'relative',
              boxShadow: plan.popular ? '0 0 40px rgba(124, 58, 237, 0.15)' : 'none',
            }}>
              {plan.popular && (
                <span style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  padding: '4px 14px', borderRadius: 9999,
                  background: '#7c3aed', color: '#fff',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Most Popular
                </span>
              )}
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>{plan.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
                <span style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>${plan.price}</span>
                <span style={{ fontSize: 15, color: '#52525b' }}>{plan.period}</span>
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: '0 0 28px',
                display: 'flex', flexDirection: 'column', gap: 12, flex: 1,
              }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontSize: 14, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" style={{
                display: 'block', textAlign: 'center',
                padding: '12px 24px', borderRadius: 4,
                background: plan.popular ? '#7c3aed' : 'rgba(255,255,255,0.06)',
                color: plan.popular ? '#fff' : '#a1a1aa',
                textDecoration: 'none', fontSize: 14, fontWeight: 600,
                transition: 'background 0.15s',
              }}>
                {plan.price === 0 ? 'Get Started Free' : 'Get Started'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '60px 24px 80px' }}>
        <div style={{
          padding: '56px 40px', borderRadius: 12,
          background: '#131316', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
            width: 600, height: 600,
            background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 60%)',
            pointerEvents: 'none',
          }} />
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.02em', marginBottom: 14, position: 'relative',
          }}>
            Ready to Automate Your Social Growth?
          </h2>
          <p style={{
            fontSize: 16, color: '#71717a', maxWidth: 460,
            margin: '0 auto 28px', lineHeight: 1.7, position: 'relative',
          }}>
            Join marketers who save hours every day with AI-powered engagement.
          </p>
          <Link href="/signup" style={{
            display: 'inline-block', padding: '14px 36px', borderRadius: 4,
            background: '#7c3aed', color: '#fff',
            textDecoration: 'none', fontSize: 16, fontWeight: 600,
            position: 'relative',
          }}>
            Get Started Free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '40px 24px', maxWidth: 1140, margin: '0 auto',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 20,
        }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fafafa' }}>
              GetMention
            </span>
            <p style={{ fontSize: 13, color: '#3f3f46', marginTop: 6 }}>
              &copy; {new Date().getFullYear()} GetMention. All rights reserved.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <Link href="/terms" style={{ color: '#52525b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Terms</Link>
            <Link href="/privacy" style={{ color: '#52525b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Privacy</Link>
            <Link href="/login" style={{ color: '#52525b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Login</Link>
            <Link href="/signup" style={{ color: '#52525b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
