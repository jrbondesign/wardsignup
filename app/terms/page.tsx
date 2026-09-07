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
    title: `Terms of Service — ${brand.shortName}`,
    description: `Terms and conditions for using ${brand.name}.`,
  };
}

export default async function TermsOfService() {
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
          Terms of Service
        </h1>

        <div className="space-y-6 text-[#2E5566]">
          <p className="text-sm text-[#5A8399]">
            Last updated: March 26, 2026
          </p>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using {brand.name}, you agree to be bound by these Terms of Service and all
              applicable laws and regulations. If you do not agree with any of these terms, you are
              prohibited from using this service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              2. Description of Service
            </h2>
            <p>
              {brand.name} provides a time-slot scheduling platform for religious organizations, community
              groups, and ministries to coordinate appointments, meetings, volunteer shifts, and similar
              events. The service allows users to create events with specific time slots and share signup
              links with participants.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              3. User Accounts
            </h2>
            <p className="mb-3">When you create an account, you agree to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Not share your account with others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              4. Acceptable Use
            </h2>
            <p className="mb-3">You agree NOT to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Use the service for any unlawful purpose</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Send spam or unsolicited invitations</li>
              <li>Impersonate others or provide false information</li>
              <li>Attempt to gain unauthorized access to the service</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Upload malicious code or viruses</li>
              <li>Collect user information without consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              5. Event Organizer Responsibilities
            </h2>
            <p className="mb-3">As an event organizer, you agree to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Only invite individuals who have consented to receive invitations</li>
              <li>Provide accurate event information</li>
              <li>Respect participant privacy and data</li>
              <li>Obtain appropriate consent for youth participants</li>
              <li>Use participant information only for the stated event purposes</li>
              <li>Comply with your organization's policies and procedures</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              6. Intellectual Property
            </h2>
            <p>
              The {brand.name} service, including its original content, features, and functionality, is owned
              by {brand.name} and is protected by international copyright, trademark, and other intellectual
              property laws. You may not copy, modify, or distribute any part of the service without
              permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              7. User Content
            </h2>
            <p className="mb-3">
              You retain ownership of any content you create on {brand.name} (event information, signup data).
              By using the service, you grant us a license to:
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Store and display your content as necessary to provide the service</li>
              <li>Send emails on your behalf for invitations and notifications</li>
              <li>Make automated backups of your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              8. Service Availability
            </h2>
            <p>
              {brand.name} is provided "as is" without warranties. We strive for 99% uptime but do not
              guarantee uninterrupted service. We reserve the right to modify, suspend, or discontinue any
              part of the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              9. Limitation of Liability
            </h2>
            <p>
              {brand.name} and its affiliates shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages resulting from your use of the service. Our total liability
              shall not exceed the amount you paid us in the past 12 months (if any).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              10. Data and Privacy
            </h2>
            <p>
              Your use of {brand.name} is also governed by our{" "}
              <Link href="/privacy" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                Privacy Policy
              </Link>
              . Please review it to understand how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              11. Termination
            </h2>
            <p className="mb-3">
              We reserve the right to terminate or suspend your account at any time for:
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Violation of these Terms of Service</li>
              <li>Fraudulent or illegal activity</li>
              <li>Prolonged inactivity</li>
              <li>Request from law enforcement</li>
            </ul>
            <p className="mt-3">
              You may terminate your account at any time by contacting us at {brand.supportEmail}.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              12. Indemnification
            </h2>
            <p>
              You agree to indemnify and hold harmless {brand.name} from any claims, damages, or expenses
              arising from your use of the service, your violation of these terms, or your violation of
              any rights of another party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              13. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. We will notify users of
              significant changes via email or through the service. Continued use of the service after
              changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              14. Governing Law
            </h2>
            <p>
              These Terms of Service shall be governed by and construed in accordance with the laws of
              the jurisdiction in which {brand.name} operates, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              15. Contact Information
            </h2>
            <p>
              If you have questions about these Terms of Service, please contact us at:
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

          <section className="border-t border-[rgba(14,150,176,0.15)] pt-6 mt-8">
            <p className="text-sm text-[#5A8399]">
              By using {brand.name}, you acknowledge that you have read, understood, and agree to be bound
              by these Terms of Service.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
