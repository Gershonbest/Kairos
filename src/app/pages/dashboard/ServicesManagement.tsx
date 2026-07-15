// Tenant service catalog management page.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Plus, Edit, Trash2, Clock, DollarSign, Briefcase, MapPin, Monitor, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api/client";
import { ServiceAppointmentFields } from "../../components/services/ServiceAppointmentFields";
import {
  ServiceSchedulingFields,
  formatServiceDurationLabel,
  type SchedulingMode,
} from "../../components/services/ServiceSchedulingFields";
import { ImageUpload } from "../../components/forms/ImageUpload";
import {
  appointmentTypeLabels,
  defaultServiceAppointmentDetails,
  formatHostLabel,
  type ServiceAppointmentDetails,
} from "../../../lib/types/service";

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  schedulingMode: SchedulingMode;
  price: number;
  deposit: number;
  active: boolean;
  appointment: ServiceAppointmentDetails;
  imageUrl: string;
}

export function ServicesManagement() {
  const [services, setServices] = useState<Service[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [businessLocation, setBusinessLocation] = useState("");

  const emptyForm = () => ({
    name: "",
    description: "",
    duration: "60",
    schedulingMode: "fixed" as SchedulingMode,
    price: "",
    deposit: "",
    imageUrl: "",
    appointment: defaultServiceAppointmentDetails(),
  });

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadServices();
    api.myTenant().then((tenant) => setBusinessLocation(tenant.location ?? "")).catch(() => undefined);
  }, []);

  const loadServices = async () => {
    try {
      const rows = await api.listServices();
      setServices(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description ?? "",
          duration: row.duration_minutes,
          schedulingMode: (row.scheduling_mode ?? "fixed") as SchedulingMode,
          price: row.price_amount,
          deposit: row.deposit_amount ?? 0,
          active: row.active,
          appointment: {
            appointment_type: row.appointment_type ?? "onsite",
            location: row.location ?? "",
            use_business_location: row.use_business_location ?? true,
            host_name: row.host_name ?? "",
            host_title: row.host_title ?? "",
            online_meeting_link: row.online_meeting_link ?? "",
            client_instructions: row.client_instructions ?? "",
            buffer_minutes: String(row.buffer_minutes ?? 0),
          },
          imageUrl: row.image_url ?? "",
        }))
      );
      setError("");
    } catch {
      setError("Unable to load services from API.");
    }
  };

  const buildPayload = () => ({
    name: formData.name,
    description: formData.description,
    duration_minutes: formData.schedulingMode === "all_day" ? 1440 : parseInt(formData.duration, 10),
    scheduling_mode: formData.schedulingMode,
    price_amount: parseFloat(formData.price),
    deposit_amount: parseFloat(formData.deposit || "0"),
    appointment_type: formData.appointment.appointment_type,
    location: formData.appointment.location || undefined,
    use_business_location: formData.appointment.use_business_location,
    host_name: formData.appointment.host_name || undefined,
    host_title: formData.appointment.host_title || undefined,
    online_meeting_link: formData.appointment.online_meeting_link || undefined,
    client_instructions: formData.appointment.client_instructions || undefined,
    buffer_minutes: Number(formData.appointment.buffer_minutes || 0),
    image_url: formData.imageUrl || undefined,
  });

  const mapCreatedService = (created: Awaited<ReturnType<typeof api.createService>>): Service => ({
    id: created.id,
    name: created.name,
    description: created.description ?? "",
    duration: created.duration_minutes,
    schedulingMode: (created.scheduling_mode ?? "fixed") as SchedulingMode,
    price: created.price_amount,
    deposit: created.deposit_amount ?? 0,
    active: created.active,
    appointment: {
      appointment_type: created.appointment_type ?? "onsite",
      location: created.location ?? "",
      use_business_location: created.use_business_location ?? true,
      host_name: created.host_name ?? "",
      host_title: created.host_title ?? "",
      online_meeting_link: created.online_meeting_link ?? "",
      client_instructions: created.client_instructions ?? "",
      buffer_minutes: String(created.buffer_minutes ?? 0),
    },
    imageUrl: created.image_url ?? "",
  });

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingService) {
        await api.updateService(editingService.id, {
          ...buildPayload(),
          active: editingService.active,
        });
        await loadServices();
      } else {
        const created = await api.createService(buildPayload());
        setServices((prev) => [...prev, mapCreatedService(created)]);
      }

      setFormData(emptyForm());
      setEditingService(null);
      setIsDialogOpen(false);
      setError("");
    } catch {
      setError(editingService ? "Unable to update service." : "Unable to create service.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description,
      duration: service.duration.toString(),
      schedulingMode: service.schedulingMode,
      price: service.price.toString(),
      deposit: service.deposit.toString(),
      imageUrl: service.imageUrl,
      appointment: service.appointment,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      setError("");
    } catch {
      setError("Unable to delete service.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (service: Service) => {
    setTogglingId(service.id);
    try {
      await api.updateService(service.id, {
        name: service.name,
        description: service.description,
        duration_minutes: service.duration,
        scheduling_mode: service.schedulingMode,
        price_amount: service.price,
        deposit_amount: service.deposit,
        appointment_type: service.appointment.appointment_type,
        location: service.appointment.location || undefined,
        use_business_location: service.appointment.use_business_location,
        host_name: service.appointment.host_name || undefined,
        host_title: service.appointment.host_title || undefined,
        online_meeting_link: service.appointment.online_meeting_link || undefined,
        client_instructions: service.appointment.client_instructions || undefined,
        buffer_minutes: Number(service.appointment.buffer_minutes || 0),
        image_url: service.imageUrl || undefined,
        active: !service.active,
      });
      await loadServices();
      setError("");
    } catch {
      setError("Unable to update service status.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Services Management</h1>
          <p className="text-muted-foreground mt-1">Create and manage your service offerings</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-[#3B3680] hover:bg-[#2E2A5C]"
              onClick={() => {
                setEditingService(null);
                setFormData(emptyForm());
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
              <DialogTitle>
                {editingService ? "Edit Service" : "Create New Service"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateOrUpdate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
              <div>
                <Label htmlFor="name">Service Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Business Consultation"
                  className="mt-1"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this service"
                  className="mt-1"
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              <ServiceSchedulingFields
                schedulingMode={formData.schedulingMode}
                duration={formData.duration}
                disabled={isSubmitting}
                onChange={({ schedulingMode, duration }) =>
                  setFormData((prev) => ({
                    ...prev,
                    ...(schedulingMode ? { schedulingMode } : {}),
                    ...(duration !== undefined ? { duration } : {}),
                  }))
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price (USD)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="mt-1"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label htmlFor="deposit">Deposit (USD)</Label>
                  <Input
                    id="deposit"
                    type="number"
                    step="0.01"
                    value={formData.deposit}
                    onChange={(e) => setFormData({ ...formData, deposit: e.target.value })}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <ServiceAppointmentFields
                value={formData.appointment}
                onChange={(appointment) => setFormData({ ...formData, appointment })}
                businessLocation={businessLocation}
                disabled={isSubmitting}
              />

              <ImageUpload
                label="Service image"
                value={formData.imageUrl}
                onChange={(imageUrl) => setFormData({ ...formData, imageUrl })}
                uploadKind="service-image"
                disabled={isSubmitting}
              />
              </div>

              <DialogFooter className="shrink-0 gap-3 border-t border-border bg-card px-6 py-4 sm:justify-stretch">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#3B3680] hover:bg-[#2E2A5C]"
                  loading={isSubmitting}
                  loadingLabel={editingService ? "Updating..." : "Creating..."}
                >
                  {editingService ? "Update Service" : "Create Service"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Services Grid */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <Card key={service.id} className={`overflow-hidden ${!service.active ? "opacity-60" : ""} ${service.imageUrl ? "gap-0" : ""}`}>
            {service.imageUrl && (
              <div className="h-36 overflow-hidden">
                <img src={service.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2E2A5C] flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-[#3B3680]/10 text-[#3B3680]">
                      {appointmentTypeLabels[service.appointment.appointment_type]}
                    </span>
                    {formatHostLabel(service.appointment.host_name, service.appointment.host_title) && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground inline-flex items-center gap-1">
                        <UserRound className="w-3 h-3" />
                        {formatHostLabel(service.appointment.host_name, service.appointment.host_title)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(service)}
                >
                  <Edit className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(service.id)}
                  loading={deletingId === service.id}
                  disabled={deletingId !== null || togglingId !== null}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {formatServiceDurationLabel(service.schedulingMode, service.duration)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Price</p>
                    <p className="font-medium">${service.price}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#2ECC71]" />
                  <div>
                    <p className="text-xs text-muted-foreground">Deposit</p>
                    <p className="font-medium">${service.deposit}</p>
                  </div>
                </div>
              </div>

              {(service.appointment.appointment_type !== "online") && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    {service.appointment.use_business_location
                      ? businessLocation || "Business address"
                      : service.appointment.location || "Custom location"}
                  </span>
                </div>
              )}
              {service.appointment.appointment_type !== "onsite" && service.appointment.online_meeting_link && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Monitor className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{service.appointment.online_meeting_link}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      service.active
                        ? "bg-[#2ECC71]/10 text-[#2ECC71]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {service.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(service)}
                  loading={togglingId === service.id}
                  loadingLabel={service.active ? "Deactivating..." : "Activating..."}
                  disabled={deletingId !== null || togglingId !== null}
                >
                  {service.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
