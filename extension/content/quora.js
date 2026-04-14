/**
 * GetMention — Quora Content Script (Optimized for speed)
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.platform && msg.platform !== 'quora') return;

    if (msg.type === 'EXECUTE_TASK') {
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Quora timed out (100s)' }); }, 100000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) { clearTimeout(timeout); sendResponse({ success: false, error: err.message || 'Quora error' }); });
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
      case 'comment': return postAnswer(text);
      case 'upvote': return upvoteAnswer();
      default: return { success: false, error: 'Unknown action: ' + action };
    }
  }

  // ── Post Answer (fast version) ──────────────────────────────────

  // ── Helpers shared across postAnswer / reverify ─────────────────
  function findQuoraEditor() {
    return document.querySelector('div.doc[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"][data-placeholder]')
      || document.querySelector('.qu-contentEditable[contenteditable="true"]')
      || document.querySelector('[role="textbox"][contenteditable="true"]')
      || document.querySelector('[contenteditable="true"][class*="editor"]')
      || document.querySelector('[contenteditable="true"]');
  }

  function getMyQuoraName() {
    // Quora sidebar / top-nav profile link exposes the username
    var el = document.querySelector('a[href*="/profile/"][aria-label*="profile" i]')
      || document.querySelector('a[href*="/profile/"] div')
      || document.querySelector('[data-testid="user-menu-button"]');
    var t = (el && (el.textContent || el.getAttribute('aria-label'))) || '';
    return t.replace(/^user menu:?/i, '').trim();
  }

  // Returns true if one of our existing answers is visible on the question page
  function alreadyAnsweredByMe(snippet) {
    var name = getMyQuoraName();
    // Strategy 1: snippet of our intended text is already in the page
    var body = document.body.innerText || '';
    if (snippet && body.indexOf(snippet) !== -1) return { ok: true, reason: 'snippet_on_page' };
    // Strategy 2: author links of visible answers contain our profile name
    if (name) {
      var authorLinks = document.querySelectorAll('a[href*="/profile/"]');
      for (var i = 0; i < authorLinks.length; i++) {
        var t = (authorLinks[i].textContent || '').trim();
        if (t && t.toLowerCase() === name.toLowerCase()) return { ok: true, reason: 'author_match' };
      }
    }
    // Strategy 3: Quora shows "Your answer" / "Edit your answer" button when user has already answered
    var markers = document.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < markers.length; j++) {
      var bt = (markers[j].textContent || '').trim().toLowerCase();
      if (bt === 'edit your answer' || bt === 'your answer' || bt === 'view your answer') {
        return { ok: true, reason: 'edit_answer_btn' };
      }
    }
    return { ok: false };
  }

  // Full pointer-event click (Reddit/Twitter pattern — Quora's q-click-wrapper
  // components also listen primarily to pointer events).
  async function qFireClick(el) {
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
      try { el.focus(); } catch (e) {}
      await sleep(40);
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      try { el.click(); } catch (e) {}
    } catch (err) {
      try { el.click(); } catch (e2) {}
    }
  }

  // Character-by-character typing (Twitter/Facebook pattern — fires real
  // beforeinput+input per char so Quora's editor flags itself as dirty
  // and the Post button enables).
  async function qHumanType(el, s) {
    el.focus();
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      try { document.execCommand('insertText', false, ch); } catch (e) {}
      await sleep(35 + Math.random() * 65);
      if ('.!?,;:'.indexOf(ch) !== -1) await sleep(120 + Math.random() * 220);
    }
  }

  async function postAnswer(text) {
    await sleep(1500);

    // Cloudflare / challenge page — bail early with a clear reason
    if (document.title.toLowerCase().includes('just a moment') || document.title.toLowerCase().includes('attention required')) {
      return { success: false, skipped: true, reason: 'cloudflare_challenge', error: 'Quora blocked by Cloudflare challenge — open Quora manually first' };
    }

    var snippet = text.slice(0, 40).trim();

    // ── Pre-check: already answered this question? ────────────────
    // Quora forbids multiple answers from the same user to the same
    // question, so don't waste a cycle trying.
    var pre = alreadyAnsweredByMe(snippet);
    if (pre.ok) {
      return { success: true, alreadyCommented: true, verifyMethod: pre.reason, postUrl: window.location.href };
    }

    // Find Answer button with retries (page may still be loading)
    var answerBtn = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      answerBtn = findAnswerButton();
      if (answerBtn) break;
      await sleep(2000);
    }
    if (!answerBtn) {
      // Final alreadyAnswered check before reporting button-not-found —
      // Quora replaces the "Answer" button with "Your answer" once posted.
      var finalCheck = alreadyAnsweredByMe(snippet);
      if (finalCheck.ok) return { success: true, alreadyCommented: true, verifyMethod: finalCheck.reason };
      var btnCount = document.querySelectorAll('button').length;
      var qClickCount = document.querySelectorAll('button.q-click-wrapper').length;
      return { success: false, error: 'Answer button not found (' + btnCount + ' buttons, ' + qClickCount + ' q-click on page)' };
    }

    await qFireClick(answerBtn);
    await sleep(1500);

    // Find editor
    var editor = findQuoraEditor();
    if (!editor) { await sleep(1500); editor = findQuoraEditor(); }
    if (!editor) { await qFireClick(answerBtn); await sleep(2000); editor = findQuoraEditor(); }
    if (!editor) return { success: false, error: 'Editor not found after clicking Answer' };

    // ── Draft detection: Quora auto-saves drafts between sessions ──
    // If existing content is already in the editor (a leftover draft),
    // clear it before we type — otherwise we'd append our text to old text.
    var existingContent = (editor.textContent || '').trim();
    if (existingContent.length > 0 && existingContent !== 'Write your answer' && existingContent.length < 5000) {
      try {
        editor.focus();
        // Select-all + delete via native commands
        var range = document.createRange();
        range.selectNodeContents(editor);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false);
        await sleep(300);
      } catch (e) {}
    }

    // Focus + caret at end
    editor.click();
    editor.focus();
    editor.classList && editor.classList.remove('empty');
    await sleep(300);
    try {
      var range2 = document.createRange();
      range2.selectNodeContents(editor);
      range2.collapse(false);
      var sel2 = window.getSelection();
      sel2.removeAllRanges();
      sel2.addRange(range2);
    } catch (e) {}

    // Primary: character-by-character typing (matches Twitter/FB pattern)
    await qHumanType(editor, text);
    await sleep(500);

    var editorText = (editor.textContent || '').trim();

    // Fallback 1: clipboard paste
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
    // Fallback 2: innerHTML
    if (editorText.length < 5) {
      try {
        editor.innerHTML = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch (e) {}
      await sleep(700);
      editorText = (editor.textContent || '').trim();
    }
    if (editorText.length < 5) return { success: false, error: 'Could not type in Quora editor (all 3 methods failed)' };

    // Find Post button
    await sleep(500);
    var submitBtn = findButton(['Post', 'Submit', 'Add Answer']);
    if (!submitBtn) { await sleep(1000); submitBtn = findButton(['Post', 'Submit', 'Add Answer']); }
    if (!submitBtn) return { success: false, error: 'Post button not found' };

    var urlBefore = window.location.href;
    var editorBefore = editor;
    var submitBtnBefore = submitBtn;

    // ── Multi-strategy submit (same cascade as Reddit) ─────────────
    var attempts = { click: false, requestSubmit: false, ctrlEnter: false };

    async function tryClick() { if (attempts.click) return; attempts.click = true; await qFireClick(submitBtn); }
    function tryRequestSubmit() {
      if (attempts.requestSubmit) return;
      attempts.requestSubmit = true;
      try {
        var form = submitBtn.closest('form') || editorBefore.closest('form');
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
      } catch (e) {}
    }
    function tryCtrlEnter() {
      if (attempts.ctrlEnter) return;
      attempts.ctrlEnter = true;
      try {
        editorBefore.focus();
        var isMac = navigator.platform.indexOf('Mac') !== -1;
        var ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true };
        editorBefore.dispatchEvent(new KeyboardEvent('keydown', ev));
        editorBefore.dispatchEvent(new KeyboardEvent('keyup', ev));
        document.dispatchEvent(new KeyboardEvent('keydown', ev));
      } catch (e) {}
    }

    await tryClick();

    // ── Re-verify by polling, escalating strategies ───────────────
    var posted = false;
    var verifyMethod = '';
    for (var poll = 0; poll < 14; poll++) {
      await sleep(1000);
      if (poll === 3) tryRequestSubmit();
      if (poll === 7) tryCtrlEnter();
      if (poll === 11) { try { await qFireClick(submitBtn); } catch (e) {} }

      if (window.location.href !== urlBefore) { posted = true; verifyMethod = 'url_changed'; break; }
      if (!document.contains(editorBefore)) { posted = true; verifyMethod = 'editor_removed'; break; }
      if ((editorBefore.textContent || '').trim().length < 5) { posted = true; verifyMethod = 'editor_cleared'; break; }
      if (!document.contains(submitBtnBefore) || submitBtnBefore.disabled) { posted = true; verifyMethod = 'submit_gone'; break; }
      if ((document.body.innerText || '').indexOf(snippet) !== -1) { posted = true; verifyMethod = 'text_on_page'; break; }
      // Also re-check already-answered markers — Quora sometimes renders a
      // "Your answer" block without any of the above signals firing.
      var mid = alreadyAnsweredByMe(snippet);
      if (mid.ok) { posted = true; verifyMethod = mid.reason; break; }
    }

    // ── Final re-verification (before logging failure) ─────────────
    // Wait an extra beat, then do one last scan. Quora occasionally renders
    // the new answer after a full navigation, after all the above signals
    // have already been checked. Also catches false negatives where the
    // answer DID post but none of our polling signals fired yet.
    if (!posted) {
      await sleep(2500);
      var finalVerify = alreadyAnsweredByMe(snippet);
      if (finalVerify.ok) { posted = true; verifyMethod = 'final_' + finalVerify.reason; }
    }

    try {
      chrome.storage.local.set({ lastQuoraResult: { success: posted, url: window.location.href, verifyMethod: verifyMethod, timestamp: Date.now() } });
    } catch (e) {}

    if (!posted) {
      var tried = Object.keys(attempts).filter(function(k) { return attempts[k]; }).join(',');
      return { success: false, error: 'Quora answer not confirmed after 14s + final verify — tried: ' + tried, postUrl: window.location.href };
    }
    // Success — include answer timing + snippet so the background-side
    // /stats verifier can match this specific answer on the user's stats page.
    return {
      success: true,
      verified: true,
      verifyMethod: verifyMethod,
      postUrl: window.location.href,
      postedAt: Date.now(),
      answerSnippet: text.slice(0, 120).trim(),
    };
  }

  function findAnswerButton() {
    // Quora frequently changes the answer button text and DOM structure.
    // We try many strategies in priority order.

    var ANSWER_LABELS = ['answer', 'write', 'add answer', 'write answer', 'post answer'];

    function isAnswerLike(el) {
      if (!el) return false;
      var t = (el.textContent || '').trim().toLowerCase();
      var aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').toLowerCase();
      // Exact match for known labels
      if (ANSWER_LABELS.indexOf(t) !== -1) return true;
      if (ANSWER_LABELS.indexOf(aria) !== -1) return true;
      // Starts-with match (e.g., "Answer · 12" or "Answer this question")
      if (t.indexOf('answer') === 0 || t.indexOf('write an answer') === 0) return true;
      if (aria.indexOf('answer') === 0) return true;
      return false;
    }

    // Strategy A: q-click-wrapper buttons (Quora's main button class)
    var qClicks = document.querySelectorAll('button.q-click-wrapper');
    for (var i = 0; i < qClicks.length; i++) {
      if (isAnswerLike(qClicks[i])) return qClicks[i];
    }

    // Strategy B: aria-label match on any button
    var ariaBtn = document.querySelector('button[aria-label*="nswer" i], [role="button"][aria-label*="nswer" i]');
    if (ariaBtn && isAnswerLike(ariaBtn)) return ariaBtn;

    // Strategy C: any button whose text starts with "Answer" or "Write"
    var allBtns = document.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < allBtns.length; j++) {
      if (isAnswerLike(allBtns[j])) return allBtns[j];
    }

    // Strategy D: look inside shadow DOM (Quora sometimes uses web components)
    var shadowHosts = document.querySelectorAll('*');
    for (var k = 0; k < shadowHosts.length; k++) {
      var sr = shadowHosts[k].shadowRoot;
      if (!sr) continue;
      var shadowBtns = sr.querySelectorAll('button, [role="button"]');
      for (var l = 0; l < shadowBtns.length; l++) {
        if (isAnswerLike(shadowBtns[l])) return shadowBtns[l];
      }
    }

    // Strategy E: link-styled "Answer" (some Quora pages use <a> not <button>)
    var links = document.querySelectorAll('a[href*="/answer/"], a.q-click-wrapper');
    for (var m = 0; m < links.length; m++) {
      if (isAnswerLike(links[m])) return links[m];
    }

    return null;
  }

  function findButton(texts) {
    return Array.from(document.querySelectorAll('button')).find(function(b) {
      var t = (b.textContent || '').trim();
      return texts.indexOf(t) !== -1 && !b.disabled;
    });
  }

  // ── Upvote (with proper verification) ───────────────────────────
  //
  // Previous bug: returned success:true after click() without verifying.
  // Even when the click fired correctly, the log falsely reported "failed"
  // in some cases (actually the OPPOSITE — it reported success when nothing
  // happened, and the reporting layer interpreted unverified clicks as
  // failures). This rewrite does proper before/after state comparison.

  function isAlreadyUpvotedQuora(btn) {
    if (!btn) return false;
    var aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    var pressed = btn.getAttribute('aria-pressed');
    var t = (btn.textContent || '').trim().toLowerCase();
    if (pressed === 'true') return true;
    // "Upvoted" (past tense) — state already ON
    if (aria.indexOf('upvoted') === 0 || aria === 'upvoted') return true;
    if (aria.indexOf('remove upvote') !== -1 || aria.indexOf('undo upvote') !== -1) return true;
    if (t === 'upvoted' || t.indexOf('upvoted ') === 0) return true;
    return false;
  }

  function findQuoraUpvoteButton() {
    // Strategy A: aria-label Upvote/Upvoted (most stable)
    var byAria = Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]'))
      .filter(function(b) {
        var a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (a === 'upvote' || a === 'upvoted' || a.indexOf('upvote this') === 0 || a.indexOf('remove upvote') === 0 || a.indexOf('undo upvote') === 0);
      });
    if (byAria.length > 0) return byAria[0];

    // Strategy B: button text "Upvote" or "Upvoted" (sometimes with count)
    var byText = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var t = (b.textContent || '').trim();
      return /^(Upvote|Upvoted)(\s*·?\s*\d+)?$/i.test(t);
    });
    if (byText.length > 0) return byText[0];

    // Strategy C: inside shadow DOM (rare on Quora but just in case)
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (!all[i].shadowRoot) continue;
      var sBtns = all[i].shadowRoot.querySelectorAll('button[aria-label*="pvote" i]');
      for (var j = 0; j < sBtns.length; j++) return sBtns[j];
    }

    return null;
  }

  async function upvoteAnswer() {
    // Wait for page to settle — Quora lazy-loads the answer container
    await sleep(2000);

    var btn = findQuoraUpvoteButton();
    // Retry once if not found immediately (lazy-load)
    if (!btn) {
      window.scrollTo({ top: 300, behavior: 'smooth' });
      await sleep(1500);
      btn = findQuoraUpvoteButton();
    }
    if (!btn) return { success: false, error: 'Upvote button not found on Quora' };

    // Already upvoted? Don't click again (would undo)
    if (isAlreadyUpvotedQuora(btn)) {
      return { success: true, alreadyUpvoted: true, verified: true };
    }

    // Capture BEFORE state for verification
    var beforeAria = (btn.getAttribute('aria-label') || '').trim();
    var beforeText = (btn.textContent || '').trim();
    var beforePressed = btn.getAttribute('aria-pressed');

    // Click with real mouse events (Quora's React handlers ignore plain .click() sometimes)
    try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
    await sleep(300);
    try {
      var rect = btn.getBoundingClientRect();
      ['mousedown', 'mouseup', 'click'].forEach(function(type) {
        btn.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      });
    } catch (e) {
      try { btn.click(); } catch (e2) {}
    }

    // Poll for state change (up to 6s)
    for (var p = 0; p < 6; p++) {
      await sleep(1000);
      // Re-locate button (Quora may re-render on upvote)
      var current = document.contains(btn) ? btn : findQuoraUpvoteButton();
      if (!current) continue;
      if (isAlreadyUpvotedQuora(current)) {
        return { success: true, verified: true, verifyMethod: 'state_flipped', postUrl: window.location.href };
      }
      var curAria = (current.getAttribute('aria-label') || '').trim();
      var curText = (current.textContent || '').trim();
      var curPressed = current.getAttribute('aria-pressed');
      if (curAria !== beforeAria || curText !== beforeText || curPressed !== beforePressed) {
        return { success: true, verified: true, verifyMethod: 'label_changed', postUrl: window.location.href };
      }
    }

    return { success: false, error: 'Upvote clicked but Quora state did not change after 6s', postUrl: window.location.href };
  }

  // ── Scraping ────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);
    var posts = [];
    var seen = {};
    var isAnswerPage = window.location.pathname === '/answer' || window.location.pathname === '/answer/';

    // On /answer page, scroll to load more questions
    if (isAnswerPage) {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await sleep(1500);
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await sleep(1500);
    }

    document.querySelectorAll('a[href]').forEach(function(a) {
      try {
        var href = a.href;
        if (!href || href.indexOf('quora.com/') === -1) return;
        if (href.indexOf('/profile/') !== -1 || href.indexOf('/topic/') !== -1 || href.indexOf('/search') !== -1) return;
        if (href.indexOf('/answer') !== -1 && href.indexOf('/answer/') === -1) return; // skip /answer page link itself
        var cleanUrl = href.split('?')[0].split('#')[0];
        if (seen[cleanUrl]) return;
        var path = new URL(cleanUrl).pathname;
        if (!path || path === '/' || path.length < 5) return;
        // Accept question URLs: /Question-Title or /unanswered/Question-Title
        if (!/\/[A-Z]/.test(path) && path.indexOf('/unanswered/') === -1) return;
        var text = (a.textContent || '').trim().split('\n')[0].trim();
        if (text.length < 10 || text.length > 500) return;
        seen[cleanUrl] = true;
        posts.push({ url: cleanUrl, content: text, author: 'Unknown', platform: 'quora' });
      } catch (e) {}
    });

    return { posts: posts.slice(0, 20) };
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
})();
