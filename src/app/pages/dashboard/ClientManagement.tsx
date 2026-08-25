// Tenant client list with search, stats, and navigation to client detail pages.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Search, Plus, Mail, Phone, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
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
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ClientManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", notes: "" });

  const { data: clientRows = [], isError: clientsFailed } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
  });

  const clients = useMemo(
    () =>
      clientRows.map((row) => ({
        id: row.id,
        name: row.full_name,
        email: row.email,
        phone: row.phone ?? "",
        totalBookings: row.total_bookings,
        totalSpent: row.total_spent,
        lastVisit: row.last_visit_at,
      })),
    [clientRows]
  );

  const displayError = error || (clientsFailed ? "Unable to load clients from API." : "");

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalBookings = clients.reduce((sum, client) => sum + client.totalBookings, 0);
  const avgBookingsPerClient = clients.length > 0 ? totalBookings / clients.length : 0;
  const avgLifetimeValue =
    clients.length > 0 ? clients.reduce((sum, client) => sum + client.totalSpent, 0) / clients.length : 0;

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError("");
    try {
      const created = await api.createClient({
        full_name: newClient.name.trim(),
        email: newClient.email.trim(),
        phone: newClient.phone.trim() || undefined,
        notes: newClient.notes.trim() || undefined,
      });
      setNewClient({ name: "", email: "", phone: "", notes: "" });
      setShowAddDialog(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      navigate(`/dashboard/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add client.");
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage relationships, bookings, and notes</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add client
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" loading={isAdding} loadingLabel="Adding...">
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
              placeholder="Search by name, email, or phone..."
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">With bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{clients.filter((c) => c.totalBookings > 0).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. bookings / client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{avgBookingsPerClient.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. lifetime value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{avgLifetimeValue.toFixed(0)}</div>
          </CardContent>
        </Card>
      </div>

      {displayError && <p className="text-sm text-red-600">{displayError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>All clients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => navigate(`/dashboard/clients/${client.id}`)}
                className="w-full text-left p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#086a82] flex items-center justify-center text-white font-medium text-lg shrink-0">
                      {clientInitials(client.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{client.name}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          {client.email}
                        </span>
                        {client.phone && (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3 shrink-0" />
                            {client.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-8 shrink-0">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Bookings</p>
                      <p className="font-semibold">{client.totalBookings}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Spent</p>
                      <p className="font-semibold text-accent">₦{client.totalSpent.toFixed(0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Last visit</p>
                      <p className="font-medium">{formatLastVisit(client.lastVisit)}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
            {filteredClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No clients found. Add one or share your booking link.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
