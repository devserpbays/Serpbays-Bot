import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0f',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    }}>
      {/* ── Header / Nav ─────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(10, 10, 15, 0.8)',
        borderBottom: '1px solid rgba(124, 58, 237, 0.15)',
      }}>
        <nav style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Link href="/" style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textDecoration: 'none',
          }}>
            GetMention
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <Link href="#features" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Features</Link>
            <Link href="#pricing" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Pricing</Link>
            <Link href="/login" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Login</Link>
            <Link href="/signup" style={{
              padding: '10px 20px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
            }}>
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '100px 24px 80px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute',
          top: -100,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          display: 'inline-block',
          padding: '6px 16px',
          borderRadius: 9999,
          border: '1px solid rgba(124, 58, 237, 0.3)',
          backgroundColor: 'rgba(124, 58, 237, 0.08)',
          fontSize: 13,
          fontWeight: 500,
          color: '#a78bfa',
          marginBottom: 32,
        }}>
          Automate your social engagement with AI
        </div>

        <h1 style={{
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: '0 auto 24px',
          maxWidth: 800,
          background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          AI-Powered Social Engagement That Drives Real Growth
        </h1>

        <p style={{
          fontSize: 18,
          lineHeight: 1.7,
          color: '#64748b',
          maxWidth: 600,
          margin: '0 auto 48px',
        }}>
          GetMention scrapes trending posts, evaluates relevance with AI, and automatically
          posts thoughtful replies across six major platforms — so you can grow your brand
          while you sleep.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{
            padding: '14px 32px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
            boxShadow: '0 0 30px rgba(124, 58, 237, 0.3)',
          }}>
            Get Started Free
          </Link>
          <Link href="#pricing" style={{
            padding: '14px 32px',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.2)',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            color: '#e2e8f0',
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
          }}>
            See Pricing
          </Link>
        </div>
      </section>

      {/* ── Platform Logos ────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '40px 24px 80px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 32 }}>
          Engage across every major platform
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 48,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {[
            { name: 'Twitter / X', icon: 'X' },
            { name: 'Reddit', icon: 'R' },
            { name: 'Facebook', icon: 'f' },
            { name: 'Quora', icon: 'Q' },
            { name: 'YouTube', icon: 'Y' },
            { name: 'Pinterest', icon: 'P' },
          ].map((platform) => (
            <div key={platform.name} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                border: '1px solid rgba(124, 58, 237, 0.2)',
                backgroundColor: 'rgba(124, 58, 237, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
                color: '#a78bfa',
              }}>
                {platform.icon}
              </div>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{platform.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────── */}
      <section id="features" style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Everything You Need to Scale Engagement
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
            Powerful features designed to save hours of manual work every single day.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }}>
          {[
            {
              icon: 'Ai',
              title: 'AI-Generated Replies',
              description: 'GPT-powered responses that sound natural and relevant, tailored to each post and platform context.',
            },
            {
              icon: 'Ap',
              title: 'Auto-Posting',
              description: 'Set a relevance threshold and let GetMention auto-post replies that score high enough — no manual approval needed.',
            },
            {
              icon: 'Mp',
              title: 'Multi-Platform',
              description: 'One dashboard for Twitter, Reddit, Facebook, Quora, YouTube, and Pinterest. Connect once, engage everywhere.',
            },
            {
              icon: 'Sc',
              title: 'Smart Scheduling',
              description: 'Cron-based scheduling scrapes and posts at optimal intervals, keeping your engagement consistent 24/7.',
            },
            {
              icon: 'Lo',
              title: 'Activity Logs',
              description: 'Full visibility into every scrape, evaluation, and posted reply. Track performance and debug with ease.',
            },
            {
              icon: 'Dl',
              title: 'Daily Limits',
              description: 'Set per-platform daily reply limits to keep your accounts safe and avoid triggering spam filters.',
            },
          ].map((feature) => (
            <div key={feature.title} style={{
              padding: 32,
              borderRadius: 16,
              border: '1px solid rgba(124, 58, 237, 0.12)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              transition: 'border-color 0.2s',
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(37, 99, 235, 0.15))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 20,
              }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: 10,
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: '#64748b',
                margin: 0,
              }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            How It Works
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
            Three simple steps to automate your social presence.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 32,
          position: 'relative',
        }}>
          {[
            {
              step: '01',
              title: 'Connect Your Accounts',
              description: 'Securely link your social media accounts by importing cookies. Your credentials stay on your machine.',
            },
            {
              step: '02',
              title: 'AI Scrapes & Evaluates',
              description: 'GetMention finds trending posts matching your keywords, then scores each one for relevance and engagement potential.',
            },
            {
              step: '03',
              title: 'Auto-Posts Replies',
              description: 'High-scoring posts get AI-crafted replies posted automatically. Review the rest from your dashboard with one click.',
            },
          ].map((item) => (
            <div key={item.step} style={{
              padding: 36,
              borderRadius: 16,
              border: '1px solid rgba(124, 58, 237, 0.12)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              textAlign: 'center',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 800,
                color: '#fff',
                margin: '0 auto 24px',
              }}>
                {item.step}
              </div>
              <h3 style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: 12,
              }}>
                {item.title}
              </h3>
              <p style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: '#64748b',
                margin: 0,
              }}>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing Preview ──────────────────────────────────────── */}
      <section id="pricing" style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
            Start free. Upgrade when you are ready to go all-in.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
          alignItems: 'stretch',
        }}>
          {/* Starter */}
          <div style={{
            padding: 36,
            borderRadius: 16,
            border: '1px solid rgba(124, 58, 237, 0.12)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Starter</h3>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: '#fff' }}>$0</span>
              <span style={{ fontSize: 16, color: '#64748b' }}>/month</span>
            </div>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              flex: 1,
            }}>
              {[
                '2 platforms',
                '5 replies per day',
                'Basic AI replies',
                'Activity logs',
                'Community support',
              ].map((item) => (
                <li key={item} style={{ fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 16 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px 24px',
              borderRadius: 10,
              border: '1px solid rgba(124, 58, 237, 0.3)',
              backgroundColor: 'transparent',
              color: '#a78bfa',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}>
              Get Started Free
            </Link>
          </div>

          {/* Pro — highlighted */}
          <div style={{
            padding: 36,
            borderRadius: 16,
            border: '1px solid rgba(124, 58, 237, 0.4)',
            background: 'linear-gradient(180deg, rgba(124, 58, 237, 0.08) 0%, rgba(10, 10, 15, 1) 100%)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 0 60px rgba(124, 58, 237, 0.1)',
          }}>
            <div style={{
              position: 'absolute',
              top: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '4px 16px',
              borderRadius: 9999,
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
            }}>
              Most Popular
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Pro</h3>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: '#fff' }}>$49</span>
              <span style={{ fontSize: 16, color: '#64748b' }}>/month</span>
            </div>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              flex: 1,
            }}>
              {[
                '4 social platforms',
                '50 replies per day',
                'Advanced AI replies',
                'Auto-posting',
                'Smart scheduling',
                'Priority support',
              ].map((item) => (
                <li key={item} style={{ fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 16 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px 24px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 0 20px rgba(124, 58, 237, 0.3)',
            }}>
              Get Started
            </Link>
          </div>

          {/* Business */}
          <div style={{
            padding: 36,
            borderRadius: 16,
            border: '1px solid rgba(124, 58, 237, 0.12)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Business</h3>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: '#fff' }}>$149</span>
              <span style={{ fontSize: 16, color: '#64748b' }}>/month</span>
            </div>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              flex: 1,
            }}>
              {[
                'All 6 platforms',
                'Unlimited replies',
                'Premium AI models',
                'Auto-posting',
                'Custom scheduling',
                'Dedicated support',
                'API access',
              ].map((item) => (
                <li key={item} style={{ fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 16 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px 24px',
              borderRadius: 10,
              border: '1px solid rgba(124, 58, 237, 0.3)',
              backgroundColor: 'transparent',
              color: '#a78bfa',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}>
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px',
      }}>
        <div style={{
          padding: '64px 48px',
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(37, 99, 235, 0.15))',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: 36,
            fontWeight: 800,
            color: '#f1f5f9',
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}>
            Ready to Automate Your Social Growth?
          </h2>
          <p style={{
            fontSize: 16,
            color: '#64748b',
            maxWidth: 480,
            margin: '0 auto 32px',
            lineHeight: 1.7,
          }}>
            Join thousands of marketers who save hours every day with AI-powered engagement.
          </p>
          <Link href="/signup" style={{
            padding: '14px 36px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 600,
            boxShadow: '0 0 30px rgba(124, 58, 237, 0.3)',
          }}>
            Get Started Free
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(124, 58, 237, 0.1)',
        padding: '48px 24px',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 24,
        }}>
          <div>
            <span style={{
              fontSize: 20,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              GetMention
            </span>
            <p style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>
              &copy; {new Date().getFullYear()} GetMention. All rights reserved.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 32 }}>
            <Link href="/terms" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Terms</Link>
            <Link href="/privacy" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Privacy</Link>
            <Link href="/login" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Login</Link>
            <Link href="/signup" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
