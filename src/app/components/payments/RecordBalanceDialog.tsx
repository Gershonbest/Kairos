import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export type BalancePaymentMethod = "cash" | "bank_transfer" | "pos" | "other";

type RecordBalanceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  clientName: string;
  serviceName: string;
  balanceDue: number;
  onSubmit: (payload: {
    amount: number;
    method: BalancePaymentMethod;
    notes?: string;
  }) => Promise<void>;
};

export function RecordBalanceDialog({
  open,
  onOpenChange,
  clientName,
  serviceName,
  balanceDue,
  onSubmit,
}: RecordBalanceDialogProps) {
  const [amount, setAmount] = useState(balanceDue > 0 ? String(balanceDue) : "");
  const [method, setMethod] = useState<BalancePaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setAmount(balanceDue > 0 ? String(balanceDue) : "");
    setMethod("cash");
    setNotes("");
    setError("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record balance payment</DialogTitle>
          <DialogDescription>
            {clientName} · {serviceName}. This records money collected outside Orheo (cash, transfer,
            etc.). Merchant fees do not apply to balance payments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="balance-amount">Amount (NGN)</Label>
            <Input
              id="balance-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Remaining balance: ₦{balanceDue.toFixed(2)}
            </p>
          </div>
          <div>
            <Label htmlFor="balance-method">Payment method</Label>
            <select
              id="balance-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as BalancePaymentMethod)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              disabled={busy}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS / card terminal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label htmlFor="balance-notes">Notes (optional)</Label>
            <Input
              id="balance-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="e.g. Paid at reception"
              disabled={busy}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              const parsed = Number(amount);
              if (!parsed || parsed <= 0) {
                setError("Enter a valid amount.");
                return;
              }
              setBusy(true);
              setError("");
              void onSubmit({
                amount: parsed,
                method,
                notes: notes.trim() || undefined,
              })
                .then(() => {
                  onOpenChange(false);
                  reset();
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : "Unable to record payment.");
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
