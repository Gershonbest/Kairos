// Platform admin tenant subscriber management page.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Ban, CheckCircle, Download, Search, Trash2 } from "lucide-react";
import { api } from "../../../lib/api/client";
import { Button } from "../../components/ui/button";
import {
  AdminHeader,
  adminGhostLinkClass,
  adminInputClass,
  adminNavLinkClass,
} from "../../components/layouts/AdminHeader";

type TenantRow = {
  id: string;
  name: string;
  owner?: string;
  owner_email?: string;
  location?: string;
  plan_code: string;
  status: string;
  public_slug?: string;
  created_at?: string;
};

const PAGE_SIZE = 10;

export function SubscriberManagement() {
  const [plans, setPlans] = useState<Array<{ code: string; name: string }>>([]);
  const [subscribers, setSubscribers] = useState<TenantRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [planUpdatingId, setPlanUpdatingId] = useState<string | null>(null);
  const isRowBusy = statusUpdatingId !== null || deletingId !== null || planUpdatingId !== null;

  const load = async () => {
    try {
      const [tenantRows, planRows] = await Promise.all([api.adminSubscribers(), api.adminPlans()]);
      setSubscribers(tenantRows);
      setPlans(planRows.map((plan) => ({ code: plan.code, name: plan.name })));
      setError("");
    } catch {
      setError("Unable to load tenants.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredSubscribers = useMemo(() => {
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return subscribers.filter((sub) => {
      const searchOk =
        sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.owner ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.owner_email ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      const statusOk = statusFilter === "all" || sub.status === statusFilter;
      const planOk = planFilter === "all" || sub.plan_code === planFilter;

      if (!sub.created_at || (!fromDate && !toDate)) {
        return searchOk && statusOk && planOk;
      }
      const createdAt = new Date(sub.created_at);
      const fromOk = !fromDate || createdAt >= fromDate;
      const toOk = !toDate || createdAt <= toDate;
      return searchOk && statusOk && planOk && fromOk && toOk;
    });
  }, [dateFrom, dateTo, planFilter, searchQuery, statusFilter, subscribers]);

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pagedSubscribers = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filteredSubscribers.slice(start, start + PAGE_SIZE);
  }, [clampedPage, filteredSubscribers]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, planFilter, dateFrom, dateTo]);

  const handleStatusToggle = async (subscriber: { id: string; status: string }) => {
    const newStatus = subscriber.status === "suspended" ? "active" : "suspended";
    setStatusUpdatingId(subscriber.id);
    try {
      await api.updateSubscriber(subscriber.id, { status: newStatus });
      await load();
      setError("");
    } catch {
      setError("Unable to update tenant status.");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDelete = async (subscriberId: string) => {
    if (!window.confirm("Delete this tenant and all related data?")) return;
    setDeletingId(subscriberId);
    try {
      await api.deleteSubscriber(subscriberId);
      await load();
      setError("");
    } catch {
      setError("Unable to delete tenant.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleChangePlan = async (tenantId: string, newPlan: string) => {
    const confirmed = window.confirm(
      `Grant the "${newPlan}" plan for free for 30 days?\n\nThis activates the account without charging the business.`
    );
    if (!confirmed) {
      await load();
      return;
    }
    setPlanUpdatingId(tenantId);
    try {
      await api.updateSubscriber(tenantId, { plan_code: newPlan, grant_days: 30 });
      await load();
      setError("");
    } catch {
      setError("Unable to grant tenant plan.");
      await load();
    } finally {
      setPlanUpdatingId(null);
    }
  };

  const handleExportCsv = () => {
    const rows = filteredSubscribers.map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.owner ?? "",
      owner_email: row.owner_email ?? "",
      status: row.status,
      plan_code: row.plan_code,
      location: row.location ?? "",
      public_slug: row.public_slug ?? "",
      created_at: row.created_at ?? "",
    }));
    const headers = Object.keys(rows[0] ?? {
      id: "",
      name: "",
      owner: "",
      owner_email: "",
      status: "",
      plan_code: "",
      location: "",
      public_slug: "",
      created_at: "",
    });
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => `"${String((r as Record<string, string>)[h] ?? "").replaceAll('"', '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tenants-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title="Tenant Management" subtitle="Manage all Kairos tenants">
        <Link to="/admin" className={adminGhostLinkClass}>
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <Link to="/admin/payments" className={adminNavLinkClass}>
          Payment Hub
        </Link>
        <button onClick={handleExportCsv} className={adminNavLinkClass}>
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </AdminHeader>

      <div className="p-6 max-w-[1600px] mx-auto">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <StatCard title="Total Tenants" value={String(subscribers.length)} color="text-foreground" />
          <StatCard
            title="Active"
            value={String(subscribers.filter((s) => s.status === "active").length)}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            title="Trial"
            value={String(subscribers.filter((s) => s.status === "trial").length)}
            color="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            title="Suspended"
            value={String(subscribers.filter((s) => s.status === "suspended").length)}
            color="text-red-600 dark:text-red-400"
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search business, owner, email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${adminInputClass} w-full pl-10`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={adminInputClass}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className={adminInputClass}
            >
              <option value="all">All Plans</option>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name}
                </option>
              ))}
            </select>
            <div className="text-sm text-muted-foreground flex items-center">
              {filteredSubscribers.length} results
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Created from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${adminInputClass} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Created to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${adminInputClass} w-full`}
              />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/60 border-b border-border">
                <tr>
                  {["Business", "Owner Email", "Plan", "Status", "Created", "Public Slug", "Actions"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-foreground">{subscriber.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {subscriber.location ?? "No location"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {subscriber.owner ?? "Unknown owner"}
                        </div>
                        <div className="text-sm text-muted-foreground">{subscriber.owner_email ?? "--"}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={subscriber.plan_code}
                        onChange={(e) => void handleChangePlan(subscriber.id, e.target.value)}
                        className="px-2 py-1.5 rounded text-xs bg-input-background text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring/40"
                        disabled={isRowBusy}
                      >
                        {plans.map((plan) => (
                          <option key={plan.code} value={plan.code}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${
                          subscriber.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : subscriber.status === "suspended"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {subscriber.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {subscriber.created_at ? new Date(subscriber.created_at).toLocaleDateString() : "--"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{subscriber.public_slug ?? "--"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleStatusToggle(subscriber)}
                          loading={statusUpdatingId === subscriber.id}
                          disabled={isRowBusy}
                          className={
                            subscriber.status === "suspended"
                              ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                              : "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                          }
                          title={subscriber.status === "suspended" ? "Activate" : "Suspend"}
                        >
                          {subscriber.status === "suspended" ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Ban className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDelete(subscriber.id)}
                          loading={deletingId === subscriber.id}
                          disabled={isRowBusy}
                          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                          title="Delete tenant"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagedSubscribers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No tenants found matching your filters.</p>
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page <span className="font-medium text-foreground">{clampedPage}</span> of{" "}
              <span className="font-medium text-foreground">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                className="px-3 py-1 text-sm text-foreground border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                className="px-3 py-1 text-sm text-foreground border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="bg-card rounded-xl p-6 border border-border">
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
