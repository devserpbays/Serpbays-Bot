import Link from 'next/link';

function CheckIcon() {
  return (
    <svg
      className="w-5 h-5 text-emerald-400 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const plans = [
  {
    name: 'Starter',
    price: 0,
    description: 'Perfect for trying out AI-powered social engagement.',
    cta: 'Get Started Free',
    ctaHref: '/signup',
    popular: false,
    platforms: ['Twitter'],
    features: [
      'Twitter / X only',
      '3 posts per day',
      '5 keywords',
      'AI-powered replies',
      'Manual posting only',
    ],
  },
  {
    name: 'Pro',
    price: 49,
    description: 'For growing brands ready to scale engagement.',
    cta: 'Start Pro Trial',
    ctaHref: '/signup',
    popular: true,
    platforms: ['Twitter', 'Facebook', 'Pinterest', 'Skool'],
    features: [
      'Twitter, Facebook, Pinterest, Skool',
      '15 posts per day per platform',
      '25 keywords',
      'AI-powered replies',
      'Auto-posting',
      'Cron scheduling',
      'Activity logs',
    ],
  },
  {
    name: 'Business',
    price: 149,
    description: 'Full power across all 7 platforms.',
    cta: 'Contact Sales',
    ctaHref: '/signup',
    popular: false,
    platforms: ['Twitter', 'Facebook', 'Pinterest', 'Skool', 'Reddit', 'Quora', 'YouTube'],
    features: [
      'All 7 platforms (+ Reddit, Quora, YouTube)',
      '50 posts per day per platform',
      '100 keywords',
      'AI-powered replies',
      'Auto-posting',
      'Cron scheduling',
      'Activity logs',
      'Priority support',
    ],
  },
];

const faqs = [
  {
    question: 'Which social platforms are supported?',
    answer:
      'GetMention supports 7 platforms — Twitter/X, Facebook, Reddit, Quora, YouTube, Pinterest, and Skool. Platforms are fixed by plan: Free gets Twitter only, Pro adds Facebook, Pinterest, and Skool, and Business unlocks all 7.',
  },
  {
    question: 'How does AI-powered reply generation work?',
    answer:
      'GetMention uses advanced AI to analyze conversations and generate contextually relevant, helpful replies that naturally mention your product or service. Every reply is scored for quality before posting.',
  },
  {
    question: 'Can I upgrade or downgrade my plan at any time?',
    answer:
      'Yes. You can change your plan at any time from your dashboard. When upgrading, you get immediate access to new features. When downgrading, changes take effect at the start of your next billing cycle.',
  },
  {
    question: 'What is auto-posting and how does it work?',
    answer:
      'Auto-posting lets GetMention automatically publish approved replies that meet your quality threshold. You set a confidence score, and any AI-generated reply that scores above it gets posted automatically on a schedule you control.',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer:
      'Yes! The Pro plan comes with a 7-day free trial so you can experience the full feature set before committing. No credit card required to start your trial.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f', color: '#e4e4e7' }}>
      {/* Minimal scoped animations — subtle fade-up on load, gentle lift on hover */}
      <style>{`
        @keyframes pricing-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pricing-card {
          animation: pricing-fade-up 0.5s ease-out both;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .pricing-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(14,165,233,0.12);
        }
        .pricing-card:nth-child(1) { animation-delay: 0s; }
        .pricing-card:nth-child(2) { animation-delay: 0.08s; }
        .pricing-card:nth-child(3) { animation-delay: 0.16s; }
        .faq-card {
          animation: pricing-fade-up 0.5s ease-out both;
          transition: border-color 0.2s ease;
        }
        .faq-card:hover { border-color: rgba(255,255,255,0.16) !important; }
      `}</style>
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            GetMention
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-white font-medium transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#0ea5e9' }}
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-4 text-center px-6">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          Simple, Transparent Pricing
        </h1>
        <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto">
          Start free, upgrade when you&apos;re ready
        </p>
        <p className="mt-6 text-sm text-zinc-500">
          Prices shown are monthly. Save ~20% with yearly billing.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="pricing-card relative rounded-2xl flex flex-col"
              style={
                plan.popular
                  ? {
                      background:
                        'linear-gradient(135deg, #0ea5e9, #2563eb) padding-box, linear-gradient(135deg, #0ea5e9, #2563eb) border-box',
                      padding: '2px',
                      borderRadius: '1rem',
                    }
                  : {}
              }
            >
              {plan.popular && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-semibold px-4 py-1 rounded-full text-white"
                  style={{
                    background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                  }}
                >
                  POPULAR
                </div>
              )}
              <div
                className="rounded-2xl flex flex-col flex-1 p-8"
                style={{
                  backgroundColor: plan.popular ? '#111118' : '#0f0f17',
                  border: plan.popular ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">
                    ${plan.price}
                  </span>
                  <span className="text-zinc-500 text-sm">/mo</span>
                </div>

                {/* Platform badges (plan-locked) */}
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {plan.platforms.map((pName) => (
                    <span
                      key={pName}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md"
                      style={{
                        backgroundColor: 'rgba(14,165,233,0.1)',
                        border: '1px solid rgba(14,165,233,0.2)',
                        color: '#38bdf8',
                      }}
                    >
                      {pName}
                    </span>
                  ))}
                </div>

                <Link
                  href={plan.ctaHref}
                  className="mt-8 block text-center py-3 rounded-lg font-medium text-sm transition-all hover:opacity-90"
                  style={
                    plan.popular
                      ? {
                          background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                          color: '#fff',
                        }
                      : {
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }
                  }
                >
                  {plan.cta}
                </Link>

                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                      <CheckIcon />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="faq-card rounded-xl p-6"
              style={{
                backgroundColor: '#0f0f17',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <h3 className="text-base font-semibold text-white">{faq.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="text-lg font-bold text-white">
              GetMention
            </Link>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <Link href="/terms" className="hover:text-zinc-300 transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
                Privacy
              </Link>
              <Link href="/pricing" className="hover:text-zinc-300 transition-colors">
                Pricing
              </Link>
              <Link href="/login" className="hover:text-zinc-300 transition-colors">
                Login
              </Link>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} GetMention. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
