# GetMention — AI Social Engagement Bot

A multi-tenant SaaS platform that monitors social media 24/7, finds relevant conversations using AI, and posts authentic replies to grow your brand — across 6 platforms from a single dashboard.

```
Scrape → AI Evaluate → Review / Auto-Post → Track Engagement
```

## Features

### Core
- **6-platform support** — Twitter/X, Reddit, Facebook, YouTube, Pinterest, Quora
- **AI-powered evaluation** — scores posts 0–100 for relevance via OpenClaw, generates natural replies
- **Auto-posting** — posts above your score threshold are published automatically
- **Human-like behavior** — randomized delays, reading simulation, varied engagement (like, retweet, bookmark, reply)
- **Anti-ban protection** — account warmup, health scoring, cooldowns, daily limits, jitter timing

### Dashboard
- **Pipeline management** — run scrape + evaluate jobs, monitor cron status
- **Per-platform settings** — keywords, daily limits, auto-post thresholds, schedules
- **Account health monitoring** — 0–100 health score per account, auto-pause at risk
- **Activity logs** — full audit trail of every scrape, evaluation, and post
- **Real-time notifications** — toast alerts + email via Resend
- **Admin panel** — user management, queue monitoring, system stats

### Platform
- **Multi-account support** — connect multiple accounts per platform, rotate them
- **Cookie-based auth** — paste browser cookies from Cookie-Editor extension
- **Encrypted storage** — cookies encrypted with AES-256-GCM at rest
- **Session monitoring** — alerts when cookies expire or sessions fail

