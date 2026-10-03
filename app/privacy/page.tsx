import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = `Privacy Policy — ${brand.shortName}`;
  const description = `How ${brand.name} collects, uses, and protects your information.`;
  const url = `${brand.siteUrl}/privacy`;
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/privacy",
    },
    openGraph: {
      title,
      description,
      url,
      siteName: brand.shortName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
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
            Last updated: October 3, 2026
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
              <li>
                <strong>Google Calendar connection data</strong> (only if an organizer chooses to connect Google Calendar): the Google account email, an encrypted refresh token, the chosen calendar’s identifier and display name, and identifiers of calendar events we create for synced time slots
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
              <li>
                Optionally write filled time slots onto a Google Calendar the organizer chooses, when they turn on Google Calendar sync
              </li>
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
                With Google, when an organizer opts in to Google Calendar sync, so that filled time slots can be written onto the organizer’s chosen calendar (see section 4)
              </li>
              <li>
                When required by law or to protect our rights
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              4. Google Calendar
            </h2>
            <p className="mb-3">
              Google Calendar sync is optional. An organizer must connect a Google account in organization
              settings and then enable sync on an event. {brand.name} does not connect to Google Calendar
              unless the organizer does this.
            </p>
            <p className="mb-3">
              When an organizer connects Google Calendar, we request permission to list calendars they can
              write to and to create, update, and delete calendar events needed to keep filled signup slots
              in sync. We use that access only to provide this feature. We do not use Google user data for
              advertising, credit scoring, or unrelated analytics. We do not sell Google user data. We do
              not transfer Google user data to other parties except as needed to write events onto the
              organizer’s own Google Calendar, or as required by law.
            </p>
            <p className="mb-3">
              {brand.name}&apos;s use of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-[#0E96B0] hover:text-[#08647E] font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="mb-3">
              If calendar sync is enabled for an event, each filled time slot is written as a Google Calendar
              event. That event includes the event name and the signup name. It may also include phone number,
              email address, guest names, and notes. Contact details and notes are placed in the event
              description, not the title. Anyone with access to that Google Calendar — including people the
              organizer has shared it with — can see those details. If the organizer turns on leader
              invitations, we may add the event leader’s email as an attendee so Google can send a calendar
              invitation.
            </p>
            <p className="mb-3">
              An organizer can disconnect Google Calendar in organization settings. We then revoke our Google
              access token and stop writing to that calendar. Canceling a signup while sync is still on will
              update or remove the matching Google Calendar event. Disconnecting or turning sync off does not
              automatically delete events already on the calendar; the calendar owner can delete those in
              Google Calendar.
            </p>
            <p>
              Information stored in Google Calendar is also subject to Google’s terms and privacy policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              5. Data Security
            </h2>
            <p>
              We use industry-standard security measures to protect your information, including:
            </p>
            <ul className="list-disc ml-6 space-y-2 mt-3">
              <li>Encrypted data transmission (HTTPS/SSL)</li>
              <li>Secure authentication via Supabase</li>
              <li>Database security with row-level security policies</li>
              <li>
                Encrypted storage of Google Calendar refresh tokens, with access limited to our server
                processes that perform calendar sync
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              6. Your Rights
            </h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Withdraw consent for email communications</li>
              <li>
                Disconnect Google Calendar in organization settings to revoke {brand.name}&apos;s access to
                that Google account
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              7. Data Retention
            </h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide services.
              Event signup data is retained as long as the event organizer maintains the event. Encrypted Google
              Calendar tokens are kept until the organizer disconnects Google Calendar or the connection is
              revoked. Identifiers of Google Calendar events we created are removed when the matching signup
              slot is cleared or the event is deleted. You may request deletion of your data at any time by
              contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              8. Cookies and Tracking
            </h2>
            <p>
              {brand.name} uses essential cookies to maintain your authentication session. We do not use
              advertising cookies or third-party tracking.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              9. Children's Privacy
            </h2>
            <p>
              {brand.name} is not intended for children under 13. We do not knowingly collect personal
              information from children under 13. Event organizers are responsible for ensuring appropriate
              consent for youth participants.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              10. Changes to Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of significant
              changes via email or through the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0D2B35] mb-3">
              11. Contact Us
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
