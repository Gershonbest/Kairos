// Platform admin tenant subscriber management page.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Ban, Calendar, CheckCircle, Download, Search, Trash2 } from "lucide-react";
import { api } from "../../../lib/api/client";
import { Button } from "../../components/ui/button";

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
    setPlanUpdatingId(tenantId);
    try {
      await api.updateSubscriber(tenantId, { plan_code: newPlan });
      await load();
      setError("");
    } catch {
      setError("Unable to update tenant plan.");
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/admin" className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Tenant Management</h1>
                  <p className="text-xs text-gray-500">Manage all Kairos tenants</p>
                </div>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2 border border-gray-200 rounded-lg"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1600px] mx-auto">
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <StatCard title="Total Tenants" value={String(subscribers.length)} color="text-gray-900" />
          <StatCard
            title="Active"
            value={String(subscribers.filter((s) => s.status === "active").length)}
            color="text-green-600"
          />
          <StatCard
            title="Trial"
            value={String(subscribers.filter((s) => s.status === "trial").length)}
            color="text-blue-600"
          />
          <StatCard
            title="Suspended"
            value={String(subscribers.filter((s) => s.status === "suspended").length)}
            color="text-red-600"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search business, owner, email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Plans</option>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name}
                </option>
              ))}
            </select>
            <div className="text-sm text-gray-500 flex items-center">{filteredSubscribers.length} results</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Created from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Created to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Owner Email
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Public Slug
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pagedSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900">{subscriber.name}</div>
                        <div className="text-sm text-gray-500 mt-1">{subscriber.location ?? "No location"}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {subscriber.owner ?? "Unknown owner"}
                        </div>
                        <div className="text-sm text-gray-500">{subscriber.owner_email ?? "--"}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={subscriber.plan_code}
                        onChange={(e) => void handleChangePlan(subscriber.id, e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          subscriber.status === "active"
                            ? "bg-green-100 text-green-800"
                            : subscriber.status === "suspended"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {subscriber.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {subscriber.created_at ? new Date(subscriber.created_at).toLocaleDateString() : "--"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{subscriber.public_slug ?? "--"}</td>
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
                              ? "text-green-600 hover:bg-green-50"
                              : "text-red-600 hover:bg-red-50"
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
                          className="text-gray-600 hover:text-red-600 hover:bg-red-50"
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
              <p className="text-gray-500">No tenants found matching your filters.</p>
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Page <span className="font-medium">{clampedPage}</span> of{" "}
              <span className="font-medium">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
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
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
