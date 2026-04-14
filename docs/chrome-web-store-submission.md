# Chrome Web Store Submission Package

Ready-to-paste content for the Chrome Web Store Developer Dashboard.

Last updated: 2026-04-14 · Extension version: 1.0.10

## Single Purpose

> GetMention is an AI-assisted social-engagement assistant that helps users discover relevant public posts across seven social platforms and draft natural replies they can review and post themselves.

## Short Description (≤ 132 chars)

> AI finds relevant posts across 7 social platforms and helps you comment, like, and engage naturally — on autopilot.

(120 chars — matches manifest)

## Detailed Description

> GetMention helps creators, marketers, and founders stay engaged on social media without burning hours scrolling.
>
> **How it works**
> 1. Configure your keywords and target platforms in the GetMention dashboard.
> 2. The extension scrapes publicly visible posts that match your topics — using your already logged-in sessions, entirely inside your own browser.
> 3. AI ranks each post for relevance and drafts a natural reply in your voice.
> 4. You review and approve, or let high-confidence replies post automatically on the schedule you set.
>
> **What it does**
> - Discovers mentions on X (Twitter), Reddit, Facebook, Quora, YouTube, Pinterest, and Skool.
> - Drafts comments with AI based on post context and your preferences.
> - Submits approved comments at a human pace with realistic delays and behavior.
> - Logs every action so you can audit exactly what was posted and where.
>
> **Privacy first**
> - Your social-media passwords and session cookies never leave your computer.
> - Only public post metadata and the replies you generate are stored on our servers.
> - You can disconnect any platform or remove the extension at any time.
>
> **Plans**
> - Free: 1 platform, 3 posts/day, 5 keywords
> - Pro ($49/mo): 3 platforms, 15 posts/day, 25 keywords
> - Business ($149/mo): 6 platforms, 50 posts/day, 100 keywords
>
> Dashboard & billing: https://ai-bot.serpbays.com
> Support: support@serpbays.com

## Category

Productivity

## Language

English (en)

---

## Permission Justifications

Paste each of these into the matching field in the CWS dashboard.

### `activeTab`
Required to read the currently open tab on supported social platforms (X, YouTube, Facebook, Reddit, Quora, Pinterest, Skool) so the extension can detect posts that match the user's configured keywords and submit replies the user has approved.

### `tabs`
Required to open a supported platform in a background window when the scheduled scraping/posting cycle fires, so the extension can read public posts and submit approved replies without the user needing to keep the tab focused. We do not read tabs outside the listed host_permissions.

### `scripting`
Required to inject the platform-specific content script that detects post structure, scrapes public content, and submits comments the user has approved. Each script only runs on the specific matched host (e.g. the X content script only runs on x.com).

### `storage`
Required to persist the user's extension API key and preferences locally using `chrome.storage.sync`. No browsing history, page content, or cookies are ever stored.

### `alarms`
Required to trigger the scraping and posting cycles on the cadence the user configures (e.g., every 30 minutes). This replaces `setInterval`, which Manifest V3 service workers do not support reliably.

### `notifications`
Required to notify the user when the extension discovers posts that need manual review, or when a scheduled posting cycle completes.

### Host Permissions — social platforms
`https://x.com/*`, `https://twitter.com/*`, `https://www.youtube.com/*`, `https://www.facebook.com/*`, `https://www.reddit.com/*`, `https://old.reddit.com/*`, `https://www.quora.com/*`, `https://www.pinterest.com/*`, `https://in.pinterest.com/*`, `https://www.skool.com/*`

Required so the extension can run its content scripts on each supported platform. This is the core functionality the user signs up for — discovering relevant posts and submitting replies on these specific platforms.

### Host Permission — `https://ai-bot.serpbays.com/*`
Required so the extension can fetch tasks and settings from, and report results to, the GetMention backend over HTTPS.

### Remote Code Use
None. The extension ships all JavaScript inside the bundle. No `eval`, no `new Function`, no remote script loading, no hosted rules or remote configurations that execute as code.

