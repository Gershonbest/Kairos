// Phone input with country dial code synced to selected country.

import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { COUNTRIES } from "../../../lib/data/locations";

interface PhoneInputProps {
  countryCode: string;
  dialCode: string;
  phoneNumber: string;
  onCountryCodeChange: (code: string, dialCode: string) => void;
  onPhoneNumberChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function PhoneInput({
  countryCode,
  dialCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  disabled,
  idPrefix = "phone",
}: PhoneInputProps) {
  return (
    <div>
      <Label htmlFor={`${idPrefix}-number`}>Business phone</Label>
      <div className="mt-1 flex gap-2">
        <Select
          value={countryCode}
          onValueChange={(code) => {
            const country = COUNTRIES.find((item) => item.code === code);
            onCountryCodeChange(code, country?.dialCode ?? dialCode);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-[150px] bg-white">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                {country.dialCode} {country.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-1">
          <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-600">
            {dialCode}
          </span>
          <Input
            id={`${idPrefix}-number`}
            type="tel"
            value={phoneNumber}
            onChange={(e) => onPhoneNumberChange(e.target.value.replace(/[^\d\s-]/g, ""))}
            placeholder="20 123 4567"
            className="rounded-l-none"
            required
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
