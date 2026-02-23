# Social Engagement Bot

A Next.js dashboard for monitoring social media platforms, evaluating posts with AI, and posting contextually relevant replies — all from a single interface.

## Overview

The bot scrapes posts from Twitter/X, Reddit, Facebook, LinkedIn, and Quora based on configurable keywords. It then uses the **OpenClaw AI gateway** to evaluate each post for relevance to your company and generate a suggested reply. Posts move through an approval workflow before being published.

```
Scrape → AI Evaluate → Review / Approve → Post Reply
```

## Features

- **Multi-platform scraping** — Twitter/X (cookie auth), Reddit (JSON API), Facebook (Playwright), LinkedIn, Quora
- **AI-powered evaluation** — scores each post 0–100 for relevance and generates a suggested reply via OpenClaw
- **Approval workflow** — post statuses: `new → evaluating → evaluated → approved / rejected → posted`
- **One-click pipeline** — run scrape + evaluate in a single job from the dashboard
- **Per-platform settings** — keywords, daily posting limits, auto-post score thresholds, and schedules
- **Multi-account support** — connect multiple accounts per platform and rotate them
- **Configurable schedules** — per-platform timezone, days of week, and posting hours
- **Reply monitoring** — tracks engagement on posted replies and supports follow-up replies
- **Live dashboard** — real-time stats with auto-polling every 10 seconds

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TailwindCSS v4 |
| Language | TypeScript |
| Database | MongoDB + Mongoose |
| Browser automation | Playwright |
| AI | OpenClaw Gateway (HTTP API + CLI fallback) |
| Linting | ESLint 9 |

## Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)
- [OpenClaw](https://github.com/openclaw/openclaw) running locally or accessible over the network
- (Optional) Platform cookies for Twitter, Facebook, LinkedIn, Quora

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env.local` file in the project root:

```env
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/social-bot

# OpenClaw AI gateway
OPENCLAW_HOST=127.0.0.1
OPENCLAW_PORT=18789
```

## Running

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Configuration

On first run, open **Settings** (top-right) and fill in:

| Field | Description |
|---|---|
| Company Name | Used in AI prompts |
| Company Description | Used in AI prompts |
| Keywords | Terms to search for across platforms |
| Platforms | Which platforms to enable |
| Subreddits | Reddit communities to search (optional) |
| Facebook Groups | Group URLs to scrape |
| Social Accounts | Connected platform accounts |
| Prompt Template | Custom AI prompt (supports `{postContent}`, `{companyName}`, `{companyDescription}`) |

Each platform also has:
- **Daily limit** — max replies per day
- **Auto-post threshold** — AI score (0–100) above which replies can be auto-posted
- **Schedule** — timezone, allowed days, and hour range

## Connecting Platform Accounts

Accounts are authenticated via browser session cookies. Use the API endpoints below to set cookies captured from a logged-in browser session:

| Endpoint | Platform |
|---|---|
| `POST /api/set-twitter-cookies` | Twitter/X |
| `POST /api/set-fb-cookies` | Facebook |
| `POST /api/set-linkedin-cookies` | LinkedIn |
| `POST /api/set-reddit-cookies` | Reddit |
| `POST /api/set-quora-cookies` | Quora |

## API Reference

### Pipeline

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/run-pipeline` | Run full scrape + evaluate job |
| `POST` | `/api/scrape` | Scrape new posts only |
| `POST` | `/api/evaluate` | Evaluate pending posts with AI |

### Posts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/posts` | List posts (supports `?status=`, `?platform=`, `?page=`, `?limit=`) |
| `PATCH` | `/api/posts` | Update a post (approve, reject, edit reply, etc.) |
| `GET` | `/api/stats` | Aggregated stats by status and platform |

### Posting

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/post-reply` | Post a reply (auto-routes by platform) |
| `POST` | `/api/fb-post-reply` | Post Facebook reply |
| `POST` | `/api/rd-post-reply` | Post Reddit reply |
| `POST` | `/api/li-post-reply` | Post LinkedIn reply |

### Settings & Accounts

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/settings` | Get or update settings |
| `GET/POST/DELETE` | `/api/social-accounts` | Manage connected accounts |

### Status Checks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/twitter-status` | Twitter connection status |
| `GET` | `/api/reddit-status` | Reddit connection status |
| `GET` | `/api/fb-status` | Facebook connection status |
| `GET` | `/api/linkedin-status` | LinkedIn connection status |
| `GET` | `/api/quora-status` | Quora connection status |

## Post Lifecycle

```
new
 └─► evaluating  (AI is processing)
      └─► evaluated  (score + suggested reply ready)
           ├─► approved  (human approved or score above threshold)
           │    └─► posted  (reply published)
           └─► rejected
```

## Project Structure

```
src/
├── app/
│   ├── api/           # Next.js API routes
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Dashboard.tsx  # Main UI
│   ├── PostCard.tsx   # Individual post card with approval actions
│   ├── SettingsPanel.tsx
│   └── StatusBadge.tsx
├── lib/
│   ├── scraper.ts     # Platform scraping logic
│   ├── openclaw.ts    # AI evaluation via OpenClaw
│   ├── twitter.ts     # Twitter cookie-auth client
│   ├── facebook.ts    # Facebook Playwright automation
│   ├── linkedin.ts    # LinkedIn automation
│   ├── reddit.ts      # Reddit helper
│   ├── quora.ts       # Quora automation
│   ├── schedule.ts    # Per-platform schedule checks
│   ├── mongodb.ts     # DB connection
│   └── types.ts       # Shared TypeScript types
└── models/
    ├── Post.ts        # Post mongoose schema
    └── Settings.ts    # Settings mongoose schema
```

## Linting

```bash
npm run lint
```
