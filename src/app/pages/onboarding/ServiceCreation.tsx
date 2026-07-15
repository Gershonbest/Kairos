// Onboarding step to create initial bookable services.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Calendar, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api/client";
import { ServiceAppointmentFields } from "../../components/services/ServiceAppointmentFields";
import {
  ServiceSchedulingFields,
  type SchedulingMode,
} from "../../components/services/ServiceSchedulingFields";
import { ImageUpload } from "../../components/forms/ImageUpload";
import {
  defaultServiceAppointmentDetails,
  type ServiceAppointmentDetails,
} from "../../../lib/types/service";

interface ServiceForm {
  id: string;
  name: string;
  duration: string;
  schedulingMode: SchedulingMode;
  price: string;
  description: string;
  imageUrl: string;
  appointment: ServiceAppointmentDetails;
}

function createEmptyService(): ServiceForm {
  return {
    id: Date.now().toString(),
    name: "",
    duration: "60",
    schedulingMode: "fixed",
    price: "",
    description: "",
    imageUrl: "",
    appointment: defaultServiceAppointmentDetails(),
  };
}

export function ServiceCreation() {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceForm[]>([createEmptyService()]);
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
  }, []);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      for (const service of services) {
        const appointment = service.appointment;
        await api.createService({
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
        });
      }
      navigate("/onboarding/availability");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save services.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Step 2 of 4</span>
            <span className="text-sm text-gray-600">50% complete</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#3B3680] to-[#4A4594] w-1/2 transition-all duration-300" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Add your services</h1>
              <p className="text-sm text-gray-600">Define what clients can book and how appointments run.</p>
            </div>
          </div>

          <form onSubmit={handleNext} className="space-y-6">
            {services.map((service, index) => (
              <div key={service.id} className="p-4 border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Service {index + 1}</h3>
                  {services.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeService(service.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
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
                    <Label htmlFor={`price-${service.id}`}>Price (USD)</Label>
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
