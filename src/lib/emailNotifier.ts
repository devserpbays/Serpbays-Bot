/**
 * Email notification sender using Resend.
 * https://resend.com
 */
import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
}

const FROM_ADDRESS = () => process.env.RESEND_FROM || 'GetMention <noreply@serpbays.com>';

/**
 * Send a cookie expiry alert email.
 */
export async function sendCookieExpiryEmail(
  to: string,
  platforms: string[],
  dashboardUrl?: string,
): Promise<boolean> {
  const resend = getResend();
  if (!resend || !to) return false;

  const platformList = platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
  const url = dashboardUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://getmention.com';

  try {
    await resend.emails.send({
      from: FROM_ADDRESS(),
      to,
      subject: `Action Required: ${platformList} cookies expired`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#131316;border-radius:12px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">GetMention</h1>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <div style="background:rgba(239,68,69,0.08);border:1px solid rgba(239,68,69,0.2);border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;color:#fca5a5;font-size:14px;font-weight:600;">
          Cookie Expiry Alert
        </p>
      </div>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Your session cookies for <strong style="color:#fafafa;">${platformList}</strong> have expired or are no longer valid. The bot has been unable to post on these platforms.
      </p>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Please reconnect your accounts from the dashboard to resume automated posting.
      </p>
      <a href="${url}/dashboard/accounts" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
        Reconnect Accounts
      </a>
    </div>
    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.04);">
      <p style="margin:0;color:#52525b;font-size:12px;">
        You're receiving this because you have email notifications enabled in your GetMention settings.
      </p>
    </div>
  </div>
</body>
</html>`,
    });
    return true;
  } catch (err) {
    console.error('[emailNotifier] Failed to send email:', (err as Error).message);
    return false;
  }
}

/**
 * Send a generic notification email.
 */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  message: string,
): Promise<boolean> {
  const resend = getResend();
  if (!resend || !to) return false;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS(),
      to,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#131316;border-radius:12px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">GetMention</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#fafafa;font-size:14px;line-height:1.6;margin:0;">${message}</p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.04);">
      <p style="margin:0;color:#52525b;font-size:12px;">GetMention notification</p>
    </div>
  </div>
</body>
</html>`,
    });
    return true;
  } catch (err) {
    console.error('[emailNotifier] Failed to send email:', (err as Error).message);
    return false;
  }
}
