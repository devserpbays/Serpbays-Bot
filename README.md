# GetMention — AI-Powered Social Media Engagement Platform

A multi-user SaaS that automatically discovers relevant social media posts, generates natural AI replies, and engages on your behalf — comments, likes, and upvotes across 7 platforms.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (v1.3.4)                     │
│  Runs in user's browser → real session, real fingerprint        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Scrape   │→ │ Submit   │→ │ Get Task │→ │ Execute  │       │
│  │ Posts    │  │ to API   │  │ from API │  │ Comment  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS API
┌────────────────────────▼────────────────────────────────────────┐
│                   Next.js Server (port 3005)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Store    │→ │ AI Eval  │→ │ Score &  │→ │ Serve    │       │
│  │ in DB    │  │ (OpenClaw)│  │ Generate │  │ Tasks    │       │
│  └──────────┘  └──────────┘  │ Reply    │  └──────────┘       │
│                              └──────────┘                       │
│  Auth: Clerk │ Billing: Stripe │ DB: MongoDB │ Cache: Redis    │
└─────────────────────────────────────────────────────────────────┘
```

## Supported Platforms

| Platform | Scrape | Comment | Like/Upvote | Special |
|---|---|---|---|---|
| **Twitter / X** | Search by keyword | Reply to tweets | Like | Modal dismiss |
| **Reddit** | Home feed + subreddits | Comment on posts | Upvote (shadow DOM + keyboard) | Join subreddits |
| **Facebook** | Group search by keyword | Comment on posts | Like/React | Per-group keyword search |
| **YouTube** | Search by keyword | Comment on videos | Like | **Ad skip + watch 60-120s before engaging** |
| **Quora** | Search by keyword | Answer questions | Upvote | Cloudflare bypass |
| **Pinterest** | Search by keyword | Comment on pins | Like/React | — |
| **Skool** | Community feed by keyword | Comment on posts | Like (heart) | Join communities |

## Key Features

- **Extension-first architecture** — uses the user's real browser session (not headless Playwright). Undetectable by platforms.
- **AI-generated natural replies** — OpenClaw AI scores posts 0-100 for relevance and generates casual, human-sounding replies. Varies tone, length, and style randomly.
- **Smart brand mention cap** — max 1-2 brand mentions/day globally (configurable). Only on high-relevance buying-intent posts. Rest are pure natural engagement.
- **Fair platform rotation** — round-robin across all enabled platforms so no single platform monopolizes the comment budget.
- **Human-like timing** — comment cooldown spreads posts evenly across active hours with jitter. Likes run continuously.
- **YouTube viewer simulation** — skips ads, watches 60-120s with random scroll/mouse micro-actions, then comments. Likes watch 30-60s first.
- **Anti-detection** — per-account health scoring, auto-pause on automation blocks, tiered backoff (2h → 6h → 12h → browse-only → hard pause).
- **Multi-user SaaS** — Clerk auth, Stripe billing (Free/Pro/Business), per-user data isolation, feature gates.
- **Self-healing** — `isProcessing` auto-resets after 3.5 min. Tab cleanup every 1 min. Offscreen popup window for background operation.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| UI | React 19 + TailwindCSS v4 + CSS variables |
| Language | TypeScript 5.9 |
| Database | MongoDB 7 + Mongoose |
| Cache / State | Redis (cron state, rate limiting) |
| Auth | Clerk (`@clerk/nextjs`) |
| Billing | Stripe (webhooks, checkout, portal) |
| AI | OpenClaw Gateway (HTTP API + CLI fallback) |
| Extension | Chrome MV3 (service worker + content scripts) |
| Process Manager | pm2 |
| Reverse Proxy | nginx |

## Project Structure

```
getmention/
├── extension/                    # Chrome Extension (MV3)
│   ├── manifest.json             # Extension manifest (permissions, content scripts)
│   ├── background.js             # Service worker — scrape loop, task polling, tab management
│   ├── content/                  # Platform-specific content scripts
│   │   ├── autopost.js           # Shared relay handler (RELAY_EXECUTE_TASK)
│   │   ├── twitter.js            # Twitter reply, like, scrape
│   │   ├── reddit.js             # Reddit comment, upvote (shadow DOM walker), scrape
│   │   ├── facebook.js           # Facebook comment, like, scrape (group search)
│   │   ├── youtube.js            # YouTube comment, like, ad skip, viewer simulation
│   │   ├── quora.js              # Quora answer, upvote, scrape
│   │   ├── pinterest.js          # Pinterest comment, like, scrape
│   │   └── skool.js              # Skool comment, like, join community, scrape
│   ├── popup/                    # Extension popup UI
│   │   ├── popup.html            # 3-step onboarding + main dashboard
│   │   └── popup.js              # Popup logic (connect, stats, auto-post toggle)
│   ├── utils/
│   │   └── api.js                # API client (auth, fetch wrapper)
│   └── icons/                    # Extension icons (16/48/128px)
│
├── extension-builds/             # Stable zip builds served by /api/download
│   └── getmention-latest.zip
│
├── src/
│   ├── app/
│   │   ├── api/                  # Next.js API routes
│   │   │   ├── extension/        # Extension-facing endpoints
│   │   │   │   ├── ping/         # Connection check + platform counts
│   │   │   │   ├── tasks/        # Serve evaluated posts as engagement tasks
│   │   │   │   ├── tasks/complete/ # Report task results (success/fail)
│   │   │   │   ├── scrape/       # Receive scraped posts, AI-evaluate, store
│   │   │   │   ├── settings/     # Extension config (platforms, limits, keywords)
│   │   │   │   ├── log/          # Activity log ingestion from extension
│   │   │   │   ├── api-key/      # Generate/regenerate extension API key
│   │   │   │   ├── status/       # Extension connection status
│   │   │   │   ├── review/       # Comment review queue
│   │   │   │   └── immediate/    # Force immediate task execution
│   │   │   ├── settings/         # User settings CRUD
│   │   │   ├── posts/            # Post management (list, update, approve)
│   │   │   ├── social-accounts/  # Account management + AccountState
│   │   │   ├── account-health/   # Health scoring API
│   │   │   ├── billing/          # Stripe checkout, portal, webhook, plan
│   │   │   ├── admin/            # Admin-only routes (stats, user management)
│   │   │   ├── download/         # Authenticated extension zip download
│   │   │   ├── evaluate/         # Manual AI evaluation trigger
│   │   │   ├── health/           # Server health check
│   │   │   ├── logs/             # Activity log viewer
│   │   │   └── stats/            # Aggregated engagement stats
│   │   ├── dashboard/            # Dashboard pages
│   │   │   ├── page.tsx          # Main dashboard (stats overview)
│   │   │   ├── accounts/         # Social accounts + extension download
│   │   │   ├── settings/         # Full settings panel
│   │   │   ├── logs/             # Activity log viewer with filters
│   │   │   ├── posts/            # Post management table
│   │   │   ├── review/           # Comment review/approve queue
│   │   │   ├── platform/[platform]/ # Per-platform detail view
│   │   │   ├── billing/          # Subscription management
│   │   │   ├── health/           # Account health dashboard
│   │   │   └── admin/            # Admin panel
│   │   ├── onboarding/           # New user setup wizard (5 steps)
│   │   ├── login/                # Clerk login
│   │   ├── signup/               # Clerk signup
│   │   └── pricing/              # Public pricing page
│   │
│   ├── components/               # Shared React components
│   │   ├── ExtensionInstallCard.tsx  # Download + install card (dark/light themes)
│   │   ├── Dashboard.tsx         # Main dashboard component
│   │   ├── PostCard.tsx          # Post card with actions
│   │   ├── SettingsPanel.tsx     # Settings form
│   │   ├── UpgradeBanner.tsx     # Plan upgrade prompt
│   │   └── StatusBadge.tsx       # Post status badge
│   │
│   ├── lib/                      # Server-side utilities
│   │   ├── openclaw.ts           # AI evaluation (prompt builder, scoring, reply generation)
│   │   ├── accountHealth.ts      # Health score computation, auto-pause, backoff
│   │   ├── activityLog.ts        # Structured logging + notifications
│   │   ├── extensionAuth.ts      # Extension API key authentication
│   │   ├── apiAuth.ts            # Clerk-based API auth
│   │   ├── featureGate.ts        # Plan-based feature limits
│   │   ├── rateLimit.ts          # In-memory sliding window rate limiter
│   │   ├── humanize.ts           # Warmup status, random delays
│   │   ├── mongodb.ts            # Database connection
│   │   ├── redis.ts              # Redis client
│   │   ├── plans.ts              # Stripe plan definitions (Free/Pro/Business)
│   │   ├── subscription.ts       # Stripe subscription management
│   │   ├── schedule.ts           # Cron schedule checks
│   │   ├── cronState.ts          # Redis-backed cron state tracking
│   │   ├── types.ts              # Shared TypeScript interfaces
│   │   └── contentSafety.ts      # Reply content validation
│   │
│   ├── models/                   # Mongoose models
│   │   ├── Post.ts               # Scraped posts (status, score, reply, attempts)
│   │   ├── Settings.ts           # Per-user settings (platforms, keywords, limits)
│   │   ├── AccountState.ts       # Per-account health, pause, proxy state
│   │   ├── Subscription.ts       # Stripe subscription tracking
│   │   ├── ActivityLog.ts        # Structured activity logs
│   │   ├── Notification.ts       # In-app notifications
│   │   ├── User.ts               # User model with cascade delete
│   │   └── TwitterFollowed.ts    # Twitter follow tracking
│   │
│   └── services/                 # Data access layer
│       ├── settingsService.ts
│       ├── postService.ts
│       ├── subscriptionService.ts
│       ├── notificationService.ts
│       └── activityLogService.ts
│
├── scripts/                      # Utility scripts
│   ├── build-extension.sh        # Build extension zip + copy to stable path
│   ├── health-check.ts           # Server health diagnostics
│   ├── check-cron-state.ts       # Redis cron state inspector
│   ├── cleanup-profiles.ts       # Remove stale browser profiles
│   └── delete-garbage-comments.ts # Clean up malformed posted comments
│
├── public/                       # Static assets
├── package.json
├── next.config.ts
├── tsconfig.json
└── ecosystem.config.js           # pm2 configuration
```

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Redis
- [OpenClaw Gateway](https://github.com/openclaw/openclaw) running locally
- Chrome browser (for the extension)

## Installation

```bash
git clone <repo-url> getmention
cd getmention
npm install
```

## Environment Variables

Create `.env.local`:

```env
# Database
MONGODB_URI=mongodb://user:pass@127.0.0.1:27017/social-engagement-bot?authSource=social-engagement-bot

