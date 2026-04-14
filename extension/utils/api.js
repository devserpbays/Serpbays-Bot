/**
 * API client for communicating with GetMention server.
 * Handles authentication, task fetching, and result reporting.
 */

// Current Hostinger dev server. Will be replaced with a production domain
// once one is provisioned. Extension popup also lets users override this.
const DEFAULT_SERVER = 'http://88.222.214.19:3005';

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.sync.get('serverUrl');
  return serverUrl || DEFAULT_SERVER;
}

async function getApiKey() {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  return apiKey;
}

async function apiRequest(endpoint, options = {}) {
  const serverUrl = await getServerUrl();
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('Not connected — enter your API key in the extension popup');
  }

  const res = await fetch(`${serverUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Extension-Key': apiKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 100)}`);
  }

  return res.json();
}

async function fetchTasks() {
  return apiRequest('/api/extension/tasks');
}

async function completeTask(taskId, result) {
  return apiRequest('/api/extension/tasks/complete', {
    method: 'POST',
    body: JSON.stringify({ taskId, ...result }),
  });
}

async function fetchSettings() {
  return apiRequest('/api/extension/settings');
}

async function reportStatus(platform, loggedIn) {
  return apiRequest('/api/extension/status', {
    method: 'POST',
    body: JSON.stringify({ platform, loggedIn }),
  });
}

async function submitScrapedPosts(posts) {
  return apiRequest('/api/extension/scrape', {
    method: 'POST',
    body: JSON.stringify({ posts }),
  });
}

async function fetchPingData() {
  return apiRequest('/api/extension/ping');
}

async function sendLog(platform, level, action, message, meta = {}) {
  return apiRequest('/api/extension/log', {
    method: 'POST',
    body: JSON.stringify({ platform, level, action, message, meta }),
  }).catch(() => {}); // never fail on logging
}

const GetMentionAPI = { fetchTasks, completeTask, fetchSettings, reportStatus, submitScrapedPosts, fetchPingData, sendLog, getServerUrl, getApiKey };
