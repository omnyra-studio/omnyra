export const metadata = { title: "Refund & Subscription Policy — Omnyra" };

export default function RefundPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-sm text-gray-200 leading-relaxed">
      <h1 className="text-2xl font-bold text-white mb-2">Refund & Subscription Policy</h1>
      <p className="text-gray-400 mb-10">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
        <p>
          Omnyra is a subscription-based AI content strategy platform. Access to the Service is provided
          through paid subscription plans. Billing is handled securely via Stripe. By subscribing, you
          agree to this Refund & Subscription Policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">2. Subscription Plans</h2>
        <p>
          Omnyra offers monthly and/or annual subscription plans. All plans are billed on a recurring
          basis. Plan details and pricing are available at the time of purchase and may be updated with
          prior notice.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">3. Billing Terms</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Payments are processed securely via Stripe</li>
          <li>Billing occurs at the start of each subscription period</li>
          <li>You are responsible for maintaining a valid payment method</li>
          <li>Applicable taxes may be applied based on your jurisdiction</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">4. Auto-Renewal</h2>
        <p>
          All subscriptions automatically renew at the end of each billing period. By subscribing, you
          authorize Omnyra and Stripe to charge your payment method on a recurring basis. To prevent
          renewal, you must cancel your subscription before the renewal date.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">5. Cancellation Policy</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>You may cancel your subscription at any time through your account settings</li>
          <li>Cancellation takes effect at the end of the current billing period</li>
          <li>You retain access to the Service until the end of the paid period</li>
          <li>No partial refunds are issued for unused portions of a billing period</li>
        </ul>
      </section>

      <section className="mb-8 border border-red-500/30 rounded-lg p-4 bg-red-500/5">
        <h2 className="text-lg font-semibold text-red-400 mb-3">6. Refund Policy</h2>

        <h3 className="font-medium text-gray-300 mb-2">Standard Rule</h3>
        <p className="mb-4">
          All subscription fees are non-refundable. Once a billing period has begun, no refunds will
          be issued for that period.
        </p>

        <h3 className="font-medium text-gray-300 mb-2">Exceptions</h3>
        <p className="mb-2">Refunds may be considered only in the following circumstances:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          <li>Verified duplicate charges caused by a technical billing error</li>
          <li>Situations required by applicable consumer protection law in your jurisdiction</li>
        </ul>

        <h3 className="font-medium text-gray-300 mb-2">No Refund Conditions</h3>
        <p className="mb-2">Refunds will not be issued for:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Unused subscription time</li>
          <li>Dissatisfaction with AI-generated outputs</li>
          <li>Low content performance, engagement, or virality outcomes</li>
          <li>User error or misunderstanding of features</li>
          <li>Failure to cancel before a renewal date</li>
        </ul>
      </section>

      <section className="mb-8 border border-yellow-500/30 rounded-lg p-4 bg-yellow-500/5">
        <h2 className="text-lg font-semibold text-yellow-400 mb-3">7. Performance Disclaimer</h2>
        <p className="mb-3 font-medium text-white">
          Virality is not guaranteed — outputs only increase the likelihood of performance based on
          predictive modeling.
        </p>
        <p className="mb-3">
          Your subscription provides access to AI-generated creative tools and strategy outputs.
          It does not guarantee:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Views or reach on any platform</li>
          <li>Engagement rates or follower growth</li>
          <li>Monetization success</li>
          <li>Any specific business or revenue outcome</li>
        </ul>
        <p className="mt-3 text-gray-400">
          Past performance or predicted engagement does not indicate future results.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">8. Failed Payments</h2>
        <p>
          If a payment fails, Stripe will automatically retry the charge. Persistent payment failure
          may result in temporary suspension of your account. Access will be restored upon successful
          payment.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">9. Chargeback Policy</h2>
        <p>
          Fraudulent or unjustified chargebacks may result in immediate account suspension. We encourage
          you to contact our support team before initiating a dispute with your payment provider. We
          reserve the right to submit evidence to the payment processor in response to any chargeback.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">10. Price Changes</h2>
        <p>
          Omnyra reserves the right to modify subscription pricing. Users will be notified of price
          changes in advance of their next billing cycle. Continued use of the Service after a price
          change constitutes acceptance of the new pricing.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">11. Taxes</h2>
        <p>
          You are responsible for all applicable taxes on your subscription. Stripe may calculate and
          collect taxes automatically depending on your region and applicable tax regulations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">12. Termination of Service</h2>
        <p>
          Omnyra reserves the right to suspend or terminate accounts engaged in abuse, fraud, or
          violations of our Terms & Conditions without refund. You may terminate your account at any
          time through your account settings.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">13. Limitation of Liability</h2>
        <p>
          Omnyra shall not be liable for any lost revenue, engagement loss, platform penalties, or
          business outcomes resulting from use of the Service. The Service is provided &quot;as is&quot; without
          guarantees of business success, growth, or content performance.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">14. Governing Law</h2>
        <p>
          This policy is governed by and construed in accordance with the laws of the jurisdiction in
          which Omnyra operates.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">15. Contact & Support</h2>
        <p>
          For billing inquiries or refund requests, contact us at:{" "}
          <a href="mailto:info@omnyra.studio" className="text-blue-400 underline">info@omnyra.studio</a>
        </p>
      </section>
    </main>
  );
}
