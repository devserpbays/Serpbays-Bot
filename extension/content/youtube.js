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
      // Extended timeout: watching the video (60-120s) + ad skip + commenting takes 2-3 min
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'YouTube content script timed out (180s)' }); }, 180000);
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

    for (var adAttempt = 0; adAttempt < 12; adAttempt++) {
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

      // No skip button — ad is non-skippable. Wait 5s and check again.
      console.log('[GM YouTube] Non-skippable ad — waiting 5s...');
      await sleep(5000);
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

    // Random watch duration: 60–120 seconds
    var watchSeconds = 60 + Math.floor(Math.random() * 60);
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

  async function postComment(text) {
    // ── Step 0: Handle ads + watch video ──────────────────────────────
    // This makes the comment look like it came from a real viewer who
    // watched the video first, not a bot that instantly commented.
    await handleAds();
    await watchVideoLikeHuman();

    // ── Step 1: Scroll to comments section ───────────────────────────
    console.log('[GM YouTube] Step 1: Scrolling to comments');
    window.scrollTo({ top: 500, behavior: 'smooth' });
    await sleep(2000);

    // Step 2: Find and click placeholder to open editor
    console.log('[GM YouTube] Step 2: Finding placeholder');
    let placeholder = null;
    for (var i = 0; i < 4; i++) {
      placeholder = document.getElementById('placeholder-area')
        || document.getElementById('simplebox-placeholder');
      if (placeholder && placeholder.offsetParent !== null) break;
      placeholder = null;
      window.scrollBy({ top: 300, behavior: 'smooth' });
      await sleep(2000);
    }
    if (!placeholder) return { success: false, error: 'Comment placeholder not found — comments may be disabled' };

    console.log('[GM YouTube] Clicking placeholder');
    placeholder.click();
    await sleep(2000);

    // Step 3: Find editor (#contenteditable-root)
    var editor = null;
    for (var j = 0; j < 3; j++) {
      editor = document.getElementById('contenteditable-root');
      if (editor) break;
      await sleep(1500);
    }
    if (!editor) return { success: false, error: 'Comment editor (#contenteditable-root) not found' };

    console.log('[GM YouTube] Editor found, height:', editor.offsetHeight);
    editor.click();
    editor.focus();
    await sleep(500);

    // Step 4: Type text — try paste first (works on most editors)
    var dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(800);

    // Check if paste worked
    if ((editor.textContent || '').trim().length < 5) {
      // Fallback: execCommand
      console.log('[GM YouTube] Paste failed, trying execCommand');
      editor.focus();
      for (var k = 0; k < text.length; k++) {
        document.execCommand('insertText', false, text.charAt(k));
        await sleep(20);
      }
      await sleep(500);
    }

    if ((editor.textContent || '').trim().length < 5) {
      return { success: false, error: 'Could not type in YouTube editor' };
    }

    console.log('[GM YouTube] Text entered, length:', editor.textContent.trim().length);
    await sleep(1000);

    // Step 5: Click submit button (wait for it to become enabled).
    // YouTube's comment-box has a #submit-button (the real submit) and a
    // #cancel-button sibling. Older markup used <ytd-button-renderer>,
    // newer uses a plain <button>. We try multiple strategies.
    function findYouTubeSubmitBtn() {
      // Strategy A: aria-label matches (most stable across redesigns)
      var byAria = document.querySelector('#submit-button button[aria-label*="omment" i]')
        || document.querySelector('button[aria-label="Comment"]')
        || document.querySelector('button[aria-label="Reply"]');
      if (byAria) return byAria;
      // Strategy B: direct button inside #submit-button
      var byId = document.querySelector('#submit-button button');
      if (byId) return byId;
      // Strategy C: button inside ytd-button-renderer#submit-button
      var byRenderer = document.querySelector('ytd-button-renderer#submit-button button');
      if (byRenderer) return byRenderer;
      // Strategy D: any visible button whose text is "Comment" / "Reply" that
      // isn't the cancel button
      var candidates = Array.from(document.querySelectorAll('button'));
      return candidates.find(function(b) {
        if (b.disabled) return false;
        var t = (b.textContent || '').trim().toLowerCase();
        var aria = (b.getAttribute('aria-label') || '').toLowerCase();
        if (t === 'cancel' || aria === 'cancel') return false;
        return t === 'comment' || t === 'reply' || aria === 'comment' || aria === 'reply';
      });
    }

    var submitBtn = null;
    for (var m = 0; m < 6; m++) {
      submitBtn = findYouTubeSubmitBtn();
      if (submitBtn && !submitBtn.disabled) break;
      submitBtn = null;
      await sleep(1000);
    }

    if (!submitBtn) {
      // Try Ctrl+Enter as fallback
      console.log('[GM YouTube] Submit disabled, trying Ctrl+Enter');
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      await sleep(5000);
      var fallbackEditor = document.getElementById('contenteditable-root');
      var fallbackCleared = !fallbackEditor || (fallbackEditor.textContent || '').trim().length < 5;
      var fallbackSnippet = text.slice(0, 40).trim();
      var fallbackFound = (document.body.innerText || '').includes(fallbackSnippet);
      var fallbackPosted = fallbackCleared || fallbackFound;
      if (!fallbackPosted) return { success: false, error: 'Comment submitted via Ctrl+Enter but not confirmed' };
      return { success: true, verified: true };
    }

    console.log('[GM YouTube] Clicking submit');
    submitBtn.click();
    await sleep(5000);

    // Verify: check if editor is now empty (YouTube clears it on success)
    var editorAfter = document.getElementById('contenteditable-root');
    var editorCleared = !editorAfter || (editorAfter.textContent || '').trim().length < 5;

    // Also check if our text snippet appears in comments
    var snippet = text.slice(0, 40).trim();
    var textFound = (document.body.innerText || '').includes(snippet);
    var posted = editorCleared || textFound;

    if (!posted) return { success: false, error: 'Comment submitted but not confirmed on page' };
    return { success: true, verified: true };
  }

  async function likeVideo() {
    // Handle ads + watch a shorter clip before liking (30-60s — less than commenting)
    await handleAds();

    // Shorter watch for likes — 30-60s (enough to look real, not as long as commenting)
    var watchSec = 30 + Math.floor(Math.random() * 30);
    console.log('[GM YouTube] Watching ' + watchSec + 's before liking');
    var video = document.querySelector('video');
    if (video && video.paused) {
      try {
        var playBtn = document.querySelector('.ytp-play-button, [aria-label="Play"]');
        if (playBtn) playBtn.click(); else video.play().catch(function(){});
      } catch (e) {}
    }
    await sleep(watchSec * 1000);

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
    if (!likeBtn) return { success: false, error: 'Like button not found on YouTube' };
    if (likeBtn.getAttribute('aria-pressed') === 'true') return { success: true, alreadyLiked: true };

    likeBtn.click();
    await sleep(1500);
    var liked = likeBtn.getAttribute('aria-pressed') === 'true';
    return { success: liked || true, verified: liked };
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
