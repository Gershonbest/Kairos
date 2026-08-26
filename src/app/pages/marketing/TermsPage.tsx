// Terms of service for Orheo Bookings.

import { Link } from "react-router";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { SUPPORT_EMAIL } from "../../../lib/seo";
import { MarketingChrome } from "./MarketingChrome";

export function TermsPage() {
  usePageMeta({
    title: "Terms of Service",
    description:
      "Terms for using Orheo: accounts, trials, paid plans, acceptable use, and limitation of liability.",
    path: "/terms",
  });

  return (
    <MarketingChrome>
      <article className="pt-28 pb-16 md:pb-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <nav className="text-sm text-gray-500 mb-6">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">Terms of Service</span>
          </nav>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: 26 August 2026</p>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            <p>
              These terms govern use of Orheo’s booking CRM, public booking pages, and related services. By creating an
              account or using the product you agree to them. See also our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">1. Accounts and workspaces</h2>
              <p>
                You must provide accurate signup information and keep credentials secure. The owner is responsible for
                staff invited into the workspace and for content published on the public booking page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">2. Trial and paid plans</h2>
              <p>
                New workspaces receive a 7-day trial on Standard entitlements, described on the{" "}
                <Link to="/pricing" className="text-primary hover:underline">
                  pricing page
                </Link>
                . Self-serve plans (Standard and Premium) are billed monthly via Paystack. Enterprise is provisioned by
                Orheo admin. Features and limits follow the live catalog; we may update it with notice in-product.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">3. Acceptable use</h2>
              <p>
                Do not use Orheo to send spam, process unlawful payments, abuse Orion, or attempt to access another
                tenant’s data. We may suspend workspaces that violate these terms or create security risk.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">4. Client bookings</h2>
              <p>
                You are the merchant of record for services you sell. Orheo provides software to take bookings and
                deposits; fulfilment, refunds to clients, and professional standards remain yours.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">5. Availability</h2>
              <p>
                We aim for reliable uptime but do not guarantee uninterrupted service. Scheduled maintenance will be
                communicated when practical.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">6. Liability</h2>
              <p>
                To the extent permitted by law, Orheo is not liable for lost profits, missed appointments, or indirect
                damages. Our aggregate liability for a paid workspace is limited to fees paid to Orheo in the three
                months before the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">7. Contact</h2>
              <p>
                Questions:{" "}
                <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                . Common answers live in the{" "}
                <Link to="/faq" className="text-primary hover:underline">
                  FAQ
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </article>
    </MarketingChrome>
  );
}
