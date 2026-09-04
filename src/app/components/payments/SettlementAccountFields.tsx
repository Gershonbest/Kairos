// Bank + account number fields that must resolve via Paystack before save.

import { useState } from "react";
import { CheckCircle2, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api } from "../../../lib/api/client";
import { FormSelect } from "../forms/FormSelect";
import { motion, AnimatePresence } from "motion/react";

export type VerifiedSettlementAccount = {
  bank_code: string;
  account_number: string;
  account_name: string;
};

type BankOption = { name: string; code: string };

type SettlementAccountFieldsProps = {
  banks: BankOption[];
  banksLoading?: boolean;
  disabled?: boolean;
  bank: string;
  accountNumber: string;
  onBankChange: (code: string) => void;
  onAccountNumberChange: (value: string) => void;
  verified: VerifiedSettlementAccount | null;
  onVerifiedChange: (value: VerifiedSettlementAccount | null) => void;
  verifyError: string;
  onVerifyErrorChange: (message: string) => void;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function SettlementAccountFields({
  banks,
  banksLoading = false,
  disabled = false,
  bank,
  accountNumber,
  onBankChange,
  onAccountNumberChange,
  verified,
  onVerifiedChange,
  verifyError,
  onVerifyErrorChange,
}: SettlementAccountFieldsProps) {
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    onVerifyErrorChange("");
    if (!bank || accountNumber.trim().length < 6) {
      onVerifyErrorChange("Select a bank and enter the account number first.");
      return;
    }
    setVerifying(true);
    try {
      const resolved = await api.resolvePaystackAccount({
        settlement_bank: bank,
        account_number: accountNumber.trim(),
      });
      const number = digitsOnly(resolved.account_number || accountNumber);
      if (number !== accountNumber) {
        onAccountNumberChange(number);
      }
      onVerifiedChange({
        bank_code: bank,
        account_number: number,
        account_name: resolved.account_name,
      });
    } catch (err) {
      onVerifiedChange(null);
      onVerifyErrorChange(
        err instanceof Error ? err.message : "Could not verify this account number."
      );
    } finally {
      setVerifying(false);
    }
  }

  const canVerify = Boolean(bank) && accountNumber.trim().length >= 6 && !disabled;
  const isVerified =
    verified !== null &&
    verified.bank_code === bank &&
    verified.account_number === accountNumber.trim();

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
        <CreditCard className="w-4 h-4 text-slate-900" />
        <span>Bank Account Verification</span>
      </div>

      <FormSelect
        id="settlement-bank"
        label="Settlement bank"
        value={bank}
        options={banks.map((item) => ({ value: item.code, label: item.name }))}
        placeholder={banksLoading ? "Loading banks..." : "Select bank"}
        disabled={disabled || banksLoading}
        required
        onChange={(next) => {
          onBankChange(next);
          onVerifiedChange(null);
          onVerifyErrorChange("");
        }}
      />

      <div>
        <Label htmlFor="settlement-account" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          10-digit Account Number
        </Label>
        <div className="mt-1 flex flex-col sm:flex-row gap-2">
          <Input
            id="settlement-account"
            value={accountNumber}
            onChange={(e) => {
              onAccountNumberChange(digitsOnly(e.target.value));
              onVerifiedChange(null);
              onVerifyErrorChange("");
            }}
            placeholder="e.g. 0123456789"
            inputMode="numeric"
            autoComplete="off"
            required
            disabled={disabled}
            className="rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 shadow-sm font-mono"
          />
          <Button
            type="button"
            variant="outline"
            className="sm:w-auto rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-semibold shadow-sm"
            onClick={() => void handleVerify()}
            disabled={!canVerify || isVerified || verifying}
            loading={verifying}
            loadingLabel="Verifying..."
          >
            {isVerified ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Verified
              </span>
            ) : (
              "Verify Account"
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          Direct API verification with Paystack to guarantee instant payout settlements.
        </p>
      </div>

      <AnimatePresence>
        {isVerified && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm font-medium"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">
                Verified Account Holder: <strong className="text-slate-900 font-bold">{verified.account_name}</strong>
              </span>
            </div>
            <span className="rounded bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 shrink-0">
              Ready
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {verifyError && !isVerified ? (
        <p className="text-xs text-red-600 font-semibold" role="alert" aria-live="assertive">
          {verifyError}
        </p>
      ) : null}
    </div>
  );
}


