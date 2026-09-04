// Onboarding step to create initial bookable services.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { ArrowRight, Plus, Trash2, Sparkles, Package } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api/client";
import { FormSelect } from "../../components/forms/FormSelect";
import { OnboardingAlert } from "../../components/onboarding/OnboardingAlert";
import { ServiceAppointmentFields } from "../../components/services/ServiceAppointmentFields";
import {
  ServiceSchedulingFields,
  type SchedulingMode,
} from "../../components/services/ServiceSchedulingFields";
import { ImageUpload } from "../../components/forms/ImageUpload";
import {
  bookingTypeLabels,
  defaultServiceAppointmentDetails,
  type BookingType,
  type ServiceAppointmentDetails,
} from "../../../lib/types/service";
import { OPTIONAL_ONBOARDING_ROUTES } from "./flow";
import { motion, AnimatePresence } from "motion/react";

interface ServiceForm {
  id: string;
  isExisting?: boolean;
  name: string;
  duration: string;
  schedulingMode: SchedulingMode;
  price: string;
  description: string;
  imageUrl: string;
  bookingType: BookingType;
  listingIds: string[];
  appointment: ServiceAppointmentDetails;
}

function createEmptyService(): ServiceForm {
  return {
    id: Date.now().toString(),
    isExisting: false,
    name: "",
    duration: "60",
    schedulingMode: "fixed",
    price: "",
    description: "",
    imageUrl: "",
    bookingType: "general",
    listingIds: [],
    appointment: defaultServiceAppointmentDetails(),
  };
}

