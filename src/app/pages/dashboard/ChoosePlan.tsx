// Plan selection and subscription activation after trial.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { ErrorNote, PageHeader, PageShell } from "../../components/dashboard-ui";
import { api } from "../../../lib/api/client";
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const paymentHandledRef = useRef(false);
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [error, setError] = useState(
    typeof (location.state as { paymentError?: string } | null)?.paymentError === "string"
      ? (location.state as { paymentError: string }).paymentError
      : ""
  );
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
          if (result.status === "failed") {
            throw new Error(result.message || "Payment failed or was cancelled. You can try again.");
          }
          throw new Error(
            result.message || "Payment is still processing. Wait a moment, then refresh this page."
          );
        }
        markWelcomeAfterPayment();
        await refreshSubscriptionCaches();
        navigate("/dashboard", { replace: true });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to verify payment."))
      .finally(() => setIsActivating(false));
  }, [navigate, searchParams]);

  async function handleActivate() {
    setError("");
    setSuccess("");
    const plan = plans.find((item) => item.code === selectedPlan);
    if (!plan) return;
    if (!plan.self_serve || plan.contact_admin) {
      setError("This plan requires a conversation with Orheo admin. Email support@orheobookings.com");
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
      <PageShell width="narrow">
        <ErrorNote>
          <p className="font-semibold">Business deactivated</p>
          <p className="mt-1">
            {status?.warning_message || "This business has been deactivated."} Contact{" "}
            <a className="underline" href="mailto:support@orheobookings.com">
              support@orheobookings.com
            </a>{" "}
            to restore it.
          </p>
        </ErrorNote>
      </PageShell>
    );
  }

  const verifyingPayment = searchParams.get("payment") === "1" && isActivating && !paymentVerified;

  return (
    <PageShell>
      {!lockedOut && (
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-2 text-muted-foreground">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      )}

      {isSuspended && (
        <ErrorNote>
          <p className="font-medium">Your account is suspended</p>
          <p className="mt-1 text-muted-foreground">
            {status?.warning_message || "Your account is suspended. Please contact support."}{" "}
            Dashboard, bookings, and your public booking page stay locked until a plan payment
            clears. If you have already paid, contact{" "}
            <a className="underline" href="mailto:support@orheobookings.com">
              support@orheobookings.com
            </a>
            .
          </p>
        </ErrorNote>
      )}

      <PageHeader
        className="sm:items-center sm:text-center"
        title={
          isSuspended
            ? "Reactivate your account"
            : trialExpired
              ? "Continue with Orheo"
              : "Upgrade before your trial ends"
        }
        description={
          isSuspended
            ? "Choose a plan and complete payment to restore access to your dashboard, bookings, and clients."
            : trialExpired
              ? "Your 7-day free trial has ended. Select a plan to restore full access to your dashboard, bookings, and clients."
              : status?.warning_message ||
                "Pick the plan that fits your business. You can change plans later as you grow."
        }
      />

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
                    <span className="rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                      Popular
                    </span>
                  )}
                </CardTitle>
                <p className="text-2xl font-semibold">
                  {plan.contact_admin || !plan.self_serve ? (
                    "Contact Admin"
                  ) : (
                    <>
                      {formatPrice(plan.monthly_price)}
                      <span className="text-sm font-normal text-muted-foreground">/month</span>
                    </>
                  )}
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
                  <p className="text-xs text-muted-foreground pt-2">Contact admin for Enterprise onboarding.</p>
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
              {plans.find((p) => p.code === selectedPlan)?.self_serve
                ? "Secure Paystack checkout — card, bank transfer, OPay, USSD, and more. Your plan activates for 30 days after payment."
                : "Enterprise is provisioned by Orheo admin. Email support@orheobookings.com to get started."}
            </p>
          </div>
          {plans.find((p) => p.code === selectedPlan)?.self_serve ? (
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleActivate}
              loading={isActivating}
              loadingLabel="Redirecting..."
              disabled={paymentVerified}
            >
              Pay now
            </Button>
          ) : (
            <Button className="bg-primary hover:bg-primary/90" asChild>
              <a href="mailto:support@orheobookings.com">Contact Admin</a>
            </Button>
          )}
        </CardContent>
      </Card>

      {verifyingPayment && (
        <p className="text-center text-sm text-muted-foreground">Verifying your payment…</p>
      )}
      {error && <ErrorNote className="mx-auto max-w-xl">{error}</ErrorNote>}
      {success && (
        <div className="flex flex-col items-center gap-3">
          <ErrorNote tone="success">{success}</ErrorNote>
          <Button onClick={goToDashboard}>
            Go to dashboard
          </Button>
        </div>
      )}
    </PageShell>
  );
}
