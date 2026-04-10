/**
 * GetMention — Popup Script (Modern SaaS with onboarding flow)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const DASHBOARD_URL = 'https://ai-bot.serpbays.com';

  const onboardSection = document.getElementById('onboardSection');
  const mainSection = document.getElementById('mainSection');

  const PLATFORM_META = {
    twitter:   { label: 'Twitter / X', color: '#1d9bf0', icon: '𝕏' },
    facebook:  { label: 'Facebook',    color: '#1877f2', icon: 'f' },
    quora:     { label: 'Quora',       color: '#b92b27', icon: 'Q' },
    reddit:    { label: 'Reddit',      color: '#ff4500', icon: 'R' },
    youtube:   { label: 'YouTube',     color: '#ff0000', icon: '▶' },
    pinterest: { label: 'Pinterest',   color: '#e60023', icon: 'P' },
    skool:     { label: 'Skool',       color: '#5865f2', icon: 'S' },
  };

  // ── Check stored key → decide which screen to show ─────────────
  const { apiKey, serverUrl } = await chrome.storage.sync.get(['apiKey', 'serverUrl']);
  const SERVER = serverUrl || DASHBOARD_URL;

  if (apiKey) {
    showMain();
  } else {
    showOnboarding(1);
  }

  // ── Version label ─────────────────────────────────────────────
  try {
    const mf = chrome.runtime.getManifest();
    const vEl = document.getElementById('versionLabel');
    if (vEl) vEl.textContent = 'v' + mf.version;
  } catch {}

  // ══════════════════════════════════════════════════════════════
  //  ONBOARDING FLOW
  // ══════════════════════════════════════════════════════════════

  function showOnboarding(stepNum) {
    onboardSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    goToStep(stepNum || 1);
  }

  function goToStep(n) {
    // Update dots
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById('dot' + i);
      dot.className = 'step-dot' + (i === n ? ' active' : (i < n ? ' done' : ''));
    }
    // Show/hide steps
    for (let i = 1; i <= 3; i++) {
      const step = document.getElementById('step' + i);
      step.className = 'step' + (i === n ? ' active' : '');
    }
  }

  // Step 1 → Step 2
  document.getElementById('step1Next').addEventListener('click', () => goToStep(2));

  // Step 2: Open signup
  document.getElementById('openSignup').addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL + '/signup' });
  });

  // Step 2 → Step 3
  document.getElementById('step2Next').addEventListener('click', () => goToStep(3));

  // Step 2 ← Back
  document.getElementById('step2Back').addEventListener('click', () => goToStep(1));

  // Step 3 ← Back
  document.getElementById('step3Back').addEventListener('click', () => goToStep(2));

  // Step 3: Paste button
  document.getElementById('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById('apiKeyInput').value = text.trim();
    } catch {
      // Clipboard read may be denied — user can paste manually
    }
  });

  // Step 3: Connect
  document.getElementById('connectBtn').addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    const msgEl = document.getElementById('connectMsg');
    const btn = document.getElementById('connectBtn');
    if (!key) { showMsg(msgEl, 'Please paste your API key', 'error'); return; }
    if (!key.startsWith('gm_')) { showMsg(msgEl, 'API key should start with "gm_"', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:gm-spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Connecting...';

    try {
      const res = await fetch(`${SERVER}/api/extension/ping`, {
        headers: { 'X-Extension-Key': key },
      });
      if (!res.ok) throw new Error('Invalid API key — check that you copied it from Dashboard → Settings');
      const data = await res.json();
      await chrome.storage.sync.set({ apiKey: key, serverUrl: SERVER, autoPost: true });
      showMsg(msgEl, 'Connected to ' + (data.companyName || 'your account') + '!', 'success');
      setTimeout(() => showMain(), 800);
    } catch (err) {
      showMsg(msgEl, err.message || 'Connection failed', 'error');
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Connect';
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  MAIN SCREEN
  // ══════════════════════════════════════════════════════════════

  async function showMain() {
    onboardSection.classList.add('hidden');
    mainSection.classList.remove('hidden');

    // Dashboard link
    document.getElementById('dashboardLink').onclick = (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: SERVER + '/dashboard' });
    };

    // Auto-post toggle
    const { autoPost } = await chrome.storage.sync.get('autoPost');
    updateAutoUI(autoPost !== false);

    document.getElementById('autoPostBtn').addEventListener('click', async () => {
      const cur = (await chrome.storage.sync.get('autoPost')).autoPost;
      const next = cur === false;
      await chrome.storage.sync.set({ autoPost: next });
      updateAutoUI(next);
    });

    await loadAll();
    setInterval(loadAll, 30000);
  }

  function updateAutoUI(on) {
    const btn = document.getElementById('autoPostBtn');
    const lbl = document.getElementById('autoPostLabel');
    btn.className = 'ctrl-toggle ' + (on ? 'on' : 'off');
    lbl.textContent = on ? 'Auto-posting ON' : 'Auto-posting OFF';
  }

  // ── Load all data ─────────────────────────────────────────────

  async function loadAll() {
    try {
      const { apiKey: key } = await chrome.storage.sync.get('apiKey');
      if (!key) return;

      const headers = { 'X-Extension-Key': key };
      const [settingsRes, pingRes] = await Promise.all([
        fetch(`${SERVER}/api/extension/settings`, { headers }),
        fetch(`${SERVER}/api/extension/ping`, { headers }),
      ]);

      const settings = await settingsRes.json();
      const ping = await pingRes.json();

      // Company name
      document.getElementById('companyName').textContent = settings.companyName || 'No company set';

      // Platforms
      const extPlatforms = settings.extensionPlatforms || ping.extensionPlatforms || [];
      const posted = settings.platformPostedToday || ping.postedByPlatform || {};
      const liked = settings.platformLikedToday || {};
      const limits = settings.platformLimits || {};

      let totalC = 0, totalL = 0;
      for (const p of extPlatforms) {
        totalC += (posted[p] || 0);
        totalL += (liked[p] || 0);
      }
      document.getElementById('totalComments').textContent = totalC;
      document.getElementById('totalLikes').textContent = totalL;

      // Brand mention cap
      const brandUsed = settings.brandMentionsToday || 0;
      const brandMax = settings.maxDailyBrandMentions || 2;
      const brandEl = document.getElementById('brandCount');
      brandEl.textContent = `${brandUsed}/${brandMax}`;
      brandEl.style.color = brandUsed >= brandMax ? '#22c55e' : '#a78bfa';

      // Next timer
      const { dailyCounters } = await chrome.storage.local.get('dailyCounters');
      const today = new Date().toISOString().slice(0, 10);
      const counters = (dailyCounters && dailyCounters.date === today) ? dailyCounters : {};
      if (counters.lastCommentAt) {
        const gap = 10 * 60 * 1000 + Math.random() * 5 * 60 * 1000;
        const remain = (counters.lastCommentAt + gap) - Date.now();
        if (remain > 0) {
          document.getElementById('nextTimer').textContent = Math.ceil(remain / 60000) + 'm';
          document.getElementById('nextTimer').className = 'stat-val amber';
        } else {
          document.getElementById('nextTimer').textContent = 'Now';
          document.getElementById('nextTimer').className = 'stat-val green';
        }
      } else {
        document.getElementById('nextTimer').textContent = 'Now';
        document.getElementById('nextTimer').className = 'stat-val green';
      }

      // Platform rows
      const listEl = document.getElementById('platformList');
      if (extPlatforms.length === 0) {
        listEl.innerHTML = '<div class="muted" style="text-align:center;padding:12px 0;">No platforms enabled — go to Dashboard → Settings</div>';
      } else {
        listEl.innerHTML = extPlatforms.map(pid => {
          const m = PLATFORM_META[pid] || { label: pid, color: '#888', icon: '?' };
          const c = posted[pid] || 0;
          const lim = limits[pid] || 10;
          const lk = liked[pid] || 0;
          const pct = Math.min((c / lim) * 100, 100);
          return `<div class="plat">
            <div class="plat-icon" style="background:${m.color}15;color:${m.color}">${m.icon}</div>
            <div class="plat-name">${m.label}</div>
            <div class="plat-count">${c}/${lim}</div>
            <div class="plat-bar-bg"><div class="plat-bar" style="width:${pct}%;background:${m.color}"></div></div>
            <div class="plat-likes">${lk} ♥</div>
          </div>`;
        }).join('');
      }

      // Errors
      document.getElementById('totalErrors').textContent = '0';

      // Activity
      loadActivity();

    } catch (err) {
      console.error('Load error:', err);
      document.getElementById('companyName').textContent = 'Error loading';
    }
  }

  async function loadActivity() {
    const listEl = document.getElementById('activityList');
    try {
      const { apiKey: key } = await chrome.storage.sync.get('apiKey');
      const res = await fetch(`${SERVER}/api/logs?limit=8`, {
        headers: { 'X-Extension-Key': key },
      });

      if (!res.ok) {
        listEl.innerHTML = '<div class="muted" style="text-align:center;padding:8px 0;">View activity in Dashboard → Logs</div>';
        return;
      }

      const data = await res.json();
      const logs = (data.logs || []).filter(l => l.message?.includes('[Extension]')).slice(0, 5);

      if (logs.length === 0) {
        listEl.innerHTML = '<div class="muted" style="text-align:center;padding:8px 0;">No recent activity</div>';
        return;
      }

      listEl.innerHTML = logs.map(l => {
        const dot = l.level === 'success' ? 'ok' : l.level === 'error' ? 'err' : 'inf';
        const msg = (l.message || '').replace('[Extension] ', '').slice(0, 65);
        const time = timeAgo(l.timestamp || l.createdAt);
        const pm = PLATFORM_META[l.platform] || {};
        return `<div class="act">
          <div class="act-dot ${dot}"></div>
          <div class="act-text"><span style="color:${pm.color || '#888'};font-weight:600;">${l.platform || ''}</span> ${msg}</div>
          <div class="act-time">${time}</div>
        </div>`;
      }).join('');
    } catch {
      listEl.innerHTML = '<div class="muted" style="text-align:center;padding:8px 0;">View activity in Dashboard → Logs</div>';
    }
  }

  // ── Scrape Now ────────────────────────────────────────────────

  document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('scrapeBtn');
    btn.textContent = '...'; btn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_SCRAPE' });
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = 'Scrape Now'; btn.disabled = false; }, 2000);
      setTimeout(loadAll, 3000);
    } catch {
      btn.textContent = '✗';
      setTimeout(() => { btn.textContent = 'Scrape Now'; btn.disabled = false; }, 2000);
    }
  });

  // ── Refresh ───────────────────────────────────────────────────

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.textContent = '...'; btn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_POLL' });
      await loadAll();
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = 'Refresh'; btn.disabled = false; }, 1000);
    } catch {
      btn.textContent = '✗';
      setTimeout(() => { btn.textContent = 'Refresh'; btn.disabled = false; }, 1500);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────

  document.getElementById('disconnectBtn').addEventListener('click', async () => {
    await chrome.storage.sync.remove(['apiKey', 'serverUrl', 'autoPost']);
    await chrome.storage.local.remove(['reviewQueue', 'dailyCounters', 'scrapeIndex', 'lastBootedVersion']);
    chrome.action.setBadgeText({ text: '' });
    showOnboarding(1);
  });

  // ── Helpers ───────────────────────────────────────────────────

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = `msg ${type}`;
    el.classList.remove('hidden');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }
});