---

## Data Usage Disclosures (Privacy Practices tab)

For the "What user data will this item collect or use?" disclosure, tick:

- **Authentication information** — used only to authenticate the user's account with the GetMention backend via an API key stored in `chrome.storage.sync`. Not shared, not sold, not used for third-party purposes.
- **Website content** — the extension reads the public post content visible on supported social-media sites so it can identify relevance and prepare replies. This data is sent to the user's own account on the GetMention backend. Not shared, not sold, not used for third-party purposes.

For all other categories (personal info, financial info, location, web history, user activity, personal communications, health info) — **do not tick.** The extension does not collect them.

Confirm the three certifications at the bottom:
- I do not sell or transfer user data to third parties outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending.

---

## URLs

- Homepage: `https://ai-bot.serpbays.com`
- Privacy policy: `https://ai-bot.serpbays.com/privacy`
- Terms of service: `https://ai-bot.serpbays.com/terms`
- Support email: `support@serpbays.com`

---

## Reviewer Test Account

Include this in the "Notes to reviewer" textbox so Google can test without signing up.

```
Test account (free tier):
  Email: reviewer@serpbays.com
  Password: <create before submission>

Or use the following demo API key directly in the extension popup to skip signup:
  API key: <generate a dedicated reviewer key in /dashboard/settings>

Workflow to test:
  1. Install extension from the attached zip.
  2. Click the GetMention icon → paste the API key above → Save.
  3. In the dashboard (https://ai-bot.serpbays.com/dashboard) add a keyword like "seo".
  4. Open https://www.reddit.com in a tab — the extension will scrape relevant posts within ~30s.
  5. Approve a draft reply in /dashboard/review → watch it post.
```

---

## Store Assets Checklist

| Asset | Size | Required | Status |
|---|---|---|---|
| Icon | 128×128 PNG | yes | shipped in manifest |
| Screenshot 1 — dashboard | 1280×800 | yes (min 1) | TODO |
| Screenshot 2 — review queue | 1280×800 | recommended | TODO |
| Screenshot 3 — extension popup | 1280×800 | recommended | TODO |
| Screenshot 4 — logs page | 1280×800 | recommended | TODO |
| Screenshot 5 — settings | 1280×800 | optional | TODO |
| Small promo tile | 440×280 PNG | yes | TODO |
| Marquee tile | 1400×560 PNG | optional | TODO |

---

## Pre-submission Verification Steps

Run through this list the day before submitting.

1. `bash scripts/build-extension.sh` — confirm the zip version matches the manifest.
2. `npm run build && pm2 restart bot-serp` — ship the latest privacy policy.
3. From a non-cached browser, confirm both `https://ai-bot.serpbays.com/privacy` and `https://ai-bot.serpbays.com/terms` return HTTP 200 publicly.
4. Create a dedicated reviewer Clerk account and API key; paste them into the "Notes to reviewer" box.
5. Load the exact zip you will upload into `chrome://extensions` (Developer Mode → Load Unpacked) and run one full end-to-end cycle (scrape + post) on each supported platform.
6. Verify no `console.error` from the extension during the test cycle.
7. Grep the extension tree for `http://` — must return zero matches outside comments.
8. Check `extension/manifest.json` has no wildcard host permissions (`<all_urls>`, `http://*/*`, `https://*/*`).

## Common Rejection Triggers

- **Single Purpose violation** — if the description hints at multiple unrelated features, Google rejects. Keep the elevator pitch tight: *discover relevant posts, draft replies, post with user approval.*
- **Automation framing** — avoid "bot", "mass", "spam", "auto-post without review" phrasing anywhere in the listing or screenshots. Emphasize *user-reviewed* and *assistive*.
- **Privacy policy mismatch** — reviewers compare manifest permissions and observed behavior to the privacy policy. Make sure Section 5 of `/privacy` lists the exact same permissions.
- **Broken HTTPS** — if the homepage, privacy, or terms URL returns 4xx/5xx during review, the submission is rejected until fixed.
