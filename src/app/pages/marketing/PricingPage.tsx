// Public pricing page with plan cards, comparison table, and trial FAQ.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Minus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../../../lib/api/client";
import { DEFAULT_DESCRIPTION, SUPPORT_EMAIL } from "../../../lib/seo";
import { SocialShare } from "../../components/marketing/SocialShare";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { MarketingChrome } from "./MarketingChrome";
import { MARKETING_FAQS } from "./faq-content";

type PlanRow = {
  code: string;
  name: string;
  monthly_price: number;
  description: string;
  features: string[];
  entitlements: Record<string, unknown>;
  flags?: Record<string, boolean>;
  self_serve: boolean;
  is_featured: boolean;
  contact_admin?: boolean;
  bookings_per_month?: number | null;
  team_members?: number | null;
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount);
}

function limitLabel(value: number | null | undefined, unlimited: string, numbered: (n: number) => string) {
  if (value == null) return unlimited;
  return numbered(value);
}

const COMPARE_ROWS: Array<{ label: string; value: (plan: PlanRow) => string | boolean }> = [
  {
    label: "Bookings / month",
    value: (plan) =>
      limitLabel(plan.bookings_per_month ?? (plan.entitlements.bookings_per_month as number | null), "Unlimited", (n) =>
        `Up to ${n}`
      ),
  },
  {
    label: "Team seats",
    value: (plan) =>
      limitLabel(plan.team_members ?? (plan.entitlements.team_members as number | null), "Unlimited", (n) =>
        n === 1 ? "Owner only" : `Up to ${n}`
      ),
  },
  {
    label: "Public booking page",
    value: (plan) => plan.flags?.mobile_booking_page ?? true,
  },
  {
    label: "Paystack payments",
    value: (plan) => plan.flags?.payment_processing ?? Boolean(plan.entitlements.payment_processing),
  },
  {
    label: "Email reminders",
    value: (plan) => plan.flags?.email_reminders ?? Boolean(plan.entitlements.client_reminders_email),
  },
  {
    label: "Orion AI",
    value: (plan) => plan.flags?.ai_assistant ?? Boolean(plan.entitlements.ai_assistant),
  },
  {
    label: "SMS reminders",
    value: (plan) => plan.flags?.client_reminders_sms ?? Boolean(plan.entitlements.client_reminders_sms),
  },
  {
    label: "WhatsApp reminders",
    value: (plan) => plan.flags?.client_reminders_whatsapp ?? Boolean(plan.entitlements.client_reminders_whatsapp),
  },
  {
    label: "Multi-location",
    value: (plan) => plan.flags?.multi_location ?? Boolean(plan.entitlements.multi_location),
  },
  {
    label: "White-label",
    value: (plan) => plan.flags?.white_label ?? Boolean(plan.entitlements.white_label),
  },
  {
    label: "Voice / AI calls",
    value: (plan) => plan.flags?.client_reminders_voice ?? Boolean(plan.entitlements.client_reminders_voice),
  },
];

function PlanSkeleton() {
  return (
    <div className="h-[34rem] rounded-3xl border border-gray-200 bg-white animate-pulse" />
  );
}

