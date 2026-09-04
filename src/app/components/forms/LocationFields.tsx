// Address fields with country/state dropdowns and optional Google Maps preview.

import { useEffect } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  COUNTRIES,
  formatAddressQuery,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  normalizeStateForCountry,
} from "../../../lib/data/locations";
import { ExternalLink, MapPin } from "lucide-react";

export interface LocationFormValue {
  country_code: string;
  state: string;
  address_line: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface LocationFieldsProps {
  value: LocationFormValue;
  onChange: (value: LocationFormValue) => void;
  onCountryChange?: (countryCode: string, dialCode: string) => void;
  disabled?: boolean;
  idPrefix?: string;
  showMap?: boolean;
}

export function LocationFields({
  value,
  onChange,
  onCountryChange,
  disabled,
  idPrefix = "location",
  showMap = true,
}: LocationFieldsProps) {
  const country = COUNTRIES.find((item) => item.code === value.country_code);
  const states = country?.states ?? [];
  const stateIsRequired = states.length > 0;
  // Only treat a region as selected when it matches a real dropdown option.
  // Invalid / legacy labels (e.g. "Abuja" vs "Abuja FCT") become empty so the
  // placeholder shows instead of a filled-looking but unsaved value.
  const resolvedState = normalizeStateForCountry(value.country_code, value.state);

  useEffect(() => {
    if (!value.country_code) return;
    if (resolvedState === (value.state ?? "").trim()) return;
    // Keep parent form state in sync with what the select can actually show.
    onChange({ ...value, state: resolvedState });
    // Intentionally depend on the derived region + country only; `value` /
    // `onChange` identity changes every render from some parents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.country_code, value.state, resolvedState]);

  const addressQuery = formatAddressQuery({
    address_line: value.address_line,
    state: resolvedState,
    country_code: value.country_code,
    country_name: country?.name,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-country`}>Country</Label>
          <Select
            value={value.country_code || undefined}
            onValueChange={(code) => {
              const selected = COUNTRIES.find((item) => item.code === code);
              onChange({ ...value, country_code: code, state: "" });
              if (selected && onCountryChange) {
                onCountryChange(selected.code, selected.dialCode);
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-country`} className="mt-1 bg-input-background">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-state`}>
            State / region
            {stateIsRequired && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {stateIsRequired ? (
            <Select
              key={`${idPrefix}-${value.country_code}-state`}
              value={resolvedState || undefined}
              onValueChange={(state) => onChange({ ...value, state })}
              disabled={disabled || !value.country_code}
            >
              <SelectTrigger
                id={`${idPrefix}-state`}
                className="mt-1 bg-input-background"
                aria-required={stateIsRequired}
              >
                <SelectValue placeholder="Select state or region" />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${idPrefix}-state`}
              value={value.state}
              onChange={(e) => onChange({ ...value, state: e.target.value })}
              placeholder="Region or city (optional)"
              className="mt-1"
              disabled={disabled || !value.country_code}
              aria-required={false}
            />
          )}
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-address`}>Street address</Label>
        <Input
          id={`${idPrefix}-address`}
          value={value.address_line}
          onChange={(e) => onChange({ ...value, address_line: e.target.value })}
          placeholder="Building, street, area"
          className="mt-1"
          required
          disabled={disabled}
        />
      </div>

      {showMap && addressQuery.length > 8 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Map preview
            </Label>
            <a
              href={googleMapsSearchUrl(addressQuery)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Open in Google Maps
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="rounded-xl overflow-hidden border border-border h-48 bg-muted">
            <iframe
              title="Location map preview"
              src={googleMapsEmbedUrl(addressQuery)}
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      )}
    </div>
  );
}
