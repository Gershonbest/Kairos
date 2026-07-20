import { Label } from "../ui/label";
import { Input } from "../ui/input";

export type SchedulingMode = "fixed" | "flexible" | "all_day";

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

const MODE_OPTIONS: Array<{ value: SchedulingMode; label: string; hint: string }> = [
  { value: "fixed", label: "Fixed time", hint: "Clients book a start time; appointments last exactly this long." },
  {
    value: "flexible",
    label: "Flexible (estimate)",
    hint: "Clients pick a start time; this estimate blocks the calendar.",
  },
  { value: "all_day", label: "All day", hint: "Clients pick a date; the booking blocks the entire calendar day." },
];

interface ServiceSchedulingFieldsProps {
  schedulingMode: SchedulingMode;
  duration: string;
  onChange: (next: { schedulingMode?: SchedulingMode; duration?: string }) => void;
  disabled?: boolean;
}

export function ServiceSchedulingFields({
  schedulingMode,
  duration,
  onChange,
  disabled = false,
}: ServiceSchedulingFieldsProps) {
  const durationLabel =
    schedulingMode === "flexible" ? "Typical duration (minutes)" : "Duration (minutes)";

  return (
    <div className="space-y-3">
      <div>
        <Label>Scheduling mode</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = schedulingMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    schedulingMode: option.value,
                    duration: option.value === "all_day" ? "1440" : duration === "1440" ? "60" : duration,
                  })
                }
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-snug">{option.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {schedulingMode === "all_day" ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2">
          Books the entire calendar day (midnight to midnight).
        </p>
      ) : (
        <div>
          <Label htmlFor="service-duration">{durationLabel}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((minutes) => {
              const selected = Number(duration) === minutes;
              return (
                <button
                  key={minutes}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ duration: String(minutes) })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {minutes}m
                </button>
              );
            })}
          </div>
          <Input
            id="service-duration"
            type="number"
            min={5}
            max={1440}
            value={duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            className="mt-2"
            required
            disabled={disabled}
          />
          {schedulingMode === "flexible" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Clients choose a start time; this estimate reserves space on your calendar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function schedulingModeLabel(mode: SchedulingMode | string | undefined): string {
  if (mode === "flexible") return "Flexible";
  if (mode === "all_day") return "All day";
  return "Fixed";
}

export function formatServiceDurationLabel(
  mode: SchedulingMode | string | undefined,
  minutes: number
): string {
  if (mode === "all_day") return "All day";
  if (mode === "flexible") return `About ${minutes} min`;
  return `${minutes} min`;
}
