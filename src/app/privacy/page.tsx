import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | GetMention",
};

export default function PrivacyPolicy() {
  return (
    <div style={{ backgroundColor: "#0a0a0f", color: "#e0e0e0", minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.5rem 2rem",
          borderBottom: "1px solid #1e1e2e",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <Link href="/" style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0ea5e9", textDecoration: "none" }}>
          GetMention
        </Link>
        <Link href="/dashboard" style={{ color: "#a0a0b0", textDecoration: "none", fontSize: "0.9rem" }}>
          Back to Dashboard
        </Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>
        <h1 style={{ color: "#ffffff", fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Privacy Policy
        </h1>
        <p style={{ color: "#888", marginBottom: "1rem" }}>Last updated: April 14, 2026</p>

        <section style={{ marginBottom: "2.5rem", padding: "1rem 1.25rem", border: "1px solid #1e2a3a", borderRadius: 8, background: "#0d1520" }}>
          <p style={{ lineHeight: 1.75, margin: 0, color: "#cdd5e0" }}>
            <strong style={{ color: "#ffffff" }}>How GetMention works:</strong> GetMention is a Chrome extension plus a
            web dashboard. The extension runs <strong>entirely in your own browser</strong> and uses your already
            logged-in sessions to read posts and submit comments you approve. Your social-media passwords and session
            cookies <strong>never leave your computer</strong> and are never transmitted to GetMention servers.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            1. Information We Collect
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            GetMention ("we," "us," or "our") collects only the information necessary to run the Service:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Account Information:</strong> Registration is handled by Clerk (our
              authentication provider), which supplies your name and email. We never receive or store your password —
              Clerk manages authentication end to end.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Configuration Data:</strong> The keywords, platforms, posting
              cadence, and other preferences you set in the dashboard.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Public Post Metadata:</strong> URL, author handle, title/body text,
              and timestamp of posts the extension scrapes while you browse. This is all content that is already public
              on the source platform.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Generated Replies & Activity Logs:</strong> AI-drafted comments,
              approval decisions, and the outcome of each posting attempt (success / failure / skipped-reason).
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Billing Data:</strong> Subscription status and PayPal subscription
              ID — PayPal holds all payment details directly, we do not see card numbers.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Technical Data:</strong> IP address, user-agent, and access
              timestamps for security, abuse prevention, and debugging.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75, marginTop: "1rem", padding: "0.75rem 1rem", background: "#1a1108", border: "1px solid #3a2a0a", borderRadius: 6, color: "#ffd6a5" }}>
            <strong style={{ color: "#ffb865" }}>What we do NOT collect:</strong> social-media passwords, session
            cookies, private messages, friends lists, account balances, or any data from accounts you have not connected
            to GetMention.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            2. How We Use Your Information
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>We use the information we collect to:</p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>Provide, operate, and maintain the Service.</li>
            <li style={{ marginBottom: "0.5rem" }}>Authenticate your identity and manage your account.</li>
            <li style={{ marginBottom: "0.5rem" }}>Execute automated social media engagement on your behalf using your configured settings.</li>
            <li style={{ marginBottom: "0.5rem" }}>Generate AI-powered responses tailored to discovered content and your preferences.</li>
            <li style={{ marginBottom: "0.5rem" }}>Monitor and improve the performance, reliability, and security of the Service.</li>
            <li style={{ marginBottom: "0.5rem" }}>Communicate with you regarding account activity, service updates, and support requests.</li>
            <li style={{ marginBottom: "0.5rem" }}>Comply with legal obligations and enforce our Terms of Service.</li>
          </ul>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            3. Data Storage
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            Dashboard data (account info, configuration, scraped post metadata, generated replies, activity logs) is
            stored in MongoDB with encryption at rest. Your API key — the token the extension uses to authenticate with
            our API — is stored locally in Chrome's <code style={{ background: "#1a1a2a", padding: "1px 5px", borderRadius: 3 }}>chrome.storage.sync</code> and
            on our servers in hashed form. Your social-media session cookies remain on your device only; we have no
            server-side copy and no way to retrieve them. All transport between the extension, the dashboard, and our
            API is encrypted via TLS. We apply industry-standard controls against unauthorized access, but no method of
            electronic storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            4. Third-Party Services
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            We integrate with the following third-party services to operate the platform:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Clerk</strong> — Handles user authentication, registration, and
              session management. Clerk processes your email, name, and login credentials under its own privacy policy.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>PayPal</strong> — Processes subscription payments. PayPal holds
              your payment details directly under PCI-DSS compliance; GetMention only receives the subscription status
              and PayPal subscription ID.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>AI Providers</strong> — We use third-party language models (e.g.,
              Anthropic, OpenAI) to evaluate post relevance and draft replies. Only the public post text and your
              configured writing style are sent; no personal identifiers are shared. Our providers are contractually
              prohibited from training models on your data.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>MongoDB Atlas</strong> — Hosted database provider for the dashboard
              data described in Section 3.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75 }}>
            Each third-party service operates under its own privacy policy. We encourage you to review their policies.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            5. Extension Permissions & Local Storage
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            The GetMention Chrome extension requests the following permissions. Each is used strictly for the purpose
            stated — never for advertising, analytics tracking, or cross-site profiling:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>activeTab / tabs / scripting</strong> — to open the relevant
              platform tab, scrape publicly visible posts that match your keywords, and submit comments you approve.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>storage</strong> — to remember your API key and extension settings
              locally in <code style={{ background: "#1a1a2a", padding: "1px 5px", borderRadius: 3 }}>chrome.storage.sync</code>.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>alarms</strong> — to run the scraping/posting cycle on a schedule
              you control.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>notifications</strong> — to alert you when the extension finds
              posts that need your review.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Host permissions</strong> (x.com, youtube.com, facebook.com,
              reddit.com, quora.com, pinterest.com, skool.com) — required by Chrome so the extension can inject the
              content scripts that read posts and submit replies on those sites.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75, marginTop: "1rem" }}>
            The extension does <strong>not</strong> use remote code, does <strong>not</strong> inject ads, does{" "}
            <strong>not</strong> read page content on sites not listed above, and does <strong>not</strong> upload your
            session cookies to our servers. You can disconnect a platform at any time from the dashboard; you can
            remove the extension at any time from <code style={{ background: "#1a1a2a", padding: "1px 5px", borderRadius: 3 }}>chrome://extensions</code>, which wipes all local extension storage.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            6. Data Retention
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            We retain your data for as long as your account is active or as needed to provide the Service. Specific
            retention periods include:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem", marginTop: "1rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Activity logs</strong> (cron execution logs, scrape logs) are
              automatically deleted after 7 days.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Discovered posts and generated comments</strong> are retained for the
              duration of your account.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Account information</strong> is retained until you request deletion or
              your account is terminated.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75, marginTop: "1rem" }}>
            Upon account deletion, we will remove your personal data within 30 days, except where retention is required
            by law.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            7. Your Rights
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>You have the right to:</p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Access</strong> — Request a copy of the personal data we hold about
              you.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Deletion</strong> — Request deletion of your personal data and
              account. We will process deletion requests within 30 days.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Export</strong> — Request an export of your data in a portable,
              machine-readable format.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Rectification</strong> — Request correction of inaccurate personal
              data.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Objection</strong> — Object to certain processing of your personal
              data.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75, marginTop: "1rem" }}>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:support@serpbays.com" style={{ color: "#0ea5e9", textDecoration: "none" }}>
              support@serpbays.com
            </a>
            .
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            8. GDPR Compliance
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            If you are located in the European Economic Area (EEA), you are entitled to additional protections under the
            General Data Protection Regulation (GDPR). We process your personal data on the following legal bases:
            performance of a contract (providing the Service), legitimate interests (improving and securing the
            Service), and consent (where explicitly provided). You have the right to lodge a complaint with your local
            data protection authority if you believe your data is being processed unlawfully. For data subject access
            requests or any GDPR-related inquiries, please contact us at{" "}
            <a href="mailto:support@serpbays.com" style={{ color: "#0ea5e9", textDecoration: "none" }}>
              support@serpbays.com
            </a>
            . We will respond to all legitimate requests within 30 days.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            9. Changes to Privacy Policy
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by posting
            the new Privacy Policy on this page and updating the "Last updated" date. Where required by law, we will
            obtain your consent before making material changes. We encourage you to review this Privacy Policy
            periodically for any changes. Your continued use of the Service after changes are posted constitutes your
            acceptance of the revised policy.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            10. Contact
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            If you have any questions or concerns about this Privacy Policy or our data practices, please contact us
            at{" "}
            <a href="mailto:support@serpbays.com" style={{ color: "#0ea5e9", textDecoration: "none" }}>
              support@serpbays.com
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
