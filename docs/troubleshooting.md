<div align="center">

# 🩺 Troubleshooting

**Common errors and their fixes — dev, prod, and extension**

</div>

---

## 🗺️ Where to Look First

```mermaid
flowchart TB
    P{Problem area?}
    P -->|Server won't start| S1[pm2 status · build log · .env.local]
    P -->|Site returns 500| S2[pm2 logs bot-serp --err]
    P -->|Extension not posting| S3[chrome://extensions → Inspect views → service worker]
    P -->|Scrape returns 0 posts| S4[/dashboard/logs → look for stats + sample hrefs]
    P -->|Auth loops| S5[Clerk claim onboardingCompleted + ob_done cookie]
    P -->|Rate-limit 429| S6[redis-cli KEYS rate:*]
    P -->|DB timeouts| S7[mongosh ping + connection pool env]

    style S1 fill:#0ea5e9,color:#fff
    style S2 fill:#0ea5e9,color:#fff
    style S3 fill:#10b981,color:#fff
    style S4 fill:#f59e0b,color:#fff
```

---

## 🏗️ Build & Deploy

### `next build` fails with `Cannot find module 'X'`

**Most common culprits (all pre-existing dead code in the extension branch):**

| Module | Fix |
|---|---|
| `ioredis` | `npm install ioredis` — referenced by `src/lib/redis.ts` |
| `bullmq/node_modules/ioredis` | Fixed — `redis.ts` now imports plain `ioredis` |
| `playwright` | Fixed — `humanize.ts` uses local type stand-ins; `debugScreenshot.ts` was deleted |

> [!NOTE]
> These were pre-existing bugs that happened to not surface in earlier builds because their code paths got tree-shaken. Once more routes were added, the compile graph widened and the errors appeared.

### Build succeeds but pm2 restart-loops

Symptom: `pm2 logs bot-serp --err` shows `Error: Could not find a production build in the '.next' directory`.

**Cause:** A failed build wiped `.next/BUILD_ID`. pm2 keeps trying to `next start`, which needs that file.

**Fix:**
```bash
pm2 stop bot-serp          # halt the loop
npm run build              # produce a fresh .next/
pm2 restart bot-serp --update-env
```

### Build is stuck / extremely slow

```bash
uptime                                      # check load avg
ps aux | grep "next build" | grep -v grep   # confirm PID is ours
free -h                                     # check RAM / swap pressure
```

On this VPS with multiple projects, builds can take **5-10 min** if other projects are building simultaneously. That's normal.

### `pm2: Process not found` after build

Your `bot-serp` app entry was removed from pm2. Re-add it:
```bash
cd /var/www/ai-bot/bot-serp
pm2 start "npm start" --name bot-serp
pm2 save
```

---

## 🌐 Site Errors (500 / 502 / 404)

### 500 Internal Server Error

```bash
pm2 logs bot-serp --err --lines 50 --nostream
```

Common messages and their causes:

| Error | Cause | Fix |
|---|---|---|
| `InvariantError: client reference manifest for route "/_not-found" does not exist` | Partial `.next/` | Rebuild: `npm run build` |
| `MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017` | Mongo down | `sudo systemctl start mongod` |
| `Redis connection refused` | Redis down | `sudo systemctl start redis-server` |
| `Clerk: Missing CLERK_SECRET_KEY` | `.env.local` not loaded | `pm2 restart bot-serp --update-env` |

### 502 Bad Gateway (nginx)

pm2 isn't running. `pm2 status bot-serp` — if stopped/errored, `pm2 restart bot-serp`.

### 404 on `/api/extension/ping` or other extension routes

Most likely middleware didn't allow the route. Verify `src/middleware.ts` still has:

```ts
'/api/extension/ping',
'/api/extension/tasks(.*)',
'/api/extension/settings',
'/api/extension/status',
'/api/extension/scrape',
'/api/extension/log',
'/api/extension/immediate',
```

---

## 🧩 Extension Issues

### "Not connected" in popup

1. Right-click extension icon → **Options** — no options page; so click the icon → check if the status dot is red
2. Open `chrome://extensions` → GetMention → **Inspect views: service worker**
3. Console — look for:
   - `Connection refused` → server is down or wrong URL
   - `403 Forbidden` → wrong API key
   - `CORS blocked` → missing host permission

**Fix by order of likelihood:**
```
a. Generate a fresh API key in /dashboard/settings → paste in popup
b. Check the server URL in popup matches where the dashboard is running
c. chrome://extensions → Reload button → re-grant permissions if prompted
```

### Scrape returns 0 posts on one platform

Check the log for stats line:
```
Scraped "guest post": scanned 41 items: 32 no-links, 9 no-url, 0 kw-miss
```

| Stat | Means | Likely fix |
|---|---|---|
| `no-links` | DOM element matched but had no `<a>` child | Selector is too wide — ignore, only `no-url` matters |
| `no-url` | Link found but not a post permalink | Platform DOM changed; update selectors in `extension/content/<platform>.js` |
| `kw-miss` | Posts found but none match keywords | Keyword too narrow; add variants in settings |
| `dupe` | Post already in DB | Normal after first few cycles |
| `items: 0` | No elements matched | Page didn't render (Cloudflare / login required / lazy-load not triggered) |

