// Onboarding step to create initial bookable services.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api/client";
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
    api.myTenant().then((tenant) => setBusinessLocation(tenant.location ?? "")).catch(() => undefined);
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
      step={2}
      title="Add your services"
      description="Define what clients can book and how appointments run."
    >
          <form onSubmit={handleNext} className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h3 className="font-medium">Products</h3>
              <p className="text-sm text-muted-foreground">
                Add products/properties/vehicles here, then link them to Product-Based services below.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="listing-name">Product Name</Label>
                  <Input
                    id="listing-name"
                    value={newListingName}
                    onChange={(e) => setNewListingName(e.target.value)}
                    placeholder="e.g., Apartment A1"
                    disabled={isLoading || isCreatingListing}
                  />
                </div>
                <div>
                  <Label htmlFor="listing-description">Description (optional)</Label>
                  <Input
                    id="listing-description"
                    value={newListingDescription}
                    onChange={(e) => setNewListingDescription(e.target.value)}
                    placeholder="2-bed serviced apartment"
                    disabled={isLoading || isCreatingListing}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void createListing()}
                  loading={isCreatingListing}
                  loadingLabel="Adding..."
                  disabled={isLoading || !newListingName.trim()}
                >
                  Add Product
                </Button>
                <span className="text-xs text-muted-foreground">
                  {listingsLoading ? "Loading products..." : `${listings.length} product(s) available`}
                </span>
              </div>
            </div>

            {services.map((service, index) => (
              <div key={service.id} className="p-4 border border-border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Service {index + 1}</h3>
                  {services.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeService(service.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor={`name-${service.id}`}>Service Name</Label>
                    <Input
                      id={`name-${service.id}`}
                      type="text"
                      placeholder="e.g., Business Consultation"
                      value={service.name}
                      onChange={(e) => updateService(service.id, { name: e.target.value })}
                      className="mt-1"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`price-${service.id}`}>Price (NGN)</Label>
                    <Input
                      id={`price-${service.id}`}
                      type="number"
                      placeholder="100"
                      value={service.price}
                      onChange={(e) => updateService(service.id, { price: e.target.value })}
                      className="mt-1"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="col-span-2 space-y-2 rounded-lg border border-border p-3">
                    <Label htmlFor={`booking-type-${service.id}`}>Booking Type</Label>
                    <select
                      id={`booking-type-${service.id}`}
                      value={service.bookingType}
                      onChange={(e) =>
                        updateService(service.id, {
                          bookingType: e.target.value as BookingType,
                          listingIds: e.target.value === "listing" ? service.listingIds : [],
                        })
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={isLoading}
                    >
                      <option value="general">{bookingTypeLabels.general}</option>
                      <option value="listing">{bookingTypeLabels.listing}</option>
                    </select>
                    {service.bookingType === "listing" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Select one or more products customers can choose from.
                        </p>
                        {listings.length === 0 ? (
                          <p className="text-xs text-amber-600">
                            Add at least one product above to continue.
                          </p>
                        ) : (
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                            {listings.map((listing) => (
                              <label key={listing.id} className="flex items-center gap-2 text-sm">
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
                                />
                                <span>{listing.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
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
                    <Label htmlFor={`description-${service.id}`}>Description</Label>
                    <Textarea
                      id={`description-${service.id}`}
                      placeholder="Brief description of this service"
                      value={service.description}
                      onChange={(e) => updateService(service.id, { description: e.target.value })}
                      className="mt-1"
                      rows={3}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <ImageUpload
                  label="Service image"
                  value={service.imageUrl}
                  onChange={(imageUrl) => updateService(service.id, { imageUrl })}
                  uploadKind="service-image"
                  disabled={isLoading}
                  hint="Shown on your public booking page."
                />

                <ServiceAppointmentFields
                  idPrefix={service.id}
                  value={service.appointment}
                  onChange={(appointment) => updateService(service.id, { appointment })}
                  businessLocation={businessLocation}
                  disabled={isLoading}
                />
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addService} className="w-full" disabled={isLoading}>
              <Plus className="w-4 h-4 mr-2" />
              Add Another Service
            </Button>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/onboarding")} className="flex-1" disabled={isLoading}>
                Back
              </Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" loading={isLoading} loadingLabel="Saving...">
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
    </OnboardingShell>
  );
}
