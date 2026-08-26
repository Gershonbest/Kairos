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
  staffOptions?: Array<{ id: string; full_name: string; job_title?: string | null; is_bookable?: boolean }>;
}

export function ServiceAppointmentFields({
  value,
  onChange,
  businessLocation,
  disabled = false,
  idPrefix = "service",
  staffOptions = [],
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

      <div>
        <Label className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          Who can deliver this
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Clients can pick Anyone or a named person when two or more people are selected.
        </p>
        <div className="space-y-2 rounded-md border border-border bg-input-background p-3">
          {staffOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">The owner is assigned until you add team members.</p>
          )}
          {staffOptions.map((member) => {
            const checked = value.staff_ids.includes(member.id);
            return (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) => {
                    const on = next === true;
                    const staff_ids = on
                      ? [...value.staff_ids, member.id]
                      : value.staff_ids.filter((id) => id !== member.id);
                    onChange({ ...value, staff_ids });
                  }}
                />
                <span>
                  {member.full_name}
                  {member.job_title ? ` · ${member.job_title}` : ""}
                </span>
              </label>
            );
          })}
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
