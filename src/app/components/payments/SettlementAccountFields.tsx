// Bank + account number fields that must resolve via Paystack before save.

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api } from "../../../lib/api/client";

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
    <>
      <div>
        <Label htmlFor="settlement-bank">Settlement bank</Label>
        <select
          id="settlement-bank"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={bank}
          onChange={(e) => {
            onBankChange(e.target.value);
            onVerifiedChange(null);
            onVerifyErrorChange("");
          }}
          disabled={disabled || banksLoading}
          required
        >
          <option value="">{banksLoading ? "Loading banks..." : "Select bank"}</option>
          {banks.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="settlement-account">Account number</Label>
        <div className="mt-1 flex flex-col sm:flex-row gap-2">
          <Input
            id="settlement-account"
            value={accountNumber}
            onChange={(e) => {
              onAccountNumberChange(digitsOnly(e.target.value));
              onVerifiedChange(null);
              onVerifyErrorChange("");
            }}
            placeholder="0123456789"
            inputMode="numeric"
            autoComplete="off"
            required
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            className="sm:w-auto"
            onClick={() => void handleVerify()}
            disabled={!canVerify || isVerified || verifying}
            loading={verifying}
            loadingLabel="Verifying..."
          >
            {isVerified ? "Verified" : "Verify account"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          We confirm the account name with Paystack before this can be saved as your settlement account.
        </p>
      </div>

      {isVerified && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Account name: <span className="font-medium">{verified.account_name}</span>
          </p>
        </div>
      )}

      {verifyError && !isVerified && <p className="text-sm text-red-600">{verifyError}</p>}
    </>
  );
}