# AI Gateway
OPENCLAW_HOST=127.0.0.1
OPENCLAW_PORT=18789

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup

# Billing (Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Admin
ADMIN_USER_IDS=user_abc123,user_def456
```

## Running

```bash
# Development
npm run dev

# Production
npm run build
pm2 start ecosystem.config.js
# or: pm2 start "next start -p 3005" --name bot-serp
```

Server runs on `http://localhost:3005` (behind nginx at `http://88.222.214.19:3005`).

## Extension Setup

### For development (load unpacked)

```bash
# Build the extension zip
./scripts/build-extension.sh

# Output:
#   /tmp/extension.zip
#   extension-builds/getmention-latest.zip
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `extension/` folder.

### For users (authenticated download)

Users download the extension from the dashboard:
- **Settings page** → top card → "Download .zip" button
- **Accounts page** → top card → "Download .zip" button
- **Onboarding step 5** → inline install card with API key
- **Direct URL**: `GET /api/download` (requires Clerk auth)

### Extension onboarding flow

1. User installs extension → opens popup
2. **Step 1: Welcome** — feature overview (scrape, AI reply, safe)
3. **Step 2: Sign Up** — "Open Dashboard & Sign Up" button → opens `/signup`
4. **Step 3: Connect** — paste API key from Dashboard → Settings → top card
5. Extension validates key via `GET /api/extension/ping`
6. Connected → main screen shows stats, platforms, activity

## Billing Plans

| Feature | Free ($0) | Pro ($49/mo) | Business ($149/mo) |
|---|---|---|---|
| Platforms | 1 | 3 | 6 |
| Posts/day | 3 | 15 | 50 |
| Keywords | 5 | 25 | 100 |

## Post Lifecycle

```
new → evaluating → evaluated → approved/rejected → posted
                      │
                      ├─ score ≥ threshold → auto-approved (if autoPost ON)
                      └─ score < threshold → stays evaluated (queued for review)
