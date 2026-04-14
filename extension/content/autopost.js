/**
 * GetMention — Auto-post from Dashboard Approve
 * Detects gm_task in URL hash.
 * Gets task from background, then relays EXECUTE_TASK to platform content script on this same tab.
 */

(() => {
  let taskId = null;
  const hashMatch = window.location.hash.match(/gm_task=([a-f0-9]+)/i);
  const queryMatch = new URLSearchParams(window.location.search).get('gm_task');
  taskId = hashMatch?.[1] || queryMatch;
  if (!taskId) return;

  console.log('[GM AutoPost] Task:', taskId);
  history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]gm_task=[^&]+/, ''));

  showBanner('Loading...');

  // Wait for page to fully render before doing anything
  setTimeout(() => executeApprovedTask(taskId), 8000);

  async function executeApprovedTask(id) {
    try {
      // Ask background to fetch task details (content scripts can't make cross-origin requests)
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'EXECUTE_DASHBOARD_TASK', taskId: id }, (res) => {
          resolve(res || { started: false, error: 'No response from background' });
        });
      });

      if (!response.started || !response.task) {
        showBanner('Task not found: ' + (response.error || ''), 'error');
        setTimeout(() => closeMyTab(), 4000);
        return;
      }

      const task = response.task;
      console.log('[GM AutoPost] Got task:', task.platform, task.action);
      showBanner('Posting comment...');

      // Wait a bit more for the page to be interactive
      await sleep(3000);

      // Send EXECUTE_TASK to platform content script via background relay.
      // Timeout is platform-aware — YouTube's ad + watch + post flow needs
      // the full ~150s window, others finish well under 90s.
      const platformTimeoutMs = task.platform === 'youtube' ? 230000 : 90000;
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ success: false, error: `Timeout — no response in ${platformTimeoutMs/1000}s (${task.platform})` }), platformTimeoutMs);

        chrome.runtime.sendMessage({
          type: 'RELAY_EXECUTE_TASK',
          action: task.action || 'comment',
          text: task.text || '',
          platform: task.platform,
        }, (res) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { success: false, error: 'Empty response' });
        });
      });

      console.log('[GM AutoPost] Result:', JSON.stringify(result));

      // Report to server via background. Prefer the specific post URL the
      // content script captured (Facebook post permalink, Quora verified
      // URL, Reddit post URL after any redirect) over the task URL — which
      // for FB is often the group URL, not the specific post.
      chrome.runtime.sendMessage({
        type: 'REPORT_TASK_RESULT',
        taskId: task.id,
        success: result.success,
        error: result.error,
        platform: task.platform,
        url: result.postUrl || task.url,
        postUrl: result.postUrl || null,
        verifyMethod: result.verifyMethod || null,
      });

      if (result.success) {
        showBanner('Comment posted!', 'success');
      } else {
        showBanner('Failed: ' + (result.error || 'Unknown'), 'error');
      }
      setTimeout(() => closeMyTab(), 4000);

    } catch (err) {
      console.error('[GM AutoPost] Error:', err);
      showBanner('Error: ' + err.message, 'error');
      setTimeout(() => closeMyTab(), 5000);
    }
  }

  // Ask the background script to close ONLY this tab.
  // Never use window.close() — if this tab happens to be the only tab in
  // its window, window.close() shuts the whole window (and Chrome itself
  // if it's the last window). chrome.tabs.remove() only removes the tab.
  function closeMyTab() {
    try {
      chrome.runtime.sendMessage({ type: 'CLOSE_MY_TAB' }, () => {});
    } catch (e) {
      console.warn('[GM AutoPost] CLOSE_MY_TAB failed:', e);
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function showBanner(text, type) {
    const existing = document.getElementById('gm-autopost-banner');
    if (existing) existing.remove();
    const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#1d9bf0';
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '⟳';
    const banner = document.createElement('div');
    banner.id = 'gm-autopost-banner';
    banner.style.cssText = `position:fixed;top:12px;right:12px;z-index:999999;padding:14px 20px;border-radius:12px;font-family:-apple-system,sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,0.4);background:${bg};color:#fff;display:flex;align-items:center;gap:8px;`;
    banner.innerHTML = `<span style="font-size:16px">${icon}</span> GetMention: ${text}`;
    document.body.appendChild(banner);
  }
})();
