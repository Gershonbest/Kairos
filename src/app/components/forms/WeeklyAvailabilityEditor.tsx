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
        <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 border border-gray-200 rounded-lg">
          <label className="flex items-center gap-3 min-w-[140px] cursor-pointer">
            <input
              type="checkbox"
              checked={value[key].enabled}
              onChange={(e) => updateDay(key, "enabled", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#3B3680] focus:ring-[#3B3680]"
              disabled={disabled}
            />
            <span className="font-medium">{label}</span>
          </label>

          {value[key].enabled ? (
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${key}-start`} className="text-sm">
                  From
                </Label>
                <input
                  id={`${key}-start`}
                  type="time"
                  value={value[key].startTime}
                  onChange={(e) => updateDay(key, "startTime", e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3B3680] bg-white"
                  disabled={disabled}
                />
              </div>
              <span className="text-gray-400">—</span>
              <div className="flex items-center gap-2">
                <Label htmlFor={`${key}-end`} className="text-sm">
                  To
                </Label>
                <input
                  id={`${key}-end`}
                  type="time"
                  value={value[key].endTime}
                  onChange={(e) => updateDay(key, "endTime", e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3B3680] bg-white"
                  disabled={disabled}
                />
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 flex-1">Unavailable</span>
          )}
        </div>
      ))}
    </div>
  );
}

export { DEFAULT_WEEKLY_AVAILABILITY };
