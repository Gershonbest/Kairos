// Platform admin overview dashboard.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Download, Receipt, RefreshCw, Settings, Users } from "lucide-react";
import { api } from "../../../lib/api/client";
import { AdminHeader, adminNavLinkClass } from "../../components/layouts/AdminHeader";

export function SystemAdmin() {
  const [metrics, setMetrics] = useState<{
    tenants: number;
    bookings: number;
    mrr: number;
    active_tenants: number;
    trial_tenants: number;
    suspended_tenants: number;
  } | null>(null);
  const [subscribers, setSubscribers] = useState<
    Array<{ id: string; name: string; owner?: string; owner_email?: string; plan_code: string; status: string }>
  >([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [m, s] = await Promise.all([api.adminMetrics(), api.adminSubscribers()]);
      setMetrics(m);
      setSubscribers(s);
      setError("");
    } catch {
      setError("Unable to load admin dashboard data.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const topSubscribers = useMemo(() => subscribers.slice(0, 10), [subscribers]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title="Orheo" subtitle="System Admin Dashboard">
        <button
          onClick={() => void load()}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export
        </button>
        <Link to="/admin/plans" className={adminNavLinkClass}>
          <Settings className="w-4 h-4" />
          Plan Settings
        </Link>
        <Link to="/admin/payments" className={adminNavLinkClass}>
          <Receipt className="w-4 h-4" />
          Payment Hub
        </Link>
        <Link
          to="/admin/subscribers"
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Manage Subscribers
        </Link>
      </AdminHeader>

      <div className="p-6 max-w-[1600px] mx-auto">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {[
            { title: "Total Tenants", value: metrics?.tenants ?? 0 },
            { title: "Total Bookings", value: metrics?.bookings ?? 0 },
            { title: "MRR", value: `₦${(metrics?.mrr ?? 0).toLocaleString()}` },
            { title: "Active Tenants", value: metrics?.active_tenants ?? 0 },
          ].map((item) => (
            <div key={item.title} className="bg-card rounded-xl p-6 border border-border">
              <h3 className="text-2xl font-bold text-foreground mb-1">{item.value}</h3>
              <p className="text-sm text-muted-foreground">{item.title}</p>
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Recent Tenants</h2>
            <p className="text-sm text-muted-foreground">All tenants loaded from database</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/60 border-b border-border">
                <tr>
                  {["Business", "Owner Email", "Plan", "Status"].map((heading) => (
                    <th
                      key={heading}
                      className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{subscriber.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{subscriber.owner_email ?? "--"}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{subscriber.plan_code}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}