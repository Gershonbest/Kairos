// Reusable appointment detail fields for service create/edit forms.

import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  appointmentTypeLabels,
  type ServiceAppointmentDetails,
} from "../../../lib/types/service";
import { MapPin, Monitor, Users, Clock3 } from "lucide-react";

interface ServiceAppointmentFieldsProps {
  value: ServiceAppointmentDetails;
  onChange: (next: ServiceAppointmentDetails) => void;
  businessLocation?: string;
  disabled?: boolean;
  idPrefix?: string;
}

export function ServiceAppointmentFields({
  value,
  onChange,
  businessLocation,
  disabled = false,
  idPrefix = "service",
}: ServiceAppointmentFieldsProps) {
  const showOnsiteFields = value.appointment_type === "onsite" || value.appointment_type === "hybrid";
  const showOnlineFields = value.appointment_type === "online" || value.appointment_type === "hybrid";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Appointment setup</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          How clients attend this service and who they will meet.
        </p>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-appointment-type`}>Appointment type</Label>
        <Select
          value={value.appointment_type}
          onValueChange={(appointment_type) =>
            onChange({
              ...value,
              appointment_type: appointment_type as ServiceAppointmentDetails["appointment_type"],
            })
          }
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-appointment-type`} className="mt-1 bg-input-background">
            <SelectValue placeholder="Select appointment type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(appointmentTypeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-host-name`} className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            Person to see
          </Label>
          <Input
            id={`${idPrefix}-host-name`}
            value={value.host_name}
            onChange={(e) => onChange({ ...value, host_name: e.target.value })}
            placeholder="e.g., Dr. Sarah Mensah"
            className="mt-1 bg-input-background"
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-host-title`}>Role / title</Label>
          <Input
            id={`${idPrefix}-host-title`}
            value={value.host_title}
            onChange={(e) => onChange({ ...value, host_title: e.target.value })}
            placeholder="e.g., Senior Consultant"
            className="mt-1 bg-input-background"
            disabled={disabled}
          />
        </div>
      </div>

      {showOnsiteFields && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${idPrefix}-use-business-location`}
              checked={value.use_business_location}
              onCheckedChange={(checked) =>
                onChange({ ...value, use_business_location: checked === true })
              }
              disabled={disabled}
            />
            <div>
              <Label htmlFor={`${idPrefix}-use-business-location`} className="cursor-pointer">
                Use business address
              </Label>
              {businessLocation && value.use_business_location && (
                <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {businessLocation}
                </p>
              )}
            </div>
          </div>

          {!value.use_business_location && (
            <div>
              <Label htmlFor={`${idPrefix}-location`}>Custom location</Label>
              <Input
                id={`${idPrefix}-location`}
                value={value.location}
                onChange={(e) => onChange({ ...value, location: e.target.value })}
                placeholder="Suite 4B, 12 Independence Ave, Accra"
                className="mt-1 bg-input-background"
                required={!value.use_business_location}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}

      {showOnlineFields && (
        <div>
          <Label htmlFor={`${idPrefix}-meeting-link`} className="flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
            Online meeting link
          </Label>
          <Input
            id={`${idPrefix}-meeting-link`}
            type="url"
            value={value.online_meeting_link}
            onChange={(e) => onChange({ ...value, online_meeting_link: e.target.value })}
            placeholder="https://meet.google.com/abc-defg-hij"
            className="mt-1 bg-input-background"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground mt-1">Sent to clients after they book online appointments.</p>
        </div>
      )}

      <div>
        <Label htmlFor={`${idPrefix}-instructions`}>Client instructions</Label>
        <Textarea
          id={`${idPrefix}-instructions`}
          value={value.client_instructions}
          onChange={(e) => onChange({ ...value, client_instructions: e.target.value })}
          placeholder="What should clients bring or prepare? e.g., arrive 10 minutes early, bring ID..."
          className="mt-1 bg-input-background"
          rows={3}
          disabled={disabled}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-buffer`} className="flex items-center gap-1.5">
          <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
          Buffer after appointment (minutes)
        </Label>
        <Input
          id={`${idPrefix}-buffer`}
          type="number"
          min={0}
          max={120}
          value={value.buffer_minutes}
          onChange={(e) => onChange({ ...value, buffer_minutes: e.target.value })}
          className="mt-1 bg-input-background max-w-[160px]"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
