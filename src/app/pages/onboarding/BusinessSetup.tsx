// Onboarding step to capture business profile, logo, location, branches, and phone.

import { useNavigate } from "react-router";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ArrowRight, Plus, Trash2, Building2, PhoneCall, MapPin, Building } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { useState } from "react";
import { api, type TenantBranchPayload } from "../../../lib/api/client";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { LocationFields } from "../../components/forms/LocationFields";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { FormSelect } from "../../components/forms/FormSelect";
import { OnboardingAlert } from "../../components/onboarding/OnboardingAlert";
import { OnboardingStepActions } from "../../components/onboarding/OnboardingStepActions";
import { Button } from "../../components/ui/button";
import { COUNTRIES, normalizeStateForCountry } from "../../../lib/data/locations";
import { REQUIRED_ONBOARDING_TOTAL } from "./flow";
import { motion, AnimatePresence } from "motion/react";

function stateRequiredForCountry(countryCode: string): boolean {
  const country = COUNTRIES.find((item) => item.code === countryCode);
  return (country?.states.length ?? 0) > 0;
}

function validateLocation(countryCode: string, state: string, label: string): string | null {
  if (stateRequiredForCountry(countryCode) && !normalizeStateForCountry(countryCode, state)) {
    return `Select a state or region for ${label}.`;
  }
  return null;
}

function createBranch(countryCode: string, dialCode: string): TenantBranchPayload {
  return {
    id: crypto.randomUUID(),
    name: "",
    country_code: countryCode,
    state: "",
    address_line: "",
    phone_country_code: dialCode,
    phone_number: "",
    is_primary: false,
  };
}

