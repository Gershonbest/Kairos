// Day-of-week keys and helpers for weekly availability editing.

export interface DayAvailability {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export const WEEK_DAYS = [
  { key: "monday", label: "Monday", dayOfWeek: 1 },
  { key: "tuesday", label: "Tuesday", dayOfWeek: 2 },
  { key: "wednesday", label: "Wednesday", dayOfWeek: 3 },
  { key: "thursday", label: "Thursday", dayOfWeek: 4 },
  { key: "friday", label: "Friday", dayOfWeek: 5 },
  { key: "saturday", label: "Saturday", dayOfWeek: 6 },
  { key: "sunday", label: "Sunday", dayOfWeek: 0 },
] as const;

export type WeekDayKey = (typeof WEEK_DAYS)[number]["key"];

const DAY_BY_INDEX = Object.fromEntries(WEEK_DAYS.map((day) => [day.dayOfWeek, day.key])) as Record<
  number,
  WeekDayKey
>;

export const DEFAULT_WEEKLY_AVAILABILITY: Record<WeekDayKey, DayAvailability> = {
  monday: { enabled: true, startTime: "09:00", endTime: "17:00" },
  tuesday: { enabled: true, startTime: "09:00", endTime: "17:00" },
  wednesday: { enabled: true, startTime: "09:00", endTime: "17:00" },
  thursday: { enabled: true, startTime: "09:00", endTime: "17:00" },
  friday: { enabled: true, startTime: "09:00", endTime: "17:00" },
  saturday: { enabled: false, startTime: "09:00", endTime: "17:00" },
  sunday: { enabled: false, startTime: "09:00", endTime: "17:00" },
};

export interface AvailabilityRuleRecord {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

export function rulesToWeeklyAvailability(rules: AvailabilityRuleRecord[]): Record<WeekDayKey, DayAvailability> {
  const availability = { ...DEFAULT_WEEKLY_AVAILABILITY };
  for (const rule of rules) {
    const key = DAY_BY_INDEX[rule.day_of_week];
    if (!key) continue;
    availability[key] = {
      enabled: rule.is_enabled,
      startTime: rule.start_time,
      endTime: rule.end_time,
    };
  }
  return availability;
}

export function weeklyAvailabilityToRules(
  availability: Record<WeekDayKey, DayAvailability>
): AvailabilityRuleRecord[] {
  return WEEK_DAYS.map((day) => ({
    day_of_week: day.dayOfWeek,
    start_time: availability[day.key].startTime,
    end_time: availability[day.key].endTime,
    is_enabled: availability[day.key].enabled,
  }));
}

export function countEnabledDays(availability: Record<WeekDayKey, DayAvailability>): number {
  return WEEK_DAYS.filter((day) => availability[day.key].enabled).length;
}

export function validateWeeklyAvailability(availability: Record<WeekDayKey, DayAvailability>): string | null {
  const enabledDays = WEEK_DAYS.filter((day) => availability[day.key].enabled);
  if (enabledDays.length === 0) {
    return "Enable at least one day for bookings.";
  }
  for (const day of enabledDays) {
    const { startTime, endTime } = availability[day.key];
    if (startTime >= endTime) {
      return `${day.label}: end time must be after start time.`;
    }
  }
  return null;
}
