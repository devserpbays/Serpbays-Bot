/**
 * GetMention — Facebook Content Script
 * Handles scraping group posts and posting comments.
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 1500, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'JOIN_GROUP') {
      joinGroup().then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg.platform && msg.platform !== 'facebook') return;

    if (msg.type === 'EXECUTE_TASK') {
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Facebook content script timed out (100s)' }); }, 100000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) { clearTimeout(timeout); sendResponse({ success: false, error: err.message || 'Facebook error' }); });
      return true;
    }

    if (msg.type === 'SCRAPE_POSTS') {
      scrapePosts(msg.keywords || []).then(sendResponse).catch(err => {
        sendResponse({ posts: [], error: err.message });
      });
      return true;
    }
  });

  // ── Post permalink extraction ───────────────────────────────────────────
  // After liking/commenting, we need the specific post URL (not the group URL)
  // for activity logs. FB sometimes opens posts in a modal that doesn't change
  // window.location, and group-level tasks arrive with the group URL. So we
  // scan the visible post container for a timestamp-style <a> that links to
  // /groups/.../posts/... — that's the canonical permalink.

  function getSpecificPostUrl() {
    try {
      // Strip the tracking garbage off an href (the __cft__ and __tn__ params
      // leak the scraping user's session — never log them).
      function clean(href) {
        if (!href) return '';
        try {
          var u = new URL(href);
          // Keep only useful params (comment_id). Drop everything else.
          var keepCommentId = u.searchParams.get('comment_id');
          u.search = '';
          u.hash = '';
          if (keepCommentId) u.searchParams.set('comment_id', keepCommentId);
          return u.toString();
        } catch (e) {
          return href.split('?')[0].split('#')[0];
        }
      }

      function isPostPermalink(href) {
        if (!href) return false;
        // Must be a post/permalink/story pattern; NOT a user/profile/members link
        if (/\/user\//.test(href) || /\/members\//.test(href) || /\/profile\.php/.test(href)) return false;
        return (
          /\/groups\/[^/]+\/posts\//.test(href) ||
          /\/groups\/[^/]+\/permalink\//.test(href) ||
          /\/posts\//.test(href) ||
          /\/permalink\//.test(href) ||
          /\/share\/p\//.test(href) ||
          /story_fbid=/.test(href) ||
          /\/story\.php/.test(href)
        );
      }

      // Strategy 1: If the browser URL itself is a post permalink, use it.
      if (isPostPermalink(location.href)) return clean(location.href);

      // Strategy 2: Find an <a> inside a timestamp/abbr — FB wraps the post
      // timestamp in a link that points to the canonical permalink.
      var timeLinks = document.querySelectorAll(
        'a[href*="/posts/"] abbr, a[href*="/permalink/"] abbr, ' +
        'a[href*="/posts/"] time, a[href*="/permalink/"] time, ' +
        'a[href*="/posts/"][aria-label*="ago" i], a[href*="/permalink/"][aria-label*="ago" i]'
      );
      for (var i = 0; i < timeLinks.length; i++) {
        var link = timeLinks[i].closest('a[href]') || timeLinks[i];
        if (link && link.href && isPostPermalink(link.href)) return clean(link.href);
      }

      // Strategy 3: first permalink-style <a> visible on the page
      var allLinks = document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/share/p/"]');
      for (var j = 0; j < allLinks.length; j++) {
        if (isPostPermalink(allLinks[j].href)) return clean(allLinks[j].href);
      }
    } catch (e) {}
    return '';
  }

  // ── Task execution ──────────────────────────────────────────────────────

  async function handleTask({ action, text }) {
    // Step 0: If we're on a group page, check membership (don't join + comment in same session)
    const isGroupPage = window.location.href.includes('/groups/');
    if (isGroupPage) {
      console.log('[GM Facebook] Group page detected — checking membership');
      const membership = await checkGroupMembership();
      if (membership === 'not_member') {
        console.log('[GM Facebook] Not a member — skipping comment (will join separately)');
        return { success: false, error: 'Not a group member — will join in next cycle' };
      }
      if (membership === 'new_member') {
        console.log('[GM Facebook] Recently joined — skipping to avoid spam filter');
        return { success: false, error: 'Recently joined group — waiting before commenting' };
      }
    }

    switch (action) {
      case 'comment': return postComment(text);
      case 'like': return likePost();
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // ── Check group membership ───────────────────────────────────────

  async function checkGroupMembership() {
    // Check if we're a member of this group
    const joinBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
      const t = (b.textContent?.trim() || '').toLowerCase();
      return t === 'join group' || t === 'join';
    });
    if (joinBtn) return 'not_member';

    // Check if "Joined" or member indicator exists
    const memberBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
      const t = (b.textContent?.trim() || '').toLowerCase();
      return t === 'joined' || t === 'member' || t === 'leave group';
    });
    if (memberBtn) return 'member';

    // If neither found, assume member (post pages may not show join button)
    return 'member';
  }

  // ── Join group ──────────────────────────────────────────────────

  async function joinGroup() {
    await sleep(500);

    // Check if already a member
    const alreadyJoined = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
      const t = (b.textContent?.trim() || '').toLowerCase();
      return t === 'joined' || t === 'member' || t === 'leave group';
    });
    if (alreadyJoined) {
      console.log('[GM Facebook] Already a member of this group');
      return { ok: true, alreadyJoined: true };
    }

    // Find Join button
    let joinBtn = null;
    for (let i = 0; i < 3; i++) {
      joinBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
        const t = (b.textContent?.trim() || '').toLowerCase();
        return t === 'join group' || t === 'join' || t === 'join community';
      });
      if (joinBtn) break;
      await sleep(1000);
    }

    if (joinBtn) {
      console.log('[GM Facebook] Clicking Join Group button');
      joinBtn.click();
      await sleep(3000);

      // Check if there's a "agree to rules" dialog — click agree if present
      const agreeBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
        const t = (b.textContent?.trim() || '').toLowerCase();
        return t === 'agree' || t === 'agree and join' || t === 'agree to rules'
          || t === 'i agree' || t === 'accept' || t === 'join group';
      });
      if (agreeBtn) {
        console.log('[GM Facebook] Agreeing to group rules');
        agreeBtn.click();
        await sleep(2000);
      }

      // Check checkboxes for rules (some groups have these)
      const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
      for (const cb of checkboxes) {
        cb.click();
        await sleep(300);
      }
      // Click final submit/join after checking boxes
      const finalJoin = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
        const t = (b.textContent?.trim() || '').toLowerCase();
        return t === 'agree and join' || t === 'submit' || t === 'join group' || t === 'join';
      });
      if (finalJoin && finalJoin !== joinBtn) {
        finalJoin.click();
        await sleep(2000);
      }

      return { ok: true, joined: true };
    }

    console.log('[GM Facebook] Join button not found — may already be a member');
    return { ok: false };
  }

  // ── Post comment ────────────────────────────────────────────────

  async function postComment(text) {
    await sleep(2000);

    // Check if we already commented
    const myName = document.querySelector('[aria-label="Your profile"] span, [aria-label*="Account" i] span')?.textContent?.trim();
    if (myName) {
      const commentAuthors = document.querySelectorAll('[role="article"] a[role="link"] strong span, [role="article"] h3 a span');
      for (const a of commentAuthors) {
        if (a.textContent?.trim() === myName) {
          return { success: true, alreadyCommented: true, postUrl: getSpecificPostUrl() };
        }
      }
    }

    // ── Find the comment composer ──────────────────────────────────────────
    // Facebook has many DOM variants for the comment box across feed/group/
    // photo/story pages. We try them all in priority order, and if none mount
    // we click a "Write a comment" affordance to force-mount the editor.

    function findCommentEditor() {
      // Priority 1: contenteditable with explicit "comment" aria-label
      let e = document.querySelector('[contenteditable="true"][aria-label*="comment" i]');
      if (e) return e;
      // Priority 2: lexical editor (newer FB builds)
      e = document.querySelector('[contenteditable="true"][data-lexical-editor="true"]');
      if (e) return e;
      // Priority 3: any plaintext-only contenteditable (FB sometimes uses this)
      e = document.querySelector('[contenteditable="plaintext-only"]');
      if (e) return e;
      // Priority 4: any contenteditable inside a role="dialog" (FB modal post view)
      e = document.querySelector('[role="dialog"] [contenteditable="true"]');
      if (e) return e;
      // Priority 5: any role=textbox contenteditable
      e = document.querySelector('[contenteditable="true"][role="textbox"]');
      if (e) return e;
      // Priority 6: last-resort, ANY contenteditable on the page
      return document.querySelector('[contenteditable="true"]');
    }

    function findCommentPlaceholder() {
      // FB's "Write a comment" placeholder takes many shapes
      let p = document.querySelector('[aria-label="Write a comment"]')
        || document.querySelector('[aria-label="Write an answer"]')
        || document.querySelector('[aria-label*="Write a comment" i]')
        || document.querySelector('[aria-label*="Comment as" i]')
        || document.querySelector('[placeholder*="Write a comment" i]');
      if (p) return p;
      // Text-based fallback: any role=button whose text contains "write a comment"
      return Array.from(document.querySelectorAll('[role="button"], div')).find(b => {
        const t = (b.textContent?.trim() || '').toLowerCase();
        return t === 'write a comment' || t === 'write a public comment' || t === 'write an answer';
      });
    }

    let editor = null;
    let attempts = 0;
    let composerStats = { textboxes: 0, dialogs: 0, placeholdersTried: 0, scrolls: 0 };

    for (let i = 0; i < 8; i++) {
      attempts = i + 1;
      editor = findCommentEditor();
      if (editor) break;

      // Snapshot diagnostics
      composerStats.textboxes = document.querySelectorAll('[contenteditable="true"]').length;
      composerStats.dialogs = document.querySelectorAll('[role="dialog"]').length;

      // Try clicking a "Write a comment" placeholder to force-mount the editor
      const placeholder = findCommentPlaceholder();
      if (placeholder) {
        composerStats.placeholdersTried++;
        try { placeholder.scrollIntoView({ block: 'center' }); } catch {}
        await sleep(300);
        try { placeholder.click(); } catch {}
        // Some FB builds need a real mouse event, not just .click()
        try {
          const r = placeholder.getBoundingClientRect();
          ['mousedown', 'mouseup', 'click'].forEach(t => {
            placeholder.dispatchEvent(new MouseEvent(t, {
              bubbles: true, cancelable: true, view: window,
              clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            }));
          });
        } catch {}
        await sleep(1500);
        editor = findCommentEditor();
        if (editor) break;
      }

      // Scroll to make more of the post visible — sometimes the composer
      // mounts only after the post body comes into view
      window.scrollBy({ top: 300, behavior: 'instant' });
      composerStats.scrolls++;
      await sleep(1500);
    }

    if (!editor) {
      // Build a diagnostic error so we can see WHY the composer didn't mount
      const onLogin = location.pathname.includes('/login') || location.pathname.includes('/checkpoint');
      const reason = onLogin
        ? 'redirected to login/checkpoint — session expired'
        : `no contenteditable found after ${attempts} attempts (${composerStats.textboxes} textboxes, ${composerStats.dialogs} dialogs, ${composerStats.placeholdersTried} placeholders tried, ${composerStats.scrolls} scrolls). Post may have comments disabled, be member-only, or use a different DOM variant.`;
      return { success: false, error: 'Comment box not found — ' + reason };
    }

    editor.click();
    editor.focus();
    await sleep(500);
    await humanType(editor, text);
    await sleep(1000);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(4000);

    // Verify: check if editor is now empty (Facebook clears it on success)
    const editorAfter = document.querySelector('[contenteditable="true"][role="textbox"]');
    const editorCleared = !editorAfter || (editorAfter.textContent || '').trim().length < 5;

    // Also check if our text snippet appears in comments
    const snippet = text.slice(0, 40).trim();
    const textFound = (document.body.innerText || '').includes(snippet);
    const posted = editorCleared || textFound;

    var postUrl = getSpecificPostUrl();
    if (!posted) return { success: false, error: 'Comment submitted but not confirmed on page', postUrl: postUrl };
    return { success: true, verified: true, postUrl: postUrl };
  }

  async function likePost() {
    await sleep(2000);

    // Check if already liked
    const alreadyLiked = document.querySelector('[aria-label="Remove Like"]')
      || document.querySelector('[aria-label*="Unlike"]')
      || document.querySelector('[aria-pressed="true"][aria-label*="like" i]');
    if (alreadyLiked) return { success: true, alreadyLiked: true, postUrl: getSpecificPostUrl() };

    // Try multiple selectors — Facebook changes DOM frequently
    const likeBtn = document.querySelector('div[aria-label="Like"][role="button"]')
      || document.querySelector('span[aria-label="Like"][role="button"]')
      || document.querySelector('[aria-label="Like"]')
      || document.querySelector('[data-testid="like_button"]')
      || Array.from(document.querySelectorAll('[role="button"]')).find(b => {
        const label = b.getAttribute('aria-label') || '';
        return label === 'Like' || label === 'like';
      });

    if (!likeBtn) {
      // Last resort: find the like icon by structure (thumb up near reaction bar)
      const reactionBar = document.querySelector('[aria-label*="reaction" i]')?.closest('div');
      if (reactionBar) {
        const firstBtn = reactionBar.querySelector('[role="button"]');
        if (firstBtn) {
          firstBtn.click();
          await sleep(2000);
          return { success: true };
        }
      }
      return { success: false, error: 'Like button not found' };
    }

    likeBtn.click();
    await sleep(2000);
    // Verify like registered
    const verified = !!document.querySelector('[aria-label="Remove Like"]')
      || !!document.querySelector('[aria-label*="Unlike"]')
      || !!document.querySelector('[aria-pressed="true"][aria-label*="like" i]');
    return { success: verified, verified, postUrl: getSpecificPostUrl() };
  }

  // ── Scraping ────────────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);

    // Trigger lazy-load: scroll a few times so React/Relay mounts feed items
    for (let s = 0; s < 4; s++) {
      window.scrollBy({ top: 800 + Math.random() * 400, behavior: 'instant' });
      await sleep(800);
    }

    const posts = [];
    const seen = new Set();

    // Modern Facebook DOM (2024+) uses many wrapper variants — cast a wide net.
    // For SEARCH RESULTS specifically (/groups/.../search/?q=...), each result
    // is wrapped in an <a> with the post permalink, with the article content
    // INSIDE that anchor. So we also include 'a[href*="/posts/"]' and the
    // search-result wrapper.
    const feedItems = document.querySelectorAll(
      '[role="article"],' +
      '[data-pagelet*="FeedUnit"],' +
      '[data-pagelet*="GroupFeed"],' +
      '[data-pagelet*="Search"],' +
      '[data-pagelet*="BrowseSearch"],' +
      '[data-ad-preview],' +
      '[data-ad-rendering-role],' +
      'div[class*="userContentWrapper"],' +
      // Search-result wrappers — these are <a> tags with the permalink as href
      'a[href*="/groups/"][href*="/posts/"],' +
      'a[href*="/groups/"][href*="/permalink/"]'
    );

    // Diagnostic counters so logs show WHY we got zero posts
    let stats = { items: feedItems.length, noLinks: 0, noUrl: 0, shortContent: 0, kwMiss: 0, dupe: 0, ok: 0, sampleHref: '' };

    // URLs that are NEVER post permalinks — skip these immediately.
    // /user/ = author profile, /members/ = group member list, etc.
    function isBlacklistedUrl(href) {
      return /\/user\//.test(href) ||
        /\/profile\.php/.test(href) ||
        /\/members\//.test(href) ||
        /\/about\//.test(href) ||
        /\/events\//.test(href) ||
        /\/admin\//.test(href) ||
        /\/settings\//.test(href) ||
        /\/calendar\//.test(href) ||
        /\/leaderboard\//.test(href);
    }

    // Helper: extract a permalink-style URL from a single href string.
    // Returns the cleaned URL if it matches a post pattern, otherwise ''.
    function matchPermalink(href) {
      if (!href) return '';
      // Reject known non-post URLs first
      if (isBlacklistedUrl(href)) return '';
      if (
        /\/groups\/[^/]+\/posts\//.test(href) ||
        /\/groups\/[^/]+\/permalink\//.test(href) ||
        href.includes('/posts/') ||
        href.includes('/permalink/') ||
        href.includes('story_fbid') ||
        href.includes('/share/p/') ||
        href.includes('/permalink.php') ||
        href.includes('/story.php') ||
        href.includes('/videos/') ||
        href.includes('/photo/') ||
        href.includes('/photos/')
      ) {
        return href.split('#')[0];
      }
      return '';
    }

    feedItems.forEach(item => {
      try {
        // ── Get post permalink (try every known FB URL pattern) ──────
        let url = '';

        // Pass 0: if the item itself IS an <a> with a permalink, use it directly
        // (this catches the FB search results wrapper)
        if (item.tagName === 'A' && item.href) {
          url = matchPermalink(item.href);
        }

        // Pass 0b: if not yet found, check the item's ANCESTOR <a> chain
        // (search results often wrap the article in an outer <a>)
        if (!url) {
          const ancestorA = item.closest && item.closest('a[href]');
          if (ancestorA && ancestorA.href) {
            url = matchPermalink(ancestorA.href);
          }
        }

        // Pass 1: strict permalink patterns inside the item
        const allLinks = item.querySelectorAll ? item.querySelectorAll('a[href]') : [];
        if (!url && allLinks.length === 0) { stats.noLinks++; return; }
        if (!stats.sampleHref && allLinks[0]) stats.sampleHref = (allLinks[0].href || '').slice(0, 120);

        if (!url) {
          for (const link of allLinks) {
            const matched = matchPermalink(link.href || '');
            if (matched) { url = matched; break; }
          }
        }
        // Pass 2: any anchor whose ancestor is a timestamp/abbr/time element
        if (!url && item.querySelector) {
          const abbr = item.querySelector('a[href] abbr, a[href] time, a[href][aria-label*="20"], a[href][aria-label*="ago" i]');
          const parentLink = abbr?.closest?.('a[href]') || (abbr && abbr.tagName === 'A' ? abbr : null);
          if (parentLink?.href && !isBlacklistedUrl(parentLink.href)) {
            url = parentLink.href.split('#')[0];
          }
        }
        // Pass 3: any facebook.com link with a long numeric segment (post IDs are 15+ digits).
        // EXCLUDE /user/ and /profile.php URLs — those are author profiles, not posts.
        if (!url) {
          for (const link of allLinks) {
            const href = link.href || '';
            if (isBlacklistedUrl(href)) continue;
            if (/facebook\.com\/.*\/\d{10,}/.test(href) || /fbid=\d{10,}/.test(href)) {
              url = href.split('#')[0];
              break;
            }
          }
        }
        if (!url) { stats.noUrl++; return; }
        if (seen.has(url)) { stats.dupe++; return; }

        // ── Get post text content ───────────────────────────────────
        // Modern FB nests text in many places — collect everything and pick longest
        const textEls = item.querySelectorAll(
          '[data-ad-preview="message"],' +
          '[data-ad-comet-preview="message"],' +
          'div[dir="auto"]:not([role="button"]):not([role="link"]),' +
          'span[dir="auto"]'
        );
        let content = '';
        textEls.forEach(el => {
          const t = (el.textContent || '').trim();
          if (t.length > content.length) content = t;
        });
        // Even broader fallback: longest text node in the article
        if (!content || content.length < 15) {
          content = (item.textContent || '').trim().slice(0, 600);
        }
        if (!content || content.length < 10) { stats.shortContent++; return; }

        // ── Keyword filter ──────────────────────────────────────────
        if (keywords.length > 0) {
          const lower = content.toLowerCase();
          if (!keywords.some(kw => lower.includes(kw.toLowerCase()))) { stats.kwMiss++; return; }
        }

        // ── Author ──────────────────────────────────────────────────
        const authorEl = item.querySelector('strong a, h3 a, h4 a, [data-ad-rendering-role="profile_name"] a, [aria-labelledby] strong');
        const author = (authorEl?.textContent || '').trim() || 'Unknown';

        seen.add(url);
        stats.ok++;
        posts.push({ url, content: content.slice(0, 2000), author, platform: 'facebook' });
      } catch {}
    });

    // ── Strategy Z: Global anchor sweep ─────────────────────────────
    // If the per-feedItem scan came up empty, Facebook has likely moved to a
    // layout where each post's clickable surface is a <div role="link"> (no
    // href) while the real permalink lives on a nested timestamp anchor that
    // our existing selectors miss. Sweep EVERY <a> on the page whose href
    // looks like a post, then resolve each to its nearest content container.
    if (posts.length === 0) {
      const permaSelector = 'a[href*="/posts/"], a[href*="/permalink/"], a[href*="/share/p/"], a[href*="story_fbid"]';
      const swept = document.querySelectorAll(permaSelector);
      stats.sweptAnchors = swept.length;
      swept.forEach(a => {
        try {
          const url = matchPermalink(a.href || '');
          if (!url) return;
          if (seen.has(url)) { stats.dupe++; return; }

          // Find the nearest post container so we can extract content text.
          // Walk up from the anchor until we hit a reasonable article-like ancestor.
          let container = a.closest('[role="article"]')
            || a.closest('[data-pagelet*="FeedUnit"]')
            || a.closest('[data-pagelet*="GroupFeed"]')
            || a.closest('[data-pagelet*="Search"]')
            || a.closest('[data-ad-preview]');
          if (!container) {
            // Walk up ~8 levels looking for a div that has meaningful content
            let el = a.parentElement;
            for (let depth = 0; depth < 8 && el; depth++) {
              if ((el.textContent || '').trim().length >= 40) { container = el; break; }
              el = el.parentElement;
            }
          }
          if (!container) return;

          // Extract content
          const textEls = container.querySelectorAll(
            '[data-ad-preview="message"], [data-ad-comet-preview="message"], ' +
            'div[dir="auto"]:not([role="button"]):not([role="link"]), span[dir="auto"]'
          );
          let content = '';
          textEls.forEach(el => {
            const t = (el.textContent || '').trim();
            if (t.length > content.length) content = t;
          });
          if (!content || content.length < 15) content = (container.textContent || '').trim().slice(0, 600);
          if (!content || content.length < 10) { stats.shortContent++; return; }

          if (keywords.length > 0) {
            const lower = content.toLowerCase();
            if (!keywords.some(kw => lower.includes(kw.toLowerCase()))) { stats.kwMiss++; return; }
          }

          const authorEl = container.querySelector('strong a, h3 a, h4 a, [aria-labelledby] strong');
          const author = (authorEl?.textContent || '').trim() || 'Unknown';

          seen.add(url);
          stats.ok++;
          stats.viaSweep = (stats.viaSweep || 0) + 1;
          posts.push({ url, content: content.slice(0, 2000), author, platform: 'facebook' });
        } catch {}
      });
    }

    console.log('[GM Facebook] Scrape stats:', JSON.stringify(stats));
    return { posts: posts.slice(0, 15), stats };
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
