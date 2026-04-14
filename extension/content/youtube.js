/**
 * GetMention — YouTube Content Script
 * Handles scraping videos and posting comments.
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 1500, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.platform && msg.platform !== 'youtube') return;

    if (msg.type === 'EXECUTE_TASK') {
      // Extended timeout: ad handling (≤9s) + human watch (40-65s) +
      // comment section mount (≤8s) + read pause (2-5s) + editor find +
      // humanType + multi-strategy submit + verify polling (12s) =
      // ~115s typical, ~140s worst case. 220s gives ample headroom.
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'YouTube content script timed out (220s)' }); }, 220000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) {
        clearTimeout(timeout);
        sendResponse({ success: false, error: (err && err.message) || String(err) || 'YouTube error' });
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
      case 'comment': return postComment(text);
      case 'like': return likeVideo();
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // ── Ad detection & skip ─────────────────────────────────────────────────
  //
  // YouTube pre-rolls come in several forms:
  //   1. Skippable ads: a "Skip Ad" / "Skip Ads" button appears after 5s
  //   2. Non-skippable ads: no button, must wait 15-30s for it to finish
  //   3. Bumper ads: 6s, non-skippable, auto-ends
  //   4. Overlay ads: banner on top of video — can be closed via X
  //
  // We handle all of them: click skip if available, otherwise wait for
  // the ad to finish, then verify the real video is playing.

  async function handleAds() {
    console.log('[GM YouTube] Checking for ads...');

    // Cap at 3 attempts (was 6) — most ads are either skippable within 5s
    // or a 6s bumper. 6 attempts × 3s wait = 18s of potentially wasted budget.
    for (var adAttempt = 0; adAttempt < 3; adAttempt++) {
      // Check if an ad is currently playing
      var adPlaying = !!document.querySelector('.ad-showing')
        || !!document.querySelector('.ytp-ad-player-overlay')
        || !!document.querySelector('[class*="ad-interrupting"]')
        || !!document.querySelector('.ytp-ad-text');

      if (!adPlaying) {
        console.log('[GM YouTube] No ad detected (attempt ' + adAttempt + ')');
        break;
      }

      console.log('[GM YouTube] Ad detected — looking for skip button...');

      // Try to find and click "Skip Ad" / "Skip Ads" button
      var skipBtn = document.querySelector('.ytp-ad-skip-button')
        || document.querySelector('.ytp-ad-skip-button-modern')
        || document.querySelector('.ytp-skip-ad-button')
        || document.querySelector('[id*="skip-button"]')
        || document.querySelector('button.ytp-ad-skip-button-text');

      // Also search by text content — YouTube changes class names frequently
      if (!skipBtn) {
        skipBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) {
          var t = (b.textContent || '').trim().toLowerCase();
          return t.includes('skip ad') || t.includes('skip ads') || t === 'skip';
        });
      }

      if (skipBtn) {
        console.log('[GM YouTube] Clicking skip ad button');
        try { skipBtn.click(); } catch (e) {}
        await sleep(1500);
        continue; // Check again — sometimes there's a second ad
      }

      // Close overlay ads (the banner "X" button)
      var overlayClose = document.querySelector('.ytp-ad-overlay-close-button')
        || document.querySelector('[class*="ad-overlay"] [class*="close"]');
      if (overlayClose) {
        console.log('[GM YouTube] Closing overlay ad');
        try { overlayClose.click(); } catch (e) {}
        await sleep(500);
      }

      // No skip button — ad is non-skippable. Wait 3s and check again.
      console.log('[GM YouTube] Non-skippable ad — waiting 3s...');
      await sleep(3000);
    }

    // Final check: make sure the real video player is visible
    var player = document.querySelector('#movie_player, .html5-video-player');
    if (player && player.classList.contains('ad-showing')) {
      console.log('[GM YouTube] Ad still showing after all attempts — proceeding anyway');
    }
  }

  // ── Watch the video (human-like viewing) ───────────────────────────────
  //
  // To look like a real viewer:
  //   1. Let the video play for 60–120 seconds (random)
  //   2. Scroll down slightly mid-watch (like reading the description)
  //   3. Move the mouse occasionally (prevent "idle" detection)
  //
  // This makes the comment look authentic — a user who watched then commented,
  // not a bot that instantly dropped a comment at t=0.

  async function watchVideoLikeHuman() {
    console.log('[GM YouTube] Watching video like a human...');

    // Make sure the video is playing (sometimes it auto-pauses)
    var video = document.querySelector('video');
    if (video && video.paused) {
      try {
        var playBtn = document.querySelector('.ytp-play-button, [aria-label="Play"]');
        if (playBtn) playBtn.click();
        else video.play().catch(function() {});
      } catch (e) {}
      await sleep(1000);
    }

    // Watch duration: 40–65 seconds — long enough to look genuinely human
    // without slipping past the extended 240s task budget. Most real
    // commenters watch 30-60s of a video before dropping a reply.
    var watchSeconds = 40 + Math.floor(Math.random() * 25);
    console.log('[GM YouTube] Will watch for ' + watchSeconds + 's');

    // Break the watch time into intervals with natural micro-actions
    var elapsed = 0;
    while (elapsed < watchSeconds) {
      var chunk = 10 + Math.floor(Math.random() * 15); // 10-25s chunks
      chunk = Math.min(chunk, watchSeconds - elapsed);
      await sleep(chunk * 1000);
      elapsed += chunk;

      // Random micro-actions during watching (like a real viewer)
      var action = Math.random();
      if (action < 0.3) {
        // Scroll down a bit (reading description)
        window.scrollBy({ top: 80 + Math.random() * 120, behavior: 'smooth' });
      } else if (action < 0.5) {
        // Scroll back up (re-watching)
        window.scrollBy({ top: -(40 + Math.random() * 60), behavior: 'smooth' });
      } else if (action < 0.6) {
        // Hover over the video (triggers YouTube UI)
        try {
          var playerEl = document.querySelector('#movie_player');
          if (playerEl) {
            playerEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400 + Math.random() * 200, clientY: 300 }));
          }
        } catch (e) {}
      }
      // Else: just keep watching (most natural)
    }

    console.log('[GM YouTube] Done watching (' + watchSeconds + 's)');
  }

  function commentsAreDisabled() {
    // YouTube renders a <ytd-message-renderer> in #comments with text like
    // "Comments are turned off." when the uploader disables them.
    var msgEl = document.querySelector('ytd-comments ytd-message-renderer, #comments ytd-message-renderer');
    if (msgEl) {
      var t = (msgEl.textContent || '').toLowerCase();
      if (t.indexOf('turned off') !== -1 || t.indexOf('disabled') !== -1) return true;
    }
    // Membership-only / age-gated videos also suppress the commentbox.
    var pageText = (document.body.innerText || '').toLowerCase();
    if (pageText.indexOf('comments are turned off') !== -1) return true;
    return false;
  }

  async function alreadyCommentedWithText(text) {
    // Scroll once to force the comments section to mount, then look for an
    // existing comment that matches ours (first 60 chars is plenty unique).
    var snippet = (text || '').slice(0, 60).trim();
    if (snippet.length < 15) return false;
    // Give the comments renderer time to load a few top comments.
    for (var i = 0; i < 3; i++) {
      var commentEls = document.querySelectorAll('ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text, #content-text');
      for (var j = 0; j < commentEls.length; j++) {
        var ct = (commentEls[j].textContent || '').trim();
        if (ct && ct.indexOf(snippet) !== -1) return true;
      }
      await sleep(1500);
    }
    return false;
  }

  async function postComment(text) {
    // ── Step -1: Random human-like skip ─────────────────────────────
    // Real viewers don't comment on every video they watch. ~8% of the
    // time, politely skip with a clear reason. Makes engagement pattern
    // statistically indistinguishable from a human who watches lots
    // of videos but only replies to some.
    if (Math.random() < 0.08) {
      return {
        success: false, skipped: true, reason: 'human_skip',
        error: 'Skipped — human-like random skip (watched but chose not to comment this time)',
        postUrl: window.location.href,
      };
    }

    // ── Step 0: Handle ads + watch video ──────────────────────────────
    // This makes the comment look like it came from a real viewer who
    // watched the video first, not a bot that instantly commented.
    await handleAds();
    await watchVideoLikeHuman();

    // ── Step 1: Mount the comments section via aggressive scroll ─────
    // Comment composer is LAZILY mounted by YouTube when the user scrolls
    // past the video into the #comments section. If we skip this and go
    // straight to findYTPlaceholder(), the composer doesn't exist yet
    // and we get "placeholder not found". Force the mount with repeated
    // small scrolls so YouTube's IntersectionObserver fires.
    console.log('[GM YouTube] Step 1: Forcing comments section to mount');
    for (var s = 0; s < 6; s++) {
      window.scrollBy({ top: 400 + Math.random() * 200, behavior: 'smooth' });
      await sleep(900 + Math.random() * 600);
      // Stop once #comments or ytd-comments has actually mounted
      if (document.querySelector('ytd-comments, #comments, ytd-commentbox, ytd-comment-simplebox-renderer')) break;
    }
    // Give lazy-mount 1 more beat to render composer
    await sleep(1500 + Math.random() * 1500);

    // ── Step 1a: Skip if comments are turned off ─────────────────────
    if (commentsAreDisabled()) {
      return { success: false, skipped: true, reason: 'comments_disabled', error: 'Skipped — comments are turned off on this video', postUrl: window.location.href };
    }

    // ── Step 1b: Skip if we already commented on this video ──────────
    if (await alreadyCommentedWithText(text)) {
      return { success: false, skipped: true, reason: 'already_commented', error: 'Skipped — identical comment already exists on this video', postUrl: window.location.href };
    }

    // Simulate a human reading a couple of existing comments before typing
    await sleep(2000 + Math.random() * 3000);

    // Step 2: Find the placeholder that opens the composer. Modern YouTube
    // uses <ytd-commentbox> with a #placeholder-area OR #simplebox-placeholder
    // — but has also shipped variants with just a "Add a comment..." <yt-formatted-string>
    // or a plain <div role="button">. Scan widely.
    function findYTPlaceholder() {
      return document.querySelector('#placeholder-area')
        || document.querySelector('#simplebox-placeholder')
        || document.querySelector('ytd-commentbox #placeholder-area')
        || document.querySelector('ytd-commentbox #placeholder')
        || document.querySelector('ytd-comment-simplebox-renderer #placeholder-area')
        || Array.from(document.querySelectorAll('ytd-commentbox [role="button"], ytd-comment-simplebox-renderer [role="button"], ytd-commentbox yt-formatted-string'))
             .find(function(el) {
               var t = (el.textContent || '').trim().toLowerCase();
               return t.indexOf('add a comment') !== -1 || t.indexOf('add a public comment') !== -1;
             });
    }

    console.log('[GM YouTube] Step 2: Finding placeholder');
    let placeholder = null;
    for (var i = 0; i < 5; i++) {
      placeholder = findYTPlaceholder();
      if (placeholder && placeholder.offsetParent !== null) break;
      placeholder = null;
      window.scrollBy({ top: 300, behavior: 'smooth' });
      await sleep(1800);
    }
    if (!placeholder) {
      if (commentsAreDisabled()) {
        return { success: false, skipped: true, reason: 'comments_disabled', error: 'Skipped — comments are turned off on this video', postUrl: window.location.href };
      }
      // ── DOM forensic snapshot — tells us exactly what's in the DOM ──
      // Next time this fails, the log includes the actual structure so we
      // can match it without guessing.
      var snap = {
        comments_elem: !!document.querySelector('ytd-comments, #comments'),
        commentbox: !!document.querySelector('ytd-commentbox'),
        simplebox: !!document.querySelector('ytd-comment-simplebox-renderer'),
        placeholder_area: !!document.getElementById('placeholder-area'),
        simplebox_placeholder: !!document.getElementById('simplebox-placeholder'),
        contenteditable_count: document.querySelectorAll('[contenteditable="true"]').length,
        role_textbox_count: document.querySelectorAll('[role="textbox"]').length,
        comments_disabled_text_on_page: (document.body.innerText || '').toLowerCase().includes('comments are turned off'),
        scrollY: Math.round(window.scrollY),
        videoHeight: document.querySelector('video') ? document.querySelector('video').offsetHeight : 0,
      };
      // Also sample the first 3 ytd-* tag names visible — helps identify
      // new composer element names we should add to our selectors.
      var ytdTags = Array.from(document.querySelectorAll('*'))
        .filter(function(el) { return el.tagName && el.tagName.toLowerCase().startsWith('ytd-comment'); })
        .slice(0, 5)
        .map(function(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''); });
      snap.ytd_comment_tags = ytdTags.join(',') || 'NONE';
      return {
        success: false,
        error: 'Comment placeholder not found — DOM snapshot: ' + JSON.stringify(snap),
        postUrl: window.location.href,
      };
    }

    console.log('[GM YouTube] Clicking placeholder');
    // Full pointer sequence (YT uses pointer handlers on the placeholder)
    try {
      var pr = placeholder.getBoundingClientRect();
      var popts = { bubbles: true, cancelable: true, view: window, clientX: pr.left + pr.width/2, clientY: pr.top + pr.height/2, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      placeholder.dispatchEvent(new PointerEvent('pointerdown', popts));
      placeholder.dispatchEvent(new MouseEvent('mousedown', popts));
      placeholder.dispatchEvent(new PointerEvent('pointerup', popts));
      placeholder.dispatchEvent(new MouseEvent('mouseup', popts));
      placeholder.dispatchEvent(new MouseEvent('click', popts));
    } catch (e) {}
    try { placeholder.click(); } catch (e) {}
    await sleep(2000);

    // Step 3: Find editor — YouTube's composer contenteditable now appears
    // under several selectors depending on account state / experiment bucket.
    function findYTEditor() {
      return document.getElementById('contenteditable-root')
        || document.querySelector('ytd-commentbox #contenteditable-root')
        || document.querySelector('ytd-commentbox [contenteditable="true"]')
        || document.querySelector('yt-formatted-string[contenteditable="true"]')
        || document.querySelector('div[contenteditable="true"][role="textbox"]')
        || document.querySelector('[contenteditable="true"][aria-label*="comment" i]')
        || document.querySelector('[contenteditable="true"]');
    }

    var editor = null;
    for (var j = 0; j < 5; j++) {
      editor = findYTEditor();
      if (editor) break;
      // Re-click placeholder every other attempt in case the click was swallowed
      if (j === 2) { try { placeholder.click(); } catch (e) {} }
      await sleep(1500);
    }
    if (!editor) {
      // Forensic snapshot — tells us exactly what's in the DOM after placeholder click
      var editorSnap = {
        placeholder_still_exists: document.contains(placeholder),
        contenteditable_count: document.querySelectorAll('[contenteditable="true"]').length,
        contenteditable_sample: Array.from(document.querySelectorAll('[contenteditable="true"]')).slice(0, 3).map(function(el) {
          return (el.tagName || '').toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).slice(0, 40) : '');
        }).join(' | '),
        role_textbox: !!document.querySelector('[role="textbox"]'),
        commentbox_still_mounted: !!document.querySelector('ytd-commentbox'),
        simplebox_renderer: !!document.querySelector('ytd-comment-simplebox-renderer'),
      };
      return {
        success: false,
        error: 'YouTube editor not found after placeholder click — DOM: ' + JSON.stringify(editorSnap),
        postUrl: window.location.href,
      };
    }

    console.log('[GM YouTube] Editor found, height:', editor.offsetHeight);
    editor.click();
    editor.focus();
    await sleep(500);

    // Step 4: humanType — same proven pattern as Twitter/FB/Reddit/Quora
    async function ytHumanType(el, s) {
      el.focus();
      for (var c = 0; c < s.length; c++) {
        var ch = s.charAt(c);
        try { document.execCommand('insertText', false, ch); } catch (e) {}
        await sleep(30 + Math.random() * 60);
        if ('.!?,;:'.indexOf(ch) !== -1) await sleep(100 + Math.random() * 200);
      }
    }

    await ytHumanType(editor, text);
    await sleep(400);

    if ((editor.textContent || '').trim().length < 5) {
      // Fallback 1: clipboard paste
      try {
        editor.focus();
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (e) {}
      await sleep(700);
    }
    if ((editor.textContent || '').trim().length < 5) {
      return { success: false, error: 'Could not type in YouTube editor (humanType + paste both failed)', postUrl: window.location.href };
    }

    console.log('[GM YouTube] Text entered, length:', editor.textContent.trim().length);
    // Human pause: re-read what we just typed before hitting Comment (2.5-5s)
    await sleep(2500 + Math.random() * 2500);

    // Step 5: Click submit button (wait for it to become enabled).
    // YouTube's comment-box has a #submit-button (the real submit) and a
    // #cancel-button sibling. Older markup used <ytd-button-renderer>,
    // newer uses a plain <button>. We try multiple strategies.
    function findYouTubeSubmitBtn() {
      // Strategy A: aria-label matches (most stable — YouTube rarely renames these)
      var byAria = document.querySelector('#submit-button button[aria-label*="omment" i]')
        || document.querySelector('ytd-commentbox button[aria-label*="omment" i]')
        || document.querySelector('button[aria-label="Comment"]')
        || document.querySelector('button[aria-label="Reply"]')
        || document.querySelector('button[aria-label*="Post comment" i]');
      if (byAria) return byAria;
      // Strategy B: direct button inside #submit-button
      var byId = document.querySelector('#submit-button button')
        || document.querySelector('ytd-commentbox #submit-button button');
      if (byId) return byId;
      // Strategy C: button inside ytd-button-renderer#submit-button
      var byRenderer = document.querySelector('ytd-button-renderer#submit-button button');
      if (byRenderer) return byRenderer;
      // Strategy D: scope to composer, text match on non-cancel buttons
      var composer = document.querySelector('ytd-commentbox') || document.querySelector('ytd-comment-simplebox-renderer') || document;
      var candidates = Array.from(composer.querySelectorAll('button, tp-yt-paper-button'));
      return candidates.find(function(b) {
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
        var t = (b.textContent || '').trim().toLowerCase();
        var aria = (b.getAttribute('aria-label') || '').toLowerCase();
        if (t === 'cancel' || aria === 'cancel') return false;
        return t === 'comment' || t === 'reply' || t === 'post' || aria === 'comment' || aria === 'reply' || aria.indexOf('post comment') !== -1;
      });
    }

    var submitBtn = null;
    for (var m = 0; m < 8; m++) {
      submitBtn = findYouTubeSubmitBtn();
      if (submitBtn && !submitBtn.disabled && submitBtn.getAttribute('aria-disabled') !== 'true') break;
      submitBtn = null;
      await sleep(1000);
    }

    async function ytFireClick(el) {
      try {
        el.scrollIntoView({ block: 'center' });
        await sleep(150);
        var r = el.getBoundingClientRect();
        var opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        el.dispatchEvent(new PointerEvent('pointerover', opts));
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        try { el.focus(); } catch (e) {}
        await sleep(40);
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        try { el.click(); } catch (e) {}
      } catch (err) {
        try { el.click(); } catch (e) {}
      }
    }

    var snippet = text.slice(0, 40).trim();

    // Multi-strategy submit cascade (same pattern as Reddit/Quora)
    var attempts = { click: false, requestSubmit: false, ctrlEnter: false };
    async function tryClick() { if (!submitBtn || attempts.click) return; attempts.click = true; await ytFireClick(submitBtn); }
    function tryRequestSubmit() {
      if (attempts.requestSubmit) return;
      attempts.requestSubmit = true;
      try {
        var form = (submitBtn && submitBtn.closest('form')) || editor.closest('form');
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
      } catch (e) {}
    }
    function tryCtrlEnter() {
      if (attempts.ctrlEnter) return;
      attempts.ctrlEnter = true;
      try {
        editor.focus();
        var ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, metaKey: true, bubbles: true, cancelable: true };
        editor.dispatchEvent(new KeyboardEvent('keydown', ev));
        editor.dispatchEvent(new KeyboardEvent('keyup', ev));
      } catch (e) {}
    }

    if (submitBtn) {
      console.log('[GM YouTube] Clicking submit');
      await tryClick();
    } else {
      console.log('[GM YouTube] Submit button not visible — falling back to Ctrl+Enter');
      tryCtrlEnter();
    }

    // Poll up to 12s for confirmation. Escalate strategies along the way.
    var posted = false;
    var verifyMethod = '';
    for (var poll = 0; poll < 12; poll++) {
      await sleep(1000);
      if (poll === 3) tryRequestSubmit();
      if (poll === 6) tryCtrlEnter();
      if (poll === 9 && submitBtn) { try { await ytFireClick(submitBtn); } catch (e) {} }

      // Signal 1: editor cleared
      var curEditor = findYTEditor();
      if (!curEditor || (curEditor.textContent || '').trim().length < 5) { posted = true; verifyMethod = 'editor_cleared'; break; }
      // Signal 2: our snippet visible on page
      if ((document.body.innerText || '').indexOf(snippet) !== -1) { posted = true; verifyMethod = 'text_on_page'; break; }
      // Signal 3: submit button gone or disabled post-click
      if (submitBtn && (!document.contains(submitBtn) || submitBtn.disabled)) { posted = true; verifyMethod = 'submit_gone'; break; }
    }

    if (!posted) {
      var tried = Object.keys(attempts).filter(function(k) { return attempts[k]; }).join(',');
      return { success: false, error: 'YouTube comment not confirmed after 12s — tried: ' + tried, postUrl: window.location.href };
    }
    return { success: true, verified: true, verifyMethod: verifyMethod, postUrl: window.location.href };
  }

  async function likeVideo() {
    // Skip ads if present, then immediately like — no watching needed for likes.
    // Watching 30-60s before liking was causing 200s timeouts (7 failures today).
    await handleAds();
    await sleep(3000); // brief pause so page fully renders

    // Find like button with multiple selectors
    var likeBtn = null;
    for (var i = 0; i < 4; i++) {
      likeBtn = document.querySelector('button[aria-label*="like this video" i]:not([aria-label*="dislike"])')
        || document.querySelector('ytd-toggle-button-renderer button[aria-label*="like" i]:not([aria-label*="dislike"])')
        || document.querySelector('#top-level-buttons-computed ytd-toggle-button-renderer:first-child button')
        || document.querySelector('like-button-view-model button')
        || document.querySelector('#segmented-like-button button')
        || document.querySelector('ytd-menu-renderer button[aria-label*="like" i]:not([aria-label*="dislike"])');
      if (likeBtn) break;
      // Scroll up — the like button is near the video title, above the fold
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(1500);
    }
    if (!likeBtn) return { success: false, error: 'Like button not found on YouTube', postUrl: window.location.href };
    if (likeBtn.getAttribute('aria-pressed') === 'true') return { success: true, alreadyLiked: true, postUrl: window.location.href };

    likeBtn.click();
    await sleep(1500);
    var liked = likeBtn.getAttribute('aria-pressed') === 'true';
    return { success: liked || true, verified: liked, verifyMethod: liked ? 'aria_pressed' : 'clicked_unverified', postUrl: window.location.href };
  }

  // ── Scraping ────────────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);
    const posts = [];
    const seen = new Set();

    // YouTube search results or home feed — video renderers
    const videos = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer');
    videos.forEach(vid => {
      try {
        const titleEl = vid.querySelector('#video-title, a#video-title-link, h3 a');
        const url = titleEl?.href || vid.querySelector('a[href*="/watch"]')?.href;
        if (!url || seen.has(url)) return;
        const content = titleEl?.textContent?.trim() || '';
        if (!content || content.length < 5) return;
        if (keywords.length > 0 && !keywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()))) return;
        const author = vid.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || 'Unknown';
        seen.add(url);
        posts.push({ url: url.split('&')[0], content, author, platform: 'youtube' });
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
