// Dedicated client profile page with edit, delete, and booking actions.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  DollarSign,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { CallClientDialog } from "../../components/clients/CallClientDialog";
import { ClientCommunicationsList } from "../../components/clients/ClientCommunicationsList";
import { SendClientEmailDialog } from "../../components/clients/SendClientEmailDialog";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";

function clientInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function formatLastVisit(value?: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  const {
    data: client,
    isPending: loadingClient,
    isError: clientFailed,
  } = useQuery({
    queryKey: queryKeys.client(clientId),
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  });

  const { data: bookings = [] } = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: () => api.listBookings(),
  });
  const { data: tenant = null } = useQuery({
    queryKey: queryKeys.tenant,
    queryFn: () => api.myTenant(),
  });
  const {
    data: communications = [],
    isPending: loadingCommunications,
    refetch: refetchCommunications,
  } = useQuery({
    queryKey: queryKeys.clientCommunications(clientId),
    queryFn: () => api.listClientCommunications(clientId),
    enabled: Boolean(clientId),
  });

  useEffect(() => {
    if (!client) return;
    setNoteDraft(client.notes ?? "");
    setEditForm({
      full_name: client.full_name,
      email: client.email,
      phone: client.phone ?? "",
    });
  }, [client]);

  const clientBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.client_id === clientId)
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    [bookings, clientId]
  );

  async function refreshClientData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.client(clientId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clients }),
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings }),
    ]);
  }

  async function handleSaveNotes() {
    if (!client) return;
    setIsSavingNotes(true);
    setError("");
    try {
      await api.updateClient(client.id, { notes: noteDraft });
      await refreshClientData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notes.");
    } finally {
      setIsSavingNotes(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setIsSavingEdit(true);
    setError("");
    try {
      await api.updateClient(client.id, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
      });
      setShowEditDialog(false);
      await refreshClientData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update client.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!client) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.deleteClient(client.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      navigate("/dashboard/clients", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete client.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (loadingClient) {
    return (
      <div className="p-6">
        <BrandLoader label="Loading client" />
      </div>
    );
  }

  if (clientFailed || !client) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/dashboard/clients">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to clients
          </Link>
        </Button>
        <p className="text-sm text-red-600">Client not found or unable to load.</p>
      </div>
    );
  }

  const phoneHref = client.phone?.replace(/[^\d+]/g, "") ?? "";
  const defaultCountryCode = tenant?.phone_country_code?.replace(/\D/g, "") || "234";
  const canDelete = client.total_bookings === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/clients">
            <ArrowLeft className="w-4 h-4 mr-2" />
            All clients
          </Link>
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-[#086a82] flex items-center justify-center text-white font-semibold text-xl shrink-0">
            {clientInitials(client.full_name)}
          </div>
          <div>
            <h1 className="text-3xl font-semibold">{client.full_name}</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {client.email}
              </p>
              {client.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {client.phone}
                </p>
              )}
              <p className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Last visit: {formatLastVisit(client.last_visit_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => navigate(`/dashboard/calendar?new=1&client=${encodeURIComponent(client.id)}`)}
          >
            <CalendarPlus className="w-4 h-4 mr-2" />
            Book appointment
          </Button>
          <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Email
          </Button>
          {client.phone && phoneHref && (
            <Button variant="outline" onClick={() => setShowCallDialog(true)}>
              <Phone className="w-4 h-4 mr-2" />
              Call
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600 hover:text-red-700" disabled={!canDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {client.full_name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {canDelete
                    ? "This permanently removes the client record. This action cannot be undone."
                    : "Clients with booking history cannot be deleted. Cancel or archive bookings first if needed."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {canDelete && (
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    disabled={isDeleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDelete();
                    }}
                  >
                    {isDeleting ? "Deleting..." : "Delete client"}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {!canDelete && (
        <p className="text-sm text-muted-foreground">
          This client has {client.total_bookings} booking{client.total_bookings === 1 ? "" : "s"} on record, so
          deletion is disabled.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total bookings</p>
              <p className="text-2xl font-semibold">{client.total_bookings}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-accent" />
            <div>
              <p className="text-sm text-muted-foreground">Total spent</p>
              <p className="text-2xl font-semibold">₦{client.total_spent.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Upcoming / recent</p>
              <p className="text-2xl font-semibold">{clientBookings.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Booking history</TabsTrigger>
          <TabsTrigger value="activity">Outreach</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {clientBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{booking.service_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(booking.start_at).toLocaleString("en-US", {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    {booking.client_name && booking.client_name !== client.full_name && (
                      <p className="text-xs text-muted-foreground mt-1">Booked as {booking.client_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent capitalize">
                      {booking.status}
                    </span>
                    <Button variant="link" size="sm" asChild>
                      <Link to="/dashboard/calendar">View</Link>
                    </Button>
                  </div>
                </div>
              ))}
              {clientBookings.length === 0 && (
                <p className="text-sm text-muted-foreground">No bookings yet for this client.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Emails & calls</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientCommunicationsList items={communications} loading={loadingCommunications} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Client notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add notes about preferences, allergies, follow-ups..."
                rows={6}
              />
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleSaveNotes}
                loading={isSavingNotes}
                loadingLabel="Saving..."
              >
                Save notes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editForm.full_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone (optional)</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full" loading={isSavingEdit} loadingLabel="Saving...">
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <SendClientEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        clientId={client.id}
        clientName={client.full_name}
        clientEmail={client.email}
        onSent={() => void refetchCommunications()}
      />

      {client.phone && (
        <CallClientDialog
          open={showCallDialog}
          onOpenChange={setShowCallDialog}
          clientId={client.id}
          clientName={client.full_name}
          phone={client.phone}
          defaultCountryCode={defaultCountryCode}
          onLogged={() => void refetchCommunications()}
        />
      )}
    </div>
  );
}
