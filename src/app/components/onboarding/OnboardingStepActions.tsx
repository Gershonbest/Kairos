import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { ShieldCheck } from "lucide-react";

type OnboardingStepActionsProps = {
  onBack?: () => void;
  backLabel?: string;
  nextLabel: string;
  nextIcon?: ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  helperText?: string;
};

export function OnboardingStepActions({
  onBack,
  backLabel = "Back",
  nextLabel,
  nextIcon,
  isLoading = false,
  loadingLabel,
  nextDisabled = false,
  backDisabled = false,
  helperText,
}: OnboardingStepActionsProps) {
  return (
    <div className="space-y-3 pt-6 border-t border-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="flex-1 rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-all py-3.5 shadow-sm"
            disabled={backDisabled || isLoading}
          >
            {backLabel}
          </Button>
        ) : null}
        <Button
          type="submit"
          className="flex-1 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-md shadow-slate-900/10 hover:scale-[1.005] active:scale-[0.995] transition-all py-3.5"
          loading={isLoading}
          loadingLabel={loadingLabel}
          disabled={nextDisabled || isLoading}
        >
          <span>{nextLabel}</span>
          {nextIcon}
        </Button>
      </div>
      {helperText ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>{helperText}</span>
        </div>
      ) : null}
    </div>
  );
}