export function ServiceCreation() {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceForm[]>([createEmptyService()]);
  const [listings, setListings] = useState<Array<{ id: string; name: string }>>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [isCreatingListing, setIsCreatingListing] = useState(false);
  const [newListingName, setNewListingName] = useState("");
  const [newListingDescription, setNewListingDescription] = useState("");
  const [businessLocation, setBusinessLocation] = useState("");
  const [currencyCode, setCurrencyCode] = useState("NGN");
  const bookingTypeOptions = [
    { value: "general", label: bookingTypeLabels.general },
    { value: "listing", label: bookingTypeLabels.listing },
  ];

  const addService = () => {
    setServices([...services, createEmptyService()]);
  };

  const removeService = (id: string) => {
    if (services.length > 1) {
      setServices(services.filter((s) => s.id !== id));
    }
  };

  const updateService = (
    id: string,
    patch: Partial<Omit<ServiceForm, "appointment">> & { appointment?: ServiceAppointmentDetails }
  ) => {
    setServices(services.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    api
      .myTenant()
      .then((tenant) => {
        setBusinessLocation(tenant.location ?? "");
        const code = (tenant.country_code || "").toUpperCase();
        setCurrencyCode(code === "GH" ? "GHS" : "NGN");
      })
      .catch(() => undefined);
    api
      .listServices()
      .then((rows) => {
        if (rows.length === 0) return;
        setServices(
          rows.map((row) => ({
            id: row.id,
            isExisting: true,
            name: row.name,
            duration: String(row.duration_minutes),
            schedulingMode: row.scheduling_mode ?? "fixed",
            price: String(row.price_amount ?? ""),
            description: row.description ?? "",
            imageUrl: row.image_url ?? "",
            bookingType: row.booking_type ?? "general",
            listingIds: row.listing_ids ?? [],
            appointment: {
              appointment_type: row.appointment_type ?? "onsite",
              location: row.location ?? "",
              use_business_location: row.use_business_location ?? true,
              host_name: row.host_name ?? "",
              host_title: row.host_title ?? "",
              staff_ids: row.staff_ids ?? [],
              online_meeting_link: row.online_meeting_link ?? "",
              client_instructions: row.client_instructions ?? "",
              buffer_minutes: String(row.buffer_minutes ?? 0),
            },
          }))
        );
      })
      .catch(() => undefined);
    api
      .listListings()
      .then((rows) => setListings(rows.map((row) => ({ id: row.id, name: row.name }))))
      .catch(() => undefined)
      .finally(() => setListingsLoading(false));
  }, []);

  const createListing = async () => {
    const name = newListingName.trim();
    if (!name) return;
    setIsCreatingListing(true);
    try {
      const created = await api.createListing({
        name,
        description: newListingDescription.trim() || undefined,
        status: "available",
        active: true,
      });
      setListings((prev) => [{ id: created.id, name: created.name }, ...prev]);
      setServices((prev) =>
        prev.map((service) =>
          service.bookingType === "listing" && service.listingIds.length === 0
            ? { ...service, listingIds: [created.id] }
            : service
        )
      );
      setNewListingName("");
      setNewListingDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create product.");
    } finally {
      setIsCreatingListing(false);
    }
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      for (const service of services) {
        if (service.bookingType === "listing" && service.listingIds.length === 0) {
          throw new Error(`Please link at least one product to ${service.name || "your product-based service"}.`);
        }
        const appointment = service.appointment;
        const payload = {
          name: service.name,
          description: service.description,
          duration_minutes: service.schedulingMode === "all_day" ? 1440 : Number(service.duration),
          scheduling_mode: service.schedulingMode,
          price_amount: Number(service.price),
          deposit_amount: 0,
          appointment_type: appointment.appointment_type,
          location: appointment.location || undefined,
          use_business_location: appointment.use_business_location,
          host_name: appointment.host_name || undefined,
          host_title: appointment.host_title || undefined,
          online_meeting_link: appointment.online_meeting_link || undefined,
          client_instructions: appointment.client_instructions || undefined,
          buffer_minutes: Number(appointment.buffer_minutes || 0),
          image_url: service.imageUrl || undefined,
          booking_type: service.bookingType,
          listing_ids: service.bookingType === "listing" ? service.listingIds : [],
        };
        if (service.isExisting) {
          await api.updateService(service.id, { ...payload, active: true });
        } else {
          await api.createService(payload);
        }
      }
      navigate("/onboarding/availability");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save services.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      showProgress={false}
      badge="Optional Setup"
      title="Create Your Bookable Services"
      description="Add consultation sessions or services clients can book on your page. You can also skip and configure services later."
      previewData={{
        servicesCount: services.length,
        previewType: "services",
      }}
    >
      <form onSubmit={handleNext} className="space-y-6">
        {error ? <OnboardingAlert tone="error" message={error} live="assertive" /> : null}
        <OnboardingAlert
          tone="info"
          message="Essential onboarding is already complete once payment is connected. You can add services now or configure them anytime in Dashboard > Services."
        />

        {/* Product Catalog Quick Add */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 text-xs font-bold uppercase tracking-wider text-slate-800">
            <Package className="w-4 h-4 text-slate-900" />
            <span>Product Catalog (Optional)</span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Add inventory items/properties/vehicles to attach to Product-Based services below.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="listing-name" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Product Name
              </Label>
              <Input
                id="listing-name"
                value={newListingName}
                onChange={(e) => setNewListingName(e.target.value)}
                placeholder="e.g., Suite 101 or Vehicle A"
                className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
                disabled={isLoading || isCreatingListing}
              />
            </div>
            <div>
              <Label htmlFor="listing-description" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Description (Optional)
              </Label>
              <Input
                id="listing-description"
                value={newListingDescription}
                onChange={(e) => setNewListingDescription(e.target.value)}
                placeholder="e.g. 2-bed executive apartment"
                className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
                disabled={isLoading || isCreatingListing}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold shadow-sm"
              onClick={() => void createListing()}
              loading={isCreatingListing}
              loadingLabel="Adding..."
              disabled={isLoading || !newListingName.trim()}
            >
              Add Product
            </Button>
            <span className="text-xs text-slate-500 font-medium">
              {listingsLoading ? "Loading products..." : `${listings.length} product(s) available`}
            </span>
          </div>
        </div>

        {/* Services List */}
        <AnimatePresence>
          {services.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-slate-900" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Service #{index + 1}</h3>
                </div>
                {services.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeService(service.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor={`name-${service.id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Service Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={`name-${service.id}`}
                    type="text"
                    placeholder="e.g., Executive Strategy Session"
                    value={service.name}
                    onChange={(e) => updateService(service.id, { name: e.target.value })}
                    className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label htmlFor={`price-${service.id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Price ({currencyCode}) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={`price-${service.id}`}
                    type="number"
                    placeholder="25000"
                    value={service.price}
                    onChange={(e) => updateService(service.id, { price: e.target.value })}
                    className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 shadow-sm font-mono"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <FormSelect
                    id={`booking-type-${service.id}`}
                    label="Booking Type"
                    value={service.bookingType}
                    options={bookingTypeOptions}
                    placeholder="Select booking type"
                    onChange={(next) =>
                      updateService(service.id, {
                        bookingType: next as BookingType,
                        listingIds: next === "listing" ? service.listingIds : [],
                      })
                    }
                    disabled={isLoading}
                    required
                  />
                  {service.bookingType === "listing" && (
                    <fieldset className="space-y-2 mt-2">
                      <legend className="sr-only">Products available for this service</legend>
                      <p className="text-xs text-slate-600 font-medium">Select products clients can choose from:</p>
                      {listings.length === 0 ? (
                        <p className="text-xs text-amber-700 font-medium">Add at least one product above first.</p>
                      ) : (
                        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                          {listings.map((listing) => (
                            <label key={listing.id} className="flex items-center gap-2 text-xs text-slate-800 font-medium">
                              <input
                                type="checkbox"
                                checked={service.listingIds.includes(listing.id)}
                                onChange={(e) =>
                                  updateService(service.id, {
                                    listingIds: e.target.checked
                                      ? [...service.listingIds, listing.id]
                                      : service.listingIds.filter((id) => id !== listing.id),
                                  })
                                }
                                disabled={isLoading}
                                className="rounded text-slate-900 focus:ring-slate-900"
                              />
                              <span>{listing.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  )}
                </div>

                <div className="col-span-2">
                  <ServiceSchedulingFields
                    schedulingMode={service.schedulingMode}
                    duration={service.duration}
                    disabled={isLoading}
                    onChange={({ schedulingMode, duration }) =>
                      updateService(service.id, {
                        ...(schedulingMode ? { schedulingMode } : {}),
                        ...(duration !== undefined ? { duration } : {}),
                      })
                    }
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor={`description-${service.id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Service Overview
                  </Label>
                  <Textarea
                    id={`description-${service.id}`}
                    placeholder="Briefly detail what clients get in this appointment..."
                    value={service.description}
                    onChange={(e) => updateService(service.id, { description: e.target.value })}
                    className="mt-1 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
                    rows={3}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <ImageUpload
                label="Service Cover Banner"
                value={service.imageUrl}
                onChange={(imageUrl) => updateService(service.id, { imageUrl })}
                uploadKind="service-image"
                disabled={isLoading}
                hint="Displayed on your client booking card."
              />

              <ServiceAppointmentFields
                idPrefix={service.id}
                value={service.appointment}
                onChange={(appointment) => updateService(service.id, { appointment })}
                businessLocation={businessLocation}
                disabled={isLoading}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <Button
          type="button"
          variant="outline"
          onClick={addService}
          className="w-full rounded-2xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50 py-3.5 font-semibold shadow-sm"
          disabled={isLoading}
        >
          <Plus className="w-4 h-4 mr-2 text-slate-900" />
          Add Another Service Card
        </Button>

        <div className="sticky bottom-4 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur-xl shadow-lg space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(OPTIONAL_ONBOARDING_ROUTES.availability)}
              className="flex-1 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-semibold"
              disabled={isLoading}
            >
              Skip to Availability
            </Button>
            <Button
              type="submit"
              className="flex-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-md shadow-slate-900/10"
              loading={isLoading}
              loadingLabel="Saving Services..."
            >
              <span>Save & Continue</span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </OnboardingShell>
  );
}


