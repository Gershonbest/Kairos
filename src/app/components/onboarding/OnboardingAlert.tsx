import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "../ui/utils";

type OnboardingAlertProps = {
  tone?: "error" | "success" | "info";
  message: string;
  className?: string;
  live?: "off" | "polite" | "assertive";
};

const TONE_STYLES: Record<NonNullable<OnboardingAlertProps["tone"]>, string> = {
  error: "border-red-200 bg-red-50 text-red-800 shadow-sm",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm",
  info: "border-slate-200 bg-slate-100/90 text-slate-800 shadow-sm",
};

const TONE_ICON = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
} as const;

export function OnboardingAlert({
  tone = "info",
  message,
  className,
  live = "polite",
}: OnboardingAlertProps) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-xs sm:text-sm font-semibold leading-relaxed transition-all",
        TONE_STYLES[tone],
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
      aria-live={live}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
    </div>
  );
}


