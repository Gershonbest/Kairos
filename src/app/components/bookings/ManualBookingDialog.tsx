import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Mail, Plus, User } from "lucide-react";
import {
  api,
  type BookingListItem,
  type ServiceRecord,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type ManualBookingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClientId?: string | null;
  initialStart?: Date | null;
  onCreated?: (booking: BookingListItem) => void;
};

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function splitName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/);
  return [parts[0] || "", parts.slice(1).join(" ")];
}

export function ManualBookingDialog({
  open,
  onOpenChange,
  initialClientId,
  initialStart,
  onCreated,
}: ManualBookingDialogProps) {
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [newClient, setNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [serviceId, setServiceId] = useState("");
  const [listingId, setListingId] = useState("");
  const [date, setDate] = useState(localDateValue(new Date()));
  const [time, setTime] = useState("09:00");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [overrideAvailability, setOverrideAvailability] = useState(false);
  const [appointmentFormat, setAppointmentFormat] = useState<"" | "online" | "onsite">("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [notes, setNotes] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid_external">("unpaid");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
    enabled: open,
  });
  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.listServices(),
    enabled: open,
  });
  const { data: listings = [] } = useQuery({
    queryKey: queryKeys.listings,
    queryFn: () => api.listListings(),
    enabled: open,
  });

  const selectedService = services.find((service) => service.id === serviceId);
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter(
      (client) =>
        client.full_name.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query) ||
        (client.phone || "").toLowerCase().includes(query)
    );
  }, [clients, clientSearch]);
  const availableListings = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.active &&
          listing.status === "available" &&
          listing.service_ids.includes(serviceId)
      ),
    [listings, serviceId]
  );
  const listingRequired = selectedService?.booking_type === "listing";
  const { data: team } = useQuery({
    queryKey: queryKeys.team,
    queryFn: () => api.getTeam(),
    enabled: open,
  });
  const assignableStaff = useMemo(() => {
    const linked = selectedService?.staff_ids ?? [];
    const members = (team?.members ?? []).filter((member) => member.is_active && member.is_bookable);
    if (linked.length === 0) return members;
    return members.filter((member) => linked.includes(member.id) || member.is_owner);
  }, [team, selectedService]);
  const canLoadSlots = Boolean(
    open && serviceId && date && (!listingRequired || listingId) && !overrideAvailability
  );
  const dateStart = date ? new Date(`${date}T00:00:00`) : null;
  const dateEnd = date ? new Date(`${date}T23:59:59`) : null;
  const { data: availability, isFetching: slotsLoading } = useQuery({
    queryKey: ["manual-booking-availability", serviceId, listingId, date, assignedUserId],
    queryFn: () =>
      api.listManualBookingAvailability(
        serviceId,
        dateStart!.toISOString(),
        dateEnd!.toISOString(),
        listingId || undefined,
        assignedUserId || undefined
      ),
    enabled: canLoadSlots,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    const start = initialStart && !Number.isNaN(initialStart.getTime()) ? initialStart : new Date();
    setDate(localDateValue(start));
    setTime(localTimeValue(start));
    setClientId(initialClientId || "");
    setClientSearch("");
    setNewClient(false);
    setServiceId("");
    setListingId("");
    setSelectedSlot("");
    setOverrideAvailability(false);
    setAppointmentFormat("");
    setNotes("");
    setSendConfirmation(true);
    setPaymentStatus("unpaid");
    setAssignedUserId("");
    setError("");
    setError("");
  }, [open, initialClientId, initialStart]);

  useEffect(() => {
    if (!clientId) return;
    const client = clients.find((row) => row.id === clientId);
    if (!client) return;
    const [first, last] = splitName(client.full_name);
    setGuestFirstName(first);
    setGuestLastName(last);
  }, [clientId, clients]);

  useEffect(() => {
    setListingId("");
    setSelectedSlot("");
    if (!selectedService) return;
    if (selectedService.appointment_type === "online") setAppointmentFormat("online");
    else if (selectedService.appointment_type === "onsite") setAppointmentFormat("onsite");
    else setAppointmentFormat("");
  }, [serviceId, selectedService]);

  useEffect(() => {
    if (!assignableStaff.length) return;
    if (!assignedUserId || !assignableStaff.some((member) => member.id === assignedUserId)) {
      setAssignedUserId(assignableStaff[0].id);
    }
  }, [assignableStaff, assignedUserId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!serviceId) return setError("Choose a service.");
    if (!assignedUserId) return setError("Assign this booking to a team member.");
    if (listingRequired && !listingId) return setError("Choose a product.");
    if (selectedService?.appointment_type === "hybrid" && !appointmentFormat) {
      return setError("Choose online or in-person.");
    }
    if (!overrideAvailability && !selectedSlot) return setError("Choose an available time.");
    if (overrideAvailability && !time) return setError("Choose a custom time.");

    setSaving(true);
    try {
      let firstName = guestFirstName.trim();
      let lastName = guestLastName.trim();
      if (newClient) {
        firstName = newClientForm.firstName.trim();
        lastName = newClientForm.lastName.trim();
        if (!firstName || !lastName || !newClientForm.email.trim()) {
          throw new Error("First name, surname, and email are required for a new client.");
        }
      }
      if (!newClient && !clientId) throw new Error("Choose a client or add a new one.");

      const startAt = overrideAvailability
        ? new Date(`${date}T${time}:00`).toISOString()
        : selectedSlot;
      const created = await api.createManualBooking({
        ...(newClient
          ? {
              new_client_first_name: firstName,
              new_client_last_name: lastName,
              new_client_email: newClientForm.email.trim(),
              ...(newClientForm.phone.trim()
                ? { new_client_phone: newClientForm.phone.trim() }
                : {}),
            }
          : { client_id: clientId }),
        service_id: serviceId,
        ...(listingId ? { listing_id: listingId } : {}),
        start_at: startAt,
        ...(firstName ? { guest_first_name: firstName } : {}),
        ...(lastName ? { guest_last_name: lastName } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(appointmentFormat ? { appointment_format: appointmentFormat } : {}),
        send_confirmation: sendConfirmation,
        payment_status: paymentStatus,
        override_availability: overrideAvailability,
        assigned_user_id: assignedUserId,
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create booking.");
    } finally {
      setSaving(false);
    }
  }

  const slots = availability?.slots ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            New booking
          </DialogTitle>
          <DialogDescription>Book an appointment for an existing or new client.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Client</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewClient((value) => !value);
                  setClientId("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                {newClient ? "Choose existing" : "New client"}
              </Button>
            </div>
            {newClient ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="First name"
                  value={newClientForm.firstName}
                  onChange={(event) =>
                    setNewClientForm((value) => ({ ...value, firstName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Surname"
                  value={newClientForm.lastName}
                  onChange={(event) =>
                    setNewClientForm((value) => ({ ...value, lastName: event.target.value }))
                  }
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={newClientForm.email}
                  onChange={(event) =>
                    setNewClientForm((value) => ({ ...value, email: event.target.value }))
                  }
                />
                <Input
                  placeholder="Phone (optional)"
                  value={newClientForm.phone}
                  onChange={(event) =>
                    setNewClientForm((value) => ({ ...value, phone: event.target.value }))
                  }
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Search by name, email, or phone"
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                />
                <select
                  className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Choose a client…</option>
                  {filteredClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name} — {client.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Service</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Choose a service…</option>
                {services
                  .filter((service) => service.active)
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.duration_minutes} min
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Assign to</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                value={assignedUserId}
                onChange={(event) => {
                  setAssignedUserId(event.target.value);
                  setSelectedSlot("");
                }}
              >
                <option value="">Choose who they’ll see…</option>
                {assignableStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                    {member.job_title ? ` · ${member.job_title}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {listingRequired && (
              <div className="space-y-2">
                <Label>Product</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                  value={listingId}
                  onChange={(event) => {
                    setListingId(event.target.value);
                    setSelectedSlot("");
                  }}
                >
                  <option value="">Choose a product…</option>
                  {availableListings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedService?.appointment_type === "hybrid" && (
              <div className="space-y-2">
                <Label>Appointment format</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                  value={appointmentFormat}
                  onChange={(event) =>
                    setAppointmentFormat(event.target.value as "online" | "onsite")
                  }
                >
                  <option value="">Choose format…</option>
                  <option value="onsite">In person</option>
                  <option value="online">Online</option>
                </select>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-booking-date">Date</Label>
                <Input
                  id="manual-booking-date"
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSelectedSlot("");
                  }}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={overrideAvailability}
                  onChange={(event) => {
                    setOverrideAvailability(event.target.checked);
                    setSelectedSlot("");
                  }}
                />
                Override business hours
              </label>
            </div>
            {overrideAvailability ? (
              <div className="max-w-xs space-y-2">
                <Label htmlFor="manual-booking-time">Custom time</Label>
                <Input
                  id="manual-booking-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={selectedService?.scheduling_mode === "all_day"}
                />
                <p className="text-xs text-muted-foreground">
                  Conflicting bookings are still blocked.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Available times</Label>
                {slotsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading available times…</p>
                ) : !canLoadSlots ? (
                  <p className="text-sm text-muted-foreground">
                    Choose a service{listingRequired ? " and product" : ""} to see times.
                  </p>
                ) : slots.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No times are available on this date. Choose another date or use the override.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <Button
                        key={slot}
                        type="button"
                        size="sm"
                        variant={selectedSlot === slot ? "default" : "outline"}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {selectedService?.scheduling_mode === "all_day"
                          ? "All day"
                          : new Date(slot).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {!newClient && clientId && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-guest-first">Visit first name</Label>
                <Input
                  id="manual-guest-first"
                  value={guestFirstName}
                  onChange={(event) => setGuestFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-guest-last">Visit surname</Label>
                <Input
                  id="manual-guest-last"
                  value={guestLastName}
                  onChange={(event) => setGuestLastName(event.target.value)}
                />
              </div>
            </section>
          )}

          <div className="space-y-2">
            <Label htmlFor="manual-booking-notes">Appointment notes</Label>
            <Textarea
              id="manual-booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Preferences, preparation notes, or anything staff should know"
            />
          </div>

          <section className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                value={paymentStatus}
                onChange={(event) =>
                  setPaymentStatus(event.target.value as "unpaid" | "paid_external")
                }
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid_external">Paid outside Orheo</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendConfirmation}
                onChange={(event) => setSendConfirmation(event.target.checked)}
              />
              <Mail className="h-4 w-4 text-muted-foreground" />
              Send confirmation email
            </label>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingLabel="Creating…">
              <User className="mr-2 h-4 w-4" />
              Create booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
