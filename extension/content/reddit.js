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
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Reddit content script timed out (110s)' }); }, 110000);
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

    // Step 4: Human-type character-by-character — same pattern that works on
    // Twitter and Facebook. Each execCommand('insertText') fires a real
    // beforeinput+input event sequence per character, which Lexical treats
    // as genuine user typing and uses to enable the submit button. One-shot
    // insertion sometimes fails to trigger Lexical's validation.
    async function humanType(el, s) {
      el.focus();
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        try { document.execCommand('insertText', false, ch); } catch (e) {}
        await sleep(35 + Math.random() * 65);
        if ('.!?,;:'.indexOf(ch) !== -1) await sleep(120 + Math.random() * 220);
      }
    }

    await humanType(editor, text);
    await sleep(400);

    var editorText = (editor.textContent || '').trim();

    // Fallback: paste + innerHTML if per-char typing was blocked by Lexical
    if (editorText.length < 5) {
      try {
        editor.focus();
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (e) {}
      await sleep(700);
      editorText = (editor.textContent || '').trim();
    }
    if (editorText.length < 5) {
      try {
        editor.focus();
        editor.innerHTML = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch (e) {}
      await sleep(700);
      editorText = (editor.textContent || '').trim();
    }
    if (editorText.length < 5) {
      return { success: false, error: 'Reddit editor rejected all typing methods (humanType + paste + innerHTML) — composer may be muted or DOM changed' };
    }

    // Step 4: Find submit button, waiting until it is actually enabled
    function isSubmitDisabled(b) {
      if (!b) return true;
      if (b.disabled) return true;
      if (b.getAttribute && b.getAttribute('aria-disabled') === 'true') return true;
      return false;
    }

    // Deep search: Reddit's submit button often lives in shreddit-composer's
    // shadow DOM. Walk every shadow root recursively and return the first
    // match for a set of prioritized selectors.
    function deepFindSubmit() {
      var selectors = [
        'button[aria-label="Submit comment" i]',
        'button[aria-label*="submit comment" i]',
        'button[aria-label*="Post comment" i]',
        'button[slot="submit-button"]',
        'button[type="submit"]',
      ];
      var found = null;
      function walk(root) {
        if (!root || found) return;
        for (var i = 0; i < selectors.length; i++) {
          try {
            var m = root.querySelector(selectors[i]);
            if (m) { found = m; return; }
          } catch (e) {}
        }
        try {
          var all = root.querySelectorAll('*');
          for (var j = 0; j < all.length; j++) {
            if (all[j].shadowRoot) walk(all[j].shadowRoot);
            if (found) return;
          }
        } catch (e) {}
      }
      walk(document);
      return found;
    }

    // Text-based fallback across the whole page (prefers composer-scoped)
    function findSubmitByText() {
      var scope = document.querySelector('shreddit-composer') || document;
      var btns = scope.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var t = (b.textContent || '').trim().toLowerCase();
        var aria = ((b.getAttribute && b.getAttribute('aria-label')) || '').toLowerCase();
        if (aria.indexOf('cancel') !== -1) continue;
        if (t === 'cancel' || t === 'discard') continue;
        if (t === 'comment' || t === 'reply' || t === 'submit' || t === 'post') return b;
        if (aria === 'submit comment' || aria === 'post comment') return b;
      }
      return null;
    }

    await sleep(500);
    var submitBtn = null;
    for (var subAttempt = 0; subAttempt < 8; subAttempt++) {
      var candidate = deepFindSubmit() || findSubmitByText();

      if (candidate && !isSubmitDisabled(candidate)) {
        submitBtn = candidate;
        break;
      }
      // Button found but still disabled — re-poke Lexical to mark the editor dirty
      try {
        editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
        editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      } catch (e) {}
      await sleep(1200);
    }

    if (!submitBtn) {
      return { success: false, error: 'Submit button never became enabled — Lexical did not register the text (likely needs an input event the editor did not fire)' };
    }

    // Snapshot BEFORE state — used for multi-signal polling
    var urlBefore = window.location.href;
    var editorRef = editor;
    var submitRef = submitBtn;
    var verifySnippet = text.slice(0, 40).trim();

    // Click with a full pointer + mouse + click sequence. Reddit's React
    // handlers are primarily wired to pointer events; a plain .click() fires
    // only the click phase and React may not recognize it as user intent.
    async function fireClick(el) {
      try {
        el.scrollIntoView({ block: 'center' });
        await sleep(200);
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        // Order matters: enter → over → down → up → click, with focus in between
        el.dispatchEvent(new PointerEvent('pointerover', opts));
        el.dispatchEvent(new PointerEvent('pointerenter', opts));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        try { el.focus(); } catch (e) {}
        await sleep(40);
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        // Native click as a backstop — does nothing if React already handled above
        try { el.click(); } catch (e) {}
      } catch (err) {
        try { el.click(); } catch (e2) {}
      }
    }

    // ── Multi-strategy submit (like react-testing-library userEvent.click) ──
    //
    // We escalate through 4 independent submit paths. The first one that
    // posts wins. Any can succeed on its own without the others.
    //
    //   A. Pointer-event click on the submit button
    //   B. HTMLFormElement.requestSubmit() on the enclosing <form>
    //      (native browser API — fires the form's onSubmit handler)
    //   C. Ctrl+Enter keyboard shortcut on the editor (Reddit's native)
    //   D. Direct submit() method call on shreddit-composer web component

    var attempts = { click: false, requestSubmit: false, ctrlEnter: false, componentSubmit: false };

    async function tryClick() {
      if (attempts.click) return;
      attempts.click = true;
      await fireClick(submitBtn);
    }

    function tryRequestSubmit() {
      if (attempts.requestSubmit) return;
      attempts.requestSubmit = true;
      try {
        var form = submitBtn.closest('form') || editorRef.closest('form');
        if (form && typeof form.requestSubmit === 'function') {
          form.requestSubmit(typeof submitBtn.form !== 'undefined' ? submitBtn : undefined);
          return true;
        }
      } catch (e) {}
      return false;
    }

    function tryCtrlEnter() {
      if (attempts.ctrlEnter) return;
      attempts.ctrlEnter = true;
      try {
        editorRef.focus();
        var isMac = navigator.platform.indexOf('Mac') !== -1;
        var ev = {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          ctrlKey: !isMac, metaKey: isMac,
          bubbles: true, cancelable: true,
        };
        editorRef.dispatchEvent(new KeyboardEvent('keydown', ev));
        editorRef.dispatchEvent(new KeyboardEvent('keypress', ev));
        editorRef.dispatchEvent(new KeyboardEvent('keyup', ev));
        // Also target the document — some Reddit keyboard handlers bind at document level
        document.dispatchEvent(new KeyboardEvent('keydown', ev));
      } catch (e) {}
    }

    function tryComponentSubmit() {
      if (attempts.componentSubmit) return;
      attempts.componentSubmit = true;
      try {
        var composer = document.querySelector('shreddit-composer');
        if (composer) {
          // Some web components expose a submit() method directly
          if (typeof composer.submit === 'function') { composer.submit(); return true; }
          // Or dispatch a custom event the component listens to
          composer.dispatchEvent(new CustomEvent('submit', { bubbles: true, cancelable: true }));
          composer.dispatchEvent(new Event('shreddit:submit', { bubbles: true }));
        }
      } catch (e) {}
      return false;
    }

    // Fire Strategy A first (most natural), then escalate by second.
    await tryClick();

    // Poll for up to 15 seconds, escalating strategies along the way.
    var posted = false;
    var verifyMethod = '';
    var rejectReason = '';
    for (var poll = 0; poll < 15; poll++) {
      await sleep(1000);
      // Strategy escalation timeline
      if (poll === 2) tryRequestSubmit();
      if (poll === 5) tryCtrlEnter();
      if (poll === 8) tryComponentSubmit();
      if (poll === 11) { try { await fireClick(submitBtn); } catch (e) {} } // re-click in case first was racy

      // Signal 0: Reddit surfaced a rejection toast/banner — bail early with a real reason.
      var pageLower = (document.body.innerText || '').toLowerCase();
      var rejectMatch = [
        ['doing that too much', 'rate_limited'],
        ['you are doing that too much', 'rate_limited'],
        ['try again in', 'rate_limited'],
        ['something went wrong', 'reddit_error'],
        ['whoops, we had an issue', 'reddit_error'],
        ['submission has been filtered', 'spam_filter'],
        ['removed by reddit', 'spam_filter'],
        ['unable to create comment', 'reddit_error'],
        ['please slow down', 'rate_limited'],
        ['requires you to have', 'karma_gate'],
        ['must have at least', 'karma_gate'],
      ].find(function(pair) { return pageLower.indexOf(pair[0]) !== -1; });
      if (rejectMatch) {
        rejectReason = rejectMatch[1];
        break;
      }

      // Signal 1: URL changed (e.g. redirected to /comments/...#new-comment)
      if (window.location.href !== urlBefore) {
        posted = true; verifyMethod = 'url_changed'; break;
      }

      // Signal 2: editor element is gone from the DOM (composer was removed)
      if (!document.contains(editorRef)) {
        posted = true; verifyMethod = 'editor_removed'; break;
      }

      // Signal 3: editor cleared (submit emptied it)
      if ((editorRef.textContent || '').trim().length < 5) {
        posted = true; verifyMethod = 'editor_cleared'; break;
      }

      // Signal 4: submit button gone or now disabled
      if (!document.contains(submitRef) || submitRef.disabled) {
        posted = true; verifyMethod = 'submit_gone'; break;
      }

      // Signal 5: our snippet appears in any comment (light DOM)
      if ((document.body.innerText || '').indexOf(verifySnippet) !== -1) {
        posted = true; verifyMethod = 'text_on_page'; break;
      }

      // Signal 6: our snippet appears in shreddit-comment shadow DOMs
      try {
        var comments = document.querySelectorAll('shreddit-comment');
        for (var c = 0; c < comments.length; c++) {
          var ct = (comments[c].textContent || '');
          if (ct.indexOf(verifySnippet) !== -1) {
            posted = true; verifyMethod = 'text_in_comment'; break;
          }
        }
        if (posted) break;
      } catch (e) {}
    }

    // Save result to storage IMMEDIATELY — before service worker can die
    try { chrome.storage.local.set({ lastRedditResult: { success: posted, url: window.location.href, verifyMethod: verifyMethod, rejectReason: rejectReason, timestamp: Date.now() } }); } catch (e) {}

    if (!posted) {
      if (rejectReason) {
        return { success: false, skipped: true, reason: rejectReason, error: 'Reddit rejected comment: ' + rejectReason.replace(/_/g, ' '), postUrl: window.location.href };
      }
      var tried = Object.keys(attempts).filter(function(k) { return attempts[k]; }).join(',');
      return { success: false, error: 'Comment not confirmed after 15s — tried strategies: ' + tried, postUrl: window.location.href };
    }
    return { success: true, verified: true, verifyMethod: verifyMethod, postUrl: window.location.href };
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

    // Reddit's vote button sits inside shreddit-vote-button (web component)
    // with its own handlers listening to pointer events. Plain .click()
    // often reaches the outer wrapper and not the inner button, so we
    // dispatch the full pointer + mouse + click sequence.
    async function fireVoteClick(el) {
      try {
        el.scrollIntoView({ block: 'center' });
        await sleep(200);
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        el.dispatchEvent(new PointerEvent('pointerover', opts));
        el.dispatchEvent(new PointerEvent('pointerenter', opts));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        try { el.focus && el.focus(); } catch (e) {}
        await sleep(40);
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        try { el.click(); } catch (e) {}
      } catch (err) {
        try { el.click(); } catch (e2) {}
      }
    }

    // Try clicking the candidate; if the element is a web-component wrapper
    // (e.g. shreddit-vote-button), also try its internal shadow-DOM button.
    await fireVoteClick(btn);

    // Poll up to 6s for state change. Reddit's vote button sometimes re-renders.
    var verified = false;
    var verifyMethod2 = '';
    for (var vp = 0; vp < 6; vp++) {
      await sleep(1000);
      var current = document.contains(btn) ? btn : (deepFindUpvote().filter(isUpvoteCandidate)[0] || null);
      if (current && isAlreadyUpvoted(current)) { verified = true; verifyMethod2 = 'state_flipped'; break; }
      // Also check any upvote-fill svg appeared
      if (document.querySelector('svg[icon-name="upvote-fill"]')) { verified = true; verifyMethod2 = 'svg_filled'; break; }
      // If still not verified, try clicking the inner shadow-root button
      if (vp === 2 && btn.shadowRoot) {
        try {
          var innerBtn = btn.shadowRoot.querySelector('button[aria-label*="upvote" i]') || btn.shadowRoot.querySelector('button');
          if (innerBtn) await fireVoteClick(innerBtn);
        } catch (e) {}
      }
      // Keyboard shortcut as late fallback (Reddit: 'a' = upvote focused post)
      if (vp === 4) {
        try {
          var postEl = document.querySelector('shreddit-post') || document.body;
          postEl.scrollIntoView && postEl.scrollIntoView({ block: 'center' });
          postEl.focus && postEl.focus();
          ['keydown','keypress','keyup'].forEach(function(t) {
            document.body.dispatchEvent(new KeyboardEvent(t, { key: 'a', code: 'KeyA', keyCode: 65, which: 65, bubbles: true, cancelable: true }));
          });
        } catch (e) {}
      }
    }

    if (!verified) {
      return { success: false, error: 'Upvote clicked but state did not flip after 6s (likely intercepted by Reddit or button moved)', postUrl: window.location.href };
    }
    return { success: true, verified: true, verifyMethod: verifyMethod2, postUrl: window.location.href };
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
