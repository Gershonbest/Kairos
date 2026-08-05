// Platform admin payment hub: client booking payments, subscription fees,
// per-business client rollups, and the raw transaction log.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import { api } from "../../../lib/api/client";
import {
  AdminHeader,
  adminGhostLinkClass,
  adminInputClass,
  adminNavLinkClass,
} from "../../components/layouts/AdminHeader";

type PaymentRow = Awaited<ReturnType<typeof api.adminPayments>>["items"][number];
type PaymentDetail = Awaited<ReturnType<typeof api.adminPaymentDetail>>;
type PaymentSummary = Awaited<ReturnType<typeof api.adminPaymentSummary>>;
type TenantRollup = Awaited<ReturnType<typeof api.adminPaymentsByTenant>>[number];
type ClientRollup = Awaited<ReturnType<typeof api.adminTenantClientPayments>>[number];

const PAGE_SIZE = 25;

function formatMoney(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
  } catch {
    return `NGN ${amount.toLocaleString()}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  refunded: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

const inputClass = adminInputClass;

function StatCard({
  title,
  value,
  hint,
  icon,
  accent,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className={accent ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PaymentLogs() {
  const [tab, setTab] = useState<"log" | "businesses">("log");

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [purpose, setPurpose] = useState("all");
  const [status, setStatus] = useState("all");
  const [tenantFilter, setTenantFilter] = useState<{ id: string; name: string } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [tenants, setTenants] = useState<TenantRollup[]>([]);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [tenantClients, setTenantClients] = useState<Record<string, ClientRollup[]>>({});

  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [webhookExpanded, setWebhookExpanded] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const range = useMemo(
    () => ({
      from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      to: dateTo ? `${dateTo}T23:59:59` : undefined,
    }),
    [dateFrom, dateTo]
  );

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.adminPayments({
        q: q || undefined,
        tenant_id: tenantFilter?.id,
        purpose: purpose === "all" ? undefined : purpose,
        status: status === "all" ? undefined : status,
        from: range.from,
        to: range.to,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setError("");
    } catch {
      setError("Unable to load payment logs.");
    } finally {
      setLoading(false);
    }
  }, [page, purpose, q, range.from, range.to, status, tenantFilter?.id]);

  const loadOverview = useCallback(async () => {
    try {
      const [summaryResult, tenantResult] = await Promise.all([
        api.adminPaymentSummary({ from: range.from, to: range.to }),
        api.adminPaymentsByTenant({ from: range.from, to: range.to }),
      ]);
      setSummary(summaryResult);
      setTenants(tenantResult);
    } catch {
      setError("Unable to load payment summary.");
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setPage(1);
  }, [q, purpose, status, dateFrom, dateTo, tenantFilter?.id]);

  const toggleTenant = async (tenantId: string) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
      return;
    }
    setExpandedTenant(tenantId);
    if (tenantClients[tenantId]) return;
    try {
      const clients = await api.adminTenantClientPayments(tenantId, {
        from: range.from,
        to: range.to,
      });
      setTenantClients((current) => ({ ...current, [tenantId]: clients }));
    } catch {
      setError("Unable to load client payments for this business.");
    }
  };

  const openDetail = async (transactionId: string) => {
    setDetailLoading(true);
    setWebhookExpanded(null);
    try {
      setDetail(await api.adminPaymentDetail(transactionId));
      setError("");
    } catch {
      setError("Unable to load payment detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const copyRef = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedRef(reference);
      window.setTimeout(() => setCopiedRef(null), 1500);
    } catch {
      setError("Unable to copy reference.");
    }
  };

  const viewTenantLog = (tenant: TenantRollup) => {
    setTenantFilter({ id: tenant.tenant_id, name: tenant.tenant_name });
    setPurpose("booking");
    setTab("log");
  };

  const exportCsv = () => {
    const header = [
      "created_at",
      "paid_at",
      "business",
      "client_name",
      "client_email",
      "client_phone",
      "purpose",
      "status",
      "amount",
      "platform_fee",
      "settlement",
      "currency",
      "provider",
      "provider_reference",
      "transaction_id",
      "booking_id",
    ];
    const lines = [
      header.join(","),
      ...items.map((row) =>
        [
          row.created_at,
          row.paid_at,
          row.tenant_name,
          row.client_name,
          row.client_email,
          row.client_phone,
          row.purpose,
          row.status,
          row.amount,
          row.platform_fee_amount,
          row.tenant_settlement_amount,
          row.currency,
          row.provider,
          row.provider_reference,
          row.id,
          row.booking_id,
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kairos-payment-logs-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader
        title="Payment Hub"
        subtitle="Client booking payments, subscription fees, and dispute evidence"
      >
        <Link to="/admin" className={adminGhostLinkClass}>
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <button
          onClick={exportCsv}
          disabled={items.length === 0}
          className={`${adminNavLinkClass} disabled:opacity-50`}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </AdminHeader>

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            accent
            title="Client booking payments"
            value={formatMoney(summary?.booking.gross ?? 0)}
            hint={`${summary?.booking.succeeded ?? 0} paid · ${summary?.booking.paying_clients ?? 0} clients · ${
              summary?.booking.businesses_collecting ?? 0
            } businesses`}
            icon={<Users className="w-5 h-5" />}
          />
          <StatCard
            title="Platform fees earned"
            value={formatMoney(summary?.booking.platform_fee ?? 0)}
            hint={`Settled to businesses: ${formatMoney(summary?.booking.settlement ?? 0)}`}
            icon={<Receipt className="w-5 h-5" />}
          />
          <StatCard
            title="Subscription fees"
            value={formatMoney(summary?.subscription.gross ?? 0)}
            hint={`${summary?.subscription.succeeded ?? 0} businesses paid Kairos`}
            icon={<CreditCard className="w-5 h-5" />}
          />
          <StatCard
            title="Needs attention"
            value={`${(summary?.booking.pending ?? 0) + (summary?.subscription.pending ?? 0)} pending`}
            hint={`${(summary?.booking.failed ?? 0) + (summary?.subscription.failed ?? 0)} failed · ${
              (summary?.booking.refunded ?? 0) + (summary?.subscription.refunded ?? 0)
            } refunded`}
            icon={<Search className="w-5 h-5" />}
          />
        </section>

        <div className="flex items-center gap-2 border-b border-border">
          <button
            onClick={() => setTab("log")}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${
              tab === "log"
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Transaction log
          </button>
          <button
            onClick={() => setTab("businesses")}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${
              tab === "businesses"
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Client payments by business
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <form
              className="lg:col-span-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setQ(searchInput.trim());
                setTab("log");
              }}
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search ref, business, client…"
                  className={`${inputClass} w-full pl-9`}
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Search
              </button>
            </form>
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className={inputClass}
            >
              <option value="all">All purposes</option>
              <option value="booking">Client bookings</option>
              <option value="subscription">Subscriptions</option>
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={inputClass}
            >
              <option value="all">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className={inputClass}
            />
          </div>
          {tenantFilter && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
                <Building2 className="w-3.5 h-3.5" />
                {tenantFilter.name}
                <button type="button" onClick={() => setTenantFilter(null)} aria-label="Clear business filter">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          )}
        </div>

        {tab === "log" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Receipt className="w-4 h-4" />
                {loading ? "Loading…" : `${total.toLocaleString()} payment${total === 1 ? "" : "s"}`}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="px-3 py-1 border border-border rounded text-foreground hover:bg-muted disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-muted-foreground">
                  Page {Math.min(page, totalPages)} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="px-3 py-1 border border-border rounded text-foreground hover:bg-muted disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Paid by</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Fee</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Paystack ref</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">
                        {formatDate(row.paid_at || row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.tenant_name || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {row.tenant_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">
                          {row.client_name || (row.purpose === "subscription" ? "Business owner" : "—")}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.client_email || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-xs ${
                            row.purpose === "booking"
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-accent/10 text-accent border-accent/30"
                          }`}
                        >
                          {row.purpose === "booking" ? "Client booking" : "Subscription"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {formatMoney(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.platform_fee_amount != null
                          ? formatMoney(row.platform_fee_amount, row.currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-xs capitalize ${
                            STATUS_STYLES[row.status] || "bg-muted text-foreground border-border"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded max-w-[140px] truncate block">
                            {row.provider_reference}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copyRef(row.provider_reference)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            title="Copy reference"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {copiedRef === row.provider_reference && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">Copied</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-foreground hover:bg-muted"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        No payments match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "businesses" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="w-4 h-4" />
              What each business collected from its clients ({tenants.length} businesses)
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Clients paid</th>
                    <th className="px-4 py-3 font-medium">Payments</th>
                    <th className="px-4 py-3 font-medium">Collected</th>
                    <th className="px-4 py-3 font-medium">Platform fee</th>
                    <th className="px-4 py-3 font-medium">Settlement</th>
                    <th className="px-4 py-3 font-medium">Last payment</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <Fragment key={tenant.tenant_id}>
                      <tr
                        className="border-t border-border hover:bg-muted/40 cursor-pointer"
                        onClick={() => void toggleTenant(tenant.tenant_id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expandedTenant === tenant.tenant_id ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="font-medium text-foreground">{tenant.tenant_name}</div>
                              <div className="text-xs text-muted-foreground capitalize">
                                {tenant.tenant_status} · {tenant.plan_code}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{tenant.clients}</td>
                        <td className="px-4 py-3 text-foreground">
                          {tenant.transactions}
                          {(tenant.pending > 0 || tenant.failed > 0) && (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              {tenant.pending} pending · {tenant.failed} failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {formatMoney(tenant.gross)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatMoney(tenant.platform_fee)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatMoney(tenant.settlement)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(tenant.last_payment_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              viewTenantLog(tenant);
                            }}
                            className="px-2.5 py-1.5 text-xs border border-border rounded-lg text-foreground hover:bg-muted"
                          >
                            View logs
                          </button>
                        </td>
                      </tr>
                      {expandedTenant === tenant.tenant_id && (
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={8} className="px-4 py-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              Clients who paid {tenant.tenant_name}
                            </p>
                            {!tenantClients[tenant.tenant_id] && (
                              <p className="text-sm text-muted-foreground">Loading clients…</p>
                            )}
                            {tenantClients[tenant.tenant_id]?.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                No client payments recorded for this business.
                              </p>
                            )}
                            {(tenantClients[tenant.tenant_id]?.length ?? 0) > 0 && (
                              <table className="min-w-full text-sm">
                                <thead className="text-left text-muted-foreground">
                                  <tr>
                                    <th className="py-2 pr-4 font-medium">Client</th>
                                    <th className="py-2 pr-4 font-medium">Contact</th>
                                    <th className="py-2 pr-4 font-medium">Payments</th>
                                    <th className="py-2 pr-4 font-medium">Total paid</th>
                                    <th className="py-2 pr-4 font-medium">Last payment</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tenantClients[tenant.tenant_id]?.map((client) => (
                                    <tr key={client.client_id} className="border-t border-border/60">
                                      <td className="py-2 pr-4 text-foreground">{client.client_name}</td>
                                      <td className="py-2 pr-4 text-muted-foreground">
                                        <div>{client.client_email}</div>
                                        <div className="text-xs">{client.client_phone || ""}</div>
                                      </td>
                                      <td className="py-2 pr-4 text-foreground">
                                        {client.transactions}
                                        {(client.pending > 0 || client.failed > 0) && (
                                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                            {client.pending} pending · {client.failed} failed
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 pr-4 font-medium text-foreground">
                                        {formatMoney(client.paid)}
                                      </td>
                                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                                        {formatDate(client.last_payment_at)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        No client booking payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50">
          <button type="button" aria-label="Close detail" className="flex-1" onClick={() => setDetail(null)} />
          <aside className="w-full max-w-xl h-full bg-card text-foreground shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Payment detail</h2>
                <p className="text-xs text-muted-foreground">Dispute evidence pack</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading && !detail && <p className="p-5 text-sm text-muted-foreground">Loading payment…</p>}

            {detail && (
              <div className="p-5 space-y-6">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Transaction</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-medium text-foreground">
                        {formatMoney(detail.amount, detail.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="capitalize text-foreground">{detail.status}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="text-foreground">
                        {detail.purpose === "booking" ? "Client booking" : "Subscription"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Fee / settlement</dt>
                      <dd className="text-foreground">
                        {detail.platform_fee_amount != null
                          ? formatMoney(detail.platform_fee_amount, detail.currency)
                          : "—"}{" "}
                        /{" "}
                        {detail.tenant_settlement_amount != null
                          ? formatMoney(detail.tenant_settlement_amount, detail.currency)
                          : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Paystack reference</dt>
                      <dd className="flex items-center gap-2 font-mono text-xs break-all text-foreground">
                        {detail.provider_reference}
                        <button type="button" onClick={() => void copyRef(detail.provider_reference)}>
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="text-foreground">{formatDate(detail.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="text-foreground">{formatDate(detail.paid_at)}</dd>
                    </div>
                  </dl>
                </section>

                {detail.tenant && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Business</h3>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="text-foreground">{detail.tenant.name}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Status / plan</dt>
                        <dd className="text-foreground">
                          {detail.tenant.status} · {detail.tenant.plan_code}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Owner</dt>
                        <dd className="text-foreground">
                          {detail.tenant.owner_name || "—"}
                          <div className="text-xs text-muted-foreground">{detail.tenant.owner_email}</div>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Settlement last4</dt>
                        <dd className="text-foreground">{detail.tenant.settlement_account_last4 || "—"}</dd>
                      </div>
                    </dl>
                  </section>
                )}

                {detail.booking && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Booking / client</h3>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Service</dt>
                        <dd className="text-foreground">{detail.booking.service?.name || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Booking status</dt>
                        <dd className="capitalize text-foreground">{detail.booking.status}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Client</dt>
                        <dd className="text-foreground">
                          {detail.booking.client?.full_name || "—"}
                          <div className="text-xs text-muted-foreground">{detail.booking.client?.email}</div>
                          <div className="text-xs text-muted-foreground">{detail.booking.client?.phone}</div>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">When</dt>
                        <dd className="text-foreground">{formatDate(detail.booking.start_at)}</dd>
                      </div>
                    </dl>
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
                  <ol className="space-y-2">
                    {detail.timeline
                      .filter((step) => step.at)
                      .map((step, index) => (
                        <li key={`${step.label}-${index}`} className="flex gap-3 text-sm">
                          <div className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                          <div>
                            <div className="font-medium text-foreground">{step.label}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(step.at)}</div>
                          </div>
                        </li>
                      ))}
                  </ol>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Gateway webhooks ({detail.webhooks.length})
                  </h3>
                  {detail.webhooks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No matching webhook events stored.</p>
                  )}
                  {detail.webhooks.map((event) => (
                    <div key={event.id} className="border border-border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-muted text-foreground"
                        onClick={() =>
                          setWebhookExpanded((current) => (current === event.id ? null : event.id))
                        }
                      >
                        <span>
                          {event.provider} · {event.event_id}
                          <span
                            className={`ml-2 text-xs ${
                              event.processed
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {event.processed ? "processed" : `pending · ${event.attempts} attempts`}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDate(event.created_at)}</span>
                      </button>
                      {webhookExpanded === event.id && (
                        <pre className="px-3 py-2 bg-slate-950 text-slate-100 text-xs overflow-x-auto max-h-80">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
