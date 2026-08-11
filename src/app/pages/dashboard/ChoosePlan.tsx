// Plan selection and subscription activation after trial.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Check, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { api, clearAuthTokens } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { markWelcomeAfterPayment } from "../../../lib/auth/welcome";

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const paymentHandledRef = useRef(false);
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const planInitializedRef = useRef(false);

  const {
    data: plans = [],
    isPending: plansPending,
    isError: plansFailed,
  } = useQuery({
    queryKey: queryKeys.subscriptionPlans,
    queryFn: () => api.listSubscriptionPlans(),
    staleTime: 5 * 60_000,
  });

  const {
    data: status = null,
    isPending: statusPending,
    isError: statusFailed,
  } = useQuery({
    queryKey: queryKeys.subscriptionStatus,
    queryFn: () => api.getSubscriptionStatus(),
  });

  const isLoading = (plansPending || statusPending) && plans.length === 0 && !status;
  const isSuspended = status?.status === "suspended";
  const isDeactivated = status?.status === "inactive";
  const lockedOut = Boolean(status?.requires_plan_selection) && !paymentVerified;
  const trialExpired = lockedOut && !isSuspended && !isDeactivated;

  async function refreshSubscriptionCaches() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionStatus }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant }),
    ]);
  }

  function goToDashboard() {
    navigate("/dashboard", { replace: true });
  }

  useEffect(() => {
    if (planInitializedRef.current || plans.length === 0 || !status) return;
    planInitializedRef.current = true;
    const defaultPlan =
      plans.find((p) => p.is_featured)?.code ??
      plans.find((p) => p.code === status.plan_code)?.code ??
      plans[0]?.code;
    if (defaultPlan) setSelectedPlan(defaultPlan);
  }, [plans, status]);

  useEffect(() => {
    if (plansFailed || statusFailed) {
      setError("Unable to load plans.");
    }
  }, [plansFailed, statusFailed]);

  useEffect(() => {
    if (paymentHandledRef.current) return;
    const paymentFlag = searchParams.get("payment");
    const reference = searchParams.get("reference") || searchParams.get("trxref");
    if (paymentFlag !== "1" || !reference) return;

    paymentHandledRef.current = true;
    setIsActivating(true);
    setError("");
    api
      .verifyPaymentReference(reference)
      .then(async (result) => {
        if (!result.ok) {
          throw new Error("Payment was not successful yet. Try again in a moment.");
        }
        // Verification activates the plan and queues the receipt email. Require
        // a fresh login so the restored account starts with a clean session.
        clearAuthTokens();
        markWelcomeAfterPayment();
        navigate("/auth/login?payment=success", { replace: true });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to verify payment."))
      .finally(() => setIsActivating(false));
  }, [navigate, searchParams]);

  async function handleActivate() {
    setError("");
    setSuccess("");
    const plan = plans.find((item) => item.code === selectedPlan);
    if (!plan) return;
    if (!plan.self_serve) {
      setError("This plan requires a sales conversation. Email support@kairosbookings.com");
      return;
    }

    setIsActivating(true);
    try {
      const checkout = await api.checkoutSubscriptionPlan(selectedPlan);
      if (checkout.authorization_url) {
        window.location.href = checkout.authorization_url;
        return;
      }
      await refreshSubscriptionCaches();
      const latest = await api.getSubscriptionStatus();
      queryClient.setQueryData(queryKeys.subscriptionStatus, latest);
      setPaymentVerified(true);
      markWelcomeAfterPayment();
      setSuccess(`Welcome to your account! You're now on the ${plan.name} plan.`);
      if (!latest.requires_plan_selection) {
        setTimeout(() => {
          goToDashboard();
        }, 800);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start checkout.";
      if (message.toLowerCase().includes("not configured") || message.toLowerCase().includes("paystack")) {
        try {
          await api.activateSubscriptionPlan(selectedPlan);
          await refreshSubscriptionCaches();
          const latest = await api.getSubscriptionStatus();
          queryClient.setQueryData(queryKeys.subscriptionStatus, latest);
          setPaymentVerified(true);
          markWelcomeAfterPayment();
          setSuccess(`Welcome to your account! You're now on the ${plan.name} plan.`);
          if (!latest.requires_plan_selection) {
            setTimeout(() => {
              goToDashboard();
            }, 800);
          }
          return;
        } catch (activateErr) {
          setError(activateErr instanceof Error ? activateErr.message : message);
          return;
        }
      }
      setError(message);
    } finally {
      setIsActivating(false);
    }
  }

  if (isLoading) {
    return <BrandLoader label="Preparing plans" fullscreen />;
  }

  if (isDeactivated) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-8">
          <h1 className="text-2xl font-semibold text-destructive">Business deactivated</h1>
          <p className="text-sm">
            {status?.warning_message || "This business has been deactivated."}
          </p>
          <p className="text-sm">
            Contact{" "}
            <a className="underline" href="mailto:support@kairosbookings.com">
              support@kairosbookings.com
            </a>{" "}
            to restore it.
          </p>
        </div>
      </div>
    );
  }

  const verifyingPayment = searchParams.get("payment") === "1" && isActivating && !paymentVerified;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {!lockedOut && (
        <div>
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 text-muted-foreground">
            <Link to="/dashboard">
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      )}

      {isSuspended && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-destructive">Your account is suspended</p>
            <p className="text-sm text-muted-foreground">
              {status?.warning_message ||
                "Your account is suspended. Please contact support."}{" "}
              Dashboard, bookings, and your public booking page stay locked until a plan payment
              clears. If you have already paid, contact{" "}
              <a className="underline" href="mailto:support@kairosbookings.com">
                support@kairosbookings.com
              </a>
              .
            </p>
          </div>
        </div>
      )}

      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 dark:bg-primary/20 px-3 py-1 text-sm text-primary dark:text-primary-foreground">
          <Sparkles className="w-4 h-4" />
          {isSuspended ? "Account suspended" : trialExpired ? "Trial ended" : "Choose your plan"}
        </div>
        <h1 className="text-3xl font-semibold">
          {isSuspended
            ? "Reactivate your account"
            : trialExpired
              ? "Continue with Orheo"
              : "Upgrade before your trial ends"}
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {isSuspended
            ? "Choose a plan and complete payment to restore access to your dashboard, bookings, and clients."
            : trialExpired
              ? "Your 7-day free trial has ended. Select a plan to restore full access to your dashboard, bookings, and clients."
              : status?.warning_message ||
                "Pick the plan that fits your business. You can change plans later as you grow."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.code;
          return (
            <Card
              key={plan.code}
              className={`cursor-pointer transition-all ${
                isSelected ? "border-primary ring-2 ring-primary/20" : "hover:border-border"
              } ${plan.is_featured ? "shadow-lg" : ""}`}
              onClick={() => setSelectedPlan(plan.code)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.name}</span>
                  {plan.is_featured && (
                    <span className="text-xs font-medium bg-primary text-white px-2 py-1 rounded-full">
                      Popular
                    </span>
                  )}
                </CardTitle>
                <p className="text-2xl font-semibold">
                  {formatPrice(plan.monthly_price)}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
                {!plan.self_serve && (
                  <p className="text-xs text-muted-foreground pt-2">Contact sales for Enterprise onboarding.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium">Selected plan: {plans.find((p) => p.code === selectedPlan)?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              Secure Paystack checkout — card, bank transfer, OPay, USSD, and more. Your plan activates for 30 days after payment.
            </p>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={handleActivate}
            loading={isActivating}
            loadingLabel="Redirecting..."
            disabled={!plans.find((p) => p.code === selectedPlan)?.self_serve || paymentVerified}
          >
            Pay now
          </Button>
        </CardContent>
      </Card>

      {verifyingPayment && (
        <p className="text-sm text-muted-foreground text-center">Verifying your payment…</p>
      )}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      {success && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-accent text-center">{success}</p>
          <Button className="bg-primary hover:bg-primary/90" onClick={goToDashboard}>
            Go to dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
