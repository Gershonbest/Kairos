// Tenant client list and contact management page.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Search, Plus, Mail, Phone, Calendar, DollarSign, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api/client";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalBookings: number;
  totalSpent: number;
  lastVisit: string;
  notes: string;
}

interface BookingRow {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  client_id: string;
  service_id: string;
  client_name: string;
  service_name: string;
}

export function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [error, setError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", notes: "" });

  const loadData = useCallback(() => {
    Promise.all([api.listClients(), api.listBookings()])
      .then(([clientRows, bookingRows]) => {
        setBookings(bookingRows);
        setClients(
          clientRows.map((row) => ({
            id: row.id,
            name: row.full_name,
            email: row.email,
            phone: row.phone ?? "N/A",
            totalBookings: row.total_bookings,
            totalSpent: row.total_spent,
            lastVisit: row.last_visit_at ?? new Date().toISOString(),
            notes: row.notes ?? "",
          }))
        );
      })
      .catch(() => setError("Unable to load clients from API."));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalBookings = clients.reduce((sum, client) => sum + client.totalBookings, 0);
  const avgBookingsPerClient = clients.length > 0 ? totalBookings / clients.length : 0;
  const avgLifetimeValue =
    clients.length > 0 ? clients.reduce((sum, client) => sum + client.totalSpent, 0) / clients.length : 0;
  const clientBookingHistory = selectedClient
    ? bookings.filter((booking) => booking.client_id === selectedClient.id)
    : [];

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError("");
    try {
      await api.createClient({
        full_name: newClient.name.trim(),
        email: newClient.email.trim(),
        phone: newClient.phone.trim() || undefined,
        notes: newClient.notes.trim() || undefined,
      });
      setNewClient({ name: "", email: "", phone: "", notes: "" });
      setShowAddDialog(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add client.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSaveNotes() {
    if (!selectedClient) return;
    setIsSavingNote(true);
    setError("");
    try {
      await api.updateClient(selectedClient.id, { notes: noteDraft });
      setSelectedClient((prev) => (prev ? { ...prev, notes: noteDraft } : prev));
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notes.");
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Client Management</h1>
          <p className="text-muted-foreground mt-1">View and manage your client relationships</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-[#3B3680] hover:bg-[#2E2A5C]">
              <Plus className="w-4 h-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add new client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <Label htmlFor="client-name">Full name</Label>
                <Input
                  id="client-name"
                  value={newClient.name}
                  onChange={(e) => setNewClient((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient((prev) => ({ ...prev, email: e.target.value }))}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="client-phone">Phone (optional)</Label>
                <Input
                  id="client-phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient((prev) => ({ ...prev, phone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="client-notes">Notes (optional)</Label>
                <Textarea
                  id="client-notes"
                  value={newClient.notes}
                  onChange={(e) => setNewClient((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full bg-[#3B3680] hover:bg-[#2E2A5C]" loading={isAdding} loadingLabel="Adding...">
                Add client
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search clients by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{clients.filter((c) => c.totalBookings > 0).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Bookings/Client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{avgBookingsPerClient.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Lifetime Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">${avgLifetimeValue.toFixed(0)}</div>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredClients.map((client) => (
              <Dialog key={client.id}>
                <DialogTrigger asChild>
                  <div
                    className="p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedClient(client);
                      setNoteDraft(client.notes);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3B3680] to-[#2E2A5C] flex items-center justify-center text-white font-medium text-lg">
                          {client.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <h3 className="font-medium">{client.name}</h3>
                          <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {client.email}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {client.phone}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Bookings</p>
                          <p className="font-semibold">{client.totalBookings}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Spent</p>
                          <p className="font-semibold text-[#2ECC71]">${client.totalSpent.toFixed(0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Last Visit</p>
                          <p className="font-medium">
                            {new Date(client.lastVisit).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3B3680] to-[#2E2A5C] flex items-center justify-center text-white font-medium text-lg">
                        {client.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <div>{client.name}</div>
                        <p className="text-sm text-muted-foreground font-normal">{client.email}</p>
                      </div>
                    </DialogTitle>
                  </DialogHeader>

                  <Tabs defaultValue="overview" className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="bookings">Booking History</TabsTrigger>
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Calendar className="w-8 h-8 text-[#3B3680]" />
                              <div>
                                <p className="text-sm text-muted-foreground">Total Bookings</p>
                                <p className="text-2xl font-semibold">{client.totalBookings}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <DollarSign className="w-8 h-8 text-[#2ECC71]" />
                              <div>
                                <p className="text-sm text-muted-foreground">Total Spent</p>
                                <p className="text-2xl font-semibold">${client.totalSpent.toFixed(0)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="bookings" className="mt-4">
                      <div className="space-y-2">
                        {clientBookingHistory.map((booking) => (
                          <div
                            key={booking.id}
                            className="flex items-center justify-between p-3 border border-border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{booking.service_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(booking.start_at).toLocaleDateString("en-US", {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-[#2ECC71]/10 text-[#2ECC71]">
                              {booking.status}
                            </span>
                          </div>
                        ))}
                        {clientBookingHistory.length === 0 && (
                          <p className="text-sm text-muted-foreground">No bookings yet for this client.</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="notes" className="mt-4 space-y-4">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-2" />
                        <Textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add notes about preferences, allergies, follow-ups..."
                          rows={5}
                        />
                      </div>
                      <Button
                        className="w-full bg-[#3B3680] hover:bg-[#2E2A5C]"
                        onClick={handleSaveNotes}
                        loading={isSavingNote}
                        loadingLabel="Saving..."
                      >
                        Save notes
                      </Button>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            ))}
            {filteredClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No clients yet. Add one or share your booking link.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
