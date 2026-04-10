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
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Quora timed out (90s)' }); }, 90000);
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

  async function postAnswer(text) {
    await sleep(1500);

    // Check if we're on a Cloudflare challenge or blocked page
    if (document.title.toLowerCase().includes('just a moment') || document.title.toLowerCase().includes('attention required')) {
      return { success: false, error: 'Quora blocked by Cloudflare challenge' };
    }

    // Find Answer button with retries (page may still be loading)
    var answerBtn = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      answerBtn = findAnswerButton();
      if (answerBtn) break;
      await sleep(2000);
    }
    if (!answerBtn) {
      var btnCount = document.querySelectorAll('button').length;
      var qClickCount = document.querySelectorAll('button.q-click-wrapper').length;
      return { success: false, error: 'Answer button not found (' + btnCount + ' buttons, ' + qClickCount + ' q-click on page)' };
    }

    answerBtn.click();
    await sleep(1500);

    // Find editor — Quora uses several editor variants
    function findQuoraEditor() {
      return document.querySelector('div.doc[contenteditable="true"]')
        || document.querySelector('[contenteditable="true"][data-placeholder]')
        || document.querySelector('.qu-contentEditable[contenteditable="true"]')
        || document.querySelector('[role="textbox"][contenteditable="true"]')
        || document.querySelector('[contenteditable="true"][class*="editor"]')
        || document.querySelector('[contenteditable="true"]');
    }
    var editor = findQuoraEditor();
    if (!editor) { await sleep(1500); editor = findQuoraEditor(); }
    if (!editor) { answerBtn.click(); await sleep(2000); editor = findQuoraEditor(); }
    if (!editor) return { success: false, error: 'Editor not found after clicking Answer' };

    // Paste text
    editor.click();
    editor.focus();
    await sleep(300);
    editor.classList.remove('empty');
    var dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(800);

    if ((editor.textContent || '').trim().length < 5) {
      // Direct DOM fallback
      editor.innerHTML = '<p>' + text + '</p>';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(500);
    }

    if ((editor.textContent || '').trim().length < 5) return { success: false, error: 'Could not type in editor' };

    // Find and click Post button
    await sleep(500);
    var submitBtn = findButton(['Post', 'Submit', 'Add Answer']);
    if (!submitBtn) { await sleep(1000); submitBtn = findButton(['Post', 'Submit', 'Add Answer']); }
    if (!submitBtn) return { success: false, error: 'Post button not found' };

    // Snapshot state BEFORE clicking Post — used by polling verifier below
    var urlBefore = window.location.href;
    var editorBefore = editor;            // reference (not text) — to detect removal from DOM
    var submitBtnBefore = submitBtn;      // same — Quora often removes/disables this on success
    var snippet = text.slice(0, 40).trim();

    submitBtn.click();

    // Poll for up to 12 seconds for ANY strong success signal.
    // Quora typically posts within 2-6s but can lag during rate-limited periods,
    // and often navigates away from the question page entirely after submit.
    var posted = false;
    var verifyMethod = '';
    for (var poll = 0; poll < 12; poll++) {
      await sleep(1000);

      // Signal 1: URL changed (Quora redirected after submit — strongest signal)
      if (window.location.href !== urlBefore) {
        posted = true; verifyMethod = 'url_changed'; break;
      }

      // Signal 2: editor element is gone from the DOM (modal closed)
      if (!document.contains(editorBefore)) {
        posted = true; verifyMethod = 'editor_removed'; break;
      }

      // Signal 3: editor is empty (submit cleared it)
      if ((editorBefore.textContent || '').trim().length < 5) {
        posted = true; verifyMethod = 'editor_cleared'; break;
      }

      // Signal 4: submit button is gone or now disabled
      if (!document.contains(submitBtnBefore) || submitBtnBefore.disabled) {
        posted = true; verifyMethod = 'submit_gone'; break;
      }

      // Signal 5: our answer text appeared on the page (rendered comment)
      var pageText = document.body.innerText || '';
      if (pageText.includes(snippet)) {
        posted = true; verifyMethod = 'text_on_page'; break;
      }
    }

    // Save result to storage IMMEDIATELY — before service worker can die
    try {
      chrome.storage.local.set({ lastQuoraResult: { success: posted, url: window.location.href, verifyMethod: verifyMethod, timestamp: Date.now() } });
    } catch (e) {}

    if (!posted) {
      return { success: false, error: 'Answer submitted but not confirmed on page after 12s polling' };
    }
    return { success: true, verified: true, verifyMethod: verifyMethod };
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

  // ── Upvote (fast) ───────────────────────────────────────────────

  async function upvoteAnswer() {
    await sleep(500);
    var btn = document.querySelector('button[aria-label*="Upvote"]')
      || Array.from(document.querySelectorAll('button')).find(function(b) { return (b.textContent || '').trim().indexOf('Upvote') === 0; });
    if (!btn) return { success: false, error: 'Upvote not found' };
    if (btn.getAttribute('aria-pressed') === 'true' || (btn.textContent || '').trim().indexOf('Upvoted') === 0) return { success: true, alreadyUpvoted: true };
    btn.click();
    await sleep(1000);
    return { success: true };
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
