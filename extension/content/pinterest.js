/**
 * GetMention — Pinterest Content Script
 * Handles scraping pins and posting comments.
 */

(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCROLL_DOWN') {
      window.scrollBy({ top: 1500, behavior: 'smooth' });
      sendResponse({ ok: true });
      return;
    }
    if (msg.platform && msg.platform !== 'pinterest') return;

    if (msg.type === 'EXECUTE_TASK') {
      // Add timeout — never hang longer than 60s
      var timeout = setTimeout(function() { sendResponse({ success: false, error: 'Pinterest content script timed out (60s)' }); }, 60000);
      handleTask(msg).then(function(r) { clearTimeout(timeout); sendResponse(r); }).catch(function(err) { clearTimeout(timeout); sendResponse({ success: false, error: err.message || 'Pinterest error' }); });
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
      case 'like': return likePin();
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  async function postComment(text) {
    await sleep(2000);

    // Scroll down to find comment section
    window.scrollBy({ top: 500, behavior: 'smooth' });
    await sleep(2000);

    // Step 1: Click the comment area to open the input
    // Pinterest hides the textarea until you click the comment area
    console.log('[GM Pinterest] Step 1: Opening comment area');

    // Find the small contenteditable div (height ~19px from inspect) — clicking it opens the textarea
    const smallEditor = Array.from(document.querySelectorAll('div[contenteditable="true"]')).find(el =>
      el.offsetParent !== null && el.offsetHeight < 50 && el.offsetHeight > 0
    );
    if (smallEditor) {
      console.log('[GM Pinterest] Clicking small editor div, height:', smallEditor.offsetHeight);
      smallEditor.click();
      smallEditor.focus();
      await sleep(2000);
    }

    // Also try clicking "Add a comment" text, textarea placeholder, or any comment trigger
    if (!smallEditor) {
      const triggers = [
        ...Array.from(document.querySelectorAll('div, span, p')).filter(el => {
          const t = (el.textContent?.trim() || '').toLowerCase();
          return (t.includes('add a comment') || t.includes('say something') || t === 'comment') && el.offsetParent !== null;
        }),
        ...Array.from(document.querySelectorAll('button')).filter(b => {
          const t = (b.textContent?.trim() || '').toLowerCase();
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          return t.includes('comment') || label.includes('comment');
        }),
      ];
      if (triggers.length > 0) {
        console.log('[GM Pinterest] Clicking trigger:', triggers[0].tagName, triggers[0].textContent?.trim()?.slice(0, 20));
        triggers[0].click();
        await sleep(2000);
      }
    }

    // Step 2: Find the comment input with retries
    console.log('[GM Pinterest] Step 2: Finding comment input');
    let commentBox = null;
    for (let i = 0; i < 5; i++) {
      // Check for textarea that became visible after clicking
      commentBox = document.querySelector('textarea[placeholder*="comment" i]')
        || document.querySelector('textarea[placeholder*="Add" i]')
        || document.querySelector('textarea[placeholder*="say" i]')
        || document.querySelector('textarea[aria-label*="comment" i]');

      // Any visible textarea (Pinterest creates it dynamically)
      if (!commentBox) {
        const allTextareas = document.querySelectorAll('textarea');
        for (const ta of allTextareas) {
          if (ta.offsetParent !== null && ta.offsetHeight > 0) {
            commentBox = ta;
            break;
          }
        }
      }

      // Any visible contenteditable with decent height
      if (!commentBox) {
        const allEditable = document.querySelectorAll('[contenteditable="true"]');
        for (const el of allEditable) {
          if (el.offsetParent !== null && el.offsetHeight > 15) {
            commentBox = el;
            break;
          }
        }
      }

      // The small DIV we clicked earlier might BE the editor
      if (!commentBox && smallEditor && smallEditor.offsetHeight > 0) {
        commentBox = smallEditor;
      }

      if (commentBox) {
        console.log('[GM Pinterest] Found:', commentBox.tagName, 'height:', commentBox.offsetHeight, 'placeholder:', commentBox.placeholder?.slice(0, 20));
        break;
      }

      // Re-click to trigger
      if (smallEditor) smallEditor.click();
      window.scrollBy({ top: 100, behavior: 'smooth' });
      await sleep(2000);
    }

    if (!commentBox) return { success: false, error: 'Comment input not found after 5 attempts' };


    commentBox.click();
    commentBox.focus();
    await sleep(500);

    // Type text — use the method that works for the element type
    console.log('[GM Pinterest] Typing into', commentBox.tagName);

    if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
      // React textarea — use native setter
      const proto = commentBox.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(commentBox, text);
      else commentBox.value = text;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      commentBox.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable div — use paste (proven method)
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      commentBox.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(500);

      // Fallback: execCommand
      if ((commentBox.textContent?.trim() || '').length < 5) {
        for (const char of text) {
          document.execCommand('insertText', false, char);
          await sleep(20);
        }
      }
      // Last resort: direct DOM
      if ((commentBox.textContent?.trim() || '').length < 5) {
        commentBox.textContent = text;
        commentBox.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
      }
    }
    await sleep(1000);

    // Find submit button
    let submitBtn = null;
    for (let i = 0; i < 3; i++) {
      submitBtn = document.querySelector('button[aria-label*="Submit" i]')
        || document.querySelector('button[aria-label*="Post" i]')
        || document.querySelector('[data-test-id="comment-submit"]')
        || Array.from(document.querySelectorAll('button')).find(b => {
          const t = b.textContent?.trim().toLowerCase();
          return t === 'done' || t === 'submit' || t === 'post' || t === 'save';
        });
      if (submitBtn) break;
      await sleep(1000);
    }

    if (!submitBtn) return { success: false, error: 'Submit button not found' };
    submitBtn.click();
    await sleep(4000);

    // Verify: check if comment text appears on page or comment box is now empty
    const snippet = text.slice(0, 25);
    const textFound = document.body.innerText.includes(snippet);
    const boxAfter = commentBox.tagName === 'TEXTAREA' ? commentBox.value.trim() === '' : (commentBox.textContent?.trim() === '');
    const posted = textFound || boxAfter;
    console.log('[GM Pinterest] Verify:', { textFound, boxAfter, posted });
    return { success: posted, verified: posted, error: posted ? undefined : 'Comment not confirmed on page' };
  }

  async function likePin() {
    await sleep(2000);
    const heartBtn = document.querySelector('button[aria-label*="react" i]')
      || document.querySelector('button[aria-label*="like" i]');
    if (!heartBtn) return { success: false, error: 'Like button not found' };
    if (heartBtn.getAttribute('aria-pressed') === 'true') return { success: true, alreadyLiked: true };
    heartBtn.click();
    await sleep(2000);
    return { success: heartBtn.getAttribute('aria-pressed') === 'true' };
  }

  // ── Scraping ────────────────────────────────────────────────────────────

  async function scrapePosts(keywords) {
    await sleep(2000);
    const posts = [];
    const seen = new Set();

    const pins = document.querySelectorAll('[data-test-id="pin"], [data-test-id="pinWrapper"], div[data-grid-item]');
    pins.forEach(pin => {
      try {
        const linkEl = pin.querySelector('a[href*="/pin/"]');
        const url = linkEl?.href;
        if (!url || seen.has(url)) return;
        const content = pin.querySelector('img')?.alt?.trim()
          || pin.querySelector('[title]')?.getAttribute('title')?.trim()
          || pin.textContent?.trim()?.slice(0, 300) || '';
        if (!content || content.length < 5) return;
        if (keywords.length > 0 && !keywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()))) return;
        seen.add(url.split('?')[0]);
        posts.push({ url: url.split('?')[0], content, author: 'Unknown', platform: 'pinterest' });
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
