import Link from "next/link";

export const metadata = {
  title: "Terms of Service | GetMention",
};

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p style={{ color: "#888", marginBottom: "3rem" }}>Last updated: March 9, 2026</p>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            1. Acceptance of Terms
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            By accessing or using the GetMention platform ("Service"), you agree to be bound by these Terms of Service
            ("Terms"). If you do not agree to all of these Terms, you may not access or use the Service. These Terms
            constitute a legally binding agreement between you and GetMention ("Company," "we," "us," or "our"). Your
            continued use of the Service following the posting of any changes to these Terms constitutes acceptance of
            those changes.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            2. Description of Service
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            GetMention is an AI-powered social media engagement automation platform. The Service enables users to monitor
            social media platforms for relevant conversations, generate contextual responses using artificial
            intelligence, and automate engagement across supported platforms including Twitter, Reddit, Facebook, Quora,
            YouTube, and Pinterest. The Service includes keyword-based content discovery, AI-driven comment and reply
            generation, scheduling and posting automation, and analytics and performance tracking. We reserve the right
            to modify, suspend, or discontinue any part of the Service at any time with or without notice.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            3. Account Registration
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            To use the Service, you must create an account through our authentication provider, Clerk. You are
            responsible for maintaining the confidentiality of your account credentials and for all activities that occur
            under your account. You agree to provide accurate, current, and complete information during registration and
            to update such information as necessary. You must notify us immediately of any unauthorized use of your
            account. GetMention is not liable for any loss or damage arising from your failure to safeguard your account
            credentials.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            4. Acceptable Use
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            You agree to use the Service in compliance with all applicable laws and the terms of service of each social
            media platform you connect. You must not:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem", marginBottom: "1rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>Use the Service to generate or distribute spam, unsolicited messages, or misleading content.</li>
            <li style={{ marginBottom: "0.5rem" }}>Violate the terms of service, community guidelines, or acceptable use policies of any connected social media platform.</li>
            <li style={{ marginBottom: "0.5rem" }}>Engage in harassment, impersonation, or any form of deceptive behavior through the Service.</li>
            <li style={{ marginBottom: "0.5rem" }}>Attempt to circumvent rate limits, bans, or other restrictions imposed by social media platforms.</li>
            <li style={{ marginBottom: "0.5rem" }}>Use the Service for any illegal or unauthorized purpose.</li>
            <li style={{ marginBottom: "0.5rem" }}>Reverse-engineer, decompile, or attempt to extract the source code of the Service.</li>
          </ul>
          <p style={{ lineHeight: 1.75 }}>
            We reserve the right to suspend or terminate your account if we determine, in our sole discretion, that you
            have violated these acceptable use provisions.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            5. Subscription & Billing
          </h2>
          <p style={{ lineHeight: 1.75, marginBottom: "1rem" }}>
            GetMention offers paid subscription plans. All billing is processed securely through PayPal. By subscribing to
            a paid plan, you agree to the following:
          </p>
          <ul style={{ lineHeight: 1.75, paddingLeft: "1.5rem", marginBottom: "1rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>Subscriptions automatically renew at the end of each billing cycle unless cancelled before the renewal date.</li>
            <li style={{ marginBottom: "0.5rem" }}>You authorize us to charge your payment method on file for recurring subscription fees.</li>
            <li style={{ marginBottom: "0.5rem" }}>Cancellations take effect at the end of the current billing period. No partial refunds are provided for unused time within a billing cycle.</li>
            <li style={{ marginBottom: "0.5rem" }}>Prices may change with 30 days' notice. Continued use after a price change constitutes acceptance of the new pricing.</li>
            <li style={{ marginBottom: "0.5rem" }}>You are responsible for any applicable taxes associated with your subscription.</li>
          </ul>
          <p style={{ lineHeight: 1.75 }}>
            For billing inquiries or disputes, please contact us at support@getmention.com.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            6. Intellectual Property
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            The Service, including its original content, features, functionality, design, and underlying technology, is
            and shall remain the exclusive property of GetMention and its licensors. The Service is protected by copyright,
            trademark, and other intellectual property laws. You retain ownership of any content you create or submit
            through the Service, but you grant GetMention a non-exclusive, worldwide, royalty-free license to use, store,
            and process such content solely for the purpose of providing and improving the Service. Our trademarks, logos,
            and service marks may not be used without our prior written consent.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            7. Limitation of Liability
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            To the maximum extent permitted by applicable law, GetMention and its directors, employees, partners, agents,
            suppliers, and affiliates shall not be liable for any indirect, incidental, special, consequential, or
            punitive damages, including but not limited to loss of profits, data, use, or goodwill, arising out of or in
            connection with your use of the Service. GetMention does not guarantee that engagement activities performed
            through the Service will not result in account suspensions, bans, or other actions taken by third-party
            social media platforms. You acknowledge that you use the Service at your own risk. In no event shall our
            total liability exceed the amount you have paid to GetMention in the twelve (12) months preceding the claim.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            8. Termination
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            We may terminate or suspend your account and access to the Service immediately, without prior notice or
            liability, for any reason, including if you breach these Terms. Upon termination, your right to use the
            Service will immediately cease. You may terminate your account at any time by cancelling your subscription
            and contacting us to request account deletion. Upon termination, we will delete your stored data in
            accordance with our Privacy Policy, except where retention is required by law.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            9. Changes to Terms
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            We reserve the right to modify or replace these Terms at any time. If a revision is material, we will
            provide at least 30 days' notice before the new terms take effect, either through a notification within the
            Service or via email. What constitutes a material change will be determined at our sole discretion. By
            continuing to access or use the Service after any revisions become effective, you agree to be bound by the
            revised Terms.
          </p>
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 600, marginBottom: "1rem" }}>
            10. Contact
          </h2>
          <p style={{ lineHeight: 1.75 }}>
            If you have any questions about these Terms of Service, please contact us at{" "}
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