export function PricingPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  usePageMeta({
    title: "Pricing",
    description:
      "Orheo plans in Naira: Standard ₦10,000, Premium ₦25,000, Enterprise contact admin. 7-day free trial, no credit card.",
    path: "/pricing",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Orheo",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DEFAULT_DESCRIPTION,
      offers: plans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.contact_admin || !plan.self_serve ? undefined : String(plan.monthly_price),
        priceCurrency: "NGN",
        description: plan.description,
      })),
    },
  });

  useEffect(() => {
    api
      .listSubscriptionPlans()
      .then((rows) => setPlans(rows as PlanRow[]))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const ordered = useMemo(
    () =>
      [...plans].sort((a, b) => {
        const order = ["standard", "premium", "enterprise"];
        return order.indexOf(a.code) - order.indexOf(b.code);
      }),
    [plans]
  );

  const previewFaqs = MARKETING_FAQS.filter((item) => ["trial", "plans", "payments"].includes(item.id));

  return (
    <MarketingChrome>
      <section className="relative isolate overflow-hidden pt-32 pb-40 bg-[#050508]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,209,154,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(61,90,254,0.2),_transparent_50%)]" />
          <div className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#00D19A]/20 blur-3xl" />
          <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-[#3D5AFE]/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.1]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at center, black 35%, transparent 75%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <nav className="text-sm text-white/50 mb-8">
            <Link to="/" className="hover:text-white">
              Home
            </Link>
            <span className="mx-2 text-white/25">/</span>
            <span className="text-white/80">Pricing</span>
          </nav>
          <p className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium tracking-[0.16em] uppercase text-[#00D19A] mb-5">
            NGN · billed monthly
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-5 leading-[1.1]">
            Pricing that stays out of{" "}
            <span className="bg-gradient-to-r from-[#00D19A] to-[#3D5AFE] bg-clip-text text-transparent">
              your way
            </span>
          </h1>
          <p className="text-lg text-white/65 max-w-xl mx-auto">
            Seven days free on Standard. No card. Pick Premium when you need Orion and a team — or ask us about
            white-label.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-28 pb-8 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {plansLoading && (
            <>
              <PlanSkeleton />
              <PlanSkeleton />
              <PlanSkeleton />
            </>
          )}
          {!plansLoading && ordered.length === 0 && (
            <p className="md:col-span-3 text-center text-gray-500 py-16">Pricing is unavailable right now.</p>
          )}
          {ordered.map((plan, index) => {
            const contactAdmin = Boolean(plan.contact_admin || !plan.self_serve);
            const featured = plan.is_featured;
            return (
              <motion.article
                key={plan.code}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.45 }}
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
                className={`relative flex flex-col rounded-3xl bg-white text-gray-900 p-7 md:p-8 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] ${
                  featured ? "ring-2 ring-[#00D19A]" : "ring-1 ring-gray-200/80"
                }`}
              >
                {featured && (
                  <div className="mb-5">
                    <span className="inline-flex rounded-full bg-gradient-to-r from-[#00D19A] to-[#3D5AFE] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  </div>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
                <p className="mt-1 text-sm min-h-[44px] text-gray-500">{plan.description}</p>
                <div className="mt-6 mb-7">
                  {contactAdmin ? (
                    <>
                      <p className="text-sm text-gray-400">Custom</p>
                      <p className="text-3xl font-bold tracking-tight mt-1">Contact admin</p>
                    </>
                  ) : (
                    <div className="flex items-end gap-1.5">
                      <span className="text-lg font-medium mb-1 text-gray-400">₦</span>
                      <span className="text-5xl font-bold tracking-tight leading-none">
                        {formatAmount(plan.monthly_price)}
                      </span>
                      <span className="text-sm mb-1 text-gray-400">/mo</span>
                    </div>
                  )}
                </div>
                {plan.self_serve ? (
                  <Link
                    to="/signup"
                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-colors ${
                      featured
                        ? "bg-[#00D19A] text-black hover:bg-[#00D19A]/90"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    }`}
                  >
                    Start 7-day trial
                  </Link>
                ) : (
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="block w-full py-3 rounded-xl font-semibold text-center transition-colors bg-gray-100 text-gray-900 hover:bg-gray-200"
                  >
                    Talk to us
                  </a>
                )}
                <div className="mt-7 mb-5 h-px bg-gray-100" />
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm leading-snug text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>
        <p className="text-center text-sm text-gray-500 mt-10">
          Trial uses Standard entitlements.{" "}
          <Link to="/faq#trial" className="text-gray-800 underline underline-offset-4 decoration-gray-300 hover:decoration-gray-800">
            How billing works
          </Link>
        </p>
      </section>

      {ordered.length > 0 && (
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900">Side by side</h2>
              <p className="mt-2 text-gray-500">Everything included, without the brochure language.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl ring-1 ring-gray-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)]">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-400 px-5 py-4 w-[34%]"> </th>
                    {ordered.map((plan) => (
                      <th
                        key={plan.code}
                        className={`px-4 py-4 font-semibold text-center ${
                          plan.is_featured ? "text-gray-900 bg-[#00D19A]/10" : "text-gray-700"
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, i) => (
                    <tr key={row.label} className={i % 2 === 0 ? "bg-gray-50/70" : "bg-white"}>
                      <td className="px-5 py-3.5 text-gray-600">{row.label}</td>
                      {ordered.map((plan) => {
                        const value = row.value(plan);
                        return (
                          <td
                            key={`${plan.code}-${row.label}`}
                            className={`px-4 py-3.5 text-center ${plan.is_featured ? "bg-[#00D19A]/10" : ""}`}
                          >
                            {typeof value === "string" ? (
                              <span className="text-gray-800 font-medium">{value}</span>
                            ) : value ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              </span>
                            ) : (
                              <Minus className="h-4 w-4 text-gray-300 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Questions, briefly</h2>
          <div className="rounded-2xl ring-1 ring-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {previewFaqs.map((item) => (
              <div key={item.id} className="px-6 py-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.question}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link to="/faq" className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-primary">
              All questions
              <ArrowRight className="h-4 w-4" />
            </Link>
            <SocialShare title="Orheo pricing — Standard, Premium, and Enterprise" path="/pricing" />
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden py-20 px-6 bg-[#050508]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,209,154,0.16),_transparent_60%)]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Try it for a week. Keep it if it fits.</h2>
          <p className="text-white/60 mb-8">
            No card on trial.{" "}
            <Link to="/privacy" className="text-white/80 underline underline-offset-4">
              Privacy
            </Link>
            {" and "}
            <Link to="/terms" className="text-white/80 underline underline-offset-4">
              terms
            </Link>
            {" are here when you need them."}
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#00D19A] text-black font-semibold hover:bg-[#00D19A]/90"
          >
            Create your account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingChrome>
  );
}
