/**
 * GetMention — Reddit Content Script
 * Uses markdown mode for reliable typing (Lexical rich editor blocks programmatic input).
 */

(() => {
  const isOldReddit = window.location.hostname === 'old.reddit.com';

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 800 + Math.random() * 700, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'JOIN_SUBREDDIT') {
      joinSubreddit().then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg.platform && msg.platform !== 'reddit') return;

    if (msg.type === 'EXECUTE_TASK') {
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Reddit content script timed out (90s)' }); }, 90000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) { clearTimeout(timeout); sendResponse({ success: false, error: err.message || 'Reddit error' }); });
      return true;
    }
    if (msg.type === 'SCRAPE_POSTS') {
      scrapePosts(msg.keywords || []).then(sendResponse).catch(err => {
        sendResponse({ posts: [], error: err.message });
      });
      return true;
    }
  });

  async function handleTask({ action, text }) {
    switch (action) {
      case 'comment': return commentWithUpvote(text);
      case 'upvote': {
        // Quick upvote — skip join (upvoting doesn't require membership)
        return upvotePost();
      }
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // ── Comment flow ────────────────────────────────────────────────

  async function commentWithUpvote(text) {
    await sleep(1000);

    // Step 1: Click "Join" if not already a member
    console.log('[GM Reddit] Step 1: Checking community membership');
    try {
      const joinResult = await joinSubreddit();
      if (joinResult?.joined) {
        console.log('[GM Reddit] Joined community');
        await sleep(1500);
      }
    } catch {}

    // Step 2: Dismiss community rules popup if it appears
    // (Some communities show a rules acknowledgment dialog after joining)
    console.log('[GM Reddit] Step 2: Checking for community rules popup');
    try { await dismissRulesPopup(); } catch {}

    window.scrollBy({ top: 300, behavior: 'smooth' });
    await sleep(1500);

    // Step 3: Upvote first (engagement before commenting)
    try { await upvotePost(); await sleep(800); } catch {}

    // Step 4: Check already commented
    const myUsername = getMyUsername();
    if (myUsername) {
      const authors = document.querySelectorAll(
        isOldReddit ? '.comment .author' : 'shreddit-comment [author], [slot="commentMeta"] a[href*="/user/"]'
      );
      for (const el of authors) {
        const name = el.textContent?.trim()?.replace('u/', '') || el.getAttribute('author') || '';
        if (name.toLowerCase() === myUsername.toLowerCase()) return { success: true, alreadyCommented: true };
      }
    }

    window.scrollBy({ top: 200, behavior: 'smooth' });
    await sleep(800);

    // Step 5: Find comment box → paste → send
    return postComment(text);
  }

  // ── Dismiss community rules popup ────────────────────────────────
  // After joining some subs, Reddit shows a "Community Rules" modal that
  // blocks the comment box until acknowledged. Click OK / I Agree / Got it.
  async function dismissRulesPopup() {
    // Wait briefly for any popup to appear after Join
    await sleep(1500);

    const tryButtonsByText = (labels) => {
      const all = document.querySelectorAll('button, a[role="button"]');
      for (const b of all) {
        const t = (b.textContent || '').trim().toLowerCase();
        if (labels.some(l => t === l || t.startsWith(l))) {
          if (b.offsetParent !== null) return b;
        }
      }
      return null;
    };

    // Strategy A: known modal selectors
    let okBtn = document.querySelector('faceplate-dialog button[type="submit"]')
      || document.querySelector('shreddit-dialog button[type="submit"]')
      || document.querySelector('[role="dialog"] button[type="submit"]')
      || document.querySelector('faceplate-dialog button')
      || document.querySelector('shreddit-dialog button');

    // Strategy B: text scan — common acknowledgment labels
    if (!okBtn) {
      okBtn = tryButtonsByText([
        'okay', 'ok', 'i agree', 'agree', 'got it', 'continue',
        'accept', 'i understand', 'understood', 'acknowledge'
      ]);
    }

    if (okBtn) {
      console.log('[GM Reddit] Dismissing community rules popup:', okBtn.textContent?.trim());
      try { okBtn.scrollIntoView({ block: 'center' }); } catch {}
      await sleep(300);
      okBtn.click();
      await sleep(1500);
      return { dismissed: true };
    }

    return { dismissed: false };
  }

  async function postComment(text) {
    const snippet = text.slice(0, 30);

    if (isOldReddit) {
      const box = document.querySelector('.usertext-edit textarea');
      if (!box) return { success: false, error: 'Comment box not found (old reddit)' };
      box.focus();
      await sleep(300);
      setNativeValue(box, text);
      await sleep(500);
      const btn = document.querySelector('.save-button button, button[type="submit"]');
      if (!btn) return { success: false, error: 'Submit button not found' };
      btn.click();
      await sleep(4000);
      var oldSnippet = text.slice(0, 40).trim();
      var oldVerified = (document.body.innerText || '').includes(oldSnippet);
      var oldBoxCleared = box.value.trim().length < 5;
      if (!oldVerified && !oldBoxCleared) return { success: false, error: 'Comment submitted but not confirmed (old reddit)' };
      return { success: true, verified: true };
    }

    // ── New Reddit ──
    //
    // Confirmed by DOM probe: shreddit-composer always contains
    //   <div slot="rte" contenteditable="true" role="textbox" data-lexical-editor="true">
    // The editor is mounted on page load — no trigger click needed.
    // Reddit uses Lexical, which ignores ClipboardEvent paste but DOES respect
    // execCommand('insertText') when the contenteditable is focused.

    // Step 1: Scroll the composer into view
    var composer = document.querySelector('shreddit-composer');
    if (!composer) {
      // It may render lazily — scroll down and wait
      window.scrollTo({ top: 800, behavior: 'instant' });
      await sleep(2000);
      composer = document.querySelector('shreddit-composer');
    }
    if (!composer) {
      window.scrollTo({ top: 1600, behavior: 'instant' });
      await sleep(2000);
      composer = document.querySelector('shreddit-composer');
    }
    if (!composer) return { success: false, error: 'shreddit-composer not found on page' };

    try { composer.scrollIntoView({ block: 'center' }); } catch {}
    await sleep(800);

    // Step 2: Find the Lexical editor (the actual contenteditable)
    var editor = composer.querySelector('div[slot="rte"][contenteditable="true"]')
      || composer.querySelector('[data-lexical-editor="true"]')
      || composer.querySelector('div[contenteditable="true"][role="textbox"]')
      || composer.querySelector('[contenteditable="true"]');

    if (!editor) {
      return { success: false, error: 'Editor not found inside shreddit-composer' };
    }

    // Step 3: Focus the editor and select all (so insertText replaces empty content cleanly)
    try { editor.scrollIntoView({ block: 'center' }); } catch {}
    await sleep(300);

    // Real mouse click — Reddit's React handlers ignore plain .click() sometimes
    function fireMouse(el, type) {
      try {
        var rect = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          button: 0,
        }));
      } catch {}
    }
    fireMouse(editor, 'mousedown');
    fireMouse(editor, 'mouseup');
    fireMouse(editor, 'click');
    try { editor.focus(); } catch {}
    await sleep(400);

    // Place caret inside the editor by selecting its contents
    try {
      var range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    await sleep(200);

    // Step 4: Insert text — Lexical responds to execCommand('insertText')
    var inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {}
    await sleep(800);

    // Check if it worked
    var editorText = (editor.textContent || '').trim();

    // Fallback 1: beforeinput event (some Lexical builds need this)
    if (editorText.length < 5) {
      try {
        editor.focus();
        editor.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: text,
          bubbles: true,
          cancelable: true,
        }));
      } catch {}
      await sleep(800);
      editorText = (editor.textContent || '').trim();
    }

    // Fallback 2: ClipboardEvent paste (works on some legacy editors)
    if (editorText.length < 5) {
      try {
        editor.focus();
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt, bubbles: true, cancelable: true,
        }));
      } catch {}
      await sleep(800);
      editorText = (editor.textContent || '').trim();
    }

    // Fallback 3: direct innerHTML + input event (last resort)
    if (editorText.length < 5) {
      try {
        editor.focus();
        editor.innerHTML = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch {}
      await sleep(800);
      editorText = (editor.textContent || '').trim();
    }

    if (editorText.length < 5) {
      return { success: false, error: 'Paste failed — all 4 insertion methods produced empty editor (inserted=' + inserted + ')' };
    }

    // Step 4: Find and click submit button
    await sleep(500);
    var submitBtn = null;
    for (var subAttempt = 0; subAttempt < 3; subAttempt++) {
      submitBtn = document.querySelector('button[slot="submit-button"]')
        || document.querySelector('shreddit-composer button[type="submit"]');

      if (!submitBtn) {
        // Scan all buttons for Comment/Reply/Submit text
        var allBtns = document.querySelectorAll('button');
        for (var bi = 0; bi < allBtns.length; bi++) {
          var btnText = (allBtns[bi].textContent || '').trim().toLowerCase();
          if ((btnText === 'comment' || btnText === 'reply' || btnText === 'submit') && !allBtns[bi].disabled) {
            submitBtn = allBtns[bi];
            break;
          }
        }
      }
      if (submitBtn) break;
      await sleep(1500);
    }

    if (!submitBtn) return { success: false, error: 'Submit button not found' };

    submitBtn.click();
    await sleep(5000);

    // Step 5: Verify comment was posted
    var verifySnippet = text.slice(0, 40).trim();
    var pageText = document.body.innerText || '';
    var verified = pageText.includes(verifySnippet);

    var editorAfter = document.querySelector('[data-lexical-editor="true"]')
      || document.querySelector('shreddit-composer [contenteditable="true"]');
    var editorCleared = !editorAfter || (editorAfter.textContent || '').trim().length < 5;
    var posted = verified || editorCleared;

    // Save result to storage IMMEDIATELY
    try { chrome.storage.local.set({ lastRedditResult: { success: posted, url: window.location.href, timestamp: Date.now() } }); } catch (e) {}

    if (!posted) return { success: false, error: 'Comment submitted but not confirmed on page' };
    return { success: true, verified: true };
  }

  // ── Upvote ──────────────────────────────────────────────────────

  async function upvotePost() {
    await sleep(1000);

    if (isOldReddit) {
      var up = document.querySelector('.arrow.up:not(.upmod)');
      if (!up) {
        if (document.querySelector('.arrow.upmod')) return { success: true, alreadyUpvoted: true };
        return { success: false, error: 'Upvote not found' };
      }
      up.click();
      await sleep(1000);
      return { success: !!document.querySelector('.arrow.upmod') };
    }

    window.scrollTo(0, 0);
    await sleep(1500);

    // Pierce ALL shadow roots in the document and collect every <button>,
    // every shreddit-vote-button, and every aria-label="upvote" element.
    // Reddit's new design hides upvote buttons inside <shreddit-post> shadow
    // DOM which document.querySelector cannot reach.
    function deepFindUpvote() {
      const found = [];
      function walk(root) {
        if (!root || !root.querySelectorAll) return;
        // Direct matches in this root
        try {
          root.querySelectorAll('button[aria-label*="upvote" i], button[upvote], shreddit-vote-button, [data-action="upvote"], [aria-label="upvote" i]').forEach(el => found.push(el));
        } catch {}
        // Recurse into shadow roots of every element in this root
        try {
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot) walk(el.shadowRoot);
          }
        } catch {}
      }
      walk(document);
      return found;
    }

    function isUpvoteCandidate(el) {
      if (!el) return false;
      const aria = (el.getAttribute && (el.getAttribute('aria-label') || '')).toLowerCase();
      if (aria.includes('downvote')) return false;
      if (aria.includes('upvote')) return true;
      if (el.tagName === 'SHREDDIT-VOTE-BUTTON') return true;
      if (el.hasAttribute && (el.hasAttribute('upvote') || el.getAttribute('data-action') === 'upvote')) return true;
      return false;
    }

    function isAlreadyUpvoted(el) {
      if (!el) return false;
      if (el.getAttribute && el.getAttribute('aria-pressed') === 'true') return true;
      const cls = (el.className || '').toString().toLowerCase();
      if (cls.includes('upmod') || cls.includes('upvoted') || cls.includes('-active')) return true;
      // Look for filled upvote SVG inside
      try {
        if (el.querySelector && el.querySelector('svg[icon-name="upvote-fill"], svg[fill="currentColor"][icon-name*="upvote"]')) return true;
      } catch {}
      return false;
    }

    // Try multiple selectors with retries — Reddit changes DOM frequently
    var btn = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      // 1. Deep-shadow-DOM walk for any upvote-like element
      var candidates = deepFindUpvote().filter(isUpvoteCandidate);
      if (candidates.length > 0) {
        btn = candidates[0];
        break;
      }
      // 2. Direct attribute selector (light DOM)
      btn = document.querySelector('button[upvote]');
      if (btn) break;
      // 3. SVG icon inside button
      var svgs = document.querySelectorAll('svg[icon-name="upvote-outline"], svg[icon-name="upvote-fill"]');
      for (var s = 0; s < svgs.length; s++) {
        var candidate = svgs[s].closest('button');
        if (candidate) { btn = candidate; break; }
      }
      if (btn) break;
      // 4. aria-label
      btn = document.querySelector('button[aria-label*="upvote" i]:not([aria-label*="downvote"])');
      if (btn) break;
      await sleep(2000);
    }

    if (!btn) {
      // Already upvoted check — look for filled upvote
      var filled = document.querySelector('svg[icon-name="upvote-fill"]');
      if (filled) return { success: true, alreadyUpvoted: true };

      // Last-resort fallback: Reddit's closed shadow DOM hides the button from
      // us, but the keyboard shortcut 'a' = upvote the focused post. Focus the
      // post body (or shreddit-post element) and dispatch the keypress.
      try {
        var postEl = document.querySelector('shreddit-post') || document.querySelector('[data-testid="post-container"]') || document.body;
        if (postEl.focus) postEl.focus();
        // Scroll so the post is in view and "focused" for keyboard shortcut
        if (postEl.scrollIntoView) postEl.scrollIntoView({ block: 'center' });
        await sleep(500);
        ['keydown', 'keypress', 'keyup'].forEach(function(type) {
          document.body.dispatchEvent(new KeyboardEvent(type, {
            key: 'a', code: 'KeyA', keyCode: 65, which: 65,
            bubbles: true, cancelable: true,
          }));
        });
        await sleep(2000);
        // Verify — check if any upvote-fill SVG now exists OR any button with aria-pressed=true
        var nowFilled = document.querySelector('svg[icon-name="upvote-fill"]');
        var nowPressed = document.querySelector('button[aria-pressed="true"][aria-label*="upvote" i]');
        if (nowFilled || nowPressed) {
          return { success: true, verified: true, verifyMethod: 'keyboard_shortcut' };
        }
      } catch (e) {}

      return { success: false, error: 'Upvote button not found (deep-walk + 4 fallback strategies + keyboard shortcut all failed)' };
    }
    if (isAlreadyUpvoted(btn)) return { success: true, alreadyUpvoted: true };

    try { btn.scrollIntoView({ block: 'center' }); } catch {}
    await sleep(200);
    try {
      var rect = btn.getBoundingClientRect();
      ['mousedown', 'mouseup', 'click'].forEach(function(type) {
        btn.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      });
    } catch {
      try { btn.click(); } catch {}
    }
    await sleep(1500);
    // Verify state changed
    return { success: true, verified: isAlreadyUpvoted(btn) };
  }

  // ── Join subreddit ──────────────────────────────────────────────

  async function joinSubreddit() {
    await sleep(500);

    // Scroll to top where join button is
    window.scrollTo(0, 0);
    await sleep(1000);

    // Check if already joined — look for "Joined" button or "Leave" button
    const alreadyJoined = document.querySelector('button[aria-label*="Leave" i]')
      || Array.from(document.querySelectorAll('button')).find(b => {
        const t = (b.textContent?.trim() || '');
        return t === 'Joined' || t === 'Joined community' || t === 'Leave';
      });
    if (alreadyJoined) {
      console.log('[GM Reddit] Already joined this community');
      return { ok: true, alreadyJoined: true };
    }

    // Find the Join button with multiple selectors
    let joinBtn = null;
    for (let i = 0; i < 3; i++) {
      joinBtn = document.querySelector('shreddit-subreddit-header-button button')
        || document.querySelector('button[join]')
        || document.querySelector('button[aria-label*="Join" i]')
        || Array.from(document.querySelectorAll('button')).find(b => {
          const t = (b.textContent?.trim() || '');
          return t === 'Join' || t === 'Join Community' || t === 'Join community';
        });
      if (joinBtn) break;
      await sleep(1000);
    }

    if (joinBtn) {
      console.log('[GM Reddit] Clicking Join button:', joinBtn.textContent?.trim());
      joinBtn.click();
      await sleep(2000);
      // Verify join worked
      const nowJoined = !!document.querySelector('button[aria-label*="Leave" i]')
        || !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Joined');
      console.log('[GM Reddit] Join verified:', nowJoined);
      return { ok: true, joined: true, verified: nowJoined };
    }

    console.log('[GM Reddit] Join button not found');
    return { ok: false };
  }

  // ── Get username ────────────────────────────────────────────────

  function getMyUsername() {
    if (isOldReddit) return document.querySelector('.user a')?.textContent?.trim() || '';
    const el = document.querySelector('a[href*="/user/"][data-testid="user-drawer-button"]')
      || document.querySelector('faceplate-tracker[noun="profile"] a')
      || document.querySelector('#USER_DROPDOWN_ID span');
    return el?.textContent?.trim()?.replace('u/', '') || '';
  }

  // ── Scraping ────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);
    const posts = [];
    const seen = new Set();
    const isSearchPage = window.location.href.includes('/search');
    const shouldFilter = keywords.length > 0 && !isSearchPage;
    const keywordWords = keywords.flatMap(kw => kw.toLowerCase().split(/\s+/).filter(w => w.length >= 3));

    function matchesKeywords(text) {
      if (!shouldFilter) return true;
      const lower = text.toLowerCase();
      return keywordWords.some(word => lower.includes(word));
    }

    if (isOldReddit) {
      document.querySelectorAll('.thing.link').forEach(thing => {
        try {
          const titleEl = thing.querySelector('a.title');
          const url = thing.querySelector('a.comments')?.href || titleEl?.href;
          if (!url || seen.has(url)) return;
          const content = titleEl?.textContent?.trim() || '';
          if (!content || content.length < 10) return;
          if (!matchesKeywords(content)) return;
          const author = thing.querySelector('.author')?.textContent?.trim() || 'Unknown';
          const bodyEl = thing.querySelector('.expando .md');
          const body = bodyEl?.textContent?.trim() || '';
          seen.add(url);
          posts.push({ url, content: body ? `${content}\n\n${body.slice(0, 500)}` : content, author, platform: 'reddit' });
        } catch {}
      });
    } else {
      const postEls = document.querySelectorAll('shreddit-post, article, [data-testid="post-container"]');
      postEls.forEach(post => {
        try {
          const titleEl = post.querySelector('a[slot="title"], a[data-testid="post-title"], h3 a, a[href*="/comments/"]');
          let url = titleEl?.href || post.querySelector('a[href*="/comments/"]')?.href;
          if (!url || seen.has(url)) return;
          url = url.split('?')[0];
          const title = titleEl?.textContent?.trim() || post.querySelector('h3')?.textContent?.trim() || '';
          if (!title || title.length < 10) return;
          if (!matchesKeywords(title)) return;
          const bodyEl = post.querySelector('[slot="text-body"], [data-testid="post-body"]');
          const body = bodyEl?.textContent?.trim() || '';
          const author = post.getAttribute('author') || post.querySelector('a[href*="/user/"]')?.textContent?.trim()?.replace('u/', '') || 'Unknown';
          seen.add(url);
          posts.push({ url, content: body ? `${title}\n\n${body.slice(0, 500)}` : title, author, platform: 'reddit' });
        } catch {}
      });

      // Fallback: scan links
      if (posts.length === 0) {
        document.querySelectorAll('a[href*="/comments/"]').forEach(a => {
          try {
            let url = a.href?.split('?')[0];
            if (!url || seen.has(url) || !url.match(/reddit\.com\/r\/\w+\/comments\//)) return;
            let title = a.textContent?.trim() || '';
            if (title.length < 10) {
              title = a.closest('div')?.textContent?.trim()?.split('\n')[0]?.trim() || '';
            }
            if (!title || title.length < 10 || title.length > 500) return;
            if (!matchesKeywords(title)) return;
            seen.add(url);
            posts.push({ url, content: title, author: 'Unknown', platform: 'reddit' });
          } catch {}
        });
      }
    }

    console.log('[GM Reddit] Scraped:', posts.length, 'posts');
    return { posts: posts.slice(0, 20) };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Set value on React-controlled inputs (textarea, input)
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
})();
