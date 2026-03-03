// Bot-Serp Dashboard — adapted from hello dashboard
// API base is /api (Next.js routes)
const API = '/api';
let pollInterval = null;
let _cronAutoPaused = false;
let activeActivityTab = 'facebook';
let activityCache = {};
let _activeAccountsCache = {};

// Posted Comments History state
let postedTimeFilter = 'today';
let postedPlatform = null;

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.style.display = theme === 'light' ? '' : 'none';
    moon.style.display = theme === 'light' ? 'none' : '';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dashboard_theme', next);
  applyTheme(next);
}

applyTheme(localStorage.getItem('dashboard_theme') || 'dark');

// --- Collapsible sections ---

function toggleSection(headerEl) {
  const section = headerEl.closest('.section');
  if (!section) return;
  const isCollapsed = section.classList.toggle('section-collapsed');
  const key = getSectionKey(section);
  if (key) {
    const states = JSON.parse(localStorage.getItem('section_states') || '{}');
    states[key] = isCollapsed;
    localStorage.setItem('section_states', JSON.stringify(states));
  }
}

function getSectionKey(section) {
  const classes = section.className;
  if (classes.includes('pa-section')) return 'pa';
  if (classes.includes('cron-status-section')) return 'cron-status';
  if (classes.includes('cron-history-section')) return 'cron-history';
  if (classes.includes('unified-activity-section')) return 'activity';
  if (classes.includes('engagement-section')) return 'engagement';
  if (classes.includes('posted-comments-section')) return 'posted';
  if (classes.includes('logs-section')) return 'logs';
  if (classes.includes('config-section')) return 'config';
  return null;
}

function restoreSectionStates() {
  const states = JSON.parse(localStorage.getItem('section_states') || '{}');
  const sectionMap = {
    'pa': '.pa-section',
    'cron-status': '.cron-status-section',
    'cron-history': '.cron-history-section',
    'activity': '.unified-activity-section',
    'engagement': '.engagement-section',
    'posted': '.posted-comments-section',
    'logs': '.logs-section',
    'config': '.config-section',
  };
  for (const [key, collapsed] of Object.entries(states)) {
    if (collapsed && sectionMap[key]) {
      const section = document.querySelector(sectionMap[key]);
      if (section) section.classList.add('section-collapsed');
    }
  }
}

// --- API ---

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  return res.json();
}

// --- Run Bot ---

async function runBot() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';
  try {
    await api('/run-pipeline', { method: 'POST' });
    await refreshStats();
    setTimeout(refreshUnifiedActivity, 5000);
  } catch (err) {
    console.error('Run bot error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Bot';
  }
}

async function resumeBot() {
  try {
    await api('/run-pipeline', { method: 'POST' });
    await refreshStats();
  } catch (err) {
    console.error('Resume error:', err);
  }
}

// --- Stats / Config ---

async function refreshStats() {
  try {
    const data = await api('/stats');
    const banner = document.getElementById('alert-banner');
    if (banner) banner.classList.add('hidden');
    renderConfig(data);
  } catch (err) {
    console.error('Stats refresh error:', err);
  }
}

function renderConfig(data) {
  const el = document.getElementById('config-info');
  if (!el) return;

  const byStatus = data.byStatus || {};
  const byPlatform = data.byPlatform || {};
  const posted = data.postedByPlatform || {};

  const items = [
    ['Total Posts', data.total ?? '—'],
    ['New', byStatus.new ?? 0],
    ['Evaluating', byStatus.evaluating ?? 0],
    ['Evaluated', byStatus.evaluated ?? 0],
    ['Posted (all time)', byStatus.posted ?? 0],
    ['Rejected', byStatus.rejected ?? 0],
    ['Facebook', `${byPlatform.facebook ?? 0} (${posted.facebook ?? 0} posted)`],
    ['Twitter', `${byPlatform.twitter ?? 0} (${posted.twitter ?? 0} posted)`],
    ['Reddit', `${byPlatform.reddit ?? 0} (${posted.reddit ?? 0} posted)`],
    ['Quora', `${byPlatform.quora ?? 0} (${posted.quora ?? 0} posted)`],
    ['Pinterest', `${byPlatform.pinterest ?? 0} (${posted.pinterest ?? 0} posted)`],
    ['YouTube', `${byPlatform.youtube ?? 0} (${posted.youtube ?? 0} posted)`],
  ];

  el.innerHTML = items.map(([k, v]) => `
    <div class="config-item">
      <span class="config-key">${k}</span>
      <span class="config-value">${v}</span>
    </div>
  `).join('');
}

// --- Logs ---

let _logLevel = null;
let _logPlatform = null;

async function refreshLogs(level = _logLevel, platform = _logPlatform) {
  try {
    const qs = new URLSearchParams({ limit: '500' });
    if (level) qs.set('level', level);
    if (platform) qs.set('platform', platform);
    const data = await api(`/logs?${qs}`);
    renderLogs(data.logs || []);
  } catch (err) {
    console.error('Logs refresh error:', err);
  }
}

