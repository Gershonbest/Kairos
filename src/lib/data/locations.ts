// Country, state, and dial-code data for onboarding and phone inputs.

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  states: string[];
}

export const COUNTRIES: CountryOption[] = [
  {
    code: "GH",
    name: "Ghana",
    dialCode: "+233",
    states: ["Greater Accra", "Ashanti", "Western", "Central", "Eastern", "Northern", "Volta", "Bono", "Upper East", "Upper West"],
  },
  {
    code: "NG",
    name: "Nigeria",
    dialCode: "+234",
    states: ["Lagos", "Abuja", "Rivers", "Kano", "Oyo", "Kaduna", "Edo", "Delta", "Enugu", "Anambra"],
  },
  {
    code: "KE",
    name: "Kenya",
    dialCode: "+254",
    states: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Kiambu", "Machakos", "Kajiado"],
  },
  {
    code: "ZA",
    name: "South Africa",
    dialCode: "+27",
    states: ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape"],
  },
  {
    code: "EG",
    name: "Egypt",
    dialCode: "+20",
    states: ["Cairo", "Giza", "Alexandria", "Qalyubia", "Dakahlia", "Sharqia"],
  },
  {
    code: "RW",
    name: "Rwanda",
    dialCode: "+250",
    states: ["Kigali", "Eastern Province", "Northern Province", "Southern Province", "Western Province"],
  },
  {
    code: "TZ",
    name: "Tanzania",
    dialCode: "+255",
    states: ["Dar es Salaam", "Arusha", "Dodoma", "Mwanza", "Mbeya", "Morogoro"],
  },
  {
    code: "UG",
    name: "Uganda",
    dialCode: "+256",
    states: ["Kampala", "Wakiso", "Mukono", "Jinja", "Gulu", "Mbarara"],
  },
  {
    code: "US",
    name: "United States",
    dialCode: "+1",
    states: ["California", "New York", "Texas", "Florida", "Illinois", "Georgia", "Washington", "Colorado"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    dialCode: "+44",
    states: ["England", "Scotland", "Wales", "Northern Ireland", "London", "Manchester", "Birmingham"],
  },
  {
    code: "CA",
    name: "Canada",
    dialCode: "+1",
    states: ["Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba"],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    dialCode: "+971",
    states: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah"],
  },
];

export function getCountryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((country) => country.code === code.toUpperCase());
}

export function getDialCodeForCountry(code: string): string {
  return getCountryByCode(code)?.dialCode ?? "+1";
}

/** Common free-text / legacy labels mapped onto the canonical option values. */
const STATE_ALIASES: Record<string, Record<string, string>> = {
  NG: {
    abuja: "Abuja",
    "abuja fct": "Abuja",
    fct: "Abuja",
    "federal capital territory": "Abuja",
  },
};

/**
 * Resolve a stored region to a valid option for the country.
 * Returns "" when the value is missing or not in the dropdown so the UI
 * shows the empty placeholder instead of a stale mismatched label.
 */
export function normalizeStateForCountry(countryCode: string, state: string | null | undefined): string {
  const trimmed = (state ?? "").trim();
  if (!trimmed) return "";
  const country = getCountryByCode(countryCode);
  if (!country) return trimmed;
  if (country.states.length === 0) return trimmed;

  const exact = country.states.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const alias = STATE_ALIASES[country.code]?.[trimmed.toLowerCase()];
  if (alias && country.states.includes(alias)) return alias;

  return "";
}

export function formatAddressQuery(parts: {
  address_line?: string;
  state?: string;
  country_code?: string;
  country_name?: string;
}): string {
  const countryName = parts.country_name ?? getCountryByCode(parts.country_code ?? "")?.name;
  return [parts.address_line, parts.state, countryName].filter(Boolean).join(", ");
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsEmbedUrl(query: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}
