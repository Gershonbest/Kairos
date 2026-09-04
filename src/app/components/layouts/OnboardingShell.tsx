// Executive shell for onboarding steps — mature bright/light mode with live client preview.

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2,
  CreditCard,
  Sparkles,
  Clock,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Eye,
  ChevronDown,
  ChevronUp,
  Globe,
  BadgeCheck,
  Lock,
  Building2Icon,
} from "lucide-react";
import { resolveMediaUrl } from "../../../lib/media";
import { googleMapsEmbedUrl } from "../../../lib/data/locations";

const orheoLogo = new URL("../../../assets/branding/logo.png", import.meta.url).href;

export type OnboardingPreviewData = {
  businessName?: string;
  businessType?: string;
  logoUrl?: string;
  helpEmail?: string;
  countryCode?: string;
  dialCode?: string;
  phoneNumber?: string;
  state?: string;
  addressLine?: string;
  branchesCount?: number;
  settlementBankName?: string;
  accountNumber?: string;
  verifiedAccountName?: string;
  servicesCount?: number;
  previewType?: "business" | "payment" | "services" | "availability" | "complete";
};

type OnboardingShellProps = {
  step: number;
  totalSteps?: number;
  title: string;
  description: string;
  children: ReactNode;
  showProgress?: boolean;
  badge?: string;
  previewData?: OnboardingPreviewData;
};

const STEP_ITEMS = [
  { id: 1, key: "business", label: "Business Profile", icon: Building2 },
  { id: 2, key: "payment", label: "Settlement Account", icon: CreditCard },
  { id: 3, key: "services", label: "Services (Optional)", icon: Building2Icon },
  { id: 4, key: "availability", label: "Weekly Schedule", icon: Clock },
];

