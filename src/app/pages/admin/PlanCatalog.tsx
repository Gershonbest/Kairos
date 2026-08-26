// Platform admin plan catalog: prices and entitlement ticks.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, Receipt, Save, Users } from "lucide-react";
import {
  api,
  type AdminPlanCapability,
  type AdminPlanRow,
  type AdminPlanUpdate,
} from "../../../lib/api/client";
import { Button } from "../../components/ui/button";
import {
  AdminHeader,
  adminGhostLinkClass,
  adminInputClass,
  adminNavLinkClass,
} from "../../components/layouts/AdminHeader";

const FALLBACK_CAPABILITIES: AdminPlanCapability[] = [
  { key: "bookings_per_month", label: "Bookings / month", kind: "limit" },
  { key: "team_members", label: "Team seats (incl. owner)", kind: "limit" },
  { key: "mobile_booking_page", label: "Public booking page", kind: "flag" },
  { key: "client_database", label: "Client database", kind: "flag" },
  { key: "payment_processing", label: "Payment processing", kind: "flag" },
  { key: "email_reminders", label: "Email notifications / reminders", kind: "flag" },
  { key: "ai_assistant", label: "Orion AI assistant", kind: "flag" },
  { key: "custom_branding", label: "Custom branding", kind: "flag" },
  { key: "analytics_dashboard", label: "Analytics dashboard", kind: "flag" },
  { key: "client_reminders_sms", label: "SMS reminders", kind: "flag" },
  { key: "client_reminders_whatsapp", label: "WhatsApp reminders", kind: "flag" },
  { key: "multi_location", label: "Multi-location", kind: "flag" },
  { key: "white_label", label: "White-label", kind: "flag" },
  { key: "client_reminders_voice", label: "Voice / AI call reminders", kind: "flag" },
  { key: "self_serve", label: "Self-serve checkout", kind: "flag" },
];

const PLAN_ORDER = ["standard", "premium", "enterprise"];

type DraftPlan = {
  code: string;
  name: string;
  description: string;
  monthly_price: number;
  is_featured: boolean;
  is_active: boolean;
  bookings_per_month: number | null;
  team_members: number | null;
  flags: Record<string, boolean>;
};

function toDraft(plan: AdminPlanRow): DraftPlan {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    monthly_price: Number(plan.monthly_price || 0),
    is_featured: Boolean(plan.is_featured),
    is_active: plan.is_active !== false,
    bookings_per_month: plan.bookings_per_month ?? null,
    team_members: plan.team_members ?? null,
    flags: {
      ...(plan.flags ?? {}),
      self_serve: plan.flags?.self_serve ?? plan.self_serve,
    },
  };
}

