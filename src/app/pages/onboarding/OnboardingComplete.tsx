import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, BadgeCheck, Sparkles, LayoutDashboard, PlusCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { motion } from "motion/react";

export function OnboardingComplete() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate("/dashboard", { replace: true }), 3200);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <OnboardingShell
      step={2}
      totalSteps={2}
      title="Merchant Account Activated!"
      description="Your business profile & Paystack settlement pipeline are configured. Redirecting to your Executive Dashboard..."
      badge="Onboarding Complete"
      previewData={{
        previewType: "complete",
      }}
    >
      <div className="space-y-6 text-center py-4">
        {/* Animated Celebration Hero */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-600 shadow-lg shadow-emerald-600/20 ring-8 ring-emerald-500/10"
        >
          <BadgeCheck className="h-10 w-10 text-white" />
        </motion.div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Ready for Instant Client Bookings
          </h2>
          <p className="text-xs text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
            Your store is live. Clients can now view your public booking profile, schedule slots, and deposit payments straight to your bank account.
          </p>
        </div>

        {/* Animated Redirect Progress Bar */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-500 font-medium">
            <span>Taking you to Dashboard...</span>
            <span className="text-emerald-700 font-mono font-semibold">Redirecting</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, ease: "linear" }}
              className="h-full bg-slate-900"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row pt-2">
          <Button
            asChild
            className="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-semibold shadow-md shadow-slate-900/10 py-5 transition-all"
          >
            <Link to="/dashboard/services">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add First Service
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="flex-1 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 py-5 font-semibold shadow-sm transition-all"
          >
            <Link to="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4 text-slate-900" />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </OnboardingShell>
  );
}