function renderLogs(logs) {
  const feed = document.getElementById('log-feed');
  if (!logs.length) {
    feed.innerHTML = '<div class="empty-state">No logs found.</div>';
    return;
  }
  const platformIcons = {
    facebook: '<span class="fb-icon" style="width:14px;height:14px;font-size:9px;margin-right:3px;flex-shrink:0;">f</span>',
    twitter:  '<span class="tw-icon" style="width:14px;height:14px;font-size:9px;margin-right:3px;flex-shrink:0;">\u{1D54F}</span>',
    reddit:   '<span class="rd-icon" style="width:14px;height:14px;font-size:8px;margin-right:3px;flex-shrink:0;">r/</span>',
    quora:    '<span style="width:14px;height:14px;font-size:8px;font-weight:800;background:#B92B27;color:#fff;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;margin-right:3px;flex-shrink:0;">Q</span>',
    pinterest:'<span class="pi-icon" style="width:14px;height:14px;font-size:8px;margin-right:3px;flex-shrink:0;">P</span>',
    youtube:  '<span class="yt-icon" style="width:14px;height:14px;font-size:8px;margin-right:3px;flex-shrink:0;">\u25B6</span>',
  };
  // Don't auto-scroll if user has scrolled up
  const feed2 = document.getElementById('log-feed');
  const atBottom = !feed2 || (feed2.scrollHeight - feed2.scrollTop - feed2.clientHeight < 80);

  feed.innerHTML = logs.map(l => {
    const time = new Date(l.timestamp).toLocaleTimeString();
    const icon = l.platform ? (platformIcons[l.platform] || '') : '';
    return `
      <div class="log-item log-item-${l.level}">
        <span class="log-dot log-dot-${l.level}"></span>
        <span class="log-time">${time}</span>
        ${icon}
        <span class="log-level log-level-${l.level}">${l.level}</span>
        <span class="log-message">${escapeHtml(l.message)}</span>
      </div>
    `;
  }).join('');

  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function filterLogs(level, platform, btn) {
  _logLevel = level;
  _logPlatform = platform;
  document.querySelectorAll('.log-filters .btn-sm').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  refreshLogs(level, platform);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

// --- Platform Activity (unified adapter using /api/posts) ---

async function refreshUnifiedActivity() {
  const platform = activeActivityTab;
  try {
    const [postsData, statsData] = await Promise.all([
      api(`/posts?platform=${platform}&limit=50`),
      api('/stats'),
    ]);

    const posts = postsData.posts || [];
    const acct = _activeAccountsCache[platform];

    // Count by status from fetched posts
    const byPlatformStatus = {};
    for (const p of posts) {
      byPlatformStatus[p.status] = (byPlatformStatus[p.status] || 0) + 1;
    }

    // Posted today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const postedToday = posts.filter(p =>
      p.status === 'posted' && p.postedAt && new Date(p.postedAt) >= todayStart
    ).length;

    const platformTotal = (statsData.byPlatform || {})[platform] ?? posts.length;
    const postedTotal = (statsData.postedByPlatform || {})[platform] ?? posts.filter(p => p.status === 'posted').length;

    const totalKeyMap = { facebook: 'fbTotal', twitter: 'twTotal', reddit: 'rdTotal', quora: 'qaTotal', pinterest: 'piTotal', youtube: 'ytTotal' };

    const data = {
      posts,
      configured: !!acct,
      loggedIn: !!acct,
      displayName: acct?.displayName || acct?.name || '',
      username: acct?.username || '',
      keywords: [],
      postedToday,
      dailyLimit: null,
      postedTotal,
      byPlatformStatus,
      error: null,
    };
    if (totalKeyMap[platform]) data[totalKeyMap[platform]] = platformTotal;

    activityCache[platform] = data;
    renderUnifiedActivity(data, platform);
  } catch (err) {
    console.error('Unified activity error:', err);
  }
}

async function prefetchAllActivity() {
  const platforms = ['facebook', 'twitter', 'reddit', 'quora', 'pinterest', 'youtube'];
  try {
    const [allPostsData, statsData] = await Promise.all([
      api('/posts?limit=200'),
      api('/stats'),
    ]);
    const allPosts = allPostsData.posts || [];
    const totalKeyMap = { facebook: 'fbTotal', twitter: 'twTotal', reddit: 'rdTotal', quora: 'qaTotal', pinterest: 'piTotal', youtube: 'ytTotal' };

    for (const platform of platforms) {
      const posts = allPosts.filter(p => p.platform === platform);
      const acct = _activeAccountsCache[platform];
      const byPlatformStatus = {};
      for (const p of posts) {
        byPlatformStatus[p.status] = (byPlatformStatus[p.status] || 0) + 1;
      }
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const postedToday = posts.filter(p => p.status === 'posted' && p.postedAt && new Date(p.postedAt) >= todayStart).length;
      const platformTotal = (statsData.byPlatform || {})[platform] ?? posts.length;
      const postedTotal = (statsData.postedByPlatform || {})[platform] ?? posts.filter(p => p.status === 'posted').length;

      const data = {
        posts, configured: !!acct, loggedIn: !!acct,
        displayName: acct?.displayName || acct?.name || '',
        username: acct?.username || '',
        keywords: [], postedToday, dailyLimit: null, postedTotal,
        byPlatformStatus, error: null,
      };
      if (totalKeyMap[platform]) data[totalKeyMap[platform]] = platformTotal;
      activityCache[platform] = data;
    }

    if (activityCache[activeActivityTab]) {
      renderUnifiedActivity(activityCache[activeActivityTab], activeActivityTab);
    }
  } catch (err) {
    console.error('Prefetch activity error:', err);
    refreshUnifiedActivity();
  }
}

// --- Activity Tab ---

function setActivityTab(platform, btn) {
  activeActivityTab = platform;
  document.querySelectorAll('#unified-activity-card .platform-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const card = document.getElementById('unified-activity-card');
  card.className = 'section unified-activity-section platform-accent-' + platform;
  if (activityCache[platform]) {
    renderUnifiedActivity(activityCache[platform], platform);
  }
  refreshUnifiedActivity();
}

function renderUnifiedActivity(data, platform) {
  const sessionBadge = document.getElementById('ua-session-badge');
  const dailyInfo = document.getElementById('ua-daily-info');
  const feed = document.getElementById('ua-posts-feed');

  if (data.error) {
    sessionBadge.textContent = 'Error loading data';
    sessionBadge.className = 'badge badge-paused';
    feed.innerHTML = '<div class="empty-state">Could not load activity data.</div>';
    return;
  }

  const platformLabels = { facebook: 'FB', twitter: '\u{1D54F}', reddit: 'r/', quora: 'Q', pinterest: 'P', youtube: '\u25B6' };
  const label = platformLabels[platform] || platform;

  if (data.configured || data.loggedIn) {
    const dn = data.displayName || data.username || '';
    sessionBadge.textContent = dn ? `${label} \u2713 ${dn}` : `${label} \u2713 Connected`;
    sessionBadge.className = 'badge badge-live';
  } else {
    sessionBadge.textContent = `${label} \u2717 Not Connected`;
    sessionBadge.className = 'badge badge-paused';
  }

  dailyInfo.textContent = `${data.postedToday ?? 0} posted today`;

  // Mini stats
  const platStatus = data.byPlatformStatus || {};
  const totalKeyMap = { facebook: 'fbTotal', twitter: 'twTotal', reddit: 'rdTotal', quora: 'qaTotal', pinterest: 'piTotal', youtube: 'ytTotal' };
  const totalKey = totalKeyMap[platform] || 'postedTotal';
  document.getElementById('ua-total').textContent = data[totalKey] ?? '—';
  document.getElementById('ua-evaluated').textContent = (platStatus.evaluated ?? 0) + (platStatus.approved ?? 0);
  document.getElementById('ua-posted').textContent = data.postedTotal ?? '—';

  // Update posted stat accent
  document.querySelector('.ua-stat-posted').className = 'ua-stat ua-stat-posted ua-posted-' + platform;

  // Extra stat
  const extraEl = document.getElementById('ua-extra');
  const extraLbl = document.getElementById('ua-extra-lbl');
  extraEl.textContent = platStatus.new ?? '—';
  extraLbl.textContent = 'New';

  // Keywords row
  const kwRow = document.getElementById('ua-keywords-row');
  kwRow.innerHTML = '';

  // Posts feed — only posted
  const posts = (data.posts || []).filter(p => p.status === 'posted');
  renderUnifiedPosts(posts, platform);
}

function renderUnifiedPosts(posts, platform) {
  const feed = document.getElementById('ua-posts-feed');

  if (!posts.length) {
    feed.innerHTML = '<div class="empty-state">No posted comments for this platform yet.</div>';
    return;
  }

  const prefixMap = { facebook: 'fb', twitter: 'tw', reddit: 'rd', quora: 'qa', pinterest: 'pi', youtube: 'yt' };
  const prefix = prefixMap[platform] || 'fb';
  const replyLabel = platform === 'twitter' ? 'Reply posted' : platform === 'quora' ? 'Answer posted' : 'Comment posted';

  feed.innerHTML = posts.map(p => {
    const score = p.aiRelevanceScore != null ? `${p.aiRelevanceScore}` : null;
    const reply = p.editedReply || p.aiReply || '';
    const content = (p.content || '').slice(0, 140);
    const keywords = p.keywordsMatched?.length ? p.keywordsMatched.join(', ') : '';
    const postedAt = p.postedAt ? new Date(p.postedAt).toLocaleString() : '';

    return `
      <div class="${prefix}-post-item status-posted">
        <div class="${prefix}-post-header">
          <span class="${prefix}-post-status status-posted">posted</span>
          ${score != null ? `<span class="fb-score-pill">AI ${score}</span>` : ''}
          ${keywords ? `<span class="activity-meta">\u{1F511} ${escapeHtml(keywords)}</span>` : ''}
          ${p.author && p.author !== 'Unknown' ? `<span class="activity-meta">by ${escapeHtml(p.author)}</span>` : ''}
          ${p.url ? `<a class="${prefix}-post-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">\u{1F517} View Post</a>` : ''}
        </div>
        <div class="${prefix}-post-content" title="${escapeHtml(p.content || '')}">${escapeHtml(content)}${(p.content || '').length > 140 ? '…' : ''}</div>
        ${reply ? `
          <div class="${prefix}-post-reply">
            <span class="${prefix}-reply-label">${replyLabel}:</span> ${escapeHtml(reply.slice(0, 200))}${reply.length > 200 ? '…' : ''}
          </div>` : ''}
        ${postedAt ? `<div class="${prefix}-post-meta">Posted at ${postedAt}</div>` : ''}
      </div>
    `;
  }).join('');
}

// --- Run Cron (unified) ---

function runActiveCron() {
  runPlatformCron(activeActivityTab);
}

async function runPlatformCron(platform) {
  const btn = document.getElementById('ua-cron-btn');
  btn.disabled = true;
  btn.textContent = 'Starting...';

  try {
    const result = await api('/run-cron', { method: 'POST', body: JSON.stringify({ platform }) });
    if (result.started) {
      btn.textContent = 'Running...';
      showToast('info', 'Cron Started', `${platform} cron started`, platform);
      const poll = setInterval(async () => {
        try {
          const status = await api('/cron-status');
          const cronInfo = status.crons?.[platform];
          if (!cronInfo?.running) {
            clearInterval(poll);
            btn.disabled = false;
            btn.textContent = 'Run Cron';
            await refreshUnifiedActivity();
            await refreshCronStatus();
            await refreshCronLog();
          }
        } catch { clearInterval(poll); btn.disabled = false; btn.textContent = 'Run Cron'; }
      }, 5000);
    } else {
      btn.textContent = result.message || 'Failed';
      showToast('warning', 'Cron', result.message || 'Could not start cron', platform);
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Run Cron'; }, 3000);
    }
  } catch (err) {
    btn.textContent = 'Error';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Run Cron'; }, 3000);
  }
}

// --- Toast Notifications ---

function showToast(type, title, message, platform = null) {
  const container = document.getElementById('toast-container');
  const id = 'toast-' + Date.now();

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠', captcha: '⚠️' };
  const icon = icons[type] || 'ℹ';

  const platformIcons = {
    facebook:  '<span class="toast-platform fb-icon" style="width:16px;height:16px;font-size:10px;margin-right:4px;">f</span>',
    twitter:   '<span class="toast-platform tw-icon" style="width:16px;height:16px;font-size:10px;margin-right:4px;">𝕏</span>',
    reddit:    '<span class="toast-platform rd-icon" style="width:16px;height:16px;font-size:10px;margin-right:4px;">r/</span>',
    quora:     '<span class="toast-platform" style="width:16px;height:16px;font-size:10px;margin-right:4px;background:#B92B27;color:#fff;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;">Q</span>',
    pinterest: '<span class="toast-platform pi-icon" style="width:16px;height:16px;font-size:10px;margin-right:4px;">P</span>',
    youtube:   '<span class="toast-platform yt-icon" style="width:16px;height:16px;font-size:9px;margin-right:4px;">\u25B6</span>',
  };
  const platformIcon = platformIcons[platform] || '';

  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `toast toast-${type}${type === 'captcha' ? ' toast-captcha' : ''}`;
  toast.innerHTML = `
    <div class="toast-header">
      <span class="toast-icon">${icon}</span>
      ${platformIcon}
      <span class="toast-title">${escapeHtml(title)}</span>
      <button class="toast-close" onclick="document.getElementById('${id}')?.remove()">×</button>
    </div>
    <div class="toast-body">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);
  const delay = (type === 'captcha' || type === 'error') ? 15000 : 7000;
  setTimeout(() => toast.remove(), delay);
}

// --- SSE — real-time notifications ---

function initSSE() {
  const es = new EventSource('/api/notifications');

  es.onmessage = (e) => {
    if (!e.data || e.data.startsWith(':')) return;
    try {
      const n = JSON.parse(e.data);
      showToast(n.type, n.title, n.message, n.platform);

      if (n.title && n.title.includes('Cron')) {
        refreshCronStatus();
        refreshCronLog();
      }
      if (n.type === 'success' && n.title && n.title.includes('Cron Done')) {
        setTimeout(() => {
          refreshUnifiedActivity();
          refreshPostedComments();
          refreshStats();
          refreshEngagementMonitor();
          refreshCronLog();
          refreshLogs();
        }, 2000);
      }
    } catch {}
  };

  es.onerror = () => {
    es.close();
    setTimeout(initSSE, 5000);
  };
}

// --- Platform Accounts ---

let paActiveTab = 'twitter';
let paStatuses = {};
let paCookieInputs = {};
let paVerifying = {};
let paErrors = {};
let paChanging = {};
let paLoading = true;

const paPlatforms = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'];

// Map platforms to their cookie endpoints (only these 4 have endpoints)
const cookieEndpoints = {
  twitter: '/set-twitter-cookies',
  facebook: '/set-fb-cookies',
  reddit: '/set-reddit-cookies',
  quora: '/set-quora-cookies',
};

const paCookiePlaceholders = {
  facebook: 'c_user=123456789; xs=abc:def:0; datr=xyz; sb=abc; fr=def...',
  twitter: 'auth_token=abc123; ct0=xyz789; twid=u%3D1234; gt=567...',
  reddit: 'reddit_session=abc123; token_v2=xyz789; csv=2; edgebucket=...',
  quora: 'm-b=abc123; m-s=xyz789; m-b_lax=abc123; m-b_strict=abc123...',
  pinterest: '_pinterest_sess=abc123; _auth=1; _routing_id=xyz...',
  youtube: 'HSID=abc; SSID=xyz; APISID=abc; SAPISID=xyz; SID=abc...',
};

const paCookieHints = {
  facebook: 'Paste the <strong>Cookie</strong> header from DevTools &rarr; Network &rarr; any facebook.com request.<br>Must include: <code>c_user</code>, <code>xs</code>, <code>datr</code>',
  twitter: 'Paste the <strong>Cookie</strong> header from DevTools &rarr; Network &rarr; any x.com request.<br>Must include: <code>auth_token</code>, <code>ct0</code>',
  reddit: 'Paste the <strong>Cookie</strong> header from DevTools &rarr; Network &rarr; any reddit.com request.<br>Must include: <code>reddit_session</code>, <code>token_v2</code>',
  quora: 'Paste the <strong>Cookie</strong> header from DevTools &rarr; Network &rarr; any quora.com request.<br>Must include: <code>m-b</code>, <code>m-s</code>',
  pinterest: 'Pinterest cookie login is managed via the Settings panel in the main app.<br>Go to <a href="/" style="color:var(--accent)">Settings</a> to configure Pinterest.',
  youtube: 'YouTube cookie login is managed via the Settings panel in the main app.<br>Go to <a href="/" style="color:var(--accent)">Settings</a> to configure YouTube.',
};

async function initPlatformAccounts() {
  paLoading = true;
  renderPaContent();
  try {
    const data = await api('/active-accounts');
    const accounts = data.accounts || {};
    for (const p of paPlatforms) {
      const acct = accounts[p];
      if (acct) {
        paStatuses[p] = { connected: true, accountId: acct.accountId || '', username: acct.username || '', name: acct.name || '', displayName: acct.displayName || acct.name || '', ts: acct.ts || '' };
      } else {
        paStatuses[p] = { connected: false };
      }
    }
    _activeAccountsCache = accounts;
  } catch {
    for (const p of paPlatforms) paStatuses[p] = { connected: false };
  }
  paLoading = false;
  updatePaDots();
  renderPaContent();
}

function setPaTab(platform, btn) {
  const textarea = document.getElementById('pa-cookie-input');
  if (textarea) paCookieInputs[paActiveTab] = textarea.value;
  paActiveTab = platform;
  document.querySelectorAll('.pa-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderPaContent();
}

function updatePaDots() {
  for (const p of paPlatforms) {
    const dot = document.getElementById('pa-dot-' + p);
    if (!dot) continue;
    if (paStatuses[p] && paStatuses[p].connected) {
      dot.classList.add('pa-dot-connected');
    } else {
      dot.classList.remove('pa-dot-connected');
    }
  }
}

function renderPaContent() {
  const container = document.getElementById('pa-content');
  if (!container) return;
  const p = paActiveTab;

  if (paLoading) {
    container.innerHTML = '<div class="pa-loading"><div class="pa-spinner"></div> Checking account status\u2026</div>';
    return;
  }

  const status = paStatuses[p];
  const isConnected = status && status.connected;

  if (isConnected && !paChanging[p]) {
    const hasDisplayName = status.displayName && status.displayName !== status.accountId;
    const hasUsername = status.username && status.username !== status.accountId;
    const prefixMap = { twitter: '@', reddit: 'u/', facebook: '', quora: '', pinterest: '@', youtube: '@' };
    const prefix = prefixMap[p] || '';

    let detailRows = '';
    if (hasDisplayName) {
      detailRows += `<div class="pa-detail-row"><span class="pa-detail-label">Display Name</span><span class="pa-detail-value">${escapeHtml(status.displayName)}</span></div>`;
    }
    if (hasUsername) {
      detailRows += `<div class="pa-detail-row"><span class="pa-detail-label">Username</span><span class="pa-detail-value">${prefix}${escapeHtml(status.username)}</span></div>`;
    }
    const idClass = (hasDisplayName || hasUsername) ? 'pa-detail-value pa-mono pa-detail-secondary' : 'pa-detail-value pa-mono';
    detailRows += `<div class="pa-detail-row"><span class="pa-detail-label">Account ID</span><span class="${idClass}">${escapeHtml(status.accountId)}</span></div>`;
    const verifiedAt = status.ts ? new Date(status.ts).toLocaleString() : '';

    container.innerHTML = `
      <div class="pa-connected-card pa-accent-${p}">
        <div class="pa-connected-header">
          <span class="pa-connected-dot"></span>
          <span class="pa-connected-label">Connected</span>
        </div>
        <div class="pa-details">
          ${detailRows}
          ${verifiedAt ? `<div class="pa-detail-row"><span class="pa-detail-label">Verified</span><span class="pa-detail-value">${verifiedAt}</span></div>` : ''}
        </div>
        <button class="btn btn-sm pa-change-btn" onclick="paStartChange('${p}')">Change Account</button>
      </div>
    `;
  } else {
    // Show cookie form (or note for pinterest/youtube)
    const error = paErrors[p] || '';
    const verifying = paVerifying[p] || false;
    const savedInput = paCookieInputs[p] || '';
    const cancelBtn = paChanging[p] ? `<button class="btn btn-sm" onclick="paCancelChange('${p}')">Cancel</button>` : '';
    const hint = paCookieHints[p] || `Paste the <strong>Cookie</strong> header from DevTools &rarr; Network &rarr; any ${p} request.`;
    const placeholder = paCookiePlaceholders[p] || 'Paste cookies here...';
    const hasEndpoint = !!cookieEndpoints[p];

    container.innerHTML = `
      <div class="pa-form">
        <div class="cookie-hint">${hint}</div>
        ${hasEndpoint ? `
          <textarea
            id="pa-cookie-input"
            class="cookie-textarea"
            placeholder="${placeholder}"
            rows="4"
            spellcheck="false"
            ${verifying ? 'disabled' : ''}
          >${escapeHtml(savedInput)}</textarea>
          <div class="cookie-actions">
            <button class="btn btn-primary" id="pa-submit-btn" onclick="paSubmitCookies('${p}')" ${verifying ? 'disabled' : ''}>
              ${verifying ? '<span class="pa-spinner-sm"></span> Verifying\u2026' : 'Verify & Connect'}
            </button>
            ${cancelBtn}
            ${error ? `<span class="cookie-status error">${escapeHtml(error)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }
}

function paStartChange(platform) {
  paChanging[platform] = true;
  paErrors[platform] = '';
  renderPaContent();
}

function paCancelChange(platform) {
  paChanging[platform] = false;
  paErrors[platform] = '';
  paCookieInputs[platform] = '';
  renderPaContent();
}

async function paSubmitCookies(platform) {
  const endpoint = cookieEndpoints[platform];
  if (!endpoint) {
    paErrors[platform] = 'Cookie login not available for this platform yet.';
    renderPaContent();
    return;
  }

  const textarea = document.getElementById('pa-cookie-input');
  const raw = textarea ? textarea.value.trim() : '';

  if (!raw) {
    paErrors[platform] = 'Paste cookies first';
    renderPaContent();
    return;
  }

  paCookieInputs[platform] = raw;

  let cookies = raw;
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      cookies = JSON.parse(raw);
    } catch {
      paErrors[platform] = 'Invalid JSON — check your cookie format';
      renderPaContent();
      return;
    }
  }

  paVerifying[platform] = true;
  paErrors[platform] = '';
  renderPaContent();

  try {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies }),
    });
    const data = await res.json();

    if (data.error) {
      paErrors[platform] = data.error;
    } else {
      paCookieInputs[platform] = '';
      paChanging[platform] = false;
      paErrors[platform] = '';
      showToast('success', 'Connected', `${platform} account connected successfully!`, platform);
      setTimeout(async () => {
        await initPlatformAccounts();
        refreshActiveAccounts();
      }, 2000);
    }
  } catch (err) {
    paErrors[platform] = 'Request failed: ' + err.message;
  } finally {
    paVerifying[platform] = false;
    renderPaContent();
  }
}

