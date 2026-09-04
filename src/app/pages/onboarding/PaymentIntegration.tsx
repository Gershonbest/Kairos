// Onboarding step to connect Paystack subaccount for booking settlements.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { CreditCard, ShieldCheck, Zap } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { SettlementAccountFields, type VerifiedSettlementAccount } from "../../components/payments/SettlementAccountFields";
import { api, SessionExpiredError, SubscriptionRequiredError } from "../../../lib/api/client";
import { OnboardingAlert } from "../../components/onboarding/OnboardingAlert";
import { OnboardingStepActions } from "../../components/onboarding/OnboardingStepActions";
import { REQUIRED_ONBOARDING_TOTAL } from "./flow";
import { markWelcomeAfterPayment } from "../../../lib/auth/welcome";

export function PaymentIntegration() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [businessName, setBusinessName] = useState("");
  const [settlementBank, setSettlementBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedAccount, setVerifiedAccount] = useState<VerifiedSettlementAccount | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);

  useEffect(() => {
    api
      .listPaystackBanks()
      .then((rows) => setBanks(rows.map((b) => ({ name: b.name, code: b.code }))))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "";
        if (err instanceof SessionExpiredError || /session expired|unauthor|log in/i.test(message)) {
          setError("Please log in again, then return to this page to connect Paystack.");
          return;
        }
        if (err instanceof SubscriptionRequiredError || /402|trial|subscription/i.test(message)) {
          setError(message || "Your trial has ended. Choose a plan before connecting Paystack.");
          return;
        }
        if (/504|timeout|gateway/i.test(message)) {
          setError("Paystack is temporarily unreachable. Wait a moment and refresh this page.");
          return;
        }
        setError(message || "Unable to load Paystack banks. Check server Paystack configuration.");
      })
      .finally(() => setBanksLoading(false));

    api
      .myTenant()
      .then((tenant) => {
        if (tenant.name) setBusinessName(tenant.name);
      })
      .catch(() => null);
  }, []);

  const selectedBankObj = banks.find((b) => b.code === settlementBank);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!verifiedAccount || verifiedAccount.bank_code !== settlementBank || verifiedAccount.account_number !== accountNumber.trim()) {
      setError("Verify the account number before connecting Paystack.");
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
      markWelcomeAfterPayment();
      navigate(OPTIONAL_ONBOARDING_ROUTES.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect Paystack subaccount.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingShell
      step={2}
      totalSteps={REQUIRED_ONBOARDING_TOTAL}
      title="Connect Settlement Account"
      description="Connect your bank account to automatically receive client booking deposits directly to your bank."
      previewData={{
        businessName,
        settlementBankName: selectedBankObj?.name,
        accountNumber,
        verifiedAccountName: verifiedAccount?.account_name,
        previewType: "payment",
      }}
    >
      <form onSubmit={handleComplete} className="space-y-6">
        {error ? <OnboardingAlert tone="error" message={error} live="assertive" /> : null}

        {/* Paystack Merchant Trust Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">Paystack Merchant Settlement</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Required Integration
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                When clients book appointments on Orheo, deposits process via Paystack. Funds settle directly into your bank account with zero manual transfer delay.
              </p>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 font-semibold">
                <span className="flex items-center gap-1 text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> 256-bit Payout Encryption
                </span>
                <span className="flex items-center gap-1 text-slate-700">
                  <Zap className="w-3.5 h-3.5 text-slate-900" /> Direct Bank Settlement
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="businessName" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Settlement Business Name (Paystack Record)
          </Label>
          <Input
            id="businessName"
            className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 shadow-sm"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Your registered business name on Paystack"
            disabled={isLoading}
          />
        </div>

        <SettlementAccountFields
          banks={banks}
          banksLoading={banksLoading}
          disabled={isLoading}
          bank={settlementBank}
          accountNumber={accountNumber}
          onBankChange={setSettlementBank}
          onAccountNumberChange={setAccountNumber}
          verified={verifiedAccount}
          onVerifiedChange={setVerifiedAccount}
          verifyError={verifyError}
          onVerifyErrorChange={setVerifyError}
        />

        <OnboardingStepActions
          onBack={() => navigate("/onboarding")}
          nextLabel="Connect Paystack & Finish Setup"
          isLoading={isLoading}
          loadingLabel="Connecting Paystack..."
          nextDisabled={!verifiedAccount}
          helperText="Bank account verification ensures client booking payments route smoothly."
        />
      </form>
    </OnboardingShell>
  );
}


