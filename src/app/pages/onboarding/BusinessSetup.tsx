// Onboarding step to capture business profile, logo, location, branches, and phone.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Calendar, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type TenantBranchPayload } from "../../../lib/api/client";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { LocationFields } from "../../components/forms/LocationFields";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { COUNTRIES } from "../../../lib/data/locations";

function stateRequiredForCountry(countryCode: string): boolean {
  const country = COUNTRIES.find((item) => item.code === countryCode);
  return (country?.states.length ?? 0) > 0;
}

function validateLocation(countryCode: string, state: string, label: string): string | null {
  if (stateRequiredForCountry(countryCode) && !state.trim()) {
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

export function BusinessSetup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    businessName: "",
    businessType: "",
    logoUrl: "",
    countryCode: "GH",
    dialCode: "+233",
    phoneNumber: "",
    state: "",
    addressLine: "",
  });
  const [branches, setBranches] = useState<TenantBranchPayload[]>([]);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const primaryLocationError = validateLocation(formData.countryCode, formData.state, "your primary location");
    if (primaryLocationError) {
      setError(primaryLocationError);
      return;
    }
    for (const [index, branch] of branches.entries()) {
      const branchLocationError = validateLocation(branch.country_code, branch.state, `branch ${index + 1}`);
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
        country_code: formData.countryCode,
        state: formData.state.trim() || undefined,
        address_line: formData.addressLine,
        phone_country_code: formData.dialCode,
        phone_number: formData.phoneNumber,
        logo_url: formData.logoUrl || undefined,
        branches: branches.map((branch) => ({
          ...branch,
          state: branch.state.trim() || undefined,
        })),
      });
      navigate("/onboarding/services");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save business details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Step 1 of 4</span>
            <span className="text-sm text-gray-600">25% complete</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#3B3680] to-[#4A4594] w-1/4 transition-all duration-300" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Tell us about your business</h1>
              <p className="text-sm text-gray-600">Logo, contact details, and where clients can find you.</p>
            </div>
          </div>

          <form onSubmit={handleNext} className="space-y-6">
            <ImageUpload
              label="Company logo"
              value={formData.logoUrl}
              onChange={(logoUrl) => setFormData((prev) => ({ ...prev, logoUrl }))}
              uploadKind="logo"
              disabled={isLoading}
              hint="Shown on your public booking page and client emails. PNG or JPG, max 5MB."
            />

            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                type="text"
                placeholder="e.g., Elite Consultancy Services"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="businessType">Business Type</Label>
              <select
                id="businessType"
                value={formData.businessType}
                onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3B3680] bg-white"
                required
                disabled={isLoading}
              >
                <option value="">Select a type</option>
                <option value="consultant">Consultant</option>
                <option value="clinic">Medical Clinic</option>
                <option value="coach">Coach/Trainer</option>
                <option value="salon">Salon/Spa</option>
                <option value="legal">Legal Services</option>
                <option value="other">Other Professional Services</option>
              </select>
            </div>

            <PhoneInput
              countryCode={formData.countryCode}
              dialCode={formData.dialCode}
              phoneNumber={formData.phoneNumber}
              onCountryCodeChange={(countryCode, dialCode) =>
                setFormData((prev) => ({ ...prev, countryCode, dialCode }))
              }
              onPhoneNumberChange={(phoneNumber) => setFormData((prev) => ({ ...prev, phoneNumber }))}
              disabled={isLoading}
            />

            <div className="rounded-lg border border-gray-200 p-4 space-y-4">
              <div>
                <h3 className="font-medium">Primary location</h3>
                <p className="text-sm text-gray-500">Used for in-person appointments and your public profile.</p>
              </div>
              <LocationFields
                value={{
                  country_code: formData.countryCode,
                  state: formData.state,
                  address_line: formData.addressLine,
                }}
                onChange={(location) =>
                  setFormData((prev) => ({
                    ...prev,
                    countryCode: location.country_code,
                    state: location.state,
                    addressLine: location.address_line,
                  }))
                }
                onCountryChange={(countryCode, dialCode) =>
                  setFormData((prev) => ({ ...prev, countryCode, dialCode }))
                }
                disabled={isLoading}
                idPrefix="primary"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Additional branches</h3>
                  <p className="text-sm text-gray-500">Optional — add other offices or studio locations.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() =>
                    setBranches((prev) => [...prev, createBranch(formData.countryCode, formData.dialCode)])
                  }
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add branch
                </Button>
              </div>

              {branches.map((branch, index) => (
                <div key={branch.id} className="rounded-lg border border-gray-200 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Branch {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBranches((prev) => prev.filter((item) => item.id !== branch.id))}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                  <div>
                    <Label>Branch name</Label>
                    <Input
                      value={branch.name}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item) => (item.id === branch.id ? { ...item, name: e.target.value } : item))
                        )
                      }
                      placeholder="e.g., East Legon Studio"
                      className="mt-1"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <LocationFields
                    value={{
                      country_code: branch.country_code,
                      state: branch.state,
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
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/")} className="flex-1" disabled={isLoading}>
                Back
              </Button>
              <Button type="submit" className="flex-1 bg-[#3B3680] hover:bg-[#2E2A5C]" loading={isLoading} loadingLabel="Saving...">
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
