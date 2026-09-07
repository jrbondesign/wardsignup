import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  return {
    metadataBase: new URL(brand.siteUrl),
    title: `Privacy Policy — ${brand.shortName}`,
    description: `How ${brand.name} collects, uses, and protects your information.`,
  };
}

export default async function PrivacyPolicy() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return (
    <main className="min-h-screen bg-[#F4FAFB] py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 md:p-10">
        <Link
          href="/"
          className="text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-6 inline-block transition-colors"
        >
          ← Back to Home
        </Link>

        <h1 className="font-serif text-3xl md:text-4xl text-[#0D2B35] mb-8">
          Privacy Policy
        </h1>

        <div className="space-y-6 text-[#2E5566]">
          <p className="text-sm text-[#5A8399]">
            Last updated: March 26, 2026
          </p>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              1. Information We Collect
            </h2>
            <p className="mb-3">
              {brand.name} collects and processes the following information:
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>
                <strong>Account Information:</strong> Email address for authentication
              </li>
              <li>
                <strong>Event Information:</strong> Event names, dates, times, locations, and spot limits
              </li>
              <li>
                <strong>Signup Information:</strong> Names, contact information (email, phone), and preferences provided during event signups
              </li>
              <li>
                <strong>Invitation Data:</strong> Email addresses and names of individuals you invite to events
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              2. How We Use Your Information
            </h2>
            <p className="mb-3">We use the collected information to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Provide and maintain the {brand.name} service</li>
              <li>Send authentication emails (magic links)</li>
              <li>Send event invitations on your behalf</li>
              <li>Enable event organizers to manage signups and track attendance</li>
              <li>Communicate important service updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              3. Information Sharing
            </h2>
            <p className="mb-3">
              We do not sell, trade, or rent your personal information to third parties. We only share information:
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>
                With event organizers (when you sign up for their events, they can see your signup information)
              </li>
              <li>
                With email service providers (Resend) to deliver authentication and invitation emails
              </li>
              <li>
                When required by law or to protect our rights
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              4. Data Security
            </h2>
            <p>
              We use industry-standard security measures to protect your information, including:
            </p>
            <ul className="list-disc ml-6 space-y-2 mt-3">
              <li>Encrypted data transmission (HTTPS/SSL)</li>
              <li>Secure authentication via Supabase</li>
              <li>Database security with row-level security policies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              5. Your Rights
            </h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Withdraw consent for email communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              6. Data Retention
            </h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide services.
              Event signup data is retained as long as the event organizer maintains the event. You may request
              deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              7. Cookies and Tracking
            </h2>
            <p>
              {brand.name} uses essential cookies to maintain your authentication session. We do not use
              advertising cookies or third-party tracking.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              8. Children's Privacy
            </h2>
            <p>
              {brand.name} is not intended for children under 13. We do not knowingly collect personal
              information from children under 13. Event organizers are responsible for ensuring appropriate
              consent for youth participants.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              9. Changes to Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of significant
              changes via email or through the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              10. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your rights, please contact us at:
            </p>
            <p className="mt-3">
              <a
                href={`mailto:${brand.supportEmail}`}
                className="text-[#0E96B0] hover:text-[#08647E] font-medium"
              >
                {brand.supportEmail}
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
