// Shared service appointment field types and defaults.

export type AppointmentType = "online" | "onsite" | "hybrid";
export type AppointmentFormat = "online" | "onsite";

export interface ServiceAppointmentDetails {
  appointment_type: AppointmentType;
  location: string;
  use_business_location: boolean;
  host_name: string;
  host_title: string;
  online_meeting_link: string;
  client_instructions: string;
  buffer_minutes: string;
}

export const defaultServiceAppointmentDetails = (): ServiceAppointmentDetails => ({
  appointment_type: "onsite",
  location: "",
  use_business_location: true,
  host_name: "",
  host_title: "",
  online_meeting_link: "",
  client_instructions: "",
  buffer_minutes: "0",
});

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  online: "Online",
  onsite: "In person",
  hybrid: "Online or in person",
};

export function formatHostLabel(hostName?: string | null, hostTitle?: string | null): string | null {
  if (!hostName?.trim()) return null;
  return hostTitle?.trim() ? `${hostName} · ${hostTitle}` : hostName;
}

export function resolvePublicLocation(
  service: {
    appointment_type: AppointmentType;
    location?: string | null;
    use_business_location: boolean;
    online_meeting_link?: string | null;
  },
  businessLocation?: string | null,
  format?: AppointmentFormat | null
): string | null {
  const effectiveFormat: AppointmentFormat =
    format ?? (service.appointment_type === "online" ? "online" : "onsite");

  if (effectiveFormat === "online") {
    return service.online_meeting_link ? `Online: ${service.online_meeting_link}` : "Online appointment";
  }
  if (service.use_business_location && businessLocation) {
    return businessLocation;
  }
  return service.location || businessLocation || null;
}
