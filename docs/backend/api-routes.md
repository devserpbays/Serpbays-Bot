<div align="center">

# 🔌 Backend — API Routes

**Complete inventory of every REST endpoint under `src/app/api/`**

![Routes](https://img.shields.io/badge/routes-44-0ea5e9?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js_App_Router-16.1.6-000?style=flat-square)
![Auth](https://img.shields.io/badge/auth-Clerk_+_API_Key-6c47ff?style=flat-square)

</div>

---

## 🗺️ Route Map

```mermaid
flowchart TB
    R[🔌 /api]
    subgraph EXT [🧩 Extension · X-Extension-Key]
        E1[/ping/]
        E2[/tasks/]
        E3[/tasks/complete/]
        E4[/immediate/]
        E5[/review/]
        E6[/settings/]
        E7[/scrape/]
        E8[/log/]
        E9[/status/]
        E10[/api-key/]
    end
    subgraph AUTH [🔐 Auth & account · Clerk]
        A1[/auth/me/]
        A2[/auth/complete-onboarding/]
        A3[/me/status/]
        A4[/account-health/]
        A5[/active-accounts/]
        A6[/social-accounts/]
        A7[/social-accounts/resume/]
    end
    subgraph POSTS [📝 Posts & engagement · Clerk]
        P1[/posts/]
        P2[/posted-comments/]
        P3[/evaluate/]
        P4[/extract-company-info/]
    end
    subgraph STATS [📊 Stats & platform status · Clerk]
        S1[/stats/]
        S2[/twitter-status/]
        S3[/reddit-status/]
        S4[/fb-status/]
        S5[/quora-status/]
        S6[/youtube-status/]
        S7[/pinterest-status/]
    end
    subgraph SETS [⚙️ Settings · Clerk]
        SE1[/settings/]
        SE2[/notifications/]
    end
    subgraph CRON [⏰ Cron · Clerk]
        C1[/cron-control/]
        C2[/cron-status/]
        C3[/logs/]
    end
    subgraph BILL [💳 Billing · PayPal]
        B1[/billing/plan/]
        B2[/billing/usage/]
        B3[/billing/create-checkout/]
        B4[/billing/create-portal/]
        B5[/billing/webhook/]
    end
    subgraph ADM [👑 Admin]
        AD1[/admin/users/]
        AD2[/admin/stats/]
    end
    subgraph SYS [🛠️ System]
        SY1[/health/]
        SY2[/download/]
    end

    R --> EXT
    R --> AUTH
    R --> POSTS
    R --> STATS
    R --> SETS
    R --> CRON
    R --> BILL
    R --> ADM
    R --> SYS

    style EXT fill:#10b98122,stroke:#10b981
    style AUTH fill:#0ea5e922,stroke:#0ea5e9
    style POSTS fill:#ec489922,stroke:#ec4899
    style STATS fill:#8b5cf622,stroke:#8b5cf6
    style SETS fill:#f59e0b22,stroke:#f59e0b
    style CRON fill:#64748b22,stroke:#64748b
    style BILL fill:#003087,color:#fff
    style ADM fill:#ef444422,stroke:#ef4444
    style SYS fill:#14b8a622,stroke:#14b8a6
```

---

## 🔑 Authentication Legend

| Badge | Meaning |
|---|---|
| ![Clerk](https://img.shields.io/badge/auth-Clerk-6c47ff?style=flat-square) | Requires dashboard user session (Clerk JWT) |
| ![ExtKey](https://img.shields.io/badge/auth-X--Extension--Key-10b981?style=flat-square) | Requires extension API key header |
| ![Admin](https://img.shields.io/badge/auth-Admin-ef4444?style=flat-square) | Clerk + `ADMIN_USER_IDS` membership |
| ![PayPal](https://img.shields.io/badge/auth-PayPal_sig-003087?style=flat-square) | PayPal webhook signature verified |
| ![Public](https://img.shields.io/badge/auth-Public-64748b?style=flat-square) | No auth required |

---

## 1 · 🧩 Extension API ![ExtKey](https://img.shields.io/badge/X--Extension--Key-10b981?style=flat-square)

Routes the Chrome extension calls. Reachable without Clerk middleware — see `src/middleware.ts` public allow-list.

| Path | Method | Purpose |
|---|:-:|---|
| `/api/extension/ping` | `GET` | Health check; returns `{ extensionPlatforms, postedByPlatform }` for popup stats. |
| `/api/extension/settings` | `GET` | User's keywords, enabled platforms, limits, prompt template, cron schedule. |
| `/api/extension/tasks` | `GET` | Pending tasks to execute (comments on approved posts + likes + upvotes). |
| `/api/extension/tasks/complete` | `POST` | Report task outcome. |
| `/api/extension/immediate` | `GET` / `POST` | Dashboard-approve flow (single-tab execution). |
| `/api/extension/review` | `GET` / `POST` | Review queue: fetch top evaluated posts; submit manual decisions. |
| `/api/extension/scrape` | `POST` | Submit scraped posts. Deduped by `(userId, url)`. |
| `/api/extension/log` | `POST` | Write activity log (`platform, level, action, message, meta`). |
| `/api/extension/status` | `POST` | Report per-platform login state `{ platform, loggedIn }`. |
| `/api/extension/api-key` | `POST` / `DELETE` | ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square) Generate / revoke extension API key. |

### 🔁 `tasks/complete` body shape

```ts
{
  taskId: string                    // Post._id
  success: boolean
  error?: string                    // on failure
  action: 'comment' | 'like' | 'upvote'
  alreadyCommented?: boolean        // skip-flag
  alreadyLiked?: boolean
  alreadyUpvoted?: boolean
  skipped?: boolean                 // e.g. comments_disabled, banned
  reason?: string                   // skip reason label
  verifyMethod?: string             // editor_cleared, url_changed, state_flipped...
  verifiedAnswerUrl?: string        // Quora /stats match URL
  postUrl?: string                  // the actual post URL after navigation
}
```

**Server-side effect:**

```mermaid
flowchart LR
    IN[Body arrives] --> S{success?}
    S -->|true + comment| SP[Post.status = 'posted'<br/>replyUrl, postedAt,<br/>verifiedAnswerUrl]
    S -->|true + like/upvote| SL[likedByBot = true]
    S -->|skipped=true| SK[Post.status = 'skipped'<br/>or 'posted' for already_commented<br/>skipReason]
    S -->|false| SF["$inc: { postAttempts: 1 }"]

    style SP fill:#10b981,color:#fff
    style SL fill:#10b981,color:#fff
    style SK fill:#f59e0b,color:#fff
    style SF fill:#ef4444,color:#fff
```

---

## 2 · 🔐 Authentication & account ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/auth/me` | `GET` | Returns Clerk profile for the logged-in user. |
| `/api/auth/complete-onboarding` | `POST` | Marks Clerk JWT claim `onboardingCompleted=true`. |
| `/api/me/status` | `GET` | Lightweight dashboard status (name, plan, cron state). |
| `/api/account-health` | `GET` / `POST` | Account health — per-platform `healthScore`, pause states, recent errors. |
| `/api/active-accounts` | `GET` | List of connected social accounts. |
| `/api/social-accounts` | `GET` / `DELETE` / `PATCH` | Add / remove / toggle a social account. |
| `/api/social-accounts/resume` | `POST` | Clears `autoPaused=true` on an account. |

---

## 3 · 📝 Posts & engagement ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/posts` | `GET` | Paginated, filtered list of Posts (status, platform, score, date). |
| `/api/posts` | `PATCH` | Approve / reject / edit a Post. |
| `/api/posted-comments` | `GET` | Successfully-posted comments with engagement metrics. |
| `/api/evaluate` | `POST` | Run AI evaluation on a Post (OpenClaw). |
| `/api/extract-company-info` | `POST` | Parse `companyName` + `companyDescription` from free-text (onboarding). |

---

## 4 · 📊 Stats & per-platform status ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/stats` | `GET` | Aggregated stats (posted count, platform breakdown). |
| `/api/twitter-status` | `GET` | Last Twitter run + health + engagement summary. |
| `/api/reddit-status` | `GET` | Same for Reddit. |
| `/api/fb-status` | `GET` | Same for Facebook. |
| `/api/quora-status` | `GET` | Same for Quora. |
| `/api/youtube-status` | `GET` | Same for YouTube. |
| `/api/pinterest-status` | `GET` | Same for Pinterest. |
| `/api/twitter-engagement` | `GET` | Likes / retweets / replies on bot-posted tweets. |
| `/api/twitter-communities` | `GET` / `POST` | Manage Twitter community IDs. |

---

## 5 · ⚙️ Settings & notifications ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/settings` | `GET` | Returns the Settings doc. |
| `/api/settings` | `PUT` | Updates Settings; enforces plan limits via `checkPlanLimit()`. |
| `/api/notifications` | `GET` / `PATCH` | Fetch notifications; mark read. |

---

## 6 · ⏰ Cron & logs ![Clerk](https://img.shields.io/badge/Clerk-6c47ff?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/cron-control` | `GET` / `POST` | Toggle `Settings.autoPostingPaused`. |
| `/api/cron-status` | `GET` | Per-platform cron lock + last run status. |
| `/api/cron-log` | `GET` | Legacy per-platform activity log. |
| `/api/logs` | `GET` | User's activity feed (info / warn / error / success). Feeds dashboard logs + popup recent activity. |

---

## 7 · 💳 Billing ![PayPal](https://img.shields.io/badge/PayPal-003087?style=flat-square)

| Path | Method | Auth | Purpose |
|---|:-:|:-:|---|
| `/api/billing/plan` | `GET` | Clerk | Current plan + limits + subscription status. |
| `/api/billing/usage` | `GET` | Clerk | Feature-usage snapshot vs. plan limits. |
| `/api/billing/create-checkout` | `POST` | Clerk | Creates a PayPal subscription approval URL. |
| `/api/billing/create-portal` | `POST` | Clerk | Returns the PayPal self-service cancel/upgrade link. |
| `/api/billing/webhook` | `POST` | PayPal sig | Handles `BILLING.SUBSCRIPTION.*` events → updates Subscription doc. |

**Required env:** `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_PRO_YEARLY`, `PAYPAL_PLAN_BUSINESS`, `PAYPAL_PLAN_BUSINESS_YEARLY`.

---

## 8 · 👑 Admin ![Admin](https://img.shields.io/badge/Admin-ef4444?style=flat-square)

| Path | Method | Purpose |
|---|:-:|---|
| `/api/admin/users` | `GET` | List all users, post counts, subscriptions. |
| `/api/admin/users/[userId]` | `GET` | Single user details + cascade-delete helper. |
| `/api/admin/stats` | `GET` | Platform-wide stats (total posts, users, revenue). |

> Admin identity is established by `ADMIN_USER_IDS` env (comma-separated Clerk user IDs).

---

## 9 · 🛠️ System

| Path | Method | Auth | Purpose |
|---|:-:|:-:|---|
| `/api/health` | `GET` | Public | Liveness check. Returns `{ ok: true }`. |
| `/api/download` | `GET` | Clerk | Returns the latest extension zip. |

---

## 10 · 🔗 Route ↔ Model touch points

```mermaid
flowchart LR
    R1[extension/scrape] -->|insert unique| M1[(Post)]
    R2[extension/tasks/complete] -->|update status/replyUrl/<br/>verifiedAnswerUrl| M1
    R3[extension/immediate POST] -->|update status=posted| M1
    R4[extension/log] -->|insert| M2[(ActivityLog)]
    R5[extension/status] -->|upsert| M3[(AccountState)]
    R6[settings PUT] -->|update| M4[(Settings)]
    R7[posts PATCH] -->|update| M1
    R8[billing/webhook] -->|update| M5[(Subscription)]
    R9[auth/complete-onboarding] -->|JWT claim| CLERK[Clerk]

    style M1 fill:#10b981,color:#fff
    style M2 fill:#0ea5e9,color:#fff
    style M3 fill:#8b5cf6,color:#fff
    style M4 fill:#f59e0b,color:#fff
    style M5 fill:#ef4444,color:#fff
    style CLERK fill:#6c47ff,color:#fff
```

---

## 11 · 🛡️ Middleware behavior

**File:** `src/middleware.ts`

```mermaid
flowchart TB
    REQ[🌐 Incoming request] --> HV{Valid host?<br/>localhost, 88.222.214.19,<br/>EXTRA_ALLOWED_HOSTS}
    HV -->|No| BLK[❌ 400]
    HV -->|Yes| PUB{In public allow-list?}
    PUB -->|Yes| OK1[✅ Allow]
    PUB -->|No| AU{/dashboard or /api?}
    AU -->|Yes| CL{Clerk session?}
    AU -->|No| OK2[✅ Allow]
    CL -->|No| RDIR[↪️ /login]
    CL -->|Yes| OB{onboardingCompleted<br/>or ob_done cookie?}
    OB -->|No & /dashboard*| OBRDIR[↪️ /onboarding]
    OB -->|Yes| OK3[✅ Allow]

    OK1 & OK2 & OK3 --> HEADERS[Inject security headers<br/>+ CORS for extension]

    style OK1 fill:#10b981,color:#fff
    style OK2 fill:#10b981,color:#fff
    style OK3 fill:#10b981,color:#fff
    style BLK fill:#ef4444,color:#fff
    style RDIR fill:#f59e0b,color:#fff
    style OBRDIR fill:#f59e0b,color:#fff
    style HEADERS fill:#64748b,color:#fff
```

**Public allow-list** (no auth required):
`/`, `/login(.*)`, `/signup(.*)`, `/pricing`, `/terms`, `/privacy`, `/api/billing/webhook`, `/api/health`, `/api/extension/ping`, `/api/extension/tasks(.*)`, `/api/extension/settings`, `/api/extension/status`, `/api/extension/scrape`, `/api/extension/log`, `/api/extension/immediate`.

**Security headers injected on all responses:**

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**CORS:** `Access-Control-Allow-Origin: *` on `/api/extension/*` only.

---

## 12 · ⚡ Rate Limits

Server-side limits from `src/lib/rateLimit.ts` (Redis sliding window):

| Tier | Limit | Applied to |
|---|---|---|
| ![api](https://img.shields.io/badge/api-60/min-0ea5e9?style=flat-square) | 60 / min | `/api/logs`, `/api/stats`, `/api/posts`, dashboard reads |
| ![scrape](https://img.shields.io/badge/scrape-5/5min-10b981?style=flat-square) | 5 / 5 min | `/api/extension/scrape` |
| ![post](https://img.shields.io/badge/post-20/min-f59e0b?style=flat-square) | 20 / min | `/api/extension/tasks/complete`, `/api/extension/immediate` POST |
| ![auth](https://img.shields.io/badge/auth-10/min-8b5cf6?style=flat-square) | 10 / min | `/api/auth/*` |
| ![billing](https://img.shields.io/badge/billing-10/min-003087?style=flat-square) | 10 / min | `/api/billing/create-checkout`, `/api/billing/create-portal` |
| ![cookieUpload](https://img.shields.io/badge/cookieUpload-8/15min-ef4444?style=flat-square) | 8 / 15 min | Legacy endpoints |

> 429 responses include a `Retry-After` header.

---

<div align="center">

**← [Architecture](../architecture.md)** · **[Back to index](../README.md)** · **Next: [Models](./models.md)** →

</div>
