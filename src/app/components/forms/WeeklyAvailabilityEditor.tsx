// Reusable weekly hours editor for onboarding and dashboard.

import { Label } from "../ui/label";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  type DayAvailability,
  WEEK_DAYS,
  type WeekDayKey,
} from "../../../lib/data/availability";

interface WeeklyAvailabilityEditorProps {
  value: Record<WeekDayKey, DayAvailability>;
  onChange: (value: Record<WeekDayKey, DayAvailability>) => void;
  disabled?: boolean;
}

export function WeeklyAvailabilityEditor({ value, onChange, disabled }: WeeklyAvailabilityEditorProps) {
  const updateDay = (day: WeekDayKey, field: keyof DayAvailability, fieldValue: boolean | string) => {
    onChange({
      ...value,
      [day]: { ...value[day], [field]: fieldValue },
    });
  };

  return (
    <div className="space-y-3">
      {WEEK_DAYS.map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 border border-border rounded-lg bg-card/40"
        >
          <label className="flex items-center gap-3 min-w-[140px] cursor-pointer">
            <input
              type="checkbox"
              checked={value[key].enabled}
              onChange={(e) => updateDay(key, "enabled", e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              disabled={disabled}
            />
            <span className="font-medium text-foreground">{label}</span>
          </label>

          {value[key].enabled ? (
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${key}-start`} className="text-sm text-muted-foreground">
                  From
                </Label>
                <input
                  id={`${key}-start`}
                  type="time"
                  value={value[key].startTime}
                  onChange={(e) => updateDay(key, "startTime", e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-input-background text-foreground"
                  disabled={disabled}
                />
              </div>
              <span className="text-muted-foreground">—</span>
              <div className="flex items-center gap-2">
                <Label htmlFor={`${key}-end`} className="text-sm text-muted-foreground">
                  To
                </Label>
                <input
                  id={`${key}-end`}
                  type="time"
                  value={value[key].endTime}
                  onChange={(e) => updateDay(key, "endTime", e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-input-background text-foreground"
                  disabled={disabled}
                />
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground flex-1">Unavailable</span>
          )}
        </div>
      ))}
    </div>
  );
}

export { DEFAULT_WEEKLY_AVAILABILITY };
