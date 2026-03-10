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
        <Link href="/" style={{ fontSize: "1.5rem", fontWeight: 700, color: "#7c3aed", textDecoration: "none" }}>
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
        <p style={{ color: "#888", marginBottom: "3rem" }}>Last updated: March 9, 2026</p>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            1. Information We Collect
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            GetMention ("we," "us," or "our") collects the following types of information when you use our platform:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Account Information:</strong> When you register through Clerk, our
              authentication provider, we receive your name, email address, and profile details. We do not store your
              password directly; authentication is managed entirely by Clerk.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Usage Data:</strong> We collect information about how you interact
              with the Service, including keywords configured, posts discovered, comments generated, approval and
              posting activity, and engagement metrics.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Social Media Cookies:</strong> To automate engagement on your behalf,
              we store browser session cookies for the social media platforms you connect (Twitter, Reddit, Facebook,
              Quora, YouTube, Pinterest). These cookies are used solely to maintain authenticated sessions for posting.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>Technical Data:</strong> We may collect IP addresses, browser type,
              device information, and access timestamps for security and operational purposes.
            </li>
          </ul>
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
            Your data is stored in MongoDB databases with encryption at rest enabled. Social media session cookies are
            stored in isolated browser profile directories on our servers, separated by user account. All data
            transmission between your browser and our servers is encrypted via TLS. We implement industry-standard
            security measures to protect your data against unauthorized access, alteration, disclosure, or destruction.
            However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute
            security.
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
              <strong style={{ color: "#ffffff" }}>Stripe</strong> — Processes subscription payments and billing. Stripe
              handles your payment card details directly; we do not store your full card number on our servers.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#ffffff" }}>AI Services</strong> — We use artificial intelligence services for
              content generation (comment and reply drafting). Content you submit for AI processing may be sent to
              third-party AI providers. We do not use your data to train AI models.
            </li>
          </ul>
          <p style={{ lineHeight: 1.75 }}>
            Each third-party service operates under its own privacy policy. We encourage you to review their policies.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            5. Cookies & Browser Data
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            GetMention stores browser cookies and session data for the social media platforms you connect to the Service.
            These cookies are essential for maintaining authenticated sessions that allow the platform to perform
            engagement actions on your behalf. This data is stored in secure, isolated browser profile directories on our
            servers and is accessible only through your account. We do not use tracking cookies for advertising purposes.
            You may disconnect a platform at any time, which will delete the associated session cookies from our servers.
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
            <a href="mailto:support@getmention.com" style={{ color: "#7c3aed", textDecoration: "none" }}>
              support@getmention.com
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
            <a href="mailto:support@getmention.com" style={{ color: "#7c3aed", textDecoration: "none" }}>
              support@getmention.com
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
            <a href="mailto:support@getmention.com" style={{ color: "#7c3aed", textDecoration: "none" }}>
              support@getmention.com
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
