<div align="center">

# ⚙️ Extension — Background Service Worker

**`extension/background.js` — ~1,724 lines of orchestration**

![MV3](https://img.shields.io/badge/MV3_service_worker-4285f4?style=flat-square)
![LoC](https://img.shields.io/badge/lines-~1724-0ea5e9?style=flat-square)

</div>

---

## 🎬 Three Alarms Drive Everything

```mermaid
flowchart LR
    ALARM1[⏰ pollTasks<br/>every 1 min] --> PT[processTasks]
    ALARM2[⏰ scrapeLoop<br/>every 5 min] --> SO[scrapeOnePlatform]
    ALARM3[⏰ cleanupTabs<br/>every 1 min] --> CL[cleanupStaleTabs]

    PT -->|calls| API[API /extension/tasks]
    SO -->|calls| API2[API /extension/scrape]
    CL -->|closes| TABS[stale tabs]

    style ALARM1 fill:#0ea5e9,color:#fff
    style ALARM2 fill:#10b981,color:#fff
    style ALARM3 fill:#64748b,color:#fff
```

All three are `chrome.alarms.create()` — MV3 replacement for `setInterval` since service workers are short-lived.

---

## 🧠 State Management

### In-memory (per service-worker lifetime)

| Variable | Purpose |
|---|---|
| `isProcessing` | Lock for `processTasks()` to avoid concurrent runs. Safety valve auto-releases after 210 s. |
| `isProcessingSince` | Timestamp for the safety valve. |
| `isScraping` | Lock for `scrapeOnePlatform()`. |
| `extensionTabs` (Set) | Tabs the extension opened, so they can be force-closed after timeout. |
| `scrapeWindowId`, `scrapeWindowLock` | ID of the **persistent minimized popup window** used for background scraping (workaround for Chrome throttling unfocused tabs). |
| `serverPlatformLimits` | Per-platform comment limits from server, synced each task cycle. |
| `processedTasks` (Set) + `processedTasksDate` | Dedup cache; reset daily. |

### `chrome.storage.local` (persistent)

| Key | Shape |
|---|---|
| `dailyCounters` | `{ date, platforms: { [p]: { comments, likes } }, lastCommentAt }` — reset at midnight local time |
| `pendingTask` | `{ id, action, platform, url, startedAt }` — recovery hook if SW dies mid-task |
| `lastQuoraResult` | `{ success, url, verifyMethod, timestamp }` — saved by content script before SW death |
| `lastRedditResult` | Same pattern for Reddit |
| `reviewQueue` | Posts awaiting manual review (auto-post off mode) |

### `chrome.storage.sync` (persistent, synced across devices)

| Key | Purpose |
|---|---|
| `apiKey` | User's extension API key (`gm_...`) |
| `serverUrl` | Default `http://88.222.214.19:3005` |
| `autoPost` | Master toggle (bool) |

---

## 🔍 `scrapeOnePlatform()` — Rotation Orchestrator

```mermaid
flowchart TB
    START[⏰ alarm fires] --> KEY{Has API key?}
    KEY -->|No| EXIT[skip]
    KEY -->|Yes| SET[Fetch /api/extension/settings]
    SET --> PLAT[getNextScrapePlatform<br/>round-robin]
    PLAT --> KW[Pick random keyword]
    KW --> SW{Which platform?}

    SW -->|reddit| JO[Join subreddit first,<br/>then scrape home feed]
    SW -->|facebook| FG[Loop 3 groups × 2 keywords]
    SW -->|skool| SC[Loop ALL configured<br/>communities]
    SW -->|others| SR[Single search URL]

    JO & FG & SC & SR --> OP[createBackgroundTab<br/>in scrape window]
    OP --> MSG[content script<br/>SCROLL + SCRAPE_POSTS]
    MSG --> SUB[POST /api/extension/scrape]
    SUB --> LOG[sendLog scrape_done<br/>or scrape_empty]

    style START fill:#0ea5e9,color:#fff
    style SUB fill:#10b981,color:#fff
    style LOG fill:#64748b,color:#fff
```

### Per-platform scraping specifics

| Platform | Scrape strategy |
|---|---|
| **Twitter** | Opens `https://x.com/search?q={keyword}&src=typed_query&f=live` |
| **Reddit** | Joins 1 random subreddit first, then scrapes home feed (shows posts from ALL joined communities) |
| **Facebook** | Up to 3 groups × 2 keywords per cycle → `/groups/{gid}/search/?q={keyword}`. New: **global anchor sweep** fallback if per-item scan finds 0 posts |
| **Quora** | `/search?q={keyword}&type=question` |
| **YouTube** | `/results?search_query={keyword}` |
| **Pinterest** | `/search/pins?q={keyword}` |
| **Skool** | **Every configured community per cycle**; auto-joins via `JOIN_COMMUNITY` message |

---

## 💬 `processTasks()` — Task Execution Loop

```mermaid
flowchart TB
    START[⏰ alarm fires] --> LOCK{isProcessing<br/>locked?}
    LOCK -->|Yes| EXIT[skip]
    LOCK -->|No| POLL[GET /api/extension/tasks]
    POLL --> AP{autoPost ON?}
    AP -->|No| Q[Queue comments for review,<br/>execute likes/upvotes immediately]
    AP -->|Yes| PICK[Pick ONE task<br/>rotating: every 3rd = comment,<br/>others = likes]
    PICK --> CD{Cooldown OK?<br/>Per-platform cap OK?}
    CD -->|No| SKIP[Defer to next cycle]
    CD -->|Yes| EX[executeTask task]

    EX --> OPEN[Open task.url in tab]
    OPEN --> REL[EXECUTE_TASK msg]
    REL --> WAIT[Wait for response<br/>YT: 240s, others: 120s]
    WAIT --> RES{Success?}

    RES -->|Yes + Quora comment| QV[verifyQuoraOnStats]
    RES -->|Yes| COMP[POST /extension/tasks/complete]
    RES -->|No| COMP

    QV --> COMP
    COMP --> INC[Increment dailyCounters]
    INC --> LOG[sendLog with URL<br/>+ verify receipt]

    style EX fill:#0ea5e9,color:#fff
    style QV fill:#ec4899,color:#fff
    style COMP fill:#10b981,color:#fff
    style LOG fill:#64748b,color:#fff
```

### Cooldown math

```js
activeMinutes = (cronEndHour - cronStartHour) * 60
remainingPosts = dailyLimit - commentsToday
targetGap = activeMinutes / remainingPosts
actualGap = targetGap * (0.7 + Math.random() * 0.6)  // 70-130% jitter
```

Default with 10h active × 10 posts = 60 min gap. Jitter gives 42–78 min spacing.

---

## ✅ `verifyQuoraOnStats()` — Answer Verification

**New in v1.0.23.** After a successful Quora comment, confirms the answer is actually published by matching it on `https://www.quora.com/stats`.

```mermaid
sequenceDiagram
    autonumber
    participant BG as background.js
    participant ST as /stats tab
    participant Q as Quora API

    BG->>BG: sleep 5s (let Quora index)
    BG->>ST: createBackgroundTab(/stats)
    BG->>ST: waitForTabLoad
    BG->>ST: scrollBy(0, 800)
    BG->>ST: chrome.scripting.executeScript<br/>(inject reader func)
    ST->>Q: SPA render
    Q-->>ST: answer list
    ST-->>BG: { ok, rows: [{url, text}, ...] }
    BG->>BG: match rows by snippet<br/>(try 80/60/40/25 char prefixes)
    alt match found
        BG-->>BG: verified: true, url: <canonical>
    else no match but post age < 5min
        BG-->>BG: verified: true, method: top_row_recency
    else
        BG-->>BG: verified: false, reason: no_match
    end
```

Returns `{ verified, method, url }` which the caller attaches to the task result as `verifiedAnswerUrl` and `verifyMethod`.

---

## 🪟 Tab & Window Management

### Persistent minimized scrape window

> [!IMPORTANT]
> Chrome throttles `setTimeout`, animations, and DOM polling in unfocused tabs. To scrape in the background without slowing down, the extension keeps a **dedicated minimized popup window** and creates its tabs there.

```mermaid
flowchart LR
    GO[getOrCreateScrapeWindow] --> EX{Window exists?}
    EX -->|Yes| RET[return scrapeWindowId]
    EX -->|No| CR[chrome.windows.create<br/>type=popup, state=minimized]
    CR --> SAVE[save scrapeWindowId<br/>in storage]
    SAVE --> RET

    style CR fill:#0ea5e9,color:#fff
    style RET fill:#10b981,color:#fff
```

### `createBackgroundTab(url)`
- Creates tab in scrape window, marks `autoDiscardable: false`
- Cleans orphaned `about:blank` tabs in the window
- Returns tab handle

### `cleanupStaleTabs()`
- Runs every 1 min
- Removes tabs that don't respond to a ping within 60 s (catches tabs where the content script died)

### `waitForTabLoad(tabId)`
- Listens to `chrome.tabs.onUpdated` until `status === 'complete'`
- Fallback timeout 30 s
- Returns

---

## 📨 Message Types (dispatcher)

`background.js` handles these `chrome.runtime.onMessage` types:

| Type | From | Purpose |
|---|---|---|
| `FORCE_POLL` | popup | Trigger `processTasks()` immediately |
| `FORCE_SCRAPE` | popup | Trigger `scrapeOnePlatform()` immediately |
| `EXECUTE_DASHBOARD_TASK` | autopost.js | Fetch task details for dashboard-approve path |
| `RELAY_EXECUTE_TASK` | autopost.js | Relay `EXECUTE_TASK` to platform content script in same tab |
| `REPORT_TASK_RESULT` | autopost.js | Report dashboard-approve outcome to server |
| `JOIN_SUBREDDIT` | reddit.js | Request subreddit join |
| `JOIN_GROUP` | facebook.js | Request group join |
| `JOIN_COMMUNITY` | skool.js | Request community join |

---

## 🚨 Error Recovery

### Service-worker death during a task

```mermaid
flowchart TB
    T[Task starts] --> PS[Save pendingTask<br/>to storage.local]
    PS --> CS[Content script runs]
    CS -->|saves to storage before responding| SR[chrome.storage.local.set<br/>lastQuoraResult / lastRedditResult]
    SR --> RES[Return to background]
    RES --> SW{SW alive?}
    SW -->|Yes| OK[Report to server]
    SW -->|No, dies mid-call| RECOVER[Next boot:<br/>recoverPendingTask checks<br/>storage for saved result,<br/>reports retroactively]

    style PS fill:#f59e0b,color:#fff
    style SR fill:#10b981,color:#fff
    style RECOVER fill:#8b5cf6,color:#fff
```

`recoverPendingTask()` runs on `onStartup` and `onInstalled` — if `pendingTask` exists and matches a stored result, it reports to the server even though the original SW died.

---

## ⏱️ Timeouts

| Operation | Timeout |
|---|---|
| Task execute (YouTube) | **180 s** |
| Task execute (other platforms) | **120 s** |
| Sendmessage ACK | **170 s** |
| Dashboard-approve relay (YouTube) | **170 s** |
| Dashboard-approve relay (others) | **90 s** |
| waitForTabLoad | **30 s** |
| cleanupStaleTabs ping | **60 s** |
| forceClose scrape tab | **45 s** |
| Quora `/stats` verify tab | **30 s** |

---

<div align="center">

**← [Overview](./overview.md)** · **[Back to index](../README.md)** · **Next: [Content Scripts](./content-scripts.md)** →

</div>
