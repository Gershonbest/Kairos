// Public FAQ for Orheo plans, trial, payments, and data.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { SocialShare } from "../../components/marketing/SocialShare";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { MarketingChrome } from "./MarketingChrome";
import { MARKETING_FAQS } from "./faq-content";

export function FaqPage() {
  const [openItem, setOpenItem] = useState<string | undefined>();

  usePageMeta({
    title: "FAQ",
    description:
      "Answers about Orheo’s 7-day trial, Standard and Premium plans, Paystack payments, Orion AI, team seats, and data privacy.",
    path: "/faq",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: MARKETING_FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  });

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (id) setOpenItem(id);
  }, []);

  return (
    <MarketingChrome>
      <section className="pt-28 pb-16 md:pb-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-3xl mx-auto px-6">
          <nav className="text-sm text-gray-500 mb-6">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">FAQ</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Frequently asked questions</h1>
          <p className="text-lg text-gray-600 mb-10">
            Billing, Orion, reminders, and data. For plan amounts see{" "}
            <Link to="/pricing" className="text-primary hover:underline">
              pricing
            </Link>
            . For how we handle personal data, read the{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>

          <Accordion
            type="single"
            collapsible
            value={openItem ?? ""}
            onValueChange={(value) => setOpenItem(value || undefined)}
          >
            {MARKETING_FAQS.map((item) => (
              <AccordionItem key={item.id} value={item.id} id={item.id} className="scroll-mt-28">
                <AccordionTrigger className="text-base text-gray-900">{item.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-gray-600 leading-relaxed">{item.answer}</p>
                  {item.id === "plans" && (
                    <p className="mt-3">
                      <Link to="/pricing" className="text-primary hover:underline">
                        Open the pricing page
                      </Link>
                    </p>
                  )}
                  {item.id === "data" && (
                    <p className="mt-3">
                      <Link to="/privacy" className="text-primary hover:underline">
                        Read the privacy policy
                      </Link>
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6">
            <div>
              <p className="font-semibold text-gray-900">Still need help?</p>
              <p className="text-sm text-gray-600">
                Email{" "}
                <a className="text-primary hover:underline" href="mailto:support@orheobookings.com">
                  support@orheobookings.com
                </a>{" "}
                or{" "}
                <Link to="/signup" className="text-primary hover:underline">
                  start a trial
                </Link>
                .
              </p>
            </div>
            <SocialShare title="Orheo FAQ — trial, plans, and payments" path="/faq" />
          </div>
        </div>
      </section>
    </MarketingChrome>
  );
}
