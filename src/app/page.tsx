import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import HeroSpotlight from '@/components/HeroSpotlight';

export const dynamic = 'force-dynamic';

/* ── Platforms ────────────────────────────────────────────────────── */
const PLATFORMS = [
  { name: 'Twitter / X', color: '#1d9bf0', letter: '𝕏' },
  { name: 'Reddit',      color: '#ff4500', letter: 'R' },
  { name: 'Facebook',    color: '#1877f2', letter: 'f' },
  { name: 'Quora',       color: '#b92b27', letter: 'Q' },
  { name: 'YouTube',     color: '#ff0000', letter: '▶' },
  { name: 'Pinterest',   color: '#e60023', letter: 'P' },
  { name: 'Skool',       color: '#5865f2', letter: 'S' },
];

/* ── Features ─────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: '💬', title: 'AI-Generated Replies', description: 'GPT-powered responses that sound natural — casual tone, specific to each post, never templated.' },
  { icon: '⚡', title: 'Auto-Posting', description: 'Set a relevance threshold and let GetMention auto-post replies that score high enough — zero manual work.' },
  { icon: '🌐', title: 'Multi-Platform', description: 'One dashboard for 7 platforms: Twitter, Facebook, Reddit, Quora, YouTube, Pinterest, Skool.' },
  { icon: '⏱', title: 'Smart Scheduling', description: 'Cron-based scheduling posts at optimal intervals with natural jitter — keeps engagement 24/7.' },
  { icon: '📊', title: 'Activity Logs', description: 'Full visibility into every scrape, evaluation, and reply. Click through to verify on-platform.' },
  { icon: '🛡', title: 'Safe by Design', description: 'Per-platform daily limits, account health scoring, auto-pause on detection — your accounts stay safe.' },
];

/* ── How it works ─────────────────────────────────────────────────── */
const STEPS = [
  { num: '01', title: 'Install the Extension', description: 'Download the Chrome extension from your dashboard, paste your API key. Takes under 2 minutes. No passwords, no cookies — uses your real browser session.', icon: '⬇' },
  { num: '02', title: 'AI Finds & Evaluates Posts', description: 'The extension searches your enabled platforms every 5 minutes using your keywords. Each post is scored 0-100 for relevance and gets an AI-generated reply.', icon: '🔍' },
  { num: '03', title: 'Auto-Engages Like You Would', description: 'Comments, likes, and upvotes post from your real browser — indistinguishable from manual activity. YouTube watches videos and skips ads before commenting.', icon: '🚀' },
];

/* ── Comparison table ─────────────────────────────────────────────── */
const COMPARISON = [
  { feature: 'Auto-find relevant posts by keyword',     gm: true,  manual: false, hootsuite: false, taplio: false },
  { feature: 'AI-generated natural replies',             gm: true,  manual: false, hootsuite: false, taplio: true  },
  { feature: '7 platform support',                       gm: true,  manual: true,  hootsuite: true,  taplio: false },
  { feature: 'Comments + Likes + Upvotes',               gm: true,  manual: true,  hootsuite: false, taplio: false },
  { feature: 'Uses YOUR real browser (undetectable)',    gm: true,  manual: true,  hootsuite: false, taplio: false },
  { feature: 'YouTube ad-skip + watch before comment',   gm: true,  manual: false, hootsuite: false, taplio: false },
  { feature: 'Smart brand mention cap (1-2/day)',        gm: true,  manual: false, hootsuite: false, taplio: false },
  { feature: 'Works when Chrome is minimized',           gm: true,  manual: false, hootsuite: true,  taplio: true  },
  { feature: 'No API keys or passwords needed',          gm: true,  manual: true,  hootsuite: false, taplio: false },
  { feature: 'Price',                                    gm: 'Free – $149', manual: 'Your time', hootsuite: '$99+', taplio: '$49+' },
];

/* ── Plans ─────────────────────────────────────────────────────────── */
const PLANS = [
  { name: 'Starter', price: 0, period: 'forever', popular: false,
    platforms: ['Twitter'],
    features: ['Twitter / X only', '3 posts per day', '5 keywords', 'AI-powered replies', 'Manual posting only'] },
  { name: 'Pro', price: 49, period: '/month', popular: true,
    platforms: ['Twitter', 'Facebook', 'Pinterest', 'Skool'],
    features: ['Twitter, Facebook, Pinterest, Skool', '15 posts per day per platform', '25 keywords', 'Auto-posting', 'Cron scheduling', 'Activity logs'] },
  { name: 'Business', price: 149, period: '/month', popular: false,
    platforms: ['Twitter', 'Facebook', 'Pinterest', 'Skool', 'Reddit', 'Quora', 'YouTube'],
    features: ['All 7 platforms', '50 posts per day per platform', '100 keywords', 'Auto-posting', 'Priority support', 'Brand mention control'] },
];

