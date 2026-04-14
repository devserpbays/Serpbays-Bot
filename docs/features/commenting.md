<div align="center">

# 💬 Feature — Commenting

**Per-platform comment posting flow**

![Platforms](https://img.shields.io/badge/platforms-7-10b981?style=flat-square)

</div>

---

## 🌊 Universal Flow

```mermaid
flowchart TB
    T[⏰ Task dispatched] --> O[Open post URL]
    O --> I[Inject content script]
    I --> P{Already commented?}
    P -->|Yes| AD[return alreadyCommented: true]
    P -->|No| ED[Find editor]
    ED --> FE{Editor found?}
    FE -->|No| DE[return error with<br/>DOM snapshot]
    FE -->|Yes| HT[humanType text]
    HT --> BT[Find submit button]
    BT --> PC[Pointer-event click]
    PC --> V[Verify via polling<br/>5-15s depending on platform]
    V --> SU{Verified?}
    SU -->|Yes| S[return success + postUrl<br/>+ verifyMethod]
    SU -->|No| FB[Fire fallback strategies<br/>form.requestSubmit, Ctrl+Enter,<br/>component.submit]
    FB --> V

    style AD fill:#10b981,color:#fff
    style S fill:#10b981,color:#fff
    style DE fill:#ef4444,color:#fff
    style HT fill:#0ea5e9,color:#fff
    style PC fill:#0ea5e9,color:#fff
```

---

## 📋 Per-platform Comparison

| Platform | Editor selector | Submit detection | Verification signals | Fallbacks |
|---|---|---|---|---|
| 🐦 **Twitter** | `[data-testid="tweetTextarea_0"]` | `[data-testid="tweetButtonInline"]` + 6 testid variants | box cleared OR snippet on page | Ctrl+Enter on box |
| 🔴 **Reddit** | `shreddit-composer > div[contenteditable]` (Lexical) | aria-label `"Submit comment"`, deep shadow DOM walk | 6-signal 15 s polling | `form.requestSubmit()` → Ctrl+Enter → composer.submit() |
| 🔵 **Facebook** | `contenteditable="true"` with "comment" aria-label; Lexical or plaintext-only fallback | N/A — press Enter on editor | editor cleared OR snippet on page | click placeholder re-mount, force-mount via fake input |
| 🟥 **Quora** | `div.doc[contenteditable]` + 5 fallback selectors | `findButton(['Post', 'Submit', 'Add Answer'])` | 6-signal 14 s polling + **2.5 s grace + /stats verification** | requestSubmit → Ctrl+Enter → re-click |
| ▶️ **YouTube** | `#contenteditable-root` + 5 fallback selectors | `#submit-button button[aria-label*="omment"]` + 3 fallbacks | 3-signal 12 s polling | requestSubmit → Ctrl+Enter → re-click |
| 📌 **Pinterest** | `[contenteditable="true"][role="textbox"]` | button with text "Send" / "Post" | box empty after click | Paste event + Enter |
| 🟣 **Skool** | `.tiptap.ProseMirror.skool-editor` (TipTap) | Enter keydown or button | box empty | restriction check + paste |

---

## 🎬 Platform-Specific Flows

### 🐦 Twitter — `postReply()`

```mermaid
flowchart LR
    A[Dismiss modals<br/>sign-up, notifications] --> B[Check already-commented<br/>own handle in replies]
    B --> C[Find tweetTextarea_0<br/>3 attempts with reply-btn click]
    C --> D[humanType 50-130ms/char]
    D --> E[Human pause 1-2.5s]
    E --> F[Find post button<br/>7 testid variants + text fallback]
    F --> G[Click or Ctrl+Enter]
    G --> H[4s wait + verify]

    style D fill:#10b981,color:#fff
```

---

### 🔴 Reddit — `commentWithUpvote()`

```mermaid
flowchart TB
    A[Join subreddit if not member] --> B[Dismiss community rules popup]
    B --> C[Upvote post first<br/>engagement before comment]
    C --> D{Already commented?}
    D -->|Yes| AD[return alreadyCommented]
    D -->|No| CM[postComment sub-flow]

    CM --> E[Find shreddit-composer]
    E --> F[Click editor to focus]
    F --> G[humanType char-by-char<br/>fires real beforeinput+input<br/>to mark Lexical dirty]
    G --> SUB[4-strategy submit cascade]

    SUB --> S1["t=0: pointer click"]
    SUB --> S2["t=2s: form.requestSubmit"]
    SUB --> S3["t=5s: Ctrl+Enter"]
    SUB --> S4["t=8s: composer.submit()"]
    SUB --> S5["t=11s: re-click"]

    S1 & S2 & S3 & S4 & S5 --> POLL[15s polling, 6 signals]
    POLL --> REJ[Check rejection toasts<br/>rate_limited, spam_filter,<br/>karma_gate, reddit_error]

    style G fill:#10b981,color:#fff
    style SUB fill:#0ea5e9,color:#fff
    style REJ fill:#f59e0b,color:#fff
```

**Rejection phrases scanned:**
| Phrase | Returned reason |
|---|---|
| "doing that too much" | `rate_limited` |
| "try again in" | `rate_limited` |
| "please slow down" | `rate_limited` |
| "something went wrong" | `reddit_error` |
| "submission has been filtered" | `spam_filter` |
| "removed by reddit" | `spam_filter` |
| "must have at least" | `karma_gate` |
| "requires you to have" | `karma_gate` |

---

### 🔵 Facebook — `postComment()`

```mermaid
flowchart TB
    A{Group page?} -->|Yes| B[checkGroupMembership]
    B --> BN{Member?}
    BN -->|not_member| SK[return skipped<br/>will join next cycle]
    BN -->|new_member| SK2[return skipped<br/>avoid spam filter]
    BN -->|member| C
    A -->|No| C
    C{Already commented<br/>own name match?} -->|Yes| AD[return alreadyCommented<br/>+ postUrl]
    C -->|No| D[Find comment editor<br/>6 selectors]
    D --> E{Editor found?}
    E -->|No| P[Click Write a comment<br/>placeholder to force-mount]
    P --> D
    E -->|Yes| H[humanType]
    H --> EN[Press Enter]
    EN --> V[4s wait + verify]
    V --> R[return + getSpecificPostUrl<br/>for clean post permalink]

    style SK fill:#f59e0b,color:#fff
    style R fill:#10b981,color:#fff
```

**`getSpecificPostUrl()`** returns the post permalink (not the group URL) so dashboard "View reply" points to the actual comment.

---

### 🟥 Quora — `postAnswer()`

```mermaid
flowchart TB
    CF{Cloudflare challenge?} -->|Yes| SK[skipped: cloudflare_challenge]
    CF -->|No| AB{Already answered?<br/>snippet OR author OR<br/>Edit your answer button}
    AB -->|Yes| AD[alreadyCommented + postUrl]
    AB -->|No| FA[Find Answer btn<br/>5 attempts × 2s]
    FA --> CLK[qFireClick full pointer]
    CLK --> FE[Find editor]
    FE --> DRAFT{Existing draft?}
    DRAFT -->|Yes| CL[Select-all + delete]
    DRAFT -->|No| HT
    CL --> HT[qHumanType]
    HT --> SUB[4-strategy submit cascade]
    SUB --> POLL[14s polling + 6 signals]
    POLL --> FV[Final 2.5s grace + re-verify<br/>alreadyAnsweredByMe]
    FV --> OK[return success<br/>+ postedAt + answerSnippet]
    OK --> BG[background: verifyQuoraOnStats]

    style BG fill:#ec4899,color:#fff
    style OK fill:#10b981,color:#fff
```

Then in background: opens `/stats` in bg tab, matches by snippet (80 → 60 → 40 → 25 char prefixes), attaches `verifiedAnswerUrl`.

---

### ▶️ YouTube — `postComment()`

```mermaid
flowchart TB
    AD[handleAds up to 3 attempts] --> WV[watchVideoLikeHuman 20-40s]
    WV --> S1[Scroll to comments 2500ms]
    S1 --> S2[Extra scroll 400px<br/>to force lazy-mount]
    S2 --> CD{comments_disabled text?}
    CD -->|Yes| SKD[skipped: comments_disabled]
    CD -->|No| AC{alreadyCommentedWithText?<br/>scan existing comments for<br/>60-char snippet}
    AC -->|Yes| SKAC[skipped: already_commented]
    AC -->|No| HR[Human read 2-5s<br/>simulate reading comments]
    HR --> P[findYTPlaceholder<br/>5 selectors]
    P --> PC[Pointer-event click placeholder]
    PC --> E[findYTEditor 6 selectors]
    E --> HT[humanType]
    HT --> PS[Pre-submit pause 2.5-5s]
    PS --> SB[findYouTubeSubmitBtn<br/>4 strategies incl. aria-label]
    SB --> SUB[4-strategy submit cascade]
    SUB --> POLL[12s polling, 3 signals]

    style HT fill:#10b981,color:#fff
    style SKD fill:#f59e0b,color:#fff
    style SKAC fill:#f59e0b,color:#fff
```

**DOM-forensic snapshot** on placeholder/editor not found — JSON of existing `ytd-*` elements, contenteditable count, scrollY etc.

---

### 📌 Pinterest — `postComment()`

```mermaid
flowchart LR
    F[Find comment trigger<br/>small contenteditable OR<br/>'Add a comment' button] --> C[Click to open]
    C --> E[Find contenteditable input]
    E --> P[Paste via ClipboardEvent]
    P --> BT[Click Send/Post]
    BT --> V[Verify box empty]

    style P fill:#0ea5e9,color:#fff
```

Pinterest's contenteditable accepts `ClipboardEvent` paste reliably — no need for per-char typing.

---

### 🟣 Skool — `postComment()`

```mermaid
flowchart TB
    R{detectSkoolRestriction<br/>pre-check?} -->|banned| SKB[skipped: banned]
    R -->|muted| SKM[skipped: muted]
    R -->|not_member| SKN[skipped: not_member]
    R -->|comments_disabled| SKD[skipped: comments_disabled]
    R -->|pending_approval| SKP[skipped: pending_approval]
    R -->|'' empty| C
    C[Click Reply button] --> E[Find .tiptap.ProseMirror.skool-editor<br/>+ fallback selectors]
    E --> F{Editor found?}
    F -->|No| R2{Post-check restriction?}
    R2 -->|Yes| SK2[skipped: reason]
    R2 -->|No| ER[Real DOM error]
    F -->|Yes| HT[humanType]
    HT --> SUB[Enter keydown + Submit btn click]

    style SKB fill:#ef4444,color:#fff
    style HT fill:#10b981,color:#fff
```

---

## 🕵️ Verification Signals (Common)

After clicking submit, content scripts poll for any of these signals:

| Signal | What it means |
|---|---|
| `url_changed` | Page redirected to comment permalink (strongest) |
| `editor_removed` | Composer DOM element vanished (modal closed) |
| `editor_cleared` | Text was cleared from editor |
| `submit_gone` | Submit button vanished or `disabled` |
| `text_on_page` | Our snippet is now visible in the post's comment section |
| `text_in_comment` | Snippet appears in a `shreddit-comment` shadow DOM (Reddit-specific) |

For Quora specifically, after all 6 signals check, there's a **final 2.5 s grace period** + `alreadyAnsweredByMe()` re-check, which catches false-negatives where the answer posted but Quora's render lagged.

---

## 📜 Log Output Examples

### Success
```
Commented on reddit (3/25 today) — https://reddit.com/r/GuestPost/comments/.../#comment [verified: editor_cleared]
Commented on quora (5/15 today) — https://quora.com/... [verified: text_on_page] [✓ verified on Quora /stats: snippet_match_60]
Liked on twitter (7/10 today) — https://x.com/user/status/... [verified: unlike_btn_visible]
```

### Skipped
```
Skipped comment on skool (banned) — https://skool.com/theskoolhub/post/... | Skool community restriction: banned — comment composer is hidden by Skool
Skipped comment on youtube (comments_disabled) — https://youtube.com/watch?v=...
Skipped comment on reddit (rate_limited) — https://reddit.com/r/... | Reddit rejected comment: rate limited
Already commentedd on quora — https://quora.com/... [verified: author_match]
```

### Failed
```
Failed comment on reddit — https://reddit.com/r/... | Comment not confirmed after 15s — tried strategies: click,requestSubmit,ctrlEnter,componentSubmit
Failed comment on youtube — https://youtube.com/watch?v=... | YouTube editor not found after placeholder click — DOM: {"placeholder_still_exists":true,"contenteditable_count":0,...}
```

---

<div align="center">

**← [Scraping](./scraping.md)** · **[Back to index](../README.md)** · **Next: [Engagement](./engagement.md)** →

</div>
