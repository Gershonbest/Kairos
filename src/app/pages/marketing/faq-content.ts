export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const MARKETING_FAQS: FaqItem[] = [
  {
    id: "trial",
    question: "Is there a free trial?",
    answer:
      "Yes. New businesses get 7 days free on Standard entitlements — no credit card required. You can upgrade to Premium anytime from your dashboard.",
  },
  {
    id: "plans",
    question: "What’s the difference between Standard, Premium, and Enterprise?",
    answer:
      "Standard is for solo practitioners (1 seat, 150 bookings/month). Premium adds Orion AI, SMS and WhatsApp reminders, 5 team seats, and unlimited bookings. Enterprise is custom white-label — contact admin rather than self-serve checkout.",
  },
  {
    id: "payments",
    question: "How do payments work?",
    answer:
      "Client deposits and remaining balances run through Paystack (cards, bank transfer, USSD, and more). Your Orheo subscription is billed monthly in Naira on Standard and Premium.",
  },
  {
    id: "orion",
    question: "What is Orion?",
    answer:
      "Orion is Orheo’s AI assistant. On Premium and Enterprise it can help configure your business, answer client questions from your knowledge base, and book appointments on your public page.",
  },
  {
    id: "team",
    question: "Can I add staff on Standard?",
    answer:
      "Standard includes the owner seat only. Upgrade to Premium for up to 5 seats (including the owner), or talk to us about Enterprise for unlimited seats.",
  },
  {
    id: "reminders",
    question: "Which reminder channels are included?",
    answer:
      "Email reminders are on every plan. SMS and WhatsApp reminders are Premium and Enterprise. Voice / AI call reminders are Enterprise.",
  },
  {
    id: "cancel",
    question: "Can I cancel anytime?",
    answer:
      "Yes. There is no long-term contract on self-serve plans. You keep access until the end of the paid period. Export client and booking data from the dashboard before you leave if you need a copy.",
  },
  {
    id: "data",
    question: "Where is my business data stored?",
    answer:
      "Tenant data is isolated per business. See our Privacy Policy for what we collect, how Paystack and email/SMS providers are used, and how to request deletion.",
  },
];