### Comment posts but log shows "not confirmed"

Open the platform post in a regular tab, check if the comment is actually there. If yes:
- Your verification signal isn't firing — content script needs a new detection method
- See per-platform details in [features/commenting.md](./features/commenting.md)

If the comment **isn't** there:
- Check rejection toasts (Reddit/Quora): `rate_limited`, `spam_filter`, `karma_gate`
- Check if the account is shadow-banned or muted
- For Reddit: confirm you can manually post a comment logged in as the same account

### YouTube specifically: "Comment editor not found"

YouTube A/B-tests composer variants. The content script logs a DOM snapshot on failure — paste the snapshot to find the right selector to add. See [extension/content-scripts.md](./extension/content-scripts.md#youtube).

### Skool: "Skipped comment on skool (banned)"

Extension detected a restriction phrase. Open the community manually:
- Can you post a comment? If NO → you are actually banned/muted/pending
- If YES → selector drift; check `detectSkoolRestriction()` in `extension/content/skool.js`

---

## 🔐 Auth Issues

### Logged-in user redirects to `/onboarding` in a loop

**Cause:** Clerk JWT claim `onboardingCompleted` is not set. Middleware keeps redirecting.

**Fix:**
1. Visit `/onboarding` manually → complete all 5 steps
2. `POST /api/auth/complete-onboarding` runs → sets the claim
3. Grace-period cookie `ob_done` persists for 24 h as a fallback

### Admin pages show 403

Check `ADMIN_USER_IDS` env var contains your Clerk user ID.

```bash
grep ADMIN_USER_IDS .env.local
# then:
# user_xxxxxxxxxxxxxx (your id from /dashboard → URL)
```

---

## ⚡ Rate Limit (HTTP 429)

```bash
redis-cli KEYS "rate:*"
redis-cli TTL "rate:api:user_xxx"
```

Tiers (from `src/lib/rateLimit.ts`):
- `api` 60/min
- `scrape` 5/5min
- `post` 20/min
- `auth` 10/min
- `billing` 10/min

**To reset during dev:**
```bash
redis-cli DEL $(redis-cli KEYS "rate:*user_your_id*")
```

> [!WARNING]
> `redis-cli FLUSHDB` nukes ALL keys in the Redis DB including plan cache and cron locks.

---

## 🗄️ Database Issues

### Mongoose connection errors

```
MongooseError: Operation `posts.find()` buffering timed out
```

**Cause:** Connection pool exhausted or Mongo unreachable.

**Fix:**
```bash
mongosh --eval 'db.runCommand({ping: 1})'   # reachable?
mongosh --eval 'db.serverStatus().connections'  # current open conns
pm2 restart bot-serp --update-env            # reopen pool
```

### Duplicate key error on `posts` collection

`E11000 duplicate key error collection: posts index: userId_1_url_1`

Expected — the `(userId, url)` unique index dedupes scrapes. The server returns `{ created: N, duplicates: M }` response; not an error for clients.

### Posts stuck in `evaluating` status

```js
db.posts.updateMany(
  { status: 'evaluating', updatedAt: { $lt: new Date(Date.now() - 10*60*1000) } },
  { $set: { status: 'new' } }
)
```

Resets stale evaluations to re-run.

---

## 🤖 AI Evaluation Issues

### All posts score below threshold → `no_relevant_posts` warnings

```
14 posts evaluated for youtube but none scored above auto-post threshold (70)
```

Options:
1. Lower `{platform}AutoPostThreshold` in `/dashboard/settings` (try 50)
2. Add more specific keywords
3. Check OpenClaw is reachable (error log will show `[openclaw] HTTP failed, falling back to CLI`)

### OpenClaw falling back to CLI every time

```
[openclaw] HTTP failed, falling back to CLI: The operation was aborted due to timeout
```

OpenClaw HTTP gateway is down or slow. CLI fallback works but is ~10× slower. Restart the OpenClaw service or reach its maintainer.

---

## 📧 Email / Notifications

### Resend emails not sending

```bash
grep RESEND .env.local    # RESEND_API_KEY + RESEND_FROM set?
```

Also check `/dashboard/logs` for `emailNotifier` errors.

---

## 🧹 Safe Reset During Dev

```bash
# Nuke Next cache
rm -rf .next

# Wipe DB (careful)
mongosh social-engagement-bot --eval 'db.dropDatabase()'

# Wipe Redis
redis-cli FLUSHDB

# Reload extension
# chrome://extensions → GetMention → reload icon
```

---

## 🆘 Escalation Checklist

If the above didn't help:

1. **Save the failing log line** — `pm2 logs bot-serp --lines 200 > /tmp/botserp-log.txt`
2. **Capture browser console** — DevTools → extension's Inspect Views → service worker → Copy All
3. **Note your extension version** — click icon → footer shows `v1.0.xx`
4. **Confirm branch** — `git rev-parse HEAD` and `git branch --show-current`

Then open an issue on GitHub with those 4 items attached.

---

<div align="center">

**[Back to index](./README.md)**

</div>
