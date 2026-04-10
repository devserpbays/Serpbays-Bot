# Chrome Web Store Submission Guide

Complete step-by-step guide to publish the GetMention Chrome extension on the Chrome Web Store (CWS).

---

## Table of Contents

1. [Overview & Distribution Options](#1-overview--distribution-options)
2. [Pre-Submission Checklist](#2-pre-submission-checklist)
3. [Create a Developer Account](#3-create-a-developer-account)
4. [Prepare the Extension Package](#4-prepare-the-extension-package)
5. [Prepare Store Listing Assets](#5-prepare-store-listing-assets)
6. [Write the Store Listing](#6-write-the-store-listing)
7. [Privacy Policy](#7-privacy-policy)
8. [Permissions Justifications](#8-permissions-justifications)
9. [Upload & Configure](#9-upload--configure)
10. [Choose Visibility (Public vs Unlisted)](#10-choose-visibility-public-vs-unlisted)
11. [Submit for Review](#11-submit-for-review)
12. [Post-Approval: Updates & Maintenance](#12-post-approval-updates--maintenance)
13. [Alternative: Self-Hosted Distribution](#13-alternative-self-hosted-distribution)
14. [Policy Risks & Mitigations](#14-policy-risks--mitigations)
15. [Troubleshooting Rejections](#15-troubleshooting-rejections)

---

## 1. Overview & Distribution Options

| Option | Pros | Cons | Best For |
|---|---|---|---|
| **CWS Public** | Discoverable via search, trust badge | Strictest review, automation policy risk | Consumer product |
| **CWS Unlisted** | Direct link only, lighter review | Still reviewed, can be taken down | SaaS with controlled distribution |
| **Self-hosted .crx** | No review, full control, instant updates | Users see "not from CWS" warning | Internal/beta users |
| **Load unpacked** | Zero friction for devs | "Developer mode" banner in Chrome | Development/testing |

**Recommended for GetMention: CWS Unlisted** — customers get a clean install link, you avoid search-based abuse reports, and review is lighter.

---

## 2. Pre-Submission Checklist

Before starting the CWS submission:

- [ ] Extension is stable and tested on latest Chrome (v120+)
- [ ] `manifest.json` version is bumped to a release number (e.g., `1.3.4`)
- [ ] All `console.log` debug statements are removed or gated behind a flag
- [ ] No hardcoded IP addresses (use domain: `https://ai-bot.serpbays.com`)
- [ ] No `http://` URLs — all API calls use HTTPS
- [ ] No wildcard host permissions (`http://*/*`, `https://*/*`) — use specific domains
- [ ] Icons are present at 16x16, 48x48, and 128x128 pixels
- [ ] Privacy policy is published at a public URL
- [ ] Extension popup works correctly when not connected (shows onboarding)
- [ ] Extension popup works correctly when connected (shows stats)
- [ ] All content scripts are declared in `manifest.json` under `content_scripts`
- [ ] `"scripting"` permission is in the `permissions` array (required for force-inject)

---

## 3. Create a Developer Account

1. Go to: https://chrome.google.com/webstore/devconsole/
2. Sign in with a **dedicated business Google account** (not personal)
3. Pay the **one-time $5 registration fee**
4. Complete identity verification:
   - **Individual**: phone number + address verification
   - **Company**: D-U-N-S number or business registration document
5. Wait for verification (1-3 business days)

> **Tip**: Use a Google Workspace account if you have one — it adds credibility during review.

---

## 4. Prepare the Extension Package

### 4.1 Update manifest.json for production

```json
{
  "manifest_version": 3,
  "name": "GetMention - AI Social Media Engagement",
  "version": "1.3.4",
  "description": "AI-powered social media engagement. Finds relevant posts and helps you comment, like, and engage across Twitter, YouTube, Facebook, Reddit, Quora, Pinterest, and Skool.",
  "permissions": [
    "activeTab",
    "storage",
    "notifications",
    "alarms",
    "tabs",
    "scripting"
  ],
  "host_permissions": [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://www.facebook.com/*",
    "https://www.youtube.com/*",
    "https://www.reddit.com/*",
    "https://old.reddit.com/*",
    "https://www.quora.com/*",
    "https://www.pinterest.com/*",
    "https://in.pinterest.com/*",
    "https://www.skool.com/*",
    "https://ai-bot.serpbays.com/*"
  ]
}
```

**Critical changes from development manifest:**
- **Remove** `"http://*/*"` and `"https://*/*"` — these trigger the highest review tier
- **Replace** `http://88.222.214.19:3005` with `https://ai-bot.serpbays.com` in `utils/api.js`
- **Add** only the exact social platform domains you need

### 4.2 Update server URL

In `extension/utils/api.js`, change:
```js
// BEFORE (development)
const DEFAULT_SERVER = 'http://88.222.214.19:3005';

// AFTER (production)
const DEFAULT_SERVER = 'https://ai-bot.serpbays.com';
```

### 4.3 Build the submission zip

```bash
cd extension/

# Remove development files
rm -f debug/*.js
rm -f .DS_Store
find . -name "*.map" -delete

# Create clean zip (CWS requires a zip, not a folder)
cd ..
rm -f /tmp/getmention-cws.zip
cd extension && zip -rq /tmp/getmention-cws.zip . \
  -x "*.DS_Store" "*.map" ".git*" "debug/*" "*.bak"

# Verify contents
unzip -l /tmp/getmention-cws.zip
```

The zip should contain ONLY:
```
manifest.json
background.js
content/autopost.js
content/twitter.js
content/reddit.js
content/facebook.js
content/youtube.js
content/quora.js
content/pinterest.js
content/skool.js
popup/popup.html
popup/popup.js
utils/api.js
icons/icon16.png
icons/icon48.png
icons/icon128.png
```

### 4.4 Verify — no forbidden content

```bash
# Must return empty — no localhost/IP references
grep -rn "localhost\|127\.0\.0\.1\|88\.222" . --include="*.js" --include="*.html"

# Must return empty — no eval() or dangerous APIs
grep -rn "eval(\|new Function(" . --include="*.js"
```

---

## 5. Prepare Store Listing Assets

### Required assets

| Asset | Dimensions | Format | Notes |
|---|---|---|---|
| **Extension icon** | 128x128 | PNG | Already at `icons/icon128.png` |
| **Small promo tile** | 440x280 | PNG/JPG | Shows in CWS search results |
| **Screenshots** | 1280x800 or 640x400 | PNG/JPG | 1-5 screenshots required |

### Recommended (optional but helps approval)

| Asset | Dimensions | Notes |
|---|---|---|
| **Marquee promo** | 1400x560 | Large banner for featured listings |
| **Video (YouTube)** | Any | Short demo walkthrough |

### Screenshot suggestions

1. **Extension popup — onboarding step 1** (Welcome screen with features)
2. **Extension popup — connected** (Stats, platforms, activity feed)
3. **Dashboard — main overview** (Platform stats, engagement counts)
4. **Dashboard — settings** (Brand config, platform toggles, extension card)
5. **Dashboard — activity logs** (Real-time engagement feed)

---

## 6. Write the Store Listing

### Short description (max 132 characters)

```
AI-powered engagement bot. Finds relevant posts, writes natural replies, and engages across 7 social platforms automatically.
```

### Detailed description

```
GetMention uses AI to discover relevant social media posts matching your keywords, 
then generates natural, human-sounding replies that mention your brand when appropriate.

HOW IT WORKS
1. Configure your brand, keywords, and platforms in the GetMention dashboard
2. Install this extension and paste your API key
3. The extension automatically finds posts, generates AI replies, and engages

SUPPORTED PLATFORMS
- Twitter / X — reply to tweets, like
- Reddit — comment on posts, upvote
- Facebook — comment in groups, like
- YouTube — comment on videos, like (watches video first for authenticity)
- Quora — answer questions, upvote
- Pinterest — comment on pins, like
- Skool — comment in communities, like

KEY FEATURES
- Uses your real browser session — safe, undetectable
- AI generates varied, casual replies (not template spam)
- Smart brand mention cap (1-2/day max, only on relevant posts)
- Fair rotation across all platforms
- Per-platform daily limits and scoring thresholds
- Auto-pause on detection signals with tiered cooldown
- Works in background while you use other apps

REQUIRES
A GetMention account (free tier available). Sign up at the dashboard to get started.

PRIVACY
- No passwords stored — uses your existing browser session
- Extension communicates only with the GetMention server
- No data shared with third parties
- Full privacy policy: https://serpbays.com/getmention/privacy
```

### Category

Select: **Productivity**

### Language

Select: **English**

### Single-purpose description (required by CWS)

```
This extension discovers relevant social media posts across Twitter, Reddit, Facebook, 
YouTube, Quora, Pinterest, and Skool, and helps users engage with AI-generated replies 
and likes to grow their brand presence.
```

---

## 7. Privacy Policy

**Required**: a publicly accessible privacy policy URL.

Host at: `https://serpbays.com/getmention/privacy` or `https://ai-bot.serpbays.com/privacy`

### Must include:

1. **What data is collected**
   - Social media post content (scraped from public pages)
   - API key (stored in `chrome.storage.sync`)
   - Extension usage metrics (action counts, errors)
   - No passwords, no private messages, no personal data beyond what's visible on public social pages

2. **Where data is stored**
   - GetMention server (MongoDB, encrypted at rest)
   - Data center location
   - Retention period (e.g., 90 days for posted comments, 7 days for activity logs)

3. **Who has access**
   - Only the user who created the account can see their data
   - Admin users can see aggregated stats (no individual post content)

4. **Third-party services**
   - Clerk (authentication)
   - Stripe (billing)
   - OpenClaw AI (post evaluation — post content is sent for scoring)

5. **How users can delete their data**
   - Disconnect extension → clears local storage
   - Delete account in dashboard → cascade deletes all data

6. **Cookie usage**
   - Extension does NOT read or store browser cookies
   - Extension uses `chrome.storage.sync` and `chrome.storage.local` only

---

## 8. Permissions Justifications

The CWS Developer Console will ask you to justify EACH permission. Copy these verbatim:

### `activeTab`
```
To detect whether the user is currently viewing a social media page (Twitter, 
Reddit, Facebook, etc.) before initiating any engagement action. This ensures 
the extension only interacts with pages the user has explicitly navigated to.
```

### `storage`
```
To store the user's API key, extension preferences (auto-post on/off, server 
URL), daily engagement counters, and the task processing queue in 
chrome.storage.sync and chrome.storage.local. No sensitive data is stored — 
only the API key and usage counters.
```

### `notifications`
```
To show desktop notifications when a social platform requires re-authentication, 
when an engagement action fails, or when the daily posting limit is reached. 
Notifications are infrequent and user-actionable.
```

### `alarms`
```
To schedule periodic background tasks in the MV3 service worker: post scraping 
every 5 minutes, task polling every 1 minute, and stale tab cleanup every 1 
minute. Alarms are the only MV3-compliant way to run recurring tasks without 
a persistent background page.
```

### `tabs`
```
To programmatically open, monitor, and close background tabs used for scraping 
social media search results and executing engagement actions (commenting, 
liking). Tabs are opened in a dedicated offscreen window and automatically 
closed after each operation completes.
```

### `scripting`
```
To inject content scripts into social media tabs as a fallback when Chrome's 
declarative content script injection fails. This is necessary because platforms 
like Reddit and Facebook use React hydration that sometimes prevents declarative 
injection from firing. The injected scripts are the same ones declared in 
manifest.json — no dynamic code is generated.
```

### Host permissions (per domain)
```
https://x.com/*, https://twitter.com/*
To read tweet content, find the reply editor, type and submit comments, and 
click the like button on the user's behalf. The extension only interacts with 
the tweet the user has approved for engagement.

https://www.facebook.com/*
To search Facebook groups for relevant posts, read post content, find the 
comment editor, type and submit comments, and click the like button.

https://www.youtube.com/*
To search for relevant videos, play the video (for authentic viewing before 
commenting), skip pre-roll ads, find the comment editor, and submit comments.

https://www.reddit.com/*, https://old.reddit.com/*
To read subreddit posts, find the comment editor or upvote button (including 
inside shadow DOM web components), and submit comments or upvotes.

https://www.quora.com/*
To search for relevant questions, find the answer editor, type and submit 
answers, and click the upvote button.

https://www.pinterest.com/*, https://in.pinterest.com/*
To search for relevant pins, find the comment editor, type and submit 
comments, and click the like/react button.

https://www.skool.com/*
To search Skool communities for relevant posts, find the comment editor, 
type and submit comments, and click the like button.

https://ai-bot.serpbays.com/*
To communicate with the GetMention server: submit scraped posts for AI 
evaluation, receive engagement tasks, report task results, and sync settings.
```

---

## 9. Upload & Configure

1. Go to https://chrome.google.com/webstore/devconsole/
2. Click **"Add new item"**
3. Upload `/tmp/getmention-cws.zip`
4. Fill in all tabs:

### Store Listing tab
- Name, short description, detailed description (from Section 6)
- Upload icon (128x128), screenshots, promo tile
- Select category: Productivity
- Select language: English

### Privacy Practices tab
- **Single purpose**: paste the single-purpose description from Section 6
- **Permission justifications**: paste each from Section 8
- **Data usage disclosures**: check the boxes honestly:
  - [x] Website content (reads social media posts)
  - [x] User activity (tracks engagement actions)
  - [ ] Personally identifiable information (we don't collect PII)
  - [ ] Authentication information (we use API keys, not passwords)
- **Privacy policy URL**: paste your published privacy policy URL
- **Certify**: check the certification that your disclosures are accurate

### Distribution tab
- Choose **Unlisted** (recommended) or **Public**
- Choose regions: All regions (or limit to specific countries)

---

## 10. Choose Visibility (Public vs Unlisted)

| | Public | Unlisted |
|---|---|---|
| **Findable in CWS search** | Yes | No |
| **Install via direct link** | Yes | Yes |
| **Review strictness** | Highest | Medium |
| **Abuse reports from strangers** | Possible | Unlikely |
| **Best for** | Consumer product | SaaS with controlled distribution |

**For GetMention: choose Unlisted.** You give the install link to customers in your onboarding email. No random CWS browsers will find it and report it.

---

## 11. Submit for Review

1. Click **"Submit for review"**
2. Review typically takes:
   - **Unlisted + specific permissions**: 2-5 business days
   - **Public + specific permissions**: 1-3 weeks
   - **Any + wildcard permissions**: indefinite (often rejected)
3. You'll receive email notifications for:
   - "Pending review" → submitted successfully
   - "Approved" → extension is live
   - "Rejected" → with reason; you have 7 days to respond
   - "More information needed" → reviewer has questions

### After approval

Your extension gets a permanent CWS URL:
```
https://chrome.google.com/webstore/detail/getmention/[extension-id]
```

Share this link in:
- Dashboard onboarding (Step 2: "Install from Chrome Web Store")
- Marketing emails
- Documentation

---

## 12. Post-Approval: Updates & Maintenance

### Publishing updates

1. Bump `manifest.json` version (e.g., 1.3.4 → 1.3.5)
2. Build the new zip: `./scripts/build-extension.sh`
3. Go to CWS Developer Console → your extension → **Package** tab
4. Click **"Upload new package"** → upload the new zip
5. Click **"Submit for review"**
6. Updates typically review faster (1-2 days) unless permissions changed

### Auto-update for existing users

Chrome checks for extension updates every few hours. After your update is approved, existing users auto-update within ~5 hours. No manual action needed by users.

### Version numbering convention

```
MAJOR.MINOR.PATCH
1.3.4 → 1.3.5  (patch: bug fix, selector update)
1.3.5 → 1.4.0  (minor: new feature, new platform)
1.4.0 → 2.0.0  (major: breaking change, architecture change)
```

---

## 13. Alternative: Self-Hosted Distribution

If CWS review is too slow or risky, you can self-host the extension with auto-updates.

### Setup

1. **Sign the extension** (one-time):
```bash
openssl genrsa -out getmention-key.pem 2048
google-chrome --pack-extension=extension --pack-extension-key=getmention-key.pem
# Produces: extension.crx
```

2. **Host the .crx file**:
```bash
cp extension.crx /var/www/serpbays/public/downloads/getmention-latest.crx
```

3. **Create updates.xml**:
```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='YOUR_EXTENSION_ID'>
    <updatecheck codebase='https://ai-bot.serpbays.com/downloads/getmention-latest.crx' 
                 version='1.3.4' />
  </app>
</gupdate>
```

4. **Add `update_url` to manifest.json**:
```json
"update_url": "https://ai-bot.serpbays.com/extension/updates.xml"
```

### Pros
- No CWS review — ship updates instantly
- Full control over distribution

### Cons
- Users see "This extension is not from the Chrome Web Store" warning
- Requires manual install (drag .crx to extensions page)
- Doesn't work on managed Chrome (enterprise policies)

---

## 14. Policy Risks & Mitigations

### Risk: Automation policy violation

CWS policy prohibits extensions whose "primary purpose is to artificially inflate engagement." GetMention auto-comments and auto-likes, which could be flagged.

**Mitigation:**
- Position as a "social media management tool" not a "bot"
- Emphasize the human-in-the-loop: users configure keywords, review AI suggestions, set limits
- The `autoPost` toggle defaults to requiring manual review
- Brand mention cap (1-2/day) proves the tool prioritizes authentic engagement over spam
- Use the Unlisted visibility to avoid scrutiny from random reporters

### Risk: Broad host permissions

`host_permissions` for 10+ social platforms triggers manual review.

**Mitigation:**
- List ONLY the exact domains needed (no wildcards)
- Each domain has a specific, documented justification (Section 8)
- The extension does NOT read/modify pages the user hasn't explicitly enabled

### Risk: Content script injection via `scripting` API

Dynamic injection is flagged as higher risk than declarative.

**Mitigation:**
- All injected files are the SAME ones declared in `content_scripts`
- The `scripting` permission is a fallback for when declarative injection fails (document this)
- No `eval()`, no `new Function()`, no remote code execution

---

## 15. Troubleshooting Rejections

### "Extension does not comply with the Single Purpose policy"

**Fix**: Rewrite the detailed description to focus on ONE thing: "helping users engage with relevant social media posts." Remove any language about "automation" or "bot."

### "Requesting broad host permissions without clear justification"

**Fix**: Check that you removed `http://*/*` and `https://*/*`. Each domain must have a specific justification. Re-submit the justifications from Section 8.

### "Extension appears to be designed to artificially inflate engagement"

**Fix**: This is the hardest rejection to overcome. Options:
1. Add a prominent "Review before posting" mode as the default (disable `autoPost` by default)
2. Reduce the description's emphasis on "auto" and increase emphasis on "AI-assisted"
3. Consider switching to Unlisted if you were Public
4. If repeatedly rejected, switch to self-hosted distribution (Section 13)

### "Privacy policy is missing or incomplete"

**Fix**: Ensure your privacy policy URL is live, HTTPS, and contains ALL sections from Section 7. The reviewer actually reads it.

### "Deceptive installation experience"

**Fix**: The extension popup must clearly explain what the extension does BEFORE asking for an API key. The 3-step onboarding (Welcome → Sign Up → Connect) addresses this. Don't skip the Welcome step.

---

## Quick Reference: Submission Checklist

```
[ ] Developer account created and verified ($5 fee paid)
[ ] manifest.json: no wildcard host_permissions
[ ] manifest.json: version bumped
[ ] utils/api.js: uses HTTPS domain (not IP)
[ ] No console.log spam in production
[ ] No eval() or dynamic code
[ ] Icons: 16x16, 48x48, 128x128 PNG
[ ] Screenshots: 1-5 at 1280x800
[ ] Small promo tile: 440x280
[ ] Privacy policy: published at HTTPS URL
[ ] Store listing: name, short desc, long desc, category, language
[ ] Permission justifications: all 6 permissions + all host domains
[ ] Data usage disclosures: checkboxes filled honestly
[ ] Single-purpose statement: written
[ ] Visibility: Unlisted (recommended)
[ ] Zip built: no debug files, no .git, no .DS_Store
[ ] Tested: popup works, onboarding works, stats work
[ ] Submit for review
```
