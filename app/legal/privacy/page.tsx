export const metadata = { title: "Privacy Policy — Omnyra" };

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-sm text-gray-200 leading-relaxed">
      <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-gray-400 mb-10">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
        <p>
          Omnyra (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy
          Policy explains how we collect, use, store, and share information when you use the Omnyra
          platform. By using the Service, you agree to the practices described in this document.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
        <h3 className="font-medium text-gray-300 mb-2">a) User-Provided Data</h3>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          <li>Topic inputs, prompts, and content ideas you submit</li>
          <li>Account registration details (email, name)</li>
          <li>Billing information (processed via Stripe; we do not store card details)</li>
        </ul>
        <h3 className="font-medium text-gray-300 mb-2">b) Automatically Collected Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Usage logs and feature interaction data</li>
          <li>Device and browser metadata</li>
          <li>Performance telemetry (non-personally-identifying where possible)</li>
          <li>IP address and general geographic region</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Data</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To generate AI-powered content outputs based on your inputs</li>
          <li>To improve system performance and output quality</li>
          <li>To detect and prevent abuse or unauthorized access</li>
          <li>To provide customer support and service communications</li>
          <li>To process billing and subscription management via Stripe</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">4. Data Sharing</h2>
        <p>
          We do not sell your personal data to third parties. We may share data only with:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Infrastructure and hosting providers required to operate the Service</li>
          <li>Payment processors (Stripe) for billing purposes</li>
          <li>Legal authorities when required by applicable law</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
        <p>
          We implement industry-standard security measures to protect your data. However, no method of
          transmission or storage is completely secure. We cannot guarantee absolute security of your
          information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">6. Data Retention</h2>
        <p>
          We retain your data only as long as necessary to provide the Service or as required by law.
          Operational logs are retained for debugging and system integrity purposes. You may request
          deletion of your data in accordance with applicable regulations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">7. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and associated data</li>
          <li>Object to certain processing activities</li>
        </ul>
        <p className="mt-2">
          To exercise these rights, contact us at{" "}
          <a href="mailto:info@omnyra.studio" className="text-blue-400 underline">info@omnyra.studio</a>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">8. Third-Party Services</h2>
        <p>
          The Service integrates with third-party platforms and APIs (e.g., Stripe, Supabase, AI model
          providers). These services are governed by their own privacy policies. We are not responsible
          for third-party data practices.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">9. Children&apos;s Privacy</h2>
        <p>
          The Service is not intended for users under the age of 13 (or the applicable minimum age in
          your jurisdiction). We do not knowingly collect personal data from minors.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">10. International Data Transfers</h2>
        <p>
          Your data may be processed and stored in jurisdictions other than your own, depending on the
          infrastructure providers we use. We take reasonable steps to ensure adequate protections are
          in place for such transfers.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be communicated
          via email or in-app notification. Continued use of the Service after changes constitutes
          acceptance of the updated policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">12. Contact</h2>
        <p>
          For privacy inquiries or data requests, contact us at:{" "}
          <a href="mailto:info@omnyra.studio" className="text-blue-400 underline">info@omnyra.studio</a>
        </p>
      </section>
    </main>
  );
}
