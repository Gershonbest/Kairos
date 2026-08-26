import { useMemo, useState } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { api } from "../../../lib/api/client";
import {
  formatPhoneDisplay,
  isMobileDevice,
  normalizePhoneE164,
  telHref,
  whatsAppHref,
} from "../../../lib/phone";

type CallClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  phone: string;
  defaultCountryCode?: string;
  onLogged?: () => void;
};

export function CallClientDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  phone,
  defaultCountryCode = "234",
  onLogged,
}: CallClientDialogProps) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const e164 = useMemo(
    () => normalizePhoneE164(phone, defaultCountryCode),
    [phone, defaultCountryCode]
  );
  const display = e164 ? formatPhoneDisplay(e164) : phone;
  const mobile = isMobileDevice();

  async function logOutreach(channel: "phone_call" | "whatsapp") {
    try {
      await api.logClientCommunication(clientId, { channel, phone: display });
      onLogged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log this action.");
    }
  }

  async function handleCall() {
    if (!e164) return;
    await logOutreach("phone_call");
    window.location.href = telHref(e164);
  }

  async function handleWhatsApp() {
    if (!e164) return;
    await logOutreach("whatsapp");
    window.open(whatsAppHref(e164), "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    if (!display) return;
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy number.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError("");
          setCopied(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact {clientName}</DialogTitle>
          <DialogDescription>
            Call or message using your device. Actions are logged on this client&apos;s activity
            history.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">Phone number</p>
          <p className="text-2xl font-semibold tracking-wide">{display}</p>
          {!e164 && (
            <p className="text-xs text-amber-600 mt-2">
              This number could not be normalized. You can still try the actions below.
            </p>
          )}
        </div>

        {!mobile && (
          <p className="text-sm text-muted-foreground">
            On desktop, <strong>Call</strong> opens your default phone app (FaceTime, Skype, etc.)
            if configured. WhatsApp Web works in the browser.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleCall}
            disabled={!phone.trim()}
          >
            <Phone className="w-4 h-4 mr-2" />
            Call
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleWhatsApp}
            disabled={!phone.trim()}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
