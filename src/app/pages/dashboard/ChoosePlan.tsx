// Plan selection and subscription activation after trial.

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { api } from "../../../lib/api/client";

interface Plan {
  code: string;
  name: string;
  monthly_price: number;
  description: string;
  features: string[];
  entitlements: Record<string, unknown>;
  self_serve: boolean;
  is_featured: boolean;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ChoosePlan() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.getSubscriptionStatus>> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    Promise.all([api.listSubscriptionPlans(), api.getSubscriptionStatus()])
      .then(([planRows, subscriptionStatus]) => {
        setPlans(planRows);
        setStatus(subscriptionStatus);
        const defaultPlan =
          planRows.find((p) => p.is_featured)?.code ??
          planRows.find((p) => p.code === subscriptionStatus.plan_code)?.code ??
          planRows[0]?.code;
        if (defaultPlan) {
          setSelectedPlan(defaultPlan);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load plans."))
      .finally(() => setIsLoading(false));
  }, []);

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
      const updated = await api.activateSubscriptionPlan(selectedPlan);
      setStatus(updated);
      setSuccess(`You're now on the ${plan.name} plan. Welcome back!`);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to activate plan.");
    } finally {
      setIsActivating(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading plans...</div>;
  }

  const trialExpired = status?.requires_plan_selection;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 dark:bg-purple-500/20 px-3 py-1 text-sm text-[#3B3680] dark:text-purple-100">
          <Sparkles className="w-4 h-4" />
          {trialExpired ? "Trial ended" : "Choose your plan"}
        </div>
        <h1 className="text-3xl font-semibold">
          {trialExpired ? "Continue with Kairos Bookings" : "Upgrade before your trial ends"}
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {trialExpired
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
                isSelected ? "border-[#3B3680] ring-2 ring-[#3B3680]/20" : "hover:border-border"
              } ${plan.is_featured ? "shadow-lg" : ""}`}
              onClick={() => setSelectedPlan(plan.code)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.name}</span>
                  {plan.is_featured && (
                    <span className="text-xs font-medium bg-[#3B3680] text-white px-2 py-1 rounded-full">
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
                    <Check className="w-4 h-4 text-[#2ECC71] mt-0.5 shrink-0" />
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
              Billing is simulated for now — your account will be activated immediately for 30 days.
            </p>
          </div>
          <Button
            className="bg-[#3B3680] hover:bg-[#2E2A5C]"
            onClick={handleActivate}
            loading={isActivating}
            loadingLabel="Activating..."
            disabled={!plans.find((p) => p.code === selectedPlan)?.self_serve}
          >
            Pay and activate plan
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      {success && <p className="text-sm text-[#2ECC71] text-center">{success}</p>}
    </div>
  );
}