/* ══════════════════════════════════════════════════════════════════ */

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', color: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ══════ Scoped Animations (light but polished) ══════ */}
      <style>{`
        /* Subtle fade-up on load, staggered */
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* Gradient text shimmer — slow, once a minute feel */
        @keyframes lp-gradient {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        /* Gentle breathing glow */
        @keyframes lp-glow {
          0%,100% { opacity: 0.6; }
          50%     { opacity: 1; }
        }
        /* Timeline line draws in */
        @keyframes lp-line-draw {
          from { height: 0; }
          to   { height: 100%; }
        }
        /* Subtle floating — used once for the hero badge */
        @keyframes lp-float-y {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-4px); }
        }
        /* Live dot pulse */
        @keyframes lp-pulse-dot {
          0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
          50%     { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
        }
        /* Card hover lift — smoother easing + stronger glow */
        .lp-card {
          transition:
            transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.4s ease,
            box-shadow 0.4s ease,
            background 0.4s ease;
        }
        .lp-card:hover {
          transform: translateY(-6px);
          border-color: rgba(14,165,233,0.45) !important;
          box-shadow: 0 18px 42px rgba(14,165,233,0.14), 0 2px 6px rgba(14,165,233,0.08);
        }
        /* Platform icon hover pop */
        .lp-plat-float {
          transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), filter 0.35s ease;
        }
        .lp-plat-float:hover {
          transform: scale(1.14) rotate(-3deg) !important;
          filter: brightness(1.15) drop-shadow(0 6px 14px rgba(14,165,233,0.35));
        }
        /* Nav links with underline sweep */
        .lp-nav {
          color: #a1a1aa; text-decoration: none;
          font-size: 14px; font-weight: 500;
          position: relative;
          transition: color 0.2s ease;
        }
        .lp-nav::after {
          content: ''; position: absolute; bottom: -4px; left: 0;
          width: 0; height: 1px; background: #0ea5e9;
          transition: width 0.25s ease;
        }
        .lp-nav:hover { color: #fafafa; }
        .lp-nav:hover::after { width: 100%; }
        /* Primary button with shine */
        .lp-btn-primary {
          position: relative; overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .lp-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(14,165,233,0.35);
        }
        .lp-btn-primary::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.7s ease;
        }
        .lp-btn-primary:hover::before { transform: translateX(100%); }
        /* Comparison row hover */
        .lp-compare-row { transition: background 0.2s ease; }
        .lp-compare-row:hover { background: rgba(14,165,233,0.04); }
        /* Staggered load for grid items */
        .lp-stagger-1 { animation: lp-fade-up 0.6s ease-out 0.05s both; }
        .lp-stagger-2 { animation: lp-fade-up 0.6s ease-out 0.10s both; }
        .lp-stagger-3 { animation: lp-fade-up 0.6s ease-out 0.15s both; }
        .lp-stagger-4 { animation: lp-fade-up 0.6s ease-out 0.20s both; }
        .lp-stagger-5 { animation: lp-fade-up 0.6s ease-out 0.25s both; }
        .lp-stagger-6 { animation: lp-fade-up 0.6s ease-out 0.30s both; }
        .lp-stagger-7 { animation: lp-fade-up 0.6s ease-out 0.35s both; }

        /* ── Rotating keywords in hero ── */
        @keyframes lp-rotate-words {
          0%, 16%  { transform: translateY(0%); }
          20%, 36% { transform: translateY(-100%); }
          40%, 56% { transform: translateY(-200%); }
          60%, 76% { transform: translateY(-300%); }
          80%, 96% { transform: translateY(-400%); }
          100%     { transform: translateY(-500%); }
        }
        .lp-rotate-wrap {
          display: inline-flex; overflow: hidden; height: 1.15em; vertical-align: baseline;
          position: relative;
        }
        .lp-rotate-track {
          display: flex; flex-direction: column;
          animation: lp-rotate-words 12s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
        }
        .lp-rotate-track span { line-height: 1.15em; white-space: nowrap; }

        /* ── Typing caret ── */
        @keyframes lp-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .lp-caret { display: inline-block; width: 3px; height: 1em; background: #38bdf8;
          margin-left: 2px; vertical-align: text-bottom; animation: lp-blink 0.9s step-end infinite; }

        /* ── Floating particles ── */
        @keyframes lp-particle-float {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10%,90% { opacity: 0.6; }
          100% { transform: translateY(-400px) translateX(20px); opacity: 0; }
        }
        .lp-particle {
          position: absolute; width: 4px; height: 4px; border-radius: 50%;
          background: #38bdf8; pointer-events: none;
          animation: lp-particle-float 12s linear infinite;
        }

        /* ── Dashboard mockup card animations ── */
        @keyframes lp-demo-in {
          0%,40%  { opacity: 0; transform: translateY(20px) scale(0.95); }
          60%,100%{ opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lp-count-tick {
          0%,20% { content: '0'; }
          25%    { content: '1'; }
          30%    { content: '2'; }
          35%    { content: '3'; }
          40%    { content: '5'; }
          50%    { content: '7'; }
          60%    { content: '9'; }
          70%    { content: '12'; }
          80%    { content: '15'; }
          90%,100% { content: '18'; }
        }
        .lp-demo-card {
          animation: lp-demo-in 1.5s ease-out both, lp-glow 6s ease-in-out 1.5s infinite;
        }
        @keyframes lp-typing {
          from { width: 0; }
          to   { width: 100%; }
        }
        .lp-demo-typing {
          overflow: hidden; white-space: nowrap;
          animation: lp-typing 3s steps(40, end) 2s both;
        }
        @keyframes lp-success-bounce {
          0%,60% { transform: scale(0); opacity: 0; }
          70%    { transform: scale(1.2); opacity: 1; }
          85%    { transform: scale(0.95); }
          100%   { transform: scale(1); opacity: 1; }
        }
        .lp-demo-check {
          animation: lp-success-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 5.2s both;
        }
        @keyframes lp-progress-fill {
          from { width: 0; }
          to   { width: var(--fill, 60%); }
        }
        .lp-progress-bar {
          animation: lp-progress-fill 1.5s ease-out 0.8s both;
        }

        /* ── Floating platform icons ── */
        @keyframes lp-float-soft {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
        .lp-plat-float:nth-child(1) { animation: lp-float-soft 4.5s ease-in-out 0s infinite; }
        .lp-plat-float:nth-child(2) { animation: lp-float-soft 5.2s ease-in-out 0.3s infinite; }
        .lp-plat-float:nth-child(3) { animation: lp-float-soft 4.8s ease-in-out 0.6s infinite; }
        .lp-plat-float:nth-child(4) { animation: lp-float-soft 5.5s ease-in-out 0.9s infinite; }
        .lp-plat-float:nth-child(5) { animation: lp-float-soft 4.3s ease-in-out 1.2s infinite; }
        .lp-plat-float:nth-child(6) { animation: lp-float-soft 5.0s ease-in-out 1.5s infinite; }
        .lp-plat-float:nth-child(7) { animation: lp-float-soft 4.7s ease-in-out 1.8s infinite; }

        /* ── Count-up animation for stats ── */
        @keyframes lp-count-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lp-stat { animation: lp-count-up 0.7s ease-out both; }

        /* ── Shimmer skeleton for demo ── */
        @keyframes lp-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .lp-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(14,165,233,0.15) 50%, rgba(255,255,255,0.03) 100%);
          background-size: 200% 100%;
          animation: lp-shimmer 2.5s linear infinite;
        }

        /* ── Orbit ring for features ── */
        @keyframes lp-spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .lp-orbit-ring {
          animation: lp-spin-slow 30s linear infinite;
        }

        /* ── Scroll-triggered reveals (CSS-only, Chrome 115+) ── */
        @keyframes lp-reveal-in {
          from { opacity: 0; transform: translateY(34px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lp-reveal {
          opacity: 0;
          animation: lp-reveal-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @supports (animation-timeline: view()) {
          .lp-reveal {
            animation-timeline: view();
            animation-range: entry 5% cover 28%;
          }
        }
        @supports not (animation-timeline: view()) {
          /* Fallback — reveal immediately on load so no content stays hidden */
          .lp-reveal { opacity: 1; animation: lp-fade-up 0.6s ease-out both; }
        }

        /* ── Section-to-section divider (vertical flow connector) ── */
        .lp-section-divider {
          width: 1px; height: 80px; margin: 0 auto;
          background: linear-gradient(180deg, transparent, rgba(14,165,233,0.35), transparent);
          background-size: 100% 220%;
          animation: lp-flow 4s ease-in-out infinite;
          opacity: 0.65;
        }
        @keyframes lp-flow {
          0%, 100% { background-position: 0 0%; }
          50%      { background-position: 0 100%; }
        }

        /* ── Ambient drifting orbs (fixed-position ambience) ── */
        @keyframes lp-drift-a {
          0%,100% { transform: translate(-10vw,  10vh) scale(1); }
          50%     { transform: translate( 10vw, -5vh)  scale(1.12); }
        }
        @keyframes lp-drift-b {
          0%,100% { transform: translate( 12vw, -8vh) scale(1); }
          50%     { transform: translate(-8vw,  12vh) scale(1.08); }
        }
        .lp-ambient {
          position: fixed; pointer-events: none; z-index: 0;
          filter: blur(80px);
          will-change: transform;
        }
        .lp-ambient-a {
          top: 18vh; left: 8vw; width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(14,165,233,0.12), transparent 70%);
          animation: lp-drift-a 32s ease-in-out infinite;
        }
        .lp-ambient-b {
          top: 55vh; right: 6vw; width: 440px; height: 440px;
          background: radial-gradient(circle, rgba(168,85,247,0.08), transparent 70%);
          animation: lp-drift-b 40s ease-in-out 4s infinite;
        }

        /* ── Halo breathe for the popular plan card ── */
        @keyframes lp-breathe {
          0%,100% { box-shadow: 0 0 48px rgba(14,165,233,0.18), 0 0 0 0 rgba(14,165,233,0.00); }
          50%     { box-shadow: 0 0 64px rgba(14,165,233,0.28), 0 0 0 2px rgba(14,165,233,0.15); }
        }
        .lp-breathe { animation: lp-breathe 4.5s ease-in-out infinite; }

        /* ── Features section: floating, styled, ambient ── */
        @keyframes lp-feat-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-10px) rotate(0.4deg); }
        }
        @keyframes lp-feat-orbit {
          0%   { transform: rotate(0deg)   translate(18px) rotate(0deg); }
          100% { transform: rotate(360deg) translate(18px) rotate(-360deg); }
        }
        @keyframes lp-icon-bob {
          0%,100% { transform: translateY(0) rotate(0); }
          30%     { transform: translateY(-4px) rotate(-4deg); }
          60%     { transform: translateY(2px)  rotate(3deg); }
        }
        @keyframes lp-border-glow {
          0%,100% { opacity: 0.35; }
          50%     { opacity: 0.85; }
        }
        @keyframes lp-feat-blob {
          0%,100% { transform: translate(0,0) scale(1); opacity: 0.35; }
          50%     { transform: translate(14px,-10px) scale(1.15); opacity: 0.6; }
        }

        .lp-feat-card {
          position: relative;
          overflow: hidden;
          padding: 28px 24px;
          border-radius: 18px;
          background: linear-gradient(180deg, #14141a 0%, #101015 100%);
          border: 1px solid rgba(255,255,255,0.06);
          /* Two animations: entry fade-up (runs once) + continuous float */
          animation:
            lp-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both,
            lp-feat-float 7s ease-in-out infinite;
          transition:
            transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.45s ease,
            box-shadow 0.45s ease;
        }
        /* Stagger BOTH animations individually: entry delay + float phase */
        .lp-feat-card:nth-child(1) { animation-delay: 0.05s, 0s;   }
        .lp-feat-card:nth-child(2) { animation-delay: 0.12s, 0.9s; }
        .lp-feat-card:nth-child(3) { animation-delay: 0.19s, 1.8s; }
        .lp-feat-card:nth-child(4) { animation-delay: 0.26s, 2.6s; }
        .lp-feat-card:nth-child(5) { animation-delay: 0.33s, 3.4s; }
        .lp-feat-card:nth-child(6) { animation-delay: 0.40s, 4.2s; }

        /* Keep pseudos behind the card's real children */
        .lp-feat-card > * { position: relative; z-index: 2; }

        /* Breathing gradient border via pseudo-element */
        .lp-feat-card::before {
          content: '';
          position: absolute; inset: -1px; z-index: 1;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: conic-gradient(from 120deg,
            rgba(14,165,233,0.55), rgba(168,85,247,0.35), rgba(14,165,233,0.0) 60%,
            rgba(14,165,233,0.55));
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: lp-border-glow 4.5s ease-in-out infinite, lp-spin-slow 22s linear infinite;
        }

        /* Soft ambient blob inside each card (behind content) */
        .lp-feat-card::after {
          content: '';
          position: absolute; z-index: 0;
          top: -40px; right: -40px; width: 180px; height: 180px;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(circle, rgba(14,165,233,0.22), transparent 70%);
          filter: blur(30px);
          animation: lp-feat-blob 9s ease-in-out infinite;
        }
        .lp-feat-card:nth-child(even)::after {
          background: radial-gradient(circle, rgba(168,85,247,0.20), transparent 70%);
          animation-duration: 11s;
          animation-delay: 1.5s;
        }

        .lp-feat-card:hover {
          transform: translateY(-8px);
          border-color: rgba(14,165,233,0.45);
          box-shadow: 0 24px 54px rgba(14,165,233,0.20), 0 4px 12px rgba(14,165,233,0.10);
        }
        .lp-feat-card:hover::before { opacity: 1; }

        /* Icon chip — styled, always bobbing */
        .lp-feat-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 54px; height: 54px; border-radius: 16px; margin-bottom: 18px;
          font-size: 26px;
          background: linear-gradient(135deg, rgba(14,165,233,0.22), rgba(37,99,235,0.12));
          border: 1px solid rgba(14,165,233,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px rgba(14,165,233,0.14);
          animation: lp-icon-bob 4.5s ease-in-out infinite;
          transform-origin: center;
          position: relative;
        }
        .lp-feat-icon::after {
          content: '';
          position: absolute; inset: -6px;
          border-radius: 20px;
          border: 1px solid rgba(14,165,233,0.18);
          opacity: 0;
          transition: opacity 0.4s ease, transform 0.4s ease;
          transform: scale(0.9);
        }
        .lp-feat-card:hover .lp-feat-icon::after { opacity: 1; transform: scale(1); }

        /* Little orbital dot revolving around the icon */
        .lp-feat-icon-dot {
          position: absolute; top: 50%; left: 50%;
          width: 6px; height: 6px; border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 10px rgba(56,189,248,0.9);
          transform: translate(-50%,-50%);
          animation: lp-feat-orbit 6s linear infinite;
        }

        /* Title underline sweep on hover */
        .lp-feat-title {
          position: relative; display: inline-block;
          background: linear-gradient(90deg, #fafafa, #fafafa);
          background-size: 0% 1px;
          background-position: 0 100%;
          background-repeat: no-repeat;
          transition: background-size 0.5s ease;
        }
        .lp-feat-card:hover .lp-feat-title {
          background-image: linear-gradient(90deg, #38bdf8, #a855f7);
          background-size: 100% 2px;
        }

        /* ── Compare table — highlight the GM column when a row is hovered ── */
        .lp-compare-row:hover td:nth-child(2) {
          background: rgba(14,165,233,0.11) !important;
          transition: background 0.25s ease;
        }

        /* Respect user's reduced-motion preference */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .lp-reveal { opacity: 1 !important; transform: none !important; }
          .lp-card:hover, .lp-plat-float:hover, .lp-btn-primary:hover, .lp-feat-card:hover { transform: none !important; }
          .lp-ambient, .lp-feat-card::before, .lp-feat-card::after, .lp-feat-icon-dot { display: none; }
          .lp-feat-card, .lp-feat-icon { animation: none !important; }
        }
      `}</style>

      {/* ══════ Ambient drift orbs (viewport background, no interaction) ══════ */}
      <div className="lp-ambient lp-ambient-a" aria-hidden="true" />
      <div className="lp-ambient lp-ambient-b" aria-hidden="true" />

      {/* ══════ Nav ══════ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(20px) saturate(1.5)',
        backgroundColor: 'rgba(9,9,11,0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
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
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 900, color: '#fff',
            }}>G</span>
            GetMention
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <Link href="#how-it-works" className="lp-nav">How it works</Link>
            <Link href="#features" className="lp-nav">Features</Link>
            <Link href="#compare" className="lp-nav">Compare</Link>
            <Link href="#pricing" className="lp-nav">Pricing</Link>
            <Link href="/login" className="lp-nav">Login</Link>
            <Link href="/signup" className="lp-btn-primary" style={{
              padding: '9px 22px', borderRadius: 10,
              background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
              color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700,
              boxShadow: '0 4px 14px rgba(14,165,233,0.25)',
            }}>Get Started</Link>
          </div>
        </nav>
      </header>

      {/* ══════ Hero ══════ */}
      <section style={{
        maxWidth: 1140, margin: '0 auto', padding: '120px 24px 80px',
        textAlign: 'center', position: 'relative',
      }}>
        {/* Cursor-follow spotlight (client island) */}
        <HeroSpotlight />

        {/* Breathing glow orbs */}
        <div style={{
          position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
          width: 760, height: 760,
          background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 60%)',
          pointerEvents: 'none', filter: 'blur(40px)',
          animation: 'lp-glow 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', top: 140, right: '10%',
          width: 340, height: 340,
          background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 65%)',
          pointerEvents: 'none', filter: 'blur(60px)',
          animation: 'lp-glow 11s ease-in-out infinite 2s',
        }} />

        {/* Live badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 16px 6px 10px', borderRadius: 9999,
          background: 'rgba(14,165,233,0.1)',
          border: '1px solid rgba(14,165,233,0.25)',
          fontSize: 13, fontWeight: 600, color: '#38bdf8',
          marginBottom: 32, position: 'relative',
          animation: 'lp-fade-up 0.6s ease-out 0s both, lp-float-y 4s ease-in-out 1s infinite',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#10b981',
            animation: 'lp-pulse-dot 2s ease-out infinite',
          }} />
          Now with 7 platform support + Chrome Extension
        </div>

        {/* Floating particles */}
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="lp-particle" style={{
            left: `${(i * 8.5) % 100}%`,
            bottom: 0,
            animationDelay: `${(i * 0.7) % 10}s`,
            animationDuration: `${10 + (i % 4) * 2}s`,
            opacity: 0.4 + (i % 3) * 0.2,
          }} />
        ))}

        {/* Animated gradient headline with rotating keyword */}
        <h1 style={{
          fontSize: 'clamp(40px, 5.5vw, 72px)',
          fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em',
          margin: '0 auto 16px', maxWidth: 820,
          color: '#fff',
          animation: 'lp-fade-up 0.7s ease-out 0.1s both',
        }}>
          Social Engagement on{' '}
          <span style={{
            backgroundImage: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 50%, #60a5fa 100%)',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            animation: 'lp-gradient 10s ease-in-out infinite',
          }}>
            Autopilot
          </span>
        </h1>

        {/* Rotating keyword line */}
        <div style={{
          fontSize: 'clamp(18px, 2.2vw, 26px)',
          fontWeight: 600, color: '#71717a',
          margin: '0 auto 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          animation: 'lp-fade-up 0.7s ease-out 0.2s both',
        }}>
          Scrape →&nbsp;
          <span className="lp-rotate-wrap" style={{ color: '#38bdf8', fontWeight: 700 }}>
            <span className="lp-rotate-track">
              <span>evaluate with AI</span>
              <span>write natural replies</span>
              <span>comment &amp; engage</span>
              <span>build authority</span>
              <span>grow on autopilot</span>
              <span>evaluate with AI</span>
            </span>
          </span>
          <span className="lp-caret" />
        </div>

        <p style={{
          fontSize: 18, lineHeight: 1.7, color: '#a1a1aa',
          maxWidth: 600, margin: '0 auto 44px',
          animation: 'lp-fade-up 0.7s ease-out 0.25s both',
        }}>
          AI finds relevant posts across 7 platforms, writes natural replies, and engages using your real browser session — undetectable and human-like.
        </p>

        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
          animation: 'lp-fade-up 0.7s ease-out 0.4s both',
        }}>
          <Link href="/signup" className="lp-btn-primary" style={{
            padding: '14px 32px', borderRadius: 12,
            background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            color: '#fff', textDecoration: 'none', fontSize: 16, fontWeight: 700,
            boxShadow: '0 6px 20px rgba(14,165,233,0.3)',
          }}>
            Start Free Today
          </Link>
          <Link href="#how-it-works" style={{
            padding: '14px 32px', borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', color: '#fafafa',
            textDecoration: 'none', fontSize: 16, fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.1)',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}>
            See How It Works
          </Link>
        </div>

        <p style={{
          color: '#52525b', fontSize: 13, marginTop: 20,
          animation: 'lp-fade-in 0.8s ease-out 0.6s both',
        }}>
          No credit card required &nbsp;·&nbsp; Free plan available &nbsp;·&nbsp; Cancel anytime
        </p>

        {/* Platform logos row with floating animation */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 28,
          flexWrap: 'wrap', marginTop: 64,
        }}>
          {PLATFORMS.map((p, i) => (
            <div key={p.name} className={`lp-plat-float lp-stagger-${Math.min(i+1, 7)}`} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: p.color,
                transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
                cursor: 'default',
              }}>
                {p.letter}
              </div>
              <span style={{ fontSize: 12, color: '#52525b', fontWeight: 500 }}>{p.name}</span>
            </div>
          ))}
        </div>

        {/* Live dashboard demo card — shows the product in action */}
        <div className="lp-demo-card" style={{
          maxWidth: 620, margin: '72px auto 0',
          background: 'linear-gradient(180deg, rgba(14,165,233,0.04), rgba(14,165,233,0.01))',
          border: '1px solid rgba(14,165,233,0.25)',
          borderRadius: 16,
          padding: '20px 24px',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(14,165,233,0.12)',
        }}>
          {/* Top bar: browser chrome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, opacity: 0.6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ marginLeft: 12, fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
              dashboard.getmention.io/activity
            </span>
          </div>

          {/* Feed items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Item 1 — scraping */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)', borderRadius: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: '#1d9bf0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>𝕏</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 600 }}>Scraping Twitter for &quot;SEO tools&quot;</div>
                <div className="lp-shimmer" style={{ height: 2, borderRadius: 1, marginTop: 6 }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8' }}>LIVE</span>
            </div>

            {/* Item 2 — AI writing reply */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#0ea5e9,#2563eb)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>AI</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600, marginBottom: 4 }}>Writing reply · Score 94/100</div>
                <div className="lp-demo-typing" style={{ fontSize: 12, color: '#e4e4e7', lineHeight: 1.5, fontFamily: 'system-ui' }}>
                  been using serpbays for backlinks — solid results...
                </div>
              </div>
            </div>

            {/* Item 3 — posted successfully with animated checkmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
              <span className="lp-demo-check" style={{
                width: 24, height: 24, borderRadius: 6, background: '#10b981',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 600 }}>Comment posted on Reddit</div>
                <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>r/SEO · 2s ago</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#10b981',
                padding: '3px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.25)',
              }}>
                ✓ Verified
              </span>
            </div>

            {/* Item 4 — Daily progress */}
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600 }}>Today&apos;s engagement</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>18 / 30</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div className="lp-progress-bar" style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg, #0ea5e9, #60a5fa)',
                  '--fill': '60%',
                } as React.CSSProperties} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ Stats bar ══════ */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16, padding: '28px 24px',
          background: 'linear-gradient(135deg, rgba(14,165,233,0.04), rgba(37,99,235,0.02))',
          border: '1px solid rgba(14,165,233,0.12)',
          borderRadius: 20,
        }}>
          {[
            { num: '7', label: 'Platforms', color: '#38bdf8', delay: 0.05 },
            { num: '24/7', label: 'Autopilot', color: '#10b981', delay: 0.15 },
            { num: '<2m', label: 'Setup Time', color: '#f59e0b', delay: 0.25 },
            { num: '0%', label: 'Detection Risk', color: '#a855f7', delay: 0.35 },
          ].map((s, i) => (
            <div key={s.label} className="lp-stat" style={{
              textAlign: 'center',
              animationDelay: `${s.delay}s`,
              borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <div style={{
                fontSize: 32, fontWeight: 900, color: s.color,
                letterSpacing: '-0.04em', lineHeight: 1,
              }}>{s.num}</div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#71717a',
                marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section flow divider ── */}
      <div className="lp-section-divider" aria-hidden="true" />

      {/* ══════ How It Works (animated timeline) ══════ */}
      <section id="how-it-works" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div className="lp-reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            How It Works
          </p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            Three Steps to Autopilot
          </h2>
          <p style={{ fontSize: 15, color: '#71717a', maxWidth: 520, margin: '12px auto 0' }}>
            From sign-up to your first AI-posted reply in under 5 minutes.
          </p>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          maxWidth: 720, margin: '0 auto', position: 'relative',
        }}>
          {/* Animated vertical line */}
          <div style={{
            position: 'absolute', left: 31, top: 40, bottom: 40, width: 2,
            background: 'linear-gradient(180deg, #0ea5e9, #2563eb)',
            opacity: 0.35,
            animation: 'lp-line-draw 1.6s ease-out 0.4s both',
            transformOrigin: 'top',
          }} />

          {STEPS.map((s, i) => (
            <div key={s.num} className="lp-reveal" style={{
              display: 'flex', gap: 24, padding: '22px 0',
              animationDelay: `${i * 0.12}s`,
              position: 'relative',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 20, flexShrink: 0,
                background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 900, color: '#fff',
                boxShadow: '0 4px 20px rgba(14,165,233,0.3)',
                zIndex: 2,
              }}>{s.num}</div>
              <div style={{ paddingTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: 0 }}>{s.title}</h3>
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#a1a1aa', margin: 0 }}>{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ══════ Features ══════ */}
      <section id="features" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div className="lp-reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Features
          </p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            Built for Growth. Safe by Design.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`lp-feat-card lp-stagger-${Math.min(i+1, 6)}`}>
              <div className="lp-feat-icon">
                <span style={{ position: 'relative', zIndex: 1 }}>{f.icon}</span>
                <span className="lp-feat-icon-dot" aria-hidden="true" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', margin: '0 0 10px' }}>
                <span className="lp-feat-title">{f.title}</span>
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#a1a1aa', margin: 0 }}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ══════ Comparison ══════ */}
      <section id="compare" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div className="lp-reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Compare
          </p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            GetMention vs The Alternatives
          </h2>
          <p style={{ fontSize: 15, color: '#71717a', maxWidth: 520, margin: '12px auto 0' }}>
            See why teams choose GetMention over manual work or generic social tools.
          </p>
        </div>

        <div style={{
          overflowX: 'auto', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          background: '#0f0f12',
          animation: 'lp-fade-up 0.7s ease-out 0.1s both',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'rgba(14,165,233,0.06)' }}>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#a1a1aa', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Feature</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(14,165,233,0.1)' }}>GetMention</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#71717a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Manual</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#71717a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Hootsuite</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#71717a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Taplio</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} className="lp-compare-row" style={{
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                }}>
                  <td style={{ padding: '13px 20px', fontSize: 13.5, fontWeight: 600, color: '#d4d4d8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {row.feature}
                  </td>
                  {(['gm', 'manual', 'hootsuite', 'taplio'] as const).map(k => {
                    const val = row[k];
                    const isGm = k === 'gm';
                    return (
                      <td key={k} style={{
                        padding: '13px 20px', textAlign: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: isGm ? 'rgba(14,165,233,0.05)' : 'transparent',
                      }}>
                        {val === true ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isGm ? '#10b981' : '#4ade80'} strokeWidth="2.5" style={{ display: 'inline-block' }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : val === false ? (
                          <span style={{ color: '#52525b', fontSize: 15, fontWeight: 600 }}>—</span>
                        ) : (
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: isGm ? '#38bdf8' : '#a1a1aa' }}>{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ══════ Pricing ══════ */}
      <section id="pricing" style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div className="lp-reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Pricing
          </p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 12 }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ fontSize: 15, color: '#71717a', maxWidth: 460, margin: '0 auto' }}>
            Start free with Twitter. Upgrade when you need more platforms.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'stretch' }}>
          {PLANS.map((plan, i) => (
            <div key={plan.name} className={`lp-card lp-reveal lp-stagger-${i+1}${plan.popular ? ' lp-breathe' : ''}`} style={{
              padding: 32, borderRadius: 20,
              background: plan.popular ? 'rgba(14,165,233,0.06)' : '#131316',
              border: plan.popular ? '2px solid #0ea5e9' : '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', position: 'relative',
              boxShadow: plan.popular ? '0 0 48px rgba(14,165,233,0.18)' : 'none',
            }}>
              {plan.popular && (
                <span style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  padding: '5px 16px', borderRadius: 9999,
                  background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                  color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>Most Popular</span>
              )}
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em' }}>${plan.price}</span>
                <span style={{ fontSize: 15, color: '#71717a' }}>{plan.period}</span>
              </div>

              {/* Platform badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {plan.platforms.map(p => (
                  <span key={p} style={{
                    padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)',
                    fontSize: 11, fontWeight: 600, color: '#38bdf8',
                  }}>{p}</span>
                ))}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 14, color: '#d4d4d8', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="lp-btn-primary" style={{
                display: 'block', textAlign: 'center', padding: '13px 24px', borderRadius: 12,
                background: plan.popular ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : 'rgba(255,255,255,0.06)',
                color: plan.popular ? '#fff' : '#d4d4d8',
                textDecoration: 'none', fontSize: 14, fontWeight: 700,
                border: plan.popular ? 'none' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: plan.popular ? '0 4px 16px rgba(14,165,233,0.3)' : 'none',
              }}>
                {plan.price === 0 ? 'Get Started Free' : 'Get Started'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ Final CTA ══════ */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{
          padding: '56px 40px', borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(37,99,235,0.06))',
          border: '1px solid rgba(14,165,233,0.2)',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
          animation: 'lp-fade-up 0.8s ease-out both',
        }}>
          <div style={{
            position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
            width: 600, height: 600,
            background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 60%)',
            pointerEvents: 'none', filter: 'blur(40px)',
            animation: 'lp-glow 8s ease-in-out infinite',
          }} />
          <h2 style={{
            fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#fff',
            letterSpacing: '-0.03em', marginBottom: 14, position: 'relative',
          }}>
            Ready to Grow on Autopilot?
          </h2>
          <p style={{
            fontSize: 17, color: '#a1a1aa', maxWidth: 500,
            margin: '0 auto 32px', lineHeight: 1.7, position: 'relative',
          }}>
            Join marketers who save hours every day with AI-powered engagement across 7 platforms.
          </p>
          <Link href="/signup" className="lp-btn-primary" style={{
            display: 'inline-block', padding: '16px 44px', borderRadius: 14,
            background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            color: '#fff', textDecoration: 'none', fontSize: 17, fontWeight: 700,
            boxShadow: '0 8px 28px rgba(14,165,233,0.35)',
            position: 'relative',
          }}>Get Started Free</Link>
        </div>
      </section>

      {/* ══════ Footer ══════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px 24px', maxWidth: 1140, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fafafa' }}>GetMention</span>
            <p style={{ fontSize: 13, color: '#3f3f46', marginTop: 6 }}>&copy; {new Date().getFullYear()} GetMention. All rights reserved.</p>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <Link href="/terms" className="lp-nav">Terms</Link>
            <Link href="/privacy" className="lp-nav">Privacy</Link>
            <Link href="/login" className="lp-nav">Login</Link>
            <Link href="/signup" className="lp-nav">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
