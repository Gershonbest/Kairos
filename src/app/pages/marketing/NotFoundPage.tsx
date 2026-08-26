// Custom 404 for unknown public URLs.

import { Link } from "react-router";
import { ArrowRight, Calendar, CircleHelp, Home } from "lucide-react";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { MarketingChrome } from "./MarketingChrome";

const LINKS = [
  { to: "/", label: "Home", hint: "Product overview", icon: Home },
  { to: "/pricing", label: "Pricing", hint: "Plans in Naira", icon: Calendar },
  { to: "/faq", label: "FAQ", hint: "Trial, payments, Orion", icon: CircleHelp },
];

export function NotFoundPage() {
  usePageMeta({
    title: "Page not found",
    description: "This Orheo page does not exist. Continue to home, pricing, or FAQ.",
    path: "/404",
    noindex: true,
  });

  return (
    <MarketingChrome>
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-[#050508] to-white min-h-[70vh]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-[#00D19A] mb-4">404</p>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">This page took a wrong turn</h1>
          <p className="text-lg text-white/70 mb-10">
            The link may be outdated. Try one of these instead — or start a 7-day trial.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 text-left mb-10">
            {LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-2xl border border-white/15 bg-white/10 p-5 hover:bg-white/15 transition-colors"
              >
                <item.icon className="h-5 w-5 text-[#00D19A] mb-3" />
                <p className="font-semibold text-white">{item.label}</p>
                <p className="text-sm text-white/60">{item.hint}</p>
              </Link>
            ))}
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00D19A] text-black font-semibold hover:bg-[#00D19A]/90"
          >
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingChrome>
  );
}
