// Platform admin subscription plan configuration page.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Calendar, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../../../lib/api/client";
import { Button } from "../../components/ui/button";

type AdminPlan = Awaited<ReturnType<typeof api.adminPlans>>[number];

type PlanForm = {
  code: string;
  name: string;
  monthly_price: string;
  description: string;
  featuresText: string;
  self_serve: boolean;
  is_active: boolean;
  is_featured: boolean;
  sort_order: string;
};

const EMPTY_FORM: PlanForm = {
  code: "",
  name: "",
  monthly_price: "0",
  description: "",
  featuresText: "",
  self_serve: true,
  is_active: true,
  is_featured: false,
  sort_order: "0",
};

function toForm(plan: AdminPlan): PlanForm {
  return {
    code: plan.code,
    name: plan.name,
    monthly_price: String(plan.monthly_price),
    description: plan.description ?? "",
    featuresText: (plan.features ?? []).join("\n"),
    self_serve: plan.self_serve,
    is_active: plan.is_active,
    is_featured: plan.is_featured,
    sort_order: String(plan.sort_order ?? 0),
  };
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PlanSettings() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = async () => {
    try {
      const rows = await api.adminPlans();
      setPlans(rows);
      setError("");
    } catch {
      setError("Unable to load subscription plans.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectPlan = (plan: AdminPlan) => {
    setIsCreating(false);
    setSelectedCode(plan.code);
    setForm(toForm(plan));
    setSuccess("");
    setError("");
  };

  const startCreate = () => {
    setIsCreating(true);
    setSelectedCode(null);
    setForm(EMPTY_FORM);
    setSuccess("");
    setError("");
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    monthly_price: Number(form.monthly_price),
    description: form.description.trim() || undefined,
    features: form.featuresText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    self_serve: form.self_serve,
    is_active: form.is_active,
    is_featured: form.is_featured,
    sort_order: Number(form.sort_order) || 0,
  });

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setIsSaving(true);
    try {
      if (isCreating) {
        const created = await api.createAdminPlan({
          code: form.code.trim().toLowerCase(),
          ...buildPayload(),
        });
        await load();
        setIsCreating(false);
        setSelectedCode(created.code);
        setForm(toForm(created));
        setSuccess("Plan created.");
      } else if (selectedCode) {
        const updated = await api.updateAdminPlan(selectedCode, buildPayload());
        await load();
        setForm(toForm(updated));
        setSuccess("Plan updated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save plan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCode || isCreating) return;
    if (!window.confirm(`Delete the "${selectedCode}" plan?`)) return;
    setError("");
    setSuccess("");
    setIsDeleting(true);
    try {
      await api.deleteAdminPlan(selectedCode);
      await load();
      setSelectedCode(null);
      setForm(EMPTY_FORM);
      setSuccess("Plan deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete plan.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/admin" className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Plan Settings</h1>
                  <p className="text-xs text-gray-500">Configure subscription plans and pricing</p>
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
              <Button onClick={startCreate} className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                New plan
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1600px] mx-auto">
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {success && <p className="text-sm text-green-600 mb-4">{success}</p>}

        {isLoading ? (
          <p className="text-gray-500">Loading plans...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Plans</h2>
                <p className="text-sm text-gray-500">{plans.length} configured</p>
              </div>
              <div className="divide-y divide-gray-100">
                {plans.map((plan) => (
                  <button
                    key={plan.code}
                    onClick={() => selectPlan(plan)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selectedCode === plan.code && !isCreating ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{plan.name}</p>
                        <p className="text-xs text-gray-500">{plan.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatPrice(plan.monthly_price)}</p>
                        <p className="text-xs text-gray-500">{plan.is_active ? "Active" : "Hidden"}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isCreating ? "Create plan" : selectedCode ? `Edit ${selectedCode}` : "Select a plan"}
                </h2>
                <p className="text-sm text-gray-500">
                  Changes apply immediately to the public choose-plan page and tenant billing.
                </p>
              </div>

              {(isCreating || selectedCode) && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isCreating && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Plan code</label>
                        <input
                          value={form.code}
                          onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toLowerCase() }))}
                          placeholder="e.g. premium"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monthly price (NGN)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.monthly_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, monthly_price: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
                      <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Features (one per line)</label>
                    <textarea
                      value={form.featuresText}
                      onChange={(e) => setForm((prev) => ({ ...prev, featuresText: e.target.value }))}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.self_serve}
                        onChange={(e) => setForm((prev) => ({ ...prev, self_serve: e.target.checked }))}
                      />
                      Self-serve checkout
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      Visible to tenants
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.is_featured}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
                      />
                      Mark as popular
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      onClick={() => void handleSave()}
                      loading={isSaving}
                      loadingLabel="Saving..."
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isCreating ? "Create plan" : "Save changes"}
                    </Button>
                    {!isCreating && selectedCode && (
                      <Button
                        variant="ghost"
                        onClick={() => void handleDelete()}
                        loading={isDeleting}
                        loadingLabel="Deleting..."
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
