// Platform admin overview dashboard.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Calendar, Download, RefreshCw, Settings, Users } from "lucide-react";
import { api } from "../../../lib/api/client";

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Kairos Bookings</h1>
                  <p className="text-xs text-gray-500">System Admin Dashboard</p>
                </div>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => void load()} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </button>
              <Link
                to="/admin/plans"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2 border border-gray-200 rounded-lg"
              >
                <Settings className="w-4 h-4" />
                Plan Settings
              </Link>
              <Link
                to="/admin/subscribers"
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Manage Subscribers
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1600px] mx-auto">
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {[
            { title: "Total Tenants", value: metrics?.tenants ?? 0 },
            { title: "Total Bookings", value: metrics?.bookings ?? 0 },
            { title: "MRR", value: `₦${(metrics?.mrr ?? 0).toLocaleString()}` },
            { title: "Active Tenants", value: metrics?.active_tenants ?? 0 },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{item.value}</h3>
              <p className="text-sm text-gray-600">{item.title}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Recent Tenants</h2>
            <p className="text-sm text-gray-500">All tenants loaded from database</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Owner Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{subscriber.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{subscriber.owner_email ?? "--"}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{subscriber.plan_code}</td>
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