function TickCell({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
        checked
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
      }`}
    >
      {checked ? <Check className="h-4 w-4" /> : <span className="block h-4 w-4" />}
    </button>
  );
}

function LimitCell({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  label: string;
}) {
  const unlimited = value == null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <input
        type="number"
        min={1}
        disabled={unlimited}
        value={unlimited ? "" : value}
        aria-label={label}
        placeholder="∞"
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1);
        }}
        className={`${adminInputClass} w-24 text-center disabled:opacity-50`}
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(event) => onChange(event.target.checked ? null : 1)}
        />
        Unlimited
      </label>
    </div>
  );
}

export function PlanCatalog() {
  const [capabilities, setCapabilities] = useState<AdminPlanCapability[]>(FALLBACK_CAPABILITIES);
  const [drafts, setDrafts] = useState<DraftPlan[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const catalog = await api.adminPlanCatalog();
      setCapabilities(catalog.capabilities.length > 0 ? catalog.capabilities : FALLBACK_CAPABILITIES);
      const ordered = [...catalog.plans].sort(
        (a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)
      );
      setDrafts(ordered.map(toDraft));
      setError("");
    } catch {
      setError("Unable to load the plan catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateDraft = (code: string, patch: Partial<DraftPlan>) => {
    setDrafts((current) => current.map((plan) => (plan.code === code ? { ...plan, ...patch } : plan)));
    setSuccess("");
  };

  const updateFlag = (code: string, key: string, value: boolean) => {
    setDrafts((current) =>
      current.map((plan) =>
        plan.code === code ? { ...plan, flags: { ...plan.flags, [key]: value } } : plan
      )
    );
    setSuccess("");
  };

  const orderedPlans = useMemo(
    () => [...drafts].sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)),
    [drafts]
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload: { plans: AdminPlanUpdate[] } = {
        plans: orderedPlans.map((plan) => {
          const selfServe = Boolean(plan.flags.self_serve);
          return {
            code: plan.code,
            name: plan.name,
            description: plan.description,
            monthly_price: selfServe ? plan.monthly_price : 0,
            self_serve: selfServe,
            is_featured: plan.is_featured,
            is_active: plan.is_active,
            bookings_per_month: plan.bookings_per_month,
            team_members: plan.team_members,
            flags: plan.flags,
          };
        }),
      };
      const catalog = await api.updateAdminPlans(payload);
      setCapabilities(catalog.capabilities.length > 0 ? catalog.capabilities : FALLBACK_CAPABILITIES);
      const ordered = [...catalog.plans].sort(
        (a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)
      );
      setDrafts(ordered.map(toDraft));
      setSuccess("Plan catalog saved. Public pricing and entitlements now use these values.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save plans.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title="Plan catalog" subtitle="Pricing and entitlements for Standard, Premium, and Enterprise">
        <Link to="/admin" className={adminGhostLinkClass}>
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <Link to="/admin/payments" className={adminNavLinkClass}>
          <Receipt className="w-4 h-4" />
          Payment Hub
        </Link>
        <Link to="/admin/subscribers" className={adminNavLinkClass}>
          <Users className="w-4 h-4" />
          Subscribers
        </Link>
        <Button onClick={() => void handleSave()} disabled={saving || loading || drafts.length === 0}>
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save catalog"}
        </Button>
      </AdminHeader>

      <div className="p-6 max-w-[1600px] mx-auto space-y-4">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            {success}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          Trial stays 7 days on Standard entitlements. Ticks turn capabilities on or off for each plan.
          Unlimited limits use the checkbox; Enterprise checkout stays contact-admin while self-serve is off.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading plans...</p>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-64">
                      Capability
                    </th>
                    {orderedPlans.map((plan) => (
                      <th key={plan.code} className="px-4 py-3 text-center min-w-[220px]">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{plan.name || plan.code}</span>
                            {plan.is_featured && (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                                Featured
                              </span>
                            )}
                          </div>
                          <input
                            value={plan.name}
                            onChange={(event) => updateDraft(plan.code, { name: event.target.value })}
                            className={`${adminInputClass} w-full text-center`}
                            aria-label={`${plan.code} name`}
                          />
                          <textarea
                            value={plan.description}
                            onChange={(event) => updateDraft(plan.code, { description: event.target.value })}
                            className={`${adminInputClass} w-full min-h-[64px] text-center resize-y`}
                            aria-label={`${plan.code} description`}
                          />
                          {plan.flags.self_serve ? (
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              ₦ / month
                              <input
                                type="number"
                                min={0}
                                value={plan.monthly_price}
                                onChange={(event) =>
                                  updateDraft(plan.code, {
                                    monthly_price: Math.max(0, Number(event.target.value) || 0),
                                  })
                                }
                                className={`${adminInputClass} w-28 text-center`}
                              />
                            </label>
                          ) : (
                            <p className="text-sm font-semibold text-foreground">Contact Admin</p>
                          )}
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={plan.is_featured}
                              onChange={(event) => updateDraft(plan.code, { is_featured: event.target.checked })}
                            />
                            Featured
                          </label>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {capabilities.map((capability) => (
                    <tr key={capability.key} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{capability.label}</td>
                      {orderedPlans.map((plan) => (
                        <td key={`${plan.code}-${capability.key}`} className="px-4 py-3 text-center">
                          {capability.kind === "limit" ? (
                            <LimitCell
                              value={
                                capability.key === "bookings_per_month"
                                  ? plan.bookings_per_month
                                  : plan.team_members
                              }
                              label={`${plan.name} ${capability.label}`}
                              onChange={(next) =>
                                updateDraft(
                                  plan.code,
                                  capability.key === "bookings_per_month"
                                    ? { bookings_per_month: next }
                                    : { team_members: next }
                                )
                              }
                            />
                          ) : (
                            <TickCell
                              checked={Boolean(plan.flags[capability.key])}
                              label={`${plan.name} ${capability.label}`}
                              onChange={(next) => updateFlag(plan.code, capability.key, next)}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