### Business
- **Clerk authentication** — OAuth sign-in/sign-up with onboarding flow
- **Subscription billing** — PayPal integration with Free / Pro / Business tiers
- **Plan-based feature gating** — platform count, daily limits, keywords per plan
- **BullMQ job queue** — background workers for browser automation

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, TailwindCSS v4 |
| Language | TypeScript |
| Database | MongoDB (Mongoose) + Redis (IORedis) |
| Auth | Clerk |
| Billing | PayPal Subscriptions |
| Job Queue | BullMQ + Redis |
| Browser | Playwright (Chromium) |
| AI | OpenClaw Gateway |
| Email | Resend |
| Deployment | PM2 + Docker Compose |

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Redis 7+
- [OpenClaw](https://github.com/openclaw/openclaw) running locally or accessible over the network
- Clerk account (publishable + secret keys)
- (Optional) PayPal developer account for billing
- (Optional) Resend account for email notifications

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Copy env template and fill in values
cp .env.example .env.local

# 4. Start development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for development.

### Using Docker

```bash
# Start MongoDB, Redis, app, and worker
docker compose up -d
```

App runs at [http://localhost:3005](http://localhost:3005).

### Using setup script

```bash
chmod +x setup.sh
./setup.sh
```

## Environment Variables

Create `.env.local` in the project root:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/social-engagement-bot
REDIS_URL=redis://127.0.0.1:6379

# AI Gateway
OPENCLAW_HOST=127.0.0.1
OPENCLAW_PORT=18789
OPENCLAW_GATEWAY_TOKEN=your_token

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# App
NEXT_PUBLIC_APP_URL=http://localhost:3005
CRON_USER_ID=your_clerk_user_id

# PayPal Billing (optional)
PAYPAL_CLIENT_ID=
PAYPAL_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=sandbox

# Email Notifications (optional)
RESEND_API_KEY=
RESEND_FROM=GetMention <onboarding@resend.dev>

# Security
COOKIE_ENCRYPTION_KEY=  # 32-byte hex string for AES-256-GCM
ADMIN_HEALTH_KEY=       # secret key for health endpoint

# Admin / Internal
ADMIN_USER_IDS=         # comma-separated Clerk user IDs
INTERNAL_USER_IDS=      # users with free Business-tier access
```

## Production Deployment

```bash
# Build
npm run build

# Run with PM2 (uses ecosystem.config.js)
pm2 start ecosystem.config.js

# Or manually
npm start              # Next.js on port 3005
npx tsx src/worker.ts  # BullMQ worker (run separately)
```

The worker process is required for cookie validation, browser-based scraping, and posting. Run at least 1 worker instance alongside the Next.js app.

```bash
# Deploy script (git pull + build + restart)
chmod +x deploy.sh
./deploy.sh
```

## Post Lifecycle

```
new → evaluating → evaluated → approved/rejected → posted
```

- Posts scoring above the auto-post threshold skip manual approval
- Account health and daily limits gate actual posting
- Failed posts retry up to 3 times before being marked failed

## Anti-Ban System

The bot mimics human behavior to avoid account bans:

- **Reading delay** — pauses 3–20s based on post length before engaging
- **Varied actions** — randomly likes, retweets, bookmarks, or replies (not all every time)
- **Action gaps** — 2–8s between actions on the same post
- **Inter-post delay** — 60–180s between replies
- **Account warmup** — new accounts start with 1 post/day, scaling up over weeks
- **Random skip** — 15% chance to skip a cron run entirely
- **Cooldown jitter** — ±30% randomization on cooldown timers
- **Health scoring** — accounts auto-pause when error rate spikes

## Project Structure

```
src/
├── app/
│   ├── api/                    # 44+ API routes
│   ├── dashboard/              # Dashboard pages
│   │   ├── page.tsx            # Overview
│   │   ├── pipeline/           # Cron & job management
│   │   ├── accounts/           # Social account connections
│   │   ├── health/             # Account health monitoring
│   │   ├── settings/           # Bot configuration
│   │   ├── billing/            # Subscription management
│   │   ├── logs/               # Activity logs
│   │   ├── admin/              # Admin panel
│   │   └── platform/[platform] # Per-platform detail
│   ├── onboarding/             # Multi-step onboarding wizard
│   ├── login/                  # Clerk sign-in
│   ├── signup/                 # Clerk sign-up
│   └── middleware.ts           # Route protection & security headers
├── lib/
│   ├── twitter.ts              # Twitter browser automation
│   ├── twitterHttp.ts          # Twitter GraphQL HTTP client
│   ├── reddit.ts               # Reddit automation
│   ├── facebook.ts             # Facebook Playwright automation
│   ├── youtube.ts              # YouTube automation
│   ├── pinterest.ts            # Pinterest automation
│   ├── quora.ts                # Quora automation
│   ├── openclaw.ts             # AI evaluation & reply generation
│   ├── antiBan.ts              # Human-like engagement engine
│   ├── humanize.ts             # Platform safety limits & browser hardening
│   ├── accountHealth.ts        # Health scoring & auto-pause
│   ├── queue.ts                # BullMQ job queue
│   ├── redis.ts                # Redis client
│   ├── cookieStore.ts          # Encrypted cookie storage
│   ├── cronRunner.ts           # Cron job orchestration
│   ├── cronScheduler.ts        # Schedule management
│   ├── featureGate.ts          # Plan-based feature limits
│   ├── rateLimit.ts            # API rate limiting
│   └── mongodb.ts              # Database connection
├── models/
│   ├── Post.ts                 # Scraped posts & replies
│   ├── Settings.ts             # Per-user bot configuration
│   ├── BrowserCookie.ts        # Encrypted platform cookies
│   ├── Notification.ts         # User notifications
│   ├── Subscription.ts         # Billing subscriptions
│   └── ActivityLog.ts          # Audit trail
├── services/                   # Business logic layer
├── worker.ts                   # BullMQ worker process
scripts/
├── master-cron.ts              # Orchestrates all platform crons
├── twitter-cron.ts             # Twitter scrape + post
├── reddit-cron.ts              # Reddit scrape + post
├── fb-comment-cron.ts          # Facebook scrape + post
├── youtube-cron.ts             # YouTube scrape + post
├── pinterest-cron.ts           # Pinterest scrape + post
├── quora-cron.ts               # Quora scrape + post
└── check-account-age.ts        # Account age verification
```

## Subscription Plans

| Feature | Free | Pro ($49/mo) | Business ($149/mo) |
|---|---|---|---|
| Platforms | 2 | 4 | All 6 |
| Posts/day | 3 | 15 | 50 |
| Keywords | 5 | 25 | 100 |
| Auto-posting | No | Yes | Yes |
| Cron scheduling | No | Yes | Yes |

## Linting

```bash
npm run lint
```
