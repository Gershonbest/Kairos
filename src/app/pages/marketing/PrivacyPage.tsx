// Privacy policy for Orheo Bookings.

import { Link } from "react-router";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { SUPPORT_EMAIL } from "../../../lib/seo";
import { MarketingChrome } from "./MarketingChrome";

export function PrivacyPage() {
  usePageMeta({
    title: "Privacy Policy",
    description:
      "How Orheo collects, uses, and protects business and client data for bookings, payments, and reminders across Africa.",
    path: "/privacy",
  });

  return (
    <MarketingChrome>
      <article className="pt-28 pb-16 md:pb-24 bg-white">
        <div className="max-w-3xl mx-auto px-6 prose prose-gray">
          <nav className="text-sm text-gray-500 mb-6 not-prose">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">Privacy Policy</span>
          </nav>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: 26 August 2026</p>

          <p className="text-gray-700 leading-relaxed">
            Orheo (“we”) provides an AI-powered booking CRM for service businesses. This policy explains what we
            collect when you visit{" "}
            <Link to="/" className="text-primary hover:underline">
              www.orheo.com
            </Link>
            , create a workspace, or book as a client.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">1. Who this covers</h2>
          <p className="text-gray-700 leading-relaxed">
            <strong>Business users</strong> (owners, managers, staff) who sign up for Orheo.{" "}
            <strong>Clients</strong> who book through a business’s public page.{" "}
            <strong>Visitors</strong> to our marketing site (
            <Link to="/pricing" className="text-primary hover:underline">
              pricing
            </Link>
            ,{" "}
            <Link to="/faq" className="text-primary hover:underline">
              FAQ
            </Link>
            , this policy).
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">2. Data we collect</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>Account details: name, email, password hash, business name, and optional phone.</li>
            <li>Workspace data: services, availability, bookings, client profiles, and team invites.</li>
            <li>Payments: amounts, status, and Paystack references — we do not store full card numbers.</li>
            <li>Communications: reminder emails and, on eligible plans, SMS or WhatsApp content needed to deliver the message.</li>
            <li>Usage: login sessions, device/browser, and basic diagnostics to keep the product reliable.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">3. How we use it</h2>
          <p className="text-gray-700 leading-relaxed">
            We use this data to run bookings, collect deposits, send reminders, provide Orion where your plan allows,
            bill Orheo subscriptions, and secure the platform. We do not sell personal information.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">4. Processors</h2>
          <p className="text-gray-700 leading-relaxed">
            We use infrastructure and delivery partners such as hosting/database providers, Paystack for payments, and
            email/SMS vendors to send transactional messages. They only process data as needed to provide those
            services.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">5. Tenant isolation</h2>
          <p className="text-gray-700 leading-relaxed">
            Each business’s records are scoped to that workspace. Staff access follows the roles the owner assigns.
            Public booking pages only expose what that business chooses to publish.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">6. Retention and your rights</h2>
          <p className="text-gray-700 leading-relaxed">
            We keep account and booking data while the workspace is active and for a limited period afterward as
            required for fraud, tax, or dispute handling. You may request access, correction, or deletion of personal
            data by emailing{" "}
            <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            . Business owners can also export or delete client records from the dashboard.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">7. Cookies</h2>
          <p className="text-gray-700 leading-relaxed">
            We use essential cookies and local storage for sign-in sessions and preferences (such as theme). Marketing
            pages do not require an account cookie.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-3">8. Contact</h2>
          <p className="text-gray-700 leading-relaxed">
            Privacy questions:{" "}
            <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            . Related:{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/faq" className="text-primary hover:underline">
              FAQ
            </Link>
            .
          </p>
        </div>
      </article>
    </MarketingChrome>
  );
}
