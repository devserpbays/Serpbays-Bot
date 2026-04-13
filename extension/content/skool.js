/**
 * GetMention — Skool Content Script
 * Exact selectors from inspect:
 *   Editor: div.tiptap.ProseMirror.skool-editor (contenteditable)
 *   Like: button with text "Like"
 *   Reply: button with text "Reply" (opens editor)
 *   Submit: button with text "Comment" (submits)
 *   Typing: ClipboardEvent paste (ProseMirror accepts it)
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'JOIN_COMMUNITY') {
      joinCommunity().then(sendResponse).catch(function() { sendResponse({ ok: false }); });
      return true;
    }
    if (msg.platform && msg.platform !== 'skool') return;

    if (msg.type === 'EXECUTE_TASK') {
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Skool timed out (100s)' }); }, 100000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) { clearTimeout(timeout); sendResponse({ success: false, error: err.message || 'Skool error' }); });
      return true;
    }

    if (msg.type === 'SCRAPE_POSTS') {
      scrapePosts(msg.keywords || []).then(sendResponse).catch(function(err) {
        sendResponse({ posts: [], error: err.message });
      });
      return true;
    }
  });

  async function handleTask({ action, text }) {
    switch (action) {
      case 'comment': return postComment(text);
      case 'like': return likePost();
      case 'upvote': return likePost();
      default: return { success: false, error: 'Unknown action: ' + action };
    }
  }

  // ── Post Comment ────────────────────────────────────────────────

  async function postComment(text) {
    await sleep(1000);

    // Step 1: Click "Reply" button to open editor.
    // No visibility checks (offsetHeight/offsetParent) — those return 0 in
    // background tabs and would always reject the button.
    var replyBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
      return (b.textContent || '').trim() === 'Reply';
    });
    if (replyBtn) {
      replyBtn.click();
      await sleep(1500);
    }

    // Step 2: Find the ProseMirror editor (Skool uses TipTap = ProseMirror)
    var editor = document.querySelector('.tiptap.ProseMirror.skool-editor');
    if (!editor) { await sleep(1500); editor = document.querySelector('.tiptap.ProseMirror.skool-editor'); }
    if (!editor) {
      editor = document.querySelector('.ProseMirror[contenteditable="true"]')
        || document.querySelector('div[contenteditable="true"][role="textbox"]')
        || document.querySelector('[contenteditable="true"]');
    }
    if (!editor) return { success: false, error: 'Skool editor not found' };

    // Step 3: Focus the editor and place caret at end
    try { editor.scrollIntoView({ block: 'center' }); } catch (e) {}
    await sleep(200);

    function fireMouse(el, type) {
      try {
        var rect = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          button: 0,
        }));
      } catch (e) {}
    }
    fireMouse(editor, 'mousedown');
    fireMouse(editor, 'mouseup');
    fireMouse(editor, 'click');
    try { editor.focus(); } catch (e) {}
    await sleep(300);

    try {
      var range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
    await sleep(150);

    // Step 4: Insert text with 4 fallback methods (same cascade as Reddit fix).
    // ProseMirror is a Lexical-like rich editor — execCommand('insertText')
    // is the most reliable path.
    var inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch (e) {}
    await sleep(700);

    var editorText = (editor.textContent || '').trim();

    // Fallback 1: beforeinput InputEvent
    if (editorText.length < 5) {
      try {
        editor.focus();
        editor.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText', data: text, bubbles: true, cancelable: true,
        }));
      } catch (e) {}
      await sleep(700);
      editorText = (editor.textContent || '').trim();
    }

    // Fallback 2: ClipboardEvent paste (legacy ProseMirror builds)
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

    // Fallback 3: direct innerHTML
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
      return { success: false, error: 'Skool paste failed — all 4 methods produced empty editor (inserted=' + inserted + ')' };
    }

    // Step 5: Click submit button — Skool labels vary ("Comment", "Post", "Reply", "Send")
    await sleep(500);

    function findSubmit() {
      // CRITICAL: do NOT include 'reply' here — that's the OPEN button label.
      // Skool's actual submit button is "Comment" (or sometimes "Post").
      var SUBMIT_LABELS = ['comment', 'post', 'send', 'submit'];

      // Exclude the original Reply button we clicked in Step 1, so we never
      // re-click it and falsely report success.
      function isExcluded(b) {
        if (replyBtn && b === replyBtn) return true;
        var t = (b.textContent || '').trim().toLowerCase();
        if (t === 'reply' || t === 'cancel' || t === 'close') return true;
        return false;
      }

      // Strategy A: scope to editor's nearest form/container
      var scope = editor.closest('form')
        || editor.closest('[class*="composer" i]')
        || editor.closest('[class*="comment" i]')
        || editor.closest('[class*="reply" i]')
        || editor.parentElement?.parentElement?.parentElement
        || document;

      var candidates = Array.from(scope.querySelectorAll('button, [role="button"]'));
      var hit = candidates.find(function(b) {
        if (b.disabled || isExcluded(b)) return false;
        var t = (b.textContent || '').trim().toLowerCase();
        var aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return SUBMIT_LABELS.indexOf(t) !== -1 || SUBMIT_LABELS.indexOf(aria) !== -1;
      });
      if (hit) return hit;

      // Strategy B: button[type=submit] inside scope (still excluded check)
      var typedSubmits = Array.from(scope.querySelectorAll ? scope.querySelectorAll('button[type="submit"]:not([disabled])') : []);
      hit = typedSubmits.find(function(b) { return !isExcluded(b); });
      if (hit) return hit;

      // Strategy C: global fallback — any enabled button with matching label
      return Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) {
        if (b.disabled || isExcluded(b)) return false;
        var t = (b.textContent || '').trim().toLowerCase();
        var aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return SUBMIT_LABELS.indexOf(t) !== -1 || SUBMIT_LABELS.indexOf(aria) !== -1;
      });
    }

    var submitBtn = findSubmit();
    if (!submitBtn) { await sleep(1500); submitBtn = findSubmit(); }
    if (!submitBtn) {
      // Last resort: press Ctrl+Enter on the editor (Skool/TipTap default submit shortcut)
      try {
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          ctrlKey: true, bubbles: true, cancelable: true,
        }));
      } catch (e) {}
      await sleep(1500);
      // Treat the Ctrl+Enter as our "click" — let polling decide success
      submitBtn = editor;
    }

    // Build a robust snippet for text-on-page detection: pick a longer
    // unique chunk that won't accidentally match unrelated UI text.
    var cleanText = text.replace(/\s+/g, ' ').trim();
    var snippet = cleanText.slice(0, 60);
    // Count baseline occurrences of the snippet on the page BEFORE we click —
    // editor.textContent already contains our pasted text, so we need to know
    // how many copies exist now and only consider it posted if a NEW copy appears.
    function countSnippet() {
      var bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
      if (snippet.length < 10) return 0;
      var n = 0; var i = 0;
      while ((i = bodyText.indexOf(snippet, i)) !== -1) { n++; i += snippet.length; }
      return n;
    }
    var baselineCount = countSnippet();

    submitBtn.click();

    // Step 6: Polling verification (12s) — REQUIRE the snippet to appear in
    // the page MORE times than baseline. This prevents false positives from
    // the editor closing/being removed without the comment actually posting.
    var posted = false;
    var verifyMethod = '';
    for (var poll = 0; poll < 12; poll++) {
      await sleep(1000);
      var currentCount = countSnippet();
      if (currentCount > baselineCount) {
        posted = true;
        verifyMethod = 'snippet_count_increased';
        break;
      }
    }

    if (!posted) {
      // Tell user exactly what we clicked so they can spot wrong-button bugs
      var btnDesc = (submitBtn === editor) ? 'editor (Ctrl+Enter)' :
        ((submitBtn.textContent || '').trim().slice(0, 30) || submitBtn.tagName);
      return { success: false, error: 'Skool comment NOT confirmed on page (clicked: "' + btnDesc + '")' };
    }
    return { success: true, verified: true, verifyMethod: verifyMethod };
  }

  // ── Like Post ───────────────────────────────────────────────────
  //
  // Skool's like button on a community post is the heart icon under the post
  // body. Skool changes the rendering frequently — sometimes it's an icon-only
  // button, sometimes "Like", sometimes "Like · 12". After clicking it flips
  // to "Liked" / "Liked · 13" or has aria-pressed=true.
  //
  // Strategy:
  //   1. Wait for the post container to mount (Skool is React/Lexical heavy)
  //   2. Try multiple selectors in priority order
  //   3. Detect "already liked" state and return early
  //   4. Click + verify the button state actually changed

  function isLikedState(btn) {
    if (!btn) return false;
    var aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    var pressed = btn.getAttribute('aria-pressed');
    var t = (btn.textContent || '').trim().toLowerCase();
    if (pressed === 'true') return true;
    if (aria.indexOf('unlike') !== -1) return true;
    if (aria.indexOf('liked') === 0 || aria === 'liked') return true;
    if (t === 'liked' || t.indexOf('liked ') === 0 || t.indexOf('liked·') === 0 || t.indexOf('liked ·') === 0) return true;
    if (btn.classList.contains('liked') || btn.classList.contains('active') || btn.classList.contains('is-liked')) return true;
    return false;
  }

  function findSkoolLikeButton() {
    // Strategy A: aria-label exact / starts with "Like" or "Unlike"
    var byAria = Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]'))
      .filter(function(b) {
        var a = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return a === 'like' || a === 'unlike' || a.indexOf('like this') === 0 || a.indexOf('unlike this') === 0;
      });
    if (byAria.length > 0) return byAria[0];

    // Strategy B: button whose text is exactly "Like" / "Liked" / "Like · N" / "Liked · N"
    var byText = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var t = (b.textContent || '').trim();
      // Accept: Like, Liked, Like · 12, Liked · 12, Like 12, Liked 12 (spaces or middot)
      return /^(Like|Liked)(\s*·?\s*\d+)?$/i.test(t);
    });
    if (byText.length > 0) return byText[0];

    // Strategy C: button containing an SVG that looks like a heart (path with heart-y d= attr).
    // Skool's heart icon path starts with M/m and contains the word "heart" in nearby data-* attrs.
    var byHeart = Array.from(document.querySelectorAll('button svg, [role="button"] svg'))
      .filter(function(svg) {
        var html = svg.outerHTML.toLowerCase();
        return html.indexOf('heart') !== -1
          || svg.querySelector('[d^="M12 21"], [d^="m12 21"], [d*="C5.4 7.5"], [d*="c5.4 7.5"]'); // common heart-path prefixes
      })
      .map(function(svg) { return svg.closest('button, [role="button"]'); })
      .filter(Boolean);
    if (byHeart.length > 0) return byHeart[0];

    // Strategy D: in Skool's feed, the like button is often the FIRST button
    // inside an action bar that lives directly under the post body. Find any
    // div whose class name contains "action" / "footer" and grab its first button.
    var actionBars = document.querySelectorAll(
      '[class*="action" i] button, [class*="footer" i] button, [class*="reactions" i] button'
    );
    for (var i = 0; i < actionBars.length; i++) {
      var b = actionBars[i];
      if (b.querySelector && b.querySelector('svg')) return b;
    }

    return null;
  }

  async function likePost() {
    // Wait longer than the comment flow — like buttons are usually below the
    // fold and Skool lazy-mounts the action bar after the post body renders.
    await sleep(1500);

    // Make sure the post is in view so React renders the action bar
    try {
      var article = document.querySelector('article, [class*="post" i] [class*="body" i], [class*="post-content" i]');
      if (article && article.scrollIntoView) article.scrollIntoView({ block: 'center' });
    } catch (e) {}
    await sleep(800);

    var likeBtn = findSkoolLikeButton();
    if (!likeBtn) {
      // Try once more after another scroll — sometimes the action bar mounts late
      window.scrollBy({ top: 200, behavior: 'instant' });
      await sleep(1200);
      likeBtn = findSkoolLikeButton();
    }
    if (!likeBtn) return { success: false, error: 'Skool like button not found (heart icon under post)' };

    // Already liked? Don't click again (would unlike)
    if (isLikedState(likeBtn)) {
      return { success: true, alreadyLiked: true, verified: true };
    }

    // Capture pre-click state for verification
    var beforeText = (likeBtn.textContent || '').trim();
    var beforeAria = (likeBtn.getAttribute('aria-label') || '').trim();

    // Click — also dispatch mousedown/mouseup since some React libs need them
    try { likeBtn.scrollIntoView({ block: 'center' }); } catch (e) {}
    await sleep(200);
    try {
      var rect = likeBtn.getBoundingClientRect();
      ['mousedown', 'mouseup', 'click'].forEach(function(type) {
        likeBtn.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          button: 0,
        }));
      });
    } catch (e) {
      try { likeBtn.click(); } catch (e2) {}
    }

    // Verify (poll 6s) — text/aria/state should flip
    for (var poll = 0; poll < 6; poll++) {
      await sleep(1000);
      // Re-locate (DOM might have re-rendered)
      var current = document.contains(likeBtn) ? likeBtn : findSkoolLikeButton();
      if (!current) continue;
      if (isLikedState(current)) {
        return { success: true, verified: true, verifyMethod: 'state_flipped' };
      }
      var afterText = (current.textContent || '').trim();
      var afterAria = (current.getAttribute('aria-label') || '').trim();
      if (afterText !== beforeText || afterAria !== beforeAria) {
        return { success: true, verified: true, verifyMethod: 'label_changed' };
      }
    }

    return { success: false, error: 'Skool like clicked but state did not change after 6s' };
  }

  // ── Join Community ──────────────────────────────────────────────

  async function joinCommunity() {
    await sleep(500);

    var alreadyJoined = Array.from(document.querySelectorAll('button')).find(function(b) {
      var t = b.textContent.trim().toLowerCase();
      return t === 'joined' || t === 'member' || t === 'leave';
    });
    if (alreadyJoined) return { ok: true, alreadyJoined: true };

    var joinBtn = Array.from(document.querySelectorAll('button, a')).find(function(b) {
      var t = b.textContent.trim().toLowerCase();
      return t === 'join' || t === 'join community' || t === 'join for free' || t === 'join group';
    });

    if (joinBtn) {
      joinBtn.click();
      await sleep(2000);
      return { ok: true, joined: true };
    }

    return { ok: false };
  }

  // ── Scraping ────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);

    // Trigger lazy-load so feed items mount
    for (var s = 0; s < 4; s++) {
      window.scrollBy({ top: 800 + Math.random() * 400, behavior: 'instant' });
      await sleep(700);
    }

    var allPosts = [];        // every post we find (no keyword filter)
    var matchedPosts = [];    // subset that matched keywords
    var seen = {};
    var stats = { links: 0, skipped: 0, shortText: 0, kept: 0, kwMatched: 0 };

    // Word-level keyword matching (more flexible than substring)
    var keywordWords = (keywords || [])
      .flatMap(function(kw) { return kw.toLowerCase().split(/\s+/); })
      .filter(function(w) { return w.length >= 3; });

    function matchesKeywords(text) {
      if (keywordWords.length === 0) return true;
      var lower = text.toLowerCase();
      return keywordWords.some(function(w) { return lower.indexOf(w) !== -1; });
    }

    // Strategy: find every link that points to a Skool post, then walk
    // up to its containing card and extract title + body together.
    var allLinks = document.querySelectorAll('a[href]');
    stats.links = allLinks.length;

    allLinks.forEach(function(a) {
      try {
        var href = a.href || '';
        if (!href || href.indexOf('skool.com/') === -1) return;
        if (
          href.indexOf('/classroom') !== -1 ||
          href.indexOf('/about') !== -1 ||
          href.indexOf('/calendar') !== -1 ||
          href.indexOf('/members') !== -1 ||
          href.indexOf('/leaderboard') !== -1 ||
          href.indexOf('/settings') !== -1 ||
          href.match(/skool\.com\/[^/]+\/?$/)   // community root
        ) { stats.skipped++; return; }

        var cleanUrl = href.split('?')[0].split('#')[0];
        if (seen[cleanUrl]) return;

        // Walk up to find the post card container
        var card = a.closest('[class*="card" i]')
          || a.closest('[class*="post" i]')
          || a.closest('[class*="feed" i]')
          || a.closest('[role="article"]')
          || a.closest('div.MuiPaper-root')
          || a.parentElement?.parentElement?.parentElement
          || a;

        // Pull text from the card — title + body merged
        var cardText = (card.textContent || '').trim().replace(/\s+/g, ' ');
        if (cardText.length < 20) {
          // Fallback: use the link text
          cardText = (a.textContent || '').trim().replace(/\s+/g, ' ');
        }
        if (cardText.length < 15 || cardText.length > 4000) { stats.shortText++; return; }

        // Author guess: first link inside the card with a username-looking text
        var authorEl = card.querySelector ? card.querySelector('a[href*="/@"], strong, h3, h4') : null;
        var author = authorEl ? (authorEl.textContent || '').trim().split('\n')[0].slice(0, 60) : 'Unknown';

        seen[cleanUrl] = true;
        stats.kept++;

        var post = {
          url: cleanUrl,
          content: cardText.slice(0, 2000),
          author: author,
          platform: 'skool'
        };
        allPosts.push(post);
        if (matchesKeywords(cardText)) {
          stats.kwMatched++;
          matchedPosts.push(post);
        }
      } catch (e) {}
    });

    console.log('[GM Skool] Scrape stats:', JSON.stringify(stats));

    // Return matched posts when we have any. Otherwise fall back to all posts
    // (without keyword filter) so the server-side AI scorer can decide
    // relevance — better than returning zero and looping forever.
    var returnList = matchedPosts.length > 0 ? matchedPosts : allPosts;
    return { posts: returnList.slice(0, 15), stats: stats };
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
})();
