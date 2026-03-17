const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let _cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an OAuth2 access token from PayPal (cached until expiry).
 */
export async function getPayPalAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be configured');
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedToken = {
    token: data.access_token,
    // Expire 60s early to avoid edge cases
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return _cachedToken.token;
}

/**
 * Make an authenticated request to the PayPal REST API.
 */
export async function paypalRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal API error (${res.status}): ${text}`);
  }

  // Some PayPal endpoints return 204 No Content
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export function getPayPalApiBase(): string {
  return PAYPAL_API_BASE;
}
