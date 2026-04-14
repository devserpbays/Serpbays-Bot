/**
 * GetMention — Twitter/X Content Script
 * Handles scraping tweets and posting replies.
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 1500, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.platform && msg.platform !== 'twitter') return;

    if (msg.type === 'EXECUTE_TASK') {
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Twitter content script timed out (100s)' }); }, 100000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) {
        clearTimeout(timeout);
        sendResponse({ success: false, error: (err && err.message) || String(err) || 'Twitter error' });
      });
      return true;
    }

    if (msg.type === 'SCRAPE_POSTS') {
      scrapePosts(msg.keywords || []).then(sendResponse).catch(err => {
        sendResponse({ posts: [], error: err.message });
      });
      return true;
    }
  });

  // ── Task execution ──────────────────────────────────────────────────────

  async function handleTask({ action, text }) {
    switch (action) {
      case 'comment': return postReply(text);
      case 'like': return likePost();
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  async function postReply(text) {
    // Quick wait + scroll
    await sleep(2000);
    window.scrollBy({ top: 300, behavior: 'smooth' });
    await sleep(1500);

    // Dismiss any "Sign up" / "Log in" / "Not now" / notification modals that
    // steal focus and block the reply UI. Twitter frequently pops these up.
    function dismissTwitterModals() {
      // Known dismiss buttons
      const dismissSelectors = [
        '[data-testid="app-bar-close"]',
        '[data-testid="confirmationSheetCancel"]',
        '[aria-label="Close"]',
        '[aria-label="Dismiss"]',
      ];
      for (const sel of dismissSelectors) {
        const el = document.querySelector(sel);
        if (el) { try { el.click(); } catch {} }
      }
      // Text-matching fallback for "Not now" / "Maybe later" buttons
      Array.from(document.querySelectorAll('[role="button"], button')).forEach(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        if (t === 'not now' || t === 'maybe later' || t === 'skip for now') {
          try { b.click(); } catch {}
        }
      });
    }
    dismissTwitterModals();
    await sleep(500);

    // Check if we already commented
    const myHandle = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] span')?.textContent?.trim();
    if (myHandle) {
      const replies = document.querySelectorAll('article[data-testid="tweet"] [data-testid="User-Name"]');
      for (const r of replies) {
        if (r.textContent?.includes(myHandle)) {
          return { success: true, alreadyCommented: true };
        }
      }
    }

    // Wait for reply box with retries (Twitter SPA loads it asynchronously)
    let replyBox = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      replyBox = document.querySelector('[data-testid="tweetTextarea_0"]')
        || document.querySelector('[data-testid="tweetTextarea_0_label"]')?.closest('div')?.querySelector('[contenteditable="true"]')
        || document.querySelector('div[role="textbox"][data-testid]');

      if (replyBox) break;

      // Try clicking "Reply" button if reply box is collapsed
      if (attempt === 1) {
        const replyBtn = document.querySelector('[data-testid="reply"]');
        if (replyBtn) { replyBtn.click(); await sleep(2000); continue; }
      }

      await sleep(2000);
    }

    if (!replyBox) return { success: false, error: 'Reply box not found' };
    replyBox.click();
    await sleep(500 + Math.random() * 500);
    await humanType(replyBox, text);
    await sleep(1000 + Math.random() * 1500);

    // Find post button with retries — Twitter renames these data-testids
    // periodically and uses different ones for inline reply vs modal compose.
    let btnDiag = { testIdsTried: [], composerButtons: 0, globalButtons: 0 };
    function findTwitterPostBtn() {
      // Strategy A: known data-testid variants in priority order
      const TESTIDS = [
        'tweetButtonInline',
        'tweetButton',
        'tweetButton-Reply',
        'replyButton',
        'tweetButton-Inline',
        'postButton',
        'postInlineReplyButton',
      ];
      btnDiag.testIdsTried = TESTIDS;
      for (const id of TESTIDS) {
        const el = document.querySelector(`[data-testid="${id}"]:not([aria-disabled="true"]):not([disabled])`);
        if (el) return el;
      }
      // Strategy B: scope search to the reply box's nearest dialog/form/composer
      const composer = replyBox.closest('[role="dialog"], form, [data-testid*="ompose" i], [data-testid*="Reply" i]') || document;
      const composerBtns = Array.from(composer.querySelectorAll('button, [role="button"]'));
      btnDiag.composerButtons = composerBtns.length;
      const inComposer = composerBtns.filter(b => {
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
        const t = (b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return t === 'post' || t === 'reply' || t === 'tweet'
          || aria === 'post' || aria === 'reply' || aria === 'tweet'
          || aria.startsWith('post your reply') || aria.startsWith('post your post')
          || aria.includes('post reply');
      });
      if (inComposer.length > 0) return inComposer[0];
      // Strategy C: global fallback — any visible enabled button with matching text/aria
      const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
      btnDiag.globalButtons = allBtns.length;
      return allBtns.find(b => {
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
        const t = (b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return t === 'post' || t === 'reply' || aria === 'post' || aria === 'reply';
      });
    }

    let postBtn = null;
    for (let i = 0; i < 6; i++) {
      postBtn = findTwitterPostBtn();
      if (postBtn) break;
      // Dismiss any modal that might have appeared mid-way
      if (i % 2 === 1) dismissTwitterModals();
      await sleep(1000);
    }
    if (!postBtn) {
      // Last resort: send Ctrl+Enter on the reply box (Twitter's default submit shortcut)
      let ctrlEnterFired = false;
      try {
        replyBox.focus();
        replyBox.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          ctrlKey: true, metaKey: navigator.platform.indexOf('Mac') !== -1,
          bubbles: true, cancelable: true,
        }));
        ctrlEnterFired = true;
      } catch {}
      await sleep(4000);

      // Check if the reply actually posted (clears the textbox)
      const boxAfterKb = document.querySelector('[data-testid="tweetTextarea_0"]');
      const clearedAfterKb = !boxAfterKb || (boxAfterKb.textContent || '').trim().length < 5;
      if (clearedAfterKb && ctrlEnterFired) {
        return { success: true, verified: true, verifyMethod: 'ctrl_enter' };
      }
      // Still nothing — return a loud diagnostic error
      return {
        success: false,
        error: 'Post button not found (tried ' + btnDiag.testIdsTried.length + ' testids, ' +
          btnDiag.composerButtons + ' composer btns, ' + btnDiag.globalButtons + ' global btns; Ctrl+Enter did not clear box)'
      };
    }
    try {
      postBtn.click();
    } catch {}
    await sleep(4000);

    // Verify: check if reply box is now empty (Twitter clears it on success)
    const boxAfter = document.querySelector('[data-testid="tweetTextarea_0"]');
    const boxCleared = !boxAfter || (boxAfter.textContent || '').trim().length < 5;

    // Also check if our text snippet appears in replies
    const snippet = text.slice(0, 40).trim();
    const textFound = (document.body.innerText || '').includes(snippet);
    const posted = boxCleared || textFound;

    if (!posted) return { success: false, error: 'Reply submitted but not confirmed on page', postUrl: window.location.href };
    return { success: true, verified: true, verifyMethod: boxCleared ? 'box_cleared' : 'text_on_page', postUrl: window.location.href };
  }

  async function likePost() {
    await sleep(2000);
    const likeBtn = document.querySelector('[data-testid="like"]');
    if (!likeBtn) {
      const unlikeBtn = document.querySelector('[data-testid="unlike"]');
      if (unlikeBtn) return { success: true, alreadyLiked: true, postUrl: window.location.href };
      return { success: false, error: 'Like button not found', postUrl: window.location.href };
    }
    likeBtn.click();
    await sleep(2000);
    const liked = !!document.querySelector('[data-testid="unlike"]');
    return { success: liked, verified: liked, verifyMethod: liked ? 'unlike_btn_visible' : '', error: liked ? undefined : 'Like click did not flip testid=unlike', postUrl: window.location.href };
  }

  // ── Scraping ────────────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);
    const posts = [];
    const seen = new Set();

    // Find all tweet articles on the page (search results or timeline)
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    articles.forEach(article => {
      try {
        // Get tweet URL
        const timeLink = article.querySelector('a[href*="/status/"] time')?.closest('a');
        const url = timeLink?.href;
        if (!url || seen.has(url)) return;

        // Get tweet text
        const tweetText = article.querySelector('[data-testid="tweetText"]');
        const content = tweetText?.textContent?.trim() || '';
        if (!content || content.length < 10) return;

        // Keyword match
        if (keywords.length > 0) {
          const lower = content.toLowerCase();
          if (!keywords.some(kw => lower.includes(kw.toLowerCase()))) return;
        }

        // Get author
        const authorEl = article.querySelector('[data-testid="User-Name"]');
        const handleMatch = authorEl?.textContent?.match(/@(\w+)/);
        const author = handleMatch ? handleMatch[1] : 'Unknown';

        // Skip own tweets (don't reply to yourself)
        // Skip retweets
        if (article.querySelector('[data-testid="socialContext"]')?.textContent?.includes('reposted')) return;

        seen.add(url);
        posts.push({ url, content, author, platform: 'twitter' });
      } catch {}
    });

    return { posts: posts.slice(0, 15) };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function humanType(element, text) {
    element.focus();
    for (const char of text) {
      document.execCommand('insertText', false, char);
      await sleep(50 + Math.random() * 80);
      if ('.!?,;'.includes(char)) await sleep(200 + Math.random() * 300);
    }
  }
})();
