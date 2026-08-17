import { useEffect, useState } from "react";
import { CalendarOff } from "lucide-react";
import { api, type CalendarBlockRecord } from "../../../lib/api/client";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type CalendarBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date | null;
  onCreated?: (block: CalendarBlockRecord) => void;
};

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CalendarBlockDialog({
  open,
  onOpenChange,
  initialDate,
  onCreated,
}: CalendarBlockDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const date = initialDate && !Number.isNaN(initialDate.getTime()) ? initialDate : new Date();
    const value = localDateValue(date);
    setStartDate(value);
    setEndDate(value);
    setReason("");
    setError("");
  }, [open, initialDate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!startDate || !endDate) return setError("Choose a start and end date.");
    if (endDate < startDate) return setError("End date must be on or after the start date.");
    setSaving(true);
    try {
      const block = await api.createCalendarBlock({
        start_date: startDate,
        end_date: endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onCreated?.(block);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to block the calendar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Block calendar
          </DialogTitle>
          <DialogDescription>
            New bookings will be unavailable on these dates. Existing bookings are not cancelled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-start-date">First day off</Label>
              <Input
                id="block-start-date"
                type="date"
                value={startDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setStartDate(value);
                  if (!endDate || endDate < value) setEndDate(value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end-date">Last day off</Label>
              <Input
                id="block-end-date"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason (optional)</Label>
            <Textarea
              id="block-reason"
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Holiday, annual leave, business closed…"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingLabel="Blocking…">
              Block dates
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