// --- Posted Comments History ---

function setPostedFilter(filter, btn) {
  postedTimeFilter = filter;
  document.querySelectorAll('#posted-time-filters .pc-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshPostedComments();
}

function setPostedPlatform(platform, btn) {
  postedPlatform = platform;
  document.querySelectorAll('#posted-platform-filters .pc-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshPostedComments();
}

async function refreshPostedComments() {
  const feed = document.getElementById('posted-comments-feed');
  feed.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const qs = new URLSearchParams({ filter: postedTimeFilter });
    if (postedPlatform) qs.set('platform', postedPlatform);
    const data = await api(`/posted-comments?${qs}`);
    if (data.error) {
      feed.innerHTML = `<div class="empty-state">Error: ${escapeHtml(data.error)}</div>`;
      return;
    }
    const badge = document.getElementById('posted-count-badge');
    badge.textContent = data.total || '0';
    renderPostedComments(data.posts || []);
  } catch (err) {
    feed.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPostedComments(posts) {
  const feed = document.getElementById('posted-comments-feed');
  if (!posts.length) {
    const label = postedTimeFilter === 'today' ? 'today' : 'yet';
    feed.innerHTML = `<div class="empty-state">No comments posted ${label}.</div>`;
    return;
  }

  const platformMeta = {
    facebook:  { icon: '<span class="fb-icon pc-plat-icon">f</span>', cls: 'pc-facebook', replyLabel: 'Comment' },
    twitter:   { icon: '<span class="tw-icon pc-plat-icon">\u{1D54F}</span>', cls: 'pc-twitter', replyLabel: 'Reply' },
    reddit:    { icon: '<span class="rd-icon pc-plat-icon">r/</span>', cls: 'pc-reddit', replyLabel: 'Comment' },
    quora:     { icon: '<span class="pc-plat-icon" style="background:#B92B27;color:#fff;font-size:10px;font-weight:700;">Q</span>', cls: 'pc-quora', replyLabel: 'Answer' },
    pinterest: { icon: '<span class="pi-icon pc-plat-icon" style="width:18px;height:18px;font-size:10px;">P</span>', cls: 'pc-pinterest', replyLabel: 'Comment' },
    youtube:   { icon: '<span class="yt-icon pc-plat-icon" style="width:18px;height:18px;font-size:9px;">\u25B6</span>', cls: 'pc-youtube', replyLabel: 'Comment' },
  };

  feed.innerHTML = posts.map(p => {
    const meta = platformMeta[p.platform] || platformMeta.facebook;
    const reply = escapeHtml((p.editedReply || p.aiReply || '').slice(0, 300));
    const hasMore = (p.editedReply || p.aiReply || '').length > 300;
    const score = p.aiRelevanceScore != null
      ? `<span class="pc-score">AI ${p.aiRelevanceScore}</span>` : '';
    const postedAt = p.postedAt ? new Date(p.postedAt).toLocaleString() : '';
    const account = p.postedByAccount ? `<span class="pc-account">${escapeHtml(p.postedByAccount)}</span>` : '';
    const originalText = escapeHtml((p.content || '').slice(0, 160));
    const originalMore = (p.content || '').length > 160 ? '...' : '';

    return `
      <div class="pc-card ${meta.cls}">
        <div class="pc-card-header">
          <div class="pc-meta-left">
            ${meta.icon}
            ${score}
            ${account}
          </div>
          ${postedAt ? `<span class="pc-time">${postedAt}</span>` : ''}
        </div>
        <div class="pc-body">
          ${originalText ? `<div class="pc-original-text">${originalText}${originalMore}</div>` : ''}
          <div class="pc-reply-block">
            <span class="pc-reply-text">${reply}${hasMore ? '...' : ''}</span>
          </div>
          <div class="pc-actions">
            ${p.url ? `<a class="pc-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">View Post</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- Cron Run History ---

let cronLogPlatformFilter = null;

function setCronLogFilter(platform, btn) {
  cronLogPlatformFilter = platform;
  document.querySelectorAll('#cron-log-filters .btn-sm').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshCronLog();
}

async function refreshCronLog() {
  const feed = document.getElementById('cron-log-feed');
  try {
    const qs = new URLSearchParams({ limit: '50' });
    if (cronLogPlatformFilter) qs.set('platform', cronLogPlatformFilter);
    const data = await api(`/cron-log?${qs}`);
    const log = data.log || [];

    const badge = document.getElementById('cron-log-count');
    badge.textContent = `${data.total} runs`;
    badge.className = data.total > 0 ? 'badge badge-live' : 'badge badge-idle';

    renderCronLog(log);
  } catch (err) {
    console.error('Cron log error:', err);
    feed.innerHTML = '<div class="empty-state">Failed to load cron history.</div>';
  }
}

function renderCronLog(log) {
  const feed = document.getElementById('cron-log-feed');
  if (!log.length) {
    feed.innerHTML = '<div class="empty-state">No cron runs recorded yet. Runs will appear here as they happen.</div>';
    return;
  }

  const platformIcons = {
    facebook: '<span class="fb-icon" style="width:18px;height:18px;font-size:10px;">f</span>',
    twitter:  '<span class="tw-icon" style="width:18px;height:18px;font-size:10px;">\u{1D54F}</span>',
    reddit:   '<span class="rd-icon" style="width:18px;height:18px;font-size:10px;">r/</span>',
    quora: '<span style="width:18px;height:18px;font-size:10px;background:#B92B27;color:#fff;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;">Q</span>',
    pinterest: '<span class="pi-icon" style="width:18px;height:18px;font-size:10px;">P</span>',
    youtube:   '<span class="yt-icon" style="width:18px;height:18px;font-size:9px;">▶</span>',
  };
  const platformNames = { facebook: 'FB', twitter: 'TW', reddit: 'RD', quora: 'QA', pinterest: 'PI', youtube: 'YT' };

  const header = `
    <div class="cron-log-header">
      <span>Platform</span>
      <span>Trigger</span>
      <span>Status</span>
      <span>Started</span>
      <span>Finished</span>
      <span>Duration</span>
    </div>
  `;

  const rows = log.map(entry => {
    const icon = platformIcons[entry.platform] || '';
    const name = platformNames[entry.platform] || entry.platform;
    const triggerCls = entry.trigger === 'auto' ? 'cl-trigger-auto' : 'cl-trigger-manual';
    const triggerLabel = entry.trigger === 'auto' ? 'Auto' : 'Manual';
    const startedAt = entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '\u2014';
    const finishedAt = entry.finishedAt ? new Date(entry.finishedAt).toLocaleString() : '\u2014';

    let duration = '\u2014';
    if (entry.startedAt && entry.finishedAt) {
      const ms = new Date(entry.finishedAt) - new Date(entry.startedAt);
      if (ms < 1000) duration = ms + 'ms';
      else if (ms < 60000) duration = (ms / 1000).toFixed(1) + 's';
      else { const m = Math.floor(ms / 60000); const s = Math.round((ms % 60000) / 1000); duration = m + 'm ' + s + 's'; }
    } else if (entry.status === 'running' && entry.startedAt) {
      const ms = Date.now() - new Date(entry.startedAt).getTime();
      duration = Math.floor(ms / 1000) + 's...';
    }

    const statusCls = 'cl-status-' + entry.status;
    const statusLabel = entry.status === 'ok' ? 'OK' : entry.status;
    const rowCls = 'cl-' + entry.status;
    const msg = entry.message ? `<div class="cl-message" title="${escapeHtml(entry.message)}">${escapeHtml(entry.message)}</div>` : '';

    return `
      <div class="cron-log-row ${rowCls}">
        <div class="cl-platform">${icon} ${name}</div>
        <div><span class="cl-trigger ${triggerCls}">${triggerLabel}</span></div>
        <div><span class="cl-status-badge ${statusCls}">${statusLabel}</span></div>
        <div class="cl-time">${startedAt}</div>
        <div class="cl-time">${finishedAt}</div>
        <div class="cl-duration">${duration}</div>
        ${msg}
      </div>
    `;
  }).join('');

  feed.innerHTML = header + rows;
}

// --- Cron Next-Run Countdown ---

let _cronNextRunAt = null;
let _cronClockOffset = 0;
let _prevCronRunning = {}; // track running state to detect completions

function updateCronTimer() {
  const el = document.getElementById('cron-next-timer');
  if (!el) return;
  if (!_cronNextRunAt) { el.textContent = 'Next run in \u2014'; return; }
  const serverNow = Date.now() + _cronClockOffset;
  const remaining = Math.max(0, Math.floor((_cronNextRunAt - serverNow) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  if (remaining <= 0) { el.textContent = 'Running now\u2026'; }
  else { el.textContent = `Next run in ${m}:${s.toString().padStart(2, '0')}`; }
}

setInterval(updateCronTimer, 1000);

// --- Cron Jobs Status ---

async function refreshCronStatus() {
  try {
    const data = await api('/cron-status');
    if (data.nextRunAt) _cronNextRunAt = new Date(data.nextRunAt).getTime();
    if (data.serverTime) _cronClockOffset = new Date(data.serverTime).getTime() - Date.now();
    updateCronTimer();

    const crons = data.crons || {};
    for (const [platform, info] of Object.entries(crons)) {
      // Detect cron just finished → auto-refresh live sections
      if (_prevCronRunning[platform] && !info.running) {
        setTimeout(() => {
          refreshPostedComments();
          refreshEngagementMonitor();
          refreshStats();
          refreshLogs();
          refreshCronLog();
        }, 2000);
      }
      _prevCronRunning[platform] = !!info.running;

      const badge = document.getElementById(`cron-badge-${platform}`);
      const card = document.getElementById(`cron-card-${platform}`);
      const started = document.getElementById(`cron-started-${platform}`);
      const finished = document.getElementById(`cron-finished-${platform}`);
      const result = document.getElementById(`cron-result-${platform}`);
      const msg = document.getElementById(`cron-msg-${platform}`);
      if (!badge) continue;

      card.className = 'cron-card';
      if (info.running) {
        badge.textContent = 'running';
        badge.className = 'cron-status-badge cron-badge-running';
        card.classList.add('cron-running');
      } else if (info.lastExitCode === 0) {
        badge.textContent = 'ok';
        badge.className = 'cron-status-badge cron-badge-ok';
        card.classList.add('cron-ok');
      } else if (info.lastExitCode !== null && info.lastExitCode !== 0) {
        badge.textContent = 'failed';
        badge.className = 'cron-status-badge cron-badge-fail';
        card.classList.add('cron-fail');
      } else {
        badge.textContent = 'idle';
        badge.className = 'cron-status-badge';
      }

      const triggerTag = info.lastTrigger ? ` (${info.lastTrigger})` : '';
      if (started) started.textContent = (info.lastStarted ? new Date(info.lastStarted).toLocaleTimeString() : '\u2014') + triggerTag;
      if (finished) finished.textContent = info.lastFinished ? new Date(info.lastFinished).toLocaleTimeString() : '\u2014';
      if (result) {
        if (info.lastExitCode === null) { result.textContent = '\u2014'; result.style.color = ''; }
        else if (info.lastExitCode === 0) { result.textContent = 'exit 0'; result.style.color = 'var(--success)'; }
        else { result.textContent = `exit ${info.lastExitCode}`; result.style.color = 'var(--danger)'; }
      }
      if (msg) { msg.textContent = info.lastMessage || ''; msg.title = info.lastMessage || ''; }
    }
  } catch (err) {
    console.error('Cron status error:', err);
  }
}

// --- Active Accounts ---

async function refreshActiveAccounts() {
  try {
    const data = await api('/active-accounts');
    const accounts = data.accounts || {};
    _activeAccountsCache = accounts;

    const dotMap = {
      facebook: 'fb-login-dot', twitter: 'tw-login-dot', reddit: 'rd-login-dot',
      quora: 'qa-login-dot', pinterest: 'pi-login-dot', youtube: 'yt-login-dot',
    };
    const prefixMap = { twitter: '@', reddit: 'u/', facebook: '', quora: '', pinterest: '@', youtube: '@' };

    for (const p of paPlatforms) {
      const acct = accounts[p];
      const prefix = prefixMap[p] || '';

      // Cron account label
      const el = document.getElementById(`cron-account-${p}`);
      if (el) {
        if (acct) {
          let label = acct.accountId || 'Connected';
          const dn = acct.displayName || acct.name || '';
          const un = acct.username || '';
          if (dn && un && dn !== un) label = `${dn} (${prefix}${un})`;
          else if (dn) label = dn;
          else if (un) label = `${prefix}${un}`;
          el.textContent = label;
          el.classList.add('cron-account-active');
          el.classList.remove('cron-account-none');
        } else {
          el.textContent = 'Not logged in';
          el.classList.add('cron-account-none');
          el.classList.remove('cron-account-active');
        }
      }

      // Header dots
      const dotId = dotMap[p];
      const dot = dotId ? document.getElementById(dotId) : null;
      if (!dot) continue;
      const pName = p.charAt(0).toUpperCase() + p.slice(1);
      if (acct) {
        dot.classList.add('dot-connected');
        dot.classList.remove('dot-disconnected');
        const dn = acct.displayName || acct.name || '';
        const un = acct.username || '';
        dot.title = pName + (un ? ` — ${prefix}${un}` : dn ? ` — ${dn}` : ' — Connected');
      } else {
        dot.classList.add('dot-disconnected');
        dot.classList.remove('dot-connected');
        dot.title = pName + ' — Not connected';
      }
    }
  } catch (err) {
    console.error('Active accounts error:', err);
  }
}

// --- Section Navigation ---

function initSectionNav() {
  const nav = document.getElementById('section-nav');
  const sentinel = document.getElementById('section-nav-sentinel');
  if (!nav || !sentinel) return;

  const links = nav.querySelectorAll('.section-nav-link');

  const stuckObserver = new IntersectionObserver(([entry]) => {
    nav.classList.toggle('is-stuck', !entry.isIntersecting);
  }, { threshold: 0 });
  stuckObserver.observe(sentinel);

  const sectionMap = [];
  links.forEach(link => {
    const href = link.getAttribute('href');
    const id = href ? href.replace('#', '') : '';
    const el = id ? document.getElementById(id) : null;
    if (el) sectionMap.push({ link, el });
  });

  let visibleSections = new Set();
  let programmaticScroll = false;

  function updateActiveLink() {
    if (programmaticScroll) return;
    let topSection = null;
    let topY = Infinity;
    for (const { link, el } of sectionMap) {
      if (visibleSections.has(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.top < topY) { topY = rect.top; topSection = link; }
      }
    }
    if (topSection) {
      links.forEach(l => l.classList.remove('active'));
      topSection.classList.add('active');
      scrollNavToActive(topSection);
    }
  }

  const spyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleSections.add(entry.target);
      else visibleSections.delete(entry.target);
    }
    updateActiveLink();
  }, { rootMargin: '-60px 0px -40% 0px', threshold: 0 });

  for (const { el } of sectionMap) spyObserver.observe(el);

  function scrollNavToActive(activeLink) {
    const inner = nav.querySelector('.section-nav-inner');
    if (!inner) return;
    const navRect = inner.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    if (linkRect.left < navRect.left || linkRect.right > navRect.right) {
      const offset = linkRect.left - navRect.left - (navRect.width / 2) + (linkRect.width / 2);
      inner.scrollBy({ left: offset, behavior: 'smooth' });
    }
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      const id = href ? href.replace('#', '') : '';
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      const section = target.closest('.section') || target;
      if (section.classList.contains('section-collapsed')) {
        const header = section.querySelector('.section-toggle');
        if (header) toggleSection(header);
      }
      programmaticScroll = true;
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { programmaticScroll = false; }, 800);
    });
  });
}

// --- Engagement Monitor ---

async function refreshEngagementMonitor() {
  const feed = document.getElementById('em-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const [postsData, statsData, accountsData, cronData] = await Promise.all([
      api('/posts?limit=500'),
      api('/stats'),
      api('/active-accounts'),
      api('/cron-status'),
    ]);
    renderEngagementMonitor(
      postsData.posts || [],
      statsData,
      accountsData.accounts || {},
      cronData.crons || {}
    );
  } catch (err) {
    feed.innerHTML = '<div class="empty-state">Failed to load engagement data.</div>';
  }
}