export function OnboardingShell({
  step,
  totalSteps = 4,
  title,
  description,
  children,
  showProgress = true,
  badge,
  previewData = {},
}: OnboardingShellProps) {
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const boundedStep = Math.max(1, Math.min(step, totalSteps));

  const displayBusinessName = previewData.businessName?.trim() || "Your Business Name";
  const displayBusinessType = previewData.businessType
    ? previewData.businessType.replace("_", " ").toUpperCase()
    : "PROFESSIONAL SERVICE";
  const displayLocation = previewData.state
    ? `${previewData.state}, ${previewData.countryCode || "NG"}`
    : "Location not set";
  // Build address query for map preview
  const addressQuery = previewData.addressLine && previewData.state && previewData.countryCode
    ? `${previewData.addressLine}, ${previewData.state}, ${previewData.countryCode}`
    : "";
  const displayPhone = previewData.phoneNumber
    ? `${previewData.dialCode || "+234"} ${previewData.phoneNumber}`
    : "Phone number";

  return (
    <div className="min-h-screen bg-slate-50/80 p-3 sm:p-6 lg:p-8 text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
      {/* Subtle Warm Backdrop Lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-100/60 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[450px] h-[450px] bg-amber-50/80 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-[500px] h-[500px] bg-slate-200/50 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl">
        {/* Executive Light Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-2 shadow-sm">
              <img src={orheoLogo} alt="Orheo logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xl font-bold tracking-tight text-slate-900"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  Orheo
                </span>
                <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                  Executive Suite
                </span>
              </div>
              <p className="text-xs text-slate-500">Merchant Onboarding Portal</p>
            </div>
          </div>

          {/* Stepper Navigation */}
          {showProgress && (
            <nav aria-label="Onboarding Progress" className="w-full lg:w-auto">
              <ol className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto py-1 no-scrollbar">
                {STEP_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isCompleted = item.id < boundedStep;
                  const isActive = item.id === boundedStep;

                  return (
                    <li key={item.id} className="flex items-center shrink-0">
                      <div
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                          isActive
                            ? "bg-slate-900 text-white shadow-md shadow-slate-900/10 ring-2 ring-slate-900/20 ring-offset-2 ring-offset-slate-50"
                            : isCompleted
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-slate-100/80 text-slate-500 border border-slate-200/80"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="whitespace-nowrap">{item.label}</span>
                      </div>
                      {item.id < STEP_ITEMS.length && (
                        <div className="mx-1.5 h-0.5 w-3 sm:w-6 bg-slate-200 rounded-full" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </header>

        {/* Mobile Toggle Live Preview Button */}
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-900" />
              {showMobilePreview ? "Hide Live Client Preview" : "Show Live Client Preview"}
            </span>
            {showMobilePreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Main Grid Layout */}
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* Left Column: Mature Form Card */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-7 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-9 shadow-xl shadow-slate-900/5"
          >
            <div className="mb-6 pb-6 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  {badge ? badge : `Step 0${boundedStep} of 0${totalSteps}`}
                </span>
                <span className="text-xs text-slate-400 font-medium">Auto-saved</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>

            {children}
          </motion.section>

          {/* Right Column: Live Interactive Client Preview (Light Theme) */}
          <aside
            className={`lg:col-span-5 ${
              showMobilePreview ? "block" : "hidden lg:block"
            } sticky top-6 transition-all duration-300`}
          >
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xl shadow-slate-900/5 space-y-5">
              {/* Preview Header Badge */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Live Client Booking Preview
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                  <Globe className="h-3 w-3 text-slate-600" />
                  <span>Public Page</span>
                </div>
              </div>

              {/* Browser Window Simulation */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
                {/* URL Bar */}
                <div className="flex items-center gap-2 bg-slate-100 px-3.5 py-2 border-b border-slate-200 text-[11px] text-slate-500 font-mono">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  </div>
                  <div className="mx-auto rounded bg-white border border-slate-200 px-3 py-0.5 text-slate-600 truncate max-w-[210px] text-center">
                    orheo.app/book/
                    {displayBusinessName.toLowerCase().replace(/[^a-z0-9]/g, "-")}
                  </div>
                </div>

                {/* Booking Page Header Canvas */}
                <div className="p-5 space-y-4 bg-white">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                      {previewData.logoUrl ? (
                        <img
                          src={resolveMediaUrl(previewData.logoUrl)}
                          alt="Business logo preview"
                          className="h-full w-full object-contain rounded-xl"
                        />
                      ) : (
                        <div className="h-full w-full rounded-xl bg-slate-900 flex items-center justify-center text-xl font-bold text-white">
                          {displayBusinessName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 tracking-wider uppercase">
                          {displayBusinessType}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <BadgeCheck className="h-3 w-3 text-emerald-600" /> Verified Merchant
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 truncate mt-1">{displayBusinessName}</h3>
                      <div className="mt-1 flex flex-col gap-1 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{displayLocation}</span>
                        </div>


                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{displayPhone}</span>
                        </div>
                        {previewData.helpEmail && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{previewData.helpEmail}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>


                  {/* Branches Pill */}
                  {Boolean(previewData.branchesCount && previewData.branchesCount > 0) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 flex items-center justify-between font-medium">
                      <span>Multi-location merchant</span>
                      <span className="font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded-md">
                        +{previewData.branchesCount} sub-locations
                      </span>
                    </div>
                  )}

                  {/* Contextual Step Preview Card */}

                  <AnimatePresence mode="wait">
                    {previewData.previewType === "payment" ? (
                      <motion.div
                        key="payment-preview"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-emerald-900 font-bold">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4 text-emerald-700" /> Paystack Instant Settlement
                          </span>
                          <span className="bg-emerald-100 border border-emerald-300 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-mono">
                            256-bit SSL
                          </span>
                        </div>
                        <p className="text-slate-700 font-medium">
                          Settlement Account:{" "}
                          <span className="font-bold text-slate-900">
                            {previewData.settlementBankName || "Bank Selected"}
                          </span>
                        </p>
                        {previewData.verifiedAccountName && (
                          <div className="rounded-lg bg-white border border-emerald-300 p-2.5 text-emerald-900 font-semibold flex items-center justify-between shadow-sm">
                            <span>{previewData.verifiedAccountName}</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          </div>
                        )}
                      </motion.div>
                    ) : previewData.previewType === "services" ? (
                      <motion.div
                        key="services-preview"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-slate-700 font-semibold">
                          <span>Client Booking Slot</span>
                          <span className="text-emerald-700 font-bold">Ready</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5 text-slate-900 font-semibold shadow-sm">
                          <span>Consultation & Appointment</span>
                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                            {previewData.servicesCount || 1} Service(s) Active
                          </span>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="default-preview"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-600 flex items-center gap-2"
                      >
                        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Clients can select available times, pay deposits, and receive instant email receipts.</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Trust Badges Footer */}
              <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 text-center font-medium">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <span className="block font-bold text-slate-900">Instant Sync</span>
                  <span className="text-slate-500 text-[10px]">Direct Calendar</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <span className="block font-bold text-slate-900">Paystack Payout</span>
                  <span className="text-slate-500 text-[10px]">Zero Delays</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <span className="block font-bold text-slate-900">Client Ready</span>
                  <span className="text-slate-500 text-[10px]">Public Link</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}


