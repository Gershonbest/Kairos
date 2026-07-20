// Onboarding step to connect Paystack subaccount for booking settlements.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { CreditCard, Check } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { api } from "../../../lib/api/client";

export function PaymentIntegration() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [businessName, setBusinessName] = useState("");
  const [settlementBank, setSettlementBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);

  useEffect(() => {
    api
      .listPaystackBanks()
      .then((rows) => setBanks(rows.map((b) => ({ name: b.name, code: b.code }))))
      .catch(() => setError("Unable to load Paystack banks. Check server Paystack configuration."))
      .finally(() => setBanksLoading(false));

    api
      .myTenant()
      .then((tenant) => {
        if (tenant.name) setBusinessName(tenant.name);
      })
      .catch(() => null);
  }, []);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!settlementBank || !accountNumber.trim()) {
      setError("Bank and account number are required.");
      return;
    }
    setIsLoading(true);
    try {
      await api.connectPaymentProvider({
        provider: "paystack",
        business_name: businessName.trim() || undefined,
        settlement_bank: settlementBank,
        account_number: accountNumber.trim(),
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect Paystack subaccount.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    navigate("/dashboard");
  };

  return (
    <OnboardingShell
      step={4}
      title="Connect Paystack"
      description="Create a settlement subaccount so client booking payments split between you and Kairos"
    >
      <form onSubmit={handleComplete} className="space-y-6">
        <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Paystack</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">Required</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Clients pay Kairos via Paystack. Your share settles to this bank account; Kairos keeps the platform fee.
              </p>
            </div>
            <Check className="w-5 h-5 text-primary ml-auto" />
          </div>
        </div>

        <div>
          <Label htmlFor="businessName">Settlement business name</Label>
          <Input
            id="businessName"
            className="mt-1"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Your business name on Paystack"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label htmlFor="bank">Settlement bank</Label>
          <select
            id="bank"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={settlementBank}
            onChange={(e) => setSettlementBank(e.target.value)}
            disabled={isLoading || banksLoading}
            required
          >
            <option value="">{banksLoading ? "Loading banks..." : "Select bank"}</option>
            {banks.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="accountNumber">Account number</Label>
          <Input
            id="accountNumber"
            className="mt-1"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="0123456789"
            required
            disabled={isLoading}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" className="flex-1" loading={isLoading} loadingLabel="Connecting...">
            Connect Paystack & finish
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={handleSkip} disabled={isLoading}>
            Skip for now
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}