function renderEngagementMonitor(posts, stats, accounts, crons) {
  const feed = document.getElementById('em-feed');
  const byStatus = stats.byStatus || {};
  const postedByPlatform = stats.postedByPlatform || {};
  const platforms = ['facebook', 'twitter', 'reddit', 'quora', 'pinterest', 'youtube'];

  const platformMeta = {
    facebook:  { icon: '<span class="fb-icon" style="width:18px;height:18px;font-size:11px;">f</span>', label: 'Facebook',  cls: 'em-facebook' },
    twitter:   { icon: '<span class="tw-icon" style="width:18px;height:18px;font-size:11px;">\u{1D54F}</span>', label: 'Twitter',   cls: 'em-twitter' },
    reddit:    { icon: '<span class="rd-icon" style="width:18px;height:18px;font-size:11px;">r/</span>', label: 'Reddit',    cls: 'em-reddit' },
    quora:     { icon: '<span style="width:18px;height:18px;font-size:10px;font-weight:800;background:#B92B27;color:#fff;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;">Q</span>', label: 'Quora',    cls: 'em-quora' },
    pinterest: { icon: '<span class="pi-icon" style="width:18px;height:18px;font-size:10px;">P</span>', label: 'Pinterest', cls: 'em-pinterest' },
    youtube:   { icon: '<span class="yt-icon" style="width:18px;height:18px;font-size:9px;">\u25B6</span>', label: 'YouTube',   cls: 'em-youtube' },
  };

  // --- 1. Pipeline bar ---
  const total = Math.max(stats.total || 1, 1);
  const pipeline = [
    { label: 'New',        key: 'new',        color: 'var(--text-muted)' },
    { label: 'Evaluating', key: 'evaluating', color: 'var(--info)' },
    { label: 'Evaluated',  key: 'evaluated',  color: 'var(--warning)' },
    { label: 'Posted',     key: 'posted',     color: 'var(--success)' },
    { label: 'Rejected',   key: 'rejected',   color: 'var(--danger)' },
  ];

  const pipelineSegs = pipeline.map(p => {
    const count = byStatus[p.key] || 0;
    const pct = Math.max(Math.round((count / total) * 100), count > 0 ? 2 : 0);
    return count > 0
      ? `<div class="em-pipeline-seg" style="flex:${pct};background:${p.color}" title="${p.label}: ${count}"></div>`
      : '';
  }).join('');

  const pipelineLabels = pipeline.map(p =>
    `<div class="em-pipeline-label">
      <span class="em-pipeline-dot" style="background:${p.color}"></span>
      ${p.label}: <b>${byStatus[p.key] || 0}</b>
    </div>`
  ).join('');

  const pipelineHtml = `
    <div class="em-pipeline">
      <div class="em-pipeline-title">Post Pipeline &mdash; ${stats.total || 0} total</div>
      <div class="em-pipeline-bar">${pipelineSegs || '<div style="flex:1;background:var(--border)"></div>'}</div>
      <div class="em-pipeline-labels">${pipelineLabels}</div>
    </div>`;

  // --- 2. Per-platform grid ---
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const platformCards = platforms.map(p => {
    const meta = platformMeta[p];
    const acct = accounts[p];
    const cron = crons[p] || {};
    const platformPosts = posts.filter(post => post.platform === p);
    const postedToday = platformPosts.filter(post =>
      post.status === 'posted' && post.postedAt && new Date(post.postedAt) >= todayStart
    ).length;
    const pending  = platformPosts.filter(post => post.status === 'new' || post.status === 'evaluating').length;
    const ready    = platformPosts.filter(post => post.status === 'evaluated').length;
    const allTime  = postedByPlatform[p] ?? 0;
    const loginBadge = acct
      ? `<span class="badge badge-live" style="font-size:10px;margin-left:auto;">Connected</span>`
      : `<span class="badge badge-paused" style="font-size:10px;margin-left:auto;">Not connected</span>`;
    const runningBadge = cron.running
      ? `<span class="badge badge-running" style="font-size:10px;">Running</span>` : '';

    const lastRun = cron.lastFinished
      ? new Date(cron.lastFinished).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <div class="em-card ${meta.cls}">
        <div class="em-card-header">
          ${meta.icon}
          <span style="font-weight:600;font-size:13px;">${meta.label}</span>
          ${runningBadge}
          ${loginBadge}
        </div>
        <div class="em-engagement-stats">
          <div class="em-stat"><span class="em-stat-val">${postedToday}</span>&nbsp;today</div>
          <div class="em-stat"><span class="em-stat-val">${ready}</span>&nbsp;ready</div>
          <div class="em-stat"><span class="em-stat-val">${pending}</span>&nbsp;pending</div>
          <div class="em-stat"><span class="em-stat-val">${allTime}</span>&nbsp;all time</div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Last run: ${lastRun}</div>
      </div>`;
  }).join('');

  // --- 3. Top candidates (evaluated, score ≥ 70) ---
  const candidates = posts
    .filter(p => p.status === 'evaluated' && (p.aiRelevanceScore || 0) >= 70)
    .sort((a, b) => (b.aiRelevanceScore || 0) - (a.aiRelevanceScore || 0))
    .slice(0, 8);

  const candidateRows = candidates.map(c => {
    const meta = platformMeta[c.platform] || platformMeta.facebook;
    const reply = (c.editedReply || c.aiReply || '').slice(0, 130);
    const content = (c.content || '').slice(0, 80);
    return `
      <div class="em-card ${meta.cls}">
        <div class="em-card-header">
          ${meta.icon}
          <span class="fb-score-pill">AI ${c.aiRelevanceScore}</span>
          <span style="font-size:12px;color:var(--text-muted);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(content)}${content.length >= 80 ? '…' : ''}</span>
          ${c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);white-space:nowrap;">View \u2197</a>` : ''}
        </div>
        ${reply ? `<div class="em-comment-text">${escapeHtml(reply)}${reply.length >= 130 ? '…' : ''}</div>` : ''}
      </div>`;
  }).join('');

  const candidatesHtml = `
    <div class="em-candidates">
      <div class="em-section-title">Top Candidates &mdash; Score \u2265 70 (${candidates.length} posts ready)</div>
      ${candidates.length
        ? candidateRows
        : '<div class="empty-state">No evaluated posts with score \u2265 70 yet. Run a cron to evaluate posts.</div>'}
    </div>`;

  feed.innerHTML = pipelineHtml
    + `<div class="em-platform-grid">${platformCards}</div>`
    + candidatesHtml;
}

async function runEngagementMonitor() {
  showToast('info', 'Engagement Monitor', 'Refreshing engagement data\u2026');
  await refreshEngagementMonitor();
}

// --- Custom Platforms ---

function getCustomPlatforms() {
  try { return JSON.parse(localStorage.getItem('custom_platforms') || '[]'); } catch { return []; }
}

function saveCustomPlatformsLocal(list) {
  localStorage.setItem('custom_platforms', JSON.stringify(list));
}

function renderCustomPlatformTabs() {
  const customs = getCustomPlatforms();

  const paTabsContainer = document.getElementById('pa-custom-tabs');
  if (paTabsContainer) {
    paTabsContainer.innerHTML = customs.map(cp => `
      <button class="pa-tab" data-pa-platform="${escapeHtml(cp.id)}" onclick="setPaTab('${escapeHtml(cp.id)}', this)">
        <span style="background:${escapeHtml(cp.color)};color:#fff;border-radius:5px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${escapeHtml(cp.icon)}</span>
        ${escapeHtml(cp.name)}
        <span class="pa-dot" id="pa-dot-${escapeHtml(cp.id)}"></span>
        <span class="pa-tab-custom-close" onclick="event.stopPropagation(); removeCustomPlatform('${escapeHtml(cp.id)}')" title="Remove">✕</span>
      </button>
    `).join('');
  }

  const activityContainer = document.getElementById('activity-custom-tabs');
  if (activityContainer) {
    activityContainer.innerHTML = customs.map(cp => `
      <button class="platform-tab" data-platform="${escapeHtml(cp.id)}" onclick="setActivityTab('${escapeHtml(cp.id)}', this)">
        <span style="background:${escapeHtml(cp.color)};color:#fff;border-radius:4px;padding:1px 4px;font-size:10px;font-weight:800">${escapeHtml(cp.icon)}</span>
        ${escapeHtml(cp.name)}
      </button>
    `).join('');
  }

  const headerDotsContainer = document.getElementById('custom-platform-dots');
  if (headerDotsContainer) {
    headerDotsContainer.innerHTML = customs.map(cp => `
      <span class="platform-dot" id="custom-dot-${escapeHtml(cp.id)}" title="${escapeHtml(cp.name)}">
        <span class="cookie-tab-icon" style="background:${escapeHtml(cp.color)};color:#fff;border-radius:5px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${escapeHtml(cp.icon)}</span>
        <span class="dot-indicator"></span>
      </span>
    `).join('');
  }

  const cronContainer = document.getElementById('cron-custom-cards');
  if (cronContainer) {
    cronContainer.innerHTML = customs.map(cp => `
      <div class="cron-card" id="cron-card-${escapeHtml(cp.id)}">
        <div class="cron-card-header">
          <span style="background:${escapeHtml(cp.color)};color:#fff;border-radius:5px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${escapeHtml(cp.icon)}</span>
          <span class="cron-platform-name">${escapeHtml(cp.name)}</span>
          <span class="cron-status-badge" id="cron-badge-${escapeHtml(cp.id)}">Idle</span>
        </div>
        <div class="cron-card-body">
          <div class="cron-row"><span class="cron-label">Account</span><span class="cron-value cron-account" id="cron-account-${escapeHtml(cp.id)}">&mdash;</span></div>
          <div class="cron-row"><span class="cron-label">Status</span><span class="cron-value text-muted">No cron script configured</span></div>
        </div>
      </div>
    `).join('');
  }
}

let _modalSelectedColor = '#E1306C';

function showAddPlatformModal() {
  document.getElementById('modal-platform-name').value = '';
  document.getElementById('modal-platform-icon').value = '';
  document.getElementById('modal-error').style.display = 'none';
  _modalSelectedColor = '#E1306C';
  document.querySelectorAll('.modal-icon-opt').forEach((opt, i) => {
    opt.classList.toggle('selected', i === 0);
    opt.style.borderColor = i === 0 ? opt.dataset.color : 'var(--border)';
  });
  document.getElementById('add-platform-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-platform-name').focus(), 100);
}

function closeAddPlatformModal() {
  document.getElementById('add-platform-overlay').style.display = 'none';
}

function selectModalColor(el) {
  document.querySelectorAll('.modal-icon-opt').forEach(opt => {
    opt.classList.remove('selected');
    opt.style.borderColor = 'var(--border)';
  });
  el.classList.add('selected');
  el.style.borderColor = el.dataset.color;
  _modalSelectedColor = el.dataset.color;
}

function saveCustomPlatform() {
  const name = document.getElementById('modal-platform-name').value.trim();
  const iconInput = document.getElementById('modal-platform-icon').value.trim();
  const errEl = document.getElementById('modal-error');
  if (!name) { errEl.textContent = 'Platform name is required'; errEl.style.display = ''; return; }
  const icon = iconInput || name.slice(0, 2).toUpperCase();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32);
  const color = _modalSelectedColor || '#6c5ce7';
  const existing = getCustomPlatforms();
  if (existing.find(p => p.id === id)) { errEl.textContent = 'A platform with this name already exists'; errEl.style.display = ''; return; }
  const list = getCustomPlatforms();
  list.push({ id, name, icon, color });
  saveCustomPlatformsLocal(list);
  closeAddPlatformModal();
  renderCustomPlatformTabs();
  paStatuses[id] = { connected: false };
  updatePaDots();
  showToast('success', 'Platform Added', `${name} has been added.`);
}

function removeCustomPlatform(id) {
  if (!confirm('Remove this platform?')) return;
  const list = getCustomPlatforms().filter(p => p.id !== id);
  saveCustomPlatformsLocal(list);
  renderCustomPlatformTabs();
  if (paActiveTab === id) {
    paActiveTab = 'twitter';
    const firstTab = document.querySelector('.pa-tab[data-pa-platform="twitter"]');
    if (firstTab) { firstTab.classList.add('active'); renderPaContent(); }
  }
  if (activeActivityTab === id) activeActivityTab = 'facebook';
}

// --- Cron Auto-Schedule Pause/Resume ---

async function refreshCronPauseStatus() {
  try {
    const data = await api('/cron-control');
    _cronAutoPaused = data.paused;
    updateCronPauseBtn();
  } catch {}
}

function updateCronPauseBtn() {
  const btn = document.getElementById('cron-pause-btn');
  const label = document.getElementById('cron-pause-label');
  if (!btn || !label) return;
  if (_cronAutoPaused) {
    btn.className = 'btn btn-warning';
    label.textContent = 'Cron Paused';
  } else {
    btn.className = 'btn btn-success';
    label.textContent = 'Cron Running';
  }
}

async function toggleCronPause() {
  const btn = document.getElementById('cron-pause-btn');
  if (btn) btn.disabled = true;
  try {
    const data = await api('/cron-control', { method: 'POST' });
    _cronAutoPaused = data.paused;
    updateCronPauseBtn();
    showToast(_cronAutoPaused ? 'warning' : 'success', 'Cron Control', _cronAutoPaused ? 'Cron jobs paused' : 'Cron jobs resumed');
  } catch (err) {
    showToast('error', 'Cron Control', err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- Init ---

function initDashboard() {
  initSSE();
  initSectionNav();
  renderCustomPlatformTabs();
  initPlatformAccounts();
  refreshStats();
  refreshLogs();
  refreshCronStatus();
  refreshCronLog();
  refreshActiveAccounts();
  refreshCronPauseStatus();
  prefetchAllActivity();
  refreshPostedComments();
  refreshEngagementMonitor();

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    refreshStats();
    refreshLogs();
    refreshCronStatus();
    refreshCronLog();
    refreshActiveAccounts();
    refreshCronPauseStatus();
    refreshEngagementMonitor();
    refreshPostedComments();
  }, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  restoreSectionStates();
  initDashboard();
});