const NIGERIA_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Federal Capital Territory (Abuja)",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export function BusinessSetup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    businessName: "",
    businessType: "",
    logoUrl: "",
    helpEmail: "",
    countryCode: "NG",
    dialCode: "+234",
    phoneNumber: "",
    state: "",
    addressLine: "",
  });
  const [branches, setBranches] = useState<TenantBranchPayload[]>([]);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const businessTypeOptions = [
    { value: "consultant", label: "Consultant" },
    { value: "clinic", label: "Medical Clinic" },
    { value: "coach", label: "Coach/Trainer" },
    { value: "salon", label: "Salon/Spa" },
    { value: "legal", label: "Legal Services" },
    { value: "other", label: "Other Professional Services" },
  ];
  const nigeriaStateOptions = NIGERIA_STATES.map((value) => ({ value, label: value }));

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!NIGERIA_STATES.includes(formData.state as (typeof NIGERIA_STATES)[number])) {
      setError("Select one of the listed Nigerian states for your primary location.");
      return;
    }
    for (const [index, branch] of branches.entries()) {
      const branchLocationError = validateLocation(branch.country_code, branch.state ?? "", `branch ${index + 1}`);
      if (branchLocationError) {
        setError(branchLocationError);
        return;
      }
    }
    setIsLoading(true);
    try {
      await api.completeOnboarding({
        business_name: formData.businessName,
        business_type: formData.businessType,
        country_code: "NG",
        state: formData.state || undefined,
        address_line: formData.addressLine,
        phone_country_code: formData.dialCode,
        phone_number: formData.phoneNumber,
        logo_url: formData.logoUrl || undefined,
        help_email: formData.helpEmail.trim() || undefined,
        branches: branches.map((branch) => ({
          ...branch,
          state: normalizeStateForCountry(branch.country_code, branch.state) || undefined,
        })),
      });
      navigate("/onboarding/payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save business details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingShell
      step={1}
      totalSteps={REQUIRED_ONBOARDING_TOTAL}
      title="Tell us about your business"
      description="Logo, contact details, and location for your public booking profile."
      previewData={{
        businessName: formData.businessName,
        businessType: formData.businessType,
        logoUrl: formData.logoUrl,
        helpEmail: formData.helpEmail,
        countryCode: formData.countryCode,
        dialCode: formData.dialCode,
        phoneNumber: formData.phoneNumber,
        state: formData.state,
        addressLine: formData.addressLine,
        branchesCount: branches.length,
        previewType: "business",
      }}
    >
      <form onSubmit={handleNext} className="space-y-6">
        {error ? <OnboardingAlert tone="error" message={error} live="assertive" /> : null}

        {/* Section 1: Business Profile */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 text-xs font-bold uppercase tracking-wider text-slate-800">
            <Building2 className="w-4 h-4 text-slate-900" />
            <span>Company Profile</span>
          </div>

          <ImageUpload
            label="Company logo"
            value={formData.logoUrl}
            onChange={(logoUrl) => setFormData((prev) => ({ ...prev, logoUrl }))}
            uploadKind="logo"
            disabled={isLoading}
            hint="Shown on your public booking page and client emails. PNG or JPG, max 5MB."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="businessName" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Business Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="businessName"
                type="text"
                placeholder="e.g., Elite Consultancy Services"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 shadow-sm"
                required
                disabled={isLoading}
              />
            </div>

            <FormSelect
              id="businessType"
              label="Business Category"
              value={formData.businessType}
              options={businessTypeOptions}
              placeholder="Select a category"
              onChange={(next) => setFormData({ ...formData, businessType: next })}
              required
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Section 2: Contact Info */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 text-xs font-bold uppercase tracking-wider text-slate-800">
            <PhoneCall className="w-4 h-4 text-slate-900" />
            <span>Contact & Support</span>
          </div>

          <PhoneInput
            countryCode={formData.countryCode}
            dialCode={formData.dialCode}
            phoneNumber={formData.phoneNumber}
            onCountryCodeChange={() =>
              setFormData((prev) => ({ ...prev, countryCode: "NG", dialCode: "+234" }))
            }
            onPhoneNumberChange={(phoneNumber) => setFormData((prev) => ({ ...prev, phoneNumber }))}
            disabled={isLoading}
          />

          <div>
            <Label htmlFor="helpEmail" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Support Email for Clients
            </Label>
            <Input
              id="helpEmail"
              type="email"
              placeholder="support@yourbusiness.com"
              value={formData.helpEmail}
              onChange={(e) => setFormData({ ...formData, helpEmail: e.target.value })}
              className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 shadow-sm"
              disabled={isLoading}
            />
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Displayed on booking receipts for client questions. Your account login email remains private.
            </p>
          </div>
        </div>

        {/* Section 3: Primary Location */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 text-xs font-bold uppercase tracking-wider text-slate-800">
            <MapPin className="w-4 h-4 text-slate-900" />
            <span>Primary Location</span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Primary merchant onboarding is optimized for Nigeria. Additional international branches can be added below.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="primary-country" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Country
              </Label>
              <Input
                id="primary-country"
                value="Nigeria"
                disabled
                className="mt-1 rounded-xl border-slate-200 bg-slate-100 text-slate-500 font-medium cursor-not-allowed"
              />
            </div>
            <FormSelect
              id="primary-state"
              label="State / Territory"
              value={formData.state}
              options={nigeriaStateOptions}
              placeholder="Select state"
              onChange={(state) => setFormData((prev) => ({ ...prev, state }))}
              disabled={isLoading}
              required
            />
          </div>
          <div>
            <Label htmlFor="primary-address" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Street Address
            </Label>
            <Input
              id="primary-address"
              value={formData.addressLine}
              onChange={(e) => setFormData((prev) => ({ ...prev, addressLine: e.target.value }))}
              placeholder="Suite, building, street name, area"
              className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 shadow-sm"
              required
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Section 4: Additional Branches */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
              <Building className="w-4 h-4 text-slate-900" />
              <span>Additional Branches</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold shadow-sm"
              disabled={isLoading}
              onClick={() =>
                setBranches((prev) => [...prev, createBranch(formData.countryCode, formData.dialCode)])
              }
            >
              <Plus className="w-4 h-4 mr-1 text-slate-900" />
              Add Branch
            </Button>
          </div>

          <AnimatePresence>
            {branches.map((branch, index) => (
              <motion.div
                key={branch.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Branch {index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setBranches((prev) => prev.filter((item) => item.id !== branch.id))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">Branch Label</Label>
                  <Input
                    value={branch.name}
                    onChange={(e) =>
                      setBranches((prev) =>
                        prev.map((item) => (item.id === branch.id ? { ...item, name: e.target.value } : item))
                      )
                    }
                    placeholder="e.g., Victoria Island Studio"
                    className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 shadow-sm"
                    required
                    disabled={isLoading}
                  />
                </div>
                <LocationFields
                  value={{
                    country_code: branch.country_code,
                    state: branch.state ?? "",
                    address_line: branch.address_line,
                  }}
                  onChange={(location) =>
                    setBranches((prev) =>
                      prev.map((item) =>
                        item.id === branch.id
                          ? {
                              ...item,
                              country_code: location.country_code,
                              state: location.state,
                              address_line: location.address_line,
                            }
                          : item
                      )
                    )
                  }
                  onCountryChange={(countryCode, dialCode) =>
                    setBranches((prev) =>
                      prev.map((item) =>
                        item.id === branch.id
                          ? { ...item, country_code: countryCode, phone_country_code: dialCode }
                          : item
                      )
                    )
                  }
                  disabled={isLoading}
                  idPrefix={`branch-${branch.id}`}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <OnboardingStepActions
          onBack={() => navigate("/")}
          nextLabel="Continue to Payment Setup"
          nextIcon={<ArrowRight className="ml-2 h-4 w-4" />}
          isLoading={isLoading}
          loadingLabel="Saving Profile..."
          helperText="Business profile details and settlement setup are required before dashboard access."
        />
      </form>
    </OnboardingShell>
  );
}


