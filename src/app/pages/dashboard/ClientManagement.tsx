// Tenant client list with search, stats, and navigation to client detail pages.

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Search, Plus, Mail, Phone, ChevronRight, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import {
  BrandAvatar,
  EmptyState,
  ErrorNote,
  ListRow,
  ListSkeleton,
  PageHeader,
  PageShell,
  SectionCard,
  StatCard,
} from "../../components/dashboard-ui";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", notes: "" });

  const {
    data: clientRows = [],
    isError: clientsFailed,
    isPending: clientsLoading,
  } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
  });

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setShowAddDialog(true);
  }, [searchParams]);

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
    [clientRows],
  );

  const displayError = error || (clientsFailed ? "Unable to load clients from API." : "");

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalBookings = clients.reduce((sum, client) => sum + client.totalBookings, 0);
  const avgBookingsPerClient = clients.length > 0 ? totalBookings / clients.length : 0;
  const avgLifetimeValue =
    clients.length > 0 ? clients.reduce((sum, client) => sum + client.totalSpent, 0) / clients.length : 0;

  function closeAddDialog(open: boolean) {
    setShowAddDialog(open);
    if (!open && searchParams.get("new") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }

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
      closeAddDialog(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      navigate(`/dashboard/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add client.");
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Customers"
        title="Clients"
        description="Manage relationships, bookings, and notes."
        actions={
          <Dialog open={showAddDialog} onOpenChange={closeAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
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
                <Button type="submit" className="w-full" loading={isAdding} loadingLabel="Adding...">
                  Add client
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total clients" value={clients.length} loading={clientsLoading} />
        <StatCard
          label="With bookings"
          value={clients.filter((c) => c.totalBookings > 0).length}
          loading={clientsLoading}
        />
        <StatCard
          label="Avg. bookings / client"
          value={avgBookingsPerClient.toFixed(1)}
          loading={clientsLoading}
        />
        <StatCard
          label="Avg. lifetime value"
          value={`₦${avgLifetimeValue.toFixed(0)}`}
          loading={clientsLoading}
        />
      </div>

      {displayError && <ErrorNote>{displayError}</ErrorNote>}

      <SectionCard title="All clients">
        {clientsLoading ? (
          <ListSkeleton rows={5} />
        ) : filteredClients.length === 0 ? (
          clients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No clients yet"
              description="Add a client yourself or share your booking link so they appear here after they book."
              action={
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add client
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No matching clients"
              description="Try a different name, email, or phone number."
            />
          )
        ) : (
          <div className="space-y-2.5">
            {filteredClients.map((client) => (
              <ListRow key={client.id} to={`/dashboard/clients/${client.id}`}>
                <BrandAvatar name={client.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{client.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      {client.email}
                    </span>
                    {client.phone && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {client.phone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-8 sm:flex">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Bookings</p>
                    <p className="font-semibold tabular-nums">{client.totalBookings}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="font-semibold tabular-nums">₦{client.totalSpent.toFixed(0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Last visit</p>
                    <p className="font-medium">{formatLastVisit(client.lastVisit)}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </ListRow>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