```

## Brand Mention System

- **Global cap**: max 2 brand mentions per day (configurable: `maxDailyBrandMentions`)
- Only fires on posts with **buying intent** (`looking for`, `recommend`, `best tool`, etc.)
- Counts both posted and pending mentions toward the cap
- When cap reached → all remaining replies are pure natural engagement (0% brand rate)
- Facebook groups → brand mentions always disabled (spam risk)

## Account Health System

Each connected account has a health score (0-100):
- **Healthy (75-100)**: normal operation
- **Warning (25-74)**: reduced posting frequency
- **Critical (0-24)**: auto-paused, requires manual resume

Factors: error rate, consecutive failures, backoff state, automation blocks.

Tiered escalation on automation blocks:
```
Block 1-2:  backoff 2-6 hours
Block 3:    browse-only 24 hours
Block 4-5:  backoff 12-24 hours
Block 6:    browse-only 24 hours
Block 7-8:  backoff 48 hours
Block 9:    browse-only 24 hours
Block 10+:  hard pause (manual resume required)
```

## Deployment

```bash
# Build
npm run build

# Restart
pm2 restart bot-serp

# Build extension + update download
./scripts/build-extension.sh

# Logs
pm2 logs bot-serp
```

## API Reference

### Extension API (authenticated via `X-Extension-Key` header)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/extension/ping` | Connection check + platform counts |
| `GET` | `/api/extension/tasks` | Get engagement tasks (comments + likes) |
| `POST` | `/api/extension/tasks/complete` | Report task result |
| `POST` | `/api/extension/scrape` | Submit scraped posts for AI evaluation |
| `GET` | `/api/extension/settings` | Get extension config + daily stats |
| `POST` | `/api/extension/log` | Submit activity log entry |
| `POST` | `/api/extension/api-key` | Generate/regenerate API key |

### Dashboard API (authenticated via Clerk session)

| Method | Endpoint | Description |
|---|---|---|
| `GET/PUT` | `/api/settings` | User settings |
| `GET/PATCH` | `/api/posts` | Post management |
| `POST` | `/api/evaluate` | Manual AI evaluation |
| `GET` | `/api/stats` | Engagement statistics |
| `GET` | `/api/logs` | Activity logs |
| `GET/DELETE/PATCH` | `/api/social-accounts` | Account management |
| `GET/POST` | `/api/account-health` | Health scores + manual resume |
| `GET` | `/api/download` | Authenticated extension zip download |
| `GET` | `/api/health` | Server health check |

## License

Proprietary. All rights reserved.
