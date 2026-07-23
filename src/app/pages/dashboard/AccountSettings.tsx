// Tabbed settings hub: account, business, public page, payments, notifications, billing, danger zone.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { LocationFields } from "../../components/forms/LocationFields";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { api, clearAuthTokens, type TenantBranchPayload } from "../../../lib/api/client";
import { COUNTRIES, getDialCodeForCountry } from "../../../lib/data/locations";

const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "UTC",
  "Europe/London",
  "America/New_York",
];

function createBranch(countryCode: string, dialCode: string): TenantBranchPayload {
  return {
    id: crypto.randomUUID(),
    name: "",
    country_code: countryCode,
    state: "",
    address_line: "",
    phone_country_code: dialCode,
    phone_number: "",
    is_primary: false,
  };
}

export function AccountSettings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("account");
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(true);
  const [emailVerified, setEmailVerified] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  // Business
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [helpEmail, setHelpEmail] = useState("");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [logoUrl, setLogoUrl] = useState("");
  const [countryCode, setCountryCode] = useState("NG");
  const [dialCode, setDialCode] = useState("+234");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [state, setState] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [branches, setBranches] = useState<TenantBranchPayload[]>([]);

  // Public
  const [publicTagline, setPublicTagline] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [publicLogoUrl, setPublicLogoUrl] = useState("");
  const [publicSlug, setPublicSlug] = useState("");

  // Payments
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [settlementBank, setSettlementBank] = useState("");
  const [settlementLast4, setSettlementLast4] = useState("");
  const [platformFee, setPlatformFee] = useState(5);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [reconnectBank, setReconnectBank] = useState("");
  const [reconnectAccount, setReconnectAccount] = useState("");
  const [reconnectBusinessName, setReconnectBusinessName] = useState("");

  // Notifications
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [bookingCreatedEmail, setBookingCreatedEmail] = useState(true);
  const [paymentReceivedEmail, setPaymentReceivedEmail] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  // Billing
  const [planCode, setPlanCode] = useState("standard");
  const [isTrial, setIsTrial] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState("active");

  // Danger
  const [deactivateConfirm, setDeactivateConfirm] = useState("");

  const flash = (msg: string) => {
    setSuccess(msg);
    setError("");
  };

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setSuccess("");
  };

  useEffect(() => {
    Promise.all([
      api.me(),
      api.myTenant().catch(() => null),
      api.getPaymentProvider().catch(() => null),
      api.getNotificationPreferences().catch(() => null),
      api.getSubscriptionStatus().catch(() => null),
      api.listPaystackBanks().catch(() => [] as Array<{ name: string; code: string }>),
    ])
      .then(([profile, tenant, payment, prefs, sub, bankRows]) => {
        setFullName(profile.full_name);
        setEmail(profile.email);
        setNewEmail(profile.email);
        setHasPassword(Boolean(profile.has_password));
        setEmailVerified(Boolean(profile.email_verified ?? true));
        setOnboardingCompleted(tenant?.onboarding_completed ?? profile.onboarding_completed ?? true);

        if (tenant) {
          setBusinessName(tenant.name || "");
          setBusinessType(tenant.business_type || "");
          setHelpEmail(tenant.help_email || "");
          setTimezone(tenant.timezone || "Africa/Lagos");
          setLogoUrl(tenant.public_logo_url || "");
          setCountryCode(tenant.country_code || "NG");
          setDialCode(tenant.phone_country_code || getDialCodeForCountry(tenant.country_code || "NG"));
          setPhoneNumber(tenant.phone_number || "");
          setState(tenant.state || "");
          setAddressLine(tenant.address_line || "");
          setBranches(tenant.branches || []);
          setPublicTagline(tenant.public_tagline || "");
          setPublicDescription(tenant.public_description || "");
          setPublicLogoUrl(tenant.public_logo_url || "");
          setPublicSlug(tenant.public_slug || "");
          setReconnectBusinessName(tenant.name || "");
          setPlanCode(tenant.plan_code || "standard");
        }

        if (payment) {
          setPaymentsEnabled(Boolean(payment.payments_enabled));
          setSettlementBank(payment.settlement_bank_code || "");
          setSettlementLast4(payment.settlement_account_last4 || "");
          setPlatformFee(Number(payment.platform_fee_percent ?? 5));
          setReconnectBank(payment.settlement_bank_code || "");
        }

        if (prefs) {
          setEmailEnabled(Boolean(prefs.email_enabled ?? prefs.email ?? true));
          setBookingCreatedEmail(Boolean(prefs.booking_created_email ?? true));
          setPaymentReceivedEmail(Boolean(prefs.payment_received_email ?? true));
          setSmsEnabled(Boolean(prefs.sms_enabled ?? prefs.sms ?? false));
        }

        if (sub) {
          setPlanCode(sub.plan_code);
          setIsTrial(sub.is_trial);
          setDaysRemaining(sub.days_remaining);
          setTrialEndsAt(sub.trial_ends_at);
          setPaidUntil(sub.subscription_paid_until);
          setBillingStatus(sub.status);
        }

        setBanks((bankRows || []).map((b) => ({ name: b.name, code: b.code })));
      })
      .catch(() => setError("Unable to load settings."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error("New passwords do not match.");
      }
      const emailChanging = hasPassword && newEmail.trim().toLowerCase() !== email.toLowerCase();
      if ((newPassword || emailChanging) && !currentPassword) {
        throw new Error("Current password is required to change email or password.");
      }
      const updated = await api.updateProfile({
        full_name: fullName.trim(),
        ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
        ...(emailChanging
          ? { new_email: newEmail.trim(), current_password: currentPassword }
          : {}),
      });
      setEmail(updated.email);
      setNewEmail(updated.email);
      setEmailVerified(updated.email_verified);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash(
        emailChanging && !updated.email_verified
          ? "Account updated. Check your inbox to verify the new email."
          : "Account settings saved."
      );
    } catch (err) {
      fail(err, "Unable to save account settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const country = COUNTRIES.find((c) => c.code === countryCode);
      if ((country?.states.length ?? 0) > 0 && !state.trim()) {
        throw new Error("Select a state or region for your primary location.");
      }
      await api.updateTenant({
        business_name: businessName.trim(),
        business_type: businessType || undefined,
        help_email: helpEmail.trim() || null,
        timezone,
        logo_url: logoUrl || undefined,
        country_code: countryCode,
        state: state.trim() || undefined,
        address_line: addressLine.trim(),
        phone_country_code: dialCode,
        phone_number: phoneNumber.trim(),
        branches,
      });
      flash("Business profile saved.");
    } catch (err) {
      fail(err, "Unable to save business profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePublic = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.updatePublicProfile({
        public_tagline: publicTagline.trim() || undefined,
        public_description: publicDescription.trim() || undefined,
        public_logo_url: publicLogoUrl || undefined,
        public_slug: publicSlug.trim() || undefined,
      });
      flash("Public booking page saved.");
    } catch (err) {
      fail(err, "Unable to save public profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleReconnectPaystack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!reconnectBank || !reconnectAccount.trim()) {
        throw new Error("Bank and account number are required.");
      }
      const result = await api.connectPaymentProvider({
        provider: "paystack",
        business_name: reconnectBusinessName.trim() || businessName,
        settlement_bank: reconnectBank,
        account_number: reconnectAccount.trim(),
      });
      setPaymentsEnabled(Boolean(result.payments_enabled));
      setSettlementBank(reconnectBank);
      setSettlementLast4(reconnectAccount.trim().slice(-4));
      setPlatformFee(Number(result.platform_fee_percent ?? platformFee));
      setReconnectAccount("");
      flash("Paystack settlement account connected.");
    } catch (err) {
      fail(err, "Unable to connect Paystack.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const prefs = await api.updateNotificationPreferences({
        email_enabled: emailEnabled,
        booking_created_email: bookingCreatedEmail,
        payment_received_email: paymentReceivedEmail,
        sms_enabled: smsEnabled,
      });
      setEmailEnabled(prefs.email_enabled);
      setBookingCreatedEmail(prefs.booking_created_email);
      setPaymentReceivedEmail(prefs.payment_received_email);
      setSmsEnabled(prefs.sms_enabled);
      flash("Notification preferences saved.");
    } catch (err) {
      fail(err, "Unable to save notification preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (deactivateConfirm !== "DEACTIVATE") {
      setError('Type DEACTIVATE to confirm.');
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.deactivateTenant();
      flash("Account deactivated. Signing out…");
      clearAuthTokens();
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      fail(err, "Unable to deactivate account.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading settings…</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, business, payments, and preferences.</p>
      </div>

      {!onboardingCompleted && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm">
            Business setup is incomplete.{" "}
            <Link to="/onboarding" className="text-primary font-medium hover:underline">
              Continue onboarding
            </Link>
          </p>
        </div>
      )}

      {(error || success) && (
        <div className="space-y-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-accent">{success}</p>}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(""); setSuccess(""); }}>
        <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="public">Public page</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4">
          <form onSubmit={handleSaveAccount} className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" required disabled={saving} />
            </div>
            <div>
              <Label htmlFor="email">Login email</Label>
              <Input
                id="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1"
                disabled={saving || !hasPassword}
                required
              />
              {!hasPassword ? (
                <p className="text-xs text-muted-foreground mt-1">Google accounts cannot change email here.</p>
              ) : !emailVerified ? (
                <p className="text-xs text-amber-600 mt-1">Email is unverified. Check your inbox for a verification link.</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Changing email requires your current password.</p>
              )}
            </div>
            {hasPassword && (
              <div className="border-t border-border pt-5 space-y-4">
                <h2 className="text-lg font-medium">Change password</h2>
                <div>
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" disabled={saving} />
                </div>
                <div>
                  <Label htmlFor="newPassword">New password</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" minLength={8} disabled={saving} />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" minLength={8} disabled={saving} />
                </div>
              </div>
            )}
            <Button type="submit" className="bg-primary hover:bg-primary/90" loading={saving} loadingLabel="Saving...">
              Save account
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="business" className="mt-4">
          <form onSubmit={handleSaveBusiness} className="bg-card border border-border rounded-xl p-6 space-y-5">
            <ImageUpload label="Company logo" value={logoUrl} onChange={setLogoUrl} uploadKind="logo" disabled={saving} />
            <div>
              <Label htmlFor="businessName">Business name</Label>
              <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="mt-1" required disabled={saving} />
            </div>
            <div>
              <Label htmlFor="businessType">Business type</Label>
              <select
                id="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background"
                disabled={saving}
              >
                <option value="">Select a type</option>
                <option value="consultant">Consultant</option>
                <option value="clinic">Medical Clinic</option>
                <option value="coach">Coach/Trainer</option>
                <option value="salon">Salon/Spa</option>
                <option value="legal">Legal Services</option>
                <option value="other">Other Professional Services</option>
              </select>
            </div>
            <div>
              <Label htmlFor="helpEmail">Help / support email</Label>
              <Input id="helpEmail" type="email" value={helpEmail} onChange={(e) => setHelpEmail(e.target.value)} className="mt-1" disabled={saving} placeholder="support@yourbusiness.com" />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background"
                disabled={saving}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <PhoneInput
              countryCode={countryCode}
              dialCode={dialCode}
              phoneNumber={phoneNumber}
              onCountryCodeChange={(code, dial) => {
                setCountryCode(code);
                setDialCode(dial);
              }}
              onPhoneNumberChange={setPhoneNumber}
              disabled={saving}
            />
            <div className="rounded-lg border border-border p-4 space-y-4">
              <h3 className="font-medium">Primary location</h3>
              <LocationFields
                value={{ country_code: countryCode, state, address_line: addressLine }}
                onChange={(loc) => {
                  setCountryCode(loc.country_code);
                  setState(loc.state);
                  setAddressLine(loc.address_line);
                }}
                onCountryChange={(code, dial) => {
                  setCountryCode(code);
                  setDialCode(dial);
                }}
                disabled={saving}
                idPrefix="settings-primary"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Branches</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setBranches((prev) => [...prev, createBranch(countryCode, dialCode)])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add branch
                </Button>
              </div>
              {branches.map((branch, index) => (
                <div key={branch.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex justify-between">
                    <h4 className="font-medium">Branch {index + 1}</h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBranches((prev) => prev.filter((b) => b.id !== branch.id))}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    value={branch.name}
                    onChange={(e) =>
                      setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, name: e.target.value } : b)))
                    }
                    placeholder="Branch name"
                    disabled={saving}
                  />
                  <LocationFields
                    value={{
                      country_code: branch.country_code,
                      state: branch.state || "",
                      address_line: branch.address_line,
                    }}
                    onChange={(loc) =>
                      setBranches((prev) =>
                        prev.map((b) =>
                          b.id === branch.id
                            ? { ...b, country_code: loc.country_code, state: loc.state, address_line: loc.address_line }
                            : b
                        )
                      )
                    }
                    disabled={saving}
                    idPrefix={`settings-branch-${branch.id}`}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Edit weekly hours in{" "}
              <Link to="/dashboard/availability" className="text-primary hover:underline">Availability</Link>.
            </p>
            <Button type="submit" className="bg-primary hover:bg-primary/90" loading={saving} loadingLabel="Saving...">
              Save business
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="public" className="mt-4">
          <form onSubmit={handleSavePublic} className="bg-card border border-border rounded-xl p-6 space-y-5">
            <ImageUpload label="Public logo" value={publicLogoUrl} onChange={setPublicLogoUrl} uploadKind="logo" disabled={saving} />
            <div>
              <Label htmlFor="publicSlug">Public booking URL slug</Label>
              <Input id="publicSlug" value={publicSlug} onChange={(e) => setPublicSlug(e.target.value.toLowerCase())} className="mt-1" disabled={saving} placeholder="my-business" />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and hyphens only.</p>
            </div>
            <div>
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" value={publicTagline} onChange={(e) => setPublicTagline(e.target.value)} className="mt-1" disabled={saving} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={publicDescription}
                onChange={(e) => setPublicDescription(e.target.value)}
                className="mt-1 w-full min-h-[100px] px-3 py-2 border border-input rounded-lg bg-background"
                disabled={saving}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Manage booking links and QR codes on{" "}
              <Link to="/dashboard/booking-links" className="text-primary hover:underline">Booking Links</Link>.
            </p>
            <Button type="submit" className="bg-primary hover:bg-primary/90" loading={saving} loadingLabel="Saving...">
              Save public page
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="rounded-lg border border-border p-4 bg-muted/30">
              <p className="text-sm">
                Status:{" "}
                <span className="font-medium">{paymentsEnabled ? "Paystack connected" : "Not connected"}</span>
              </p>
              {paymentsEnabled && (
                <p className="text-sm text-muted-foreground mt-1">
                  Settlement bank {settlementBank || "—"} · ····{settlementLast4 || "----"} · Platform fee {platformFee}%
                </p>
              )}
              <Link to="/dashboard/payments" className="text-sm text-primary hover:underline mt-2 inline-block">
                Open payments dashboard
              </Link>
            </div>
            <form onSubmit={handleReconnectPaystack} className="space-y-4">
              <h2 className="text-lg font-medium">{paymentsEnabled ? "Update settlement account" : "Connect Paystack"}</h2>
              <div>
                <Label>Settlement business name</Label>
                <Input value={reconnectBusinessName} onChange={(e) => setReconnectBusinessName(e.target.value)} className="mt-1" disabled={saving} />
              </div>
              <div>
                <Label>Bank</Label>
                <select
                  value={reconnectBank}
                  onChange={(e) => setReconnectBank(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background"
                  disabled={saving || banks.length === 0}
                  required
                >
                  <option value="">Select bank</option>
                  {banks.map((bank) => (
                    <option key={bank.code} value={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Account number</Label>
                <Input value={reconnectAccount} onChange={(e) => setReconnectAccount(e.target.value)} className="mt-1" disabled={saving} required />
              </div>
              <Button type="submit" className="bg-primary hover:bg-primary/90" loading={saving} loadingLabel="Connecting...">
                {paymentsEnabled ? "Update Paystack account" : "Connect Paystack"}
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <form onSubmit={handleSaveNotifications} className="bg-card border border-border rounded-xl p-6 space-y-4">
            {[
              { id: "emailEnabled", label: "Email notifications", checked: emailEnabled, set: setEmailEnabled },
              { id: "bookingCreated", label: "Email when a booking is created", checked: bookingCreatedEmail, set: setBookingCreatedEmail },
              { id: "paymentReceived", label: "Email when a payment is received", checked: paymentReceivedEmail, set: setPaymentReceivedEmail },
            ].map((item) => (
              <label key={item.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary"
                  disabled={saving}
                />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}
            <label className="flex items-center gap-3 opacity-60 cursor-not-allowed">
              <input type="checkbox" checked={smsEnabled} disabled className="w-4 h-4 rounded border-border" />
              <span className="text-sm">SMS notifications (coming soon)</span>
            </label>
            <Button type="submit" className="bg-primary hover:bg-primary/90" loading={saving} loadingLabel="Saving...">
              Save notifications
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-2xl font-semibold capitalize">{planCode}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{billingStatus}{isTrial ? " (trial)" : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Days remaining</p>
                <p className="font-medium">{daysRemaining}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Trial ends</p>
                <p className="font-medium">{trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Paid until</p>
                <p className="font-medium">{paidUntil ? new Date(paidUntil).toLocaleDateString() : "—"}</p>
              </div>
            </div>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link to="/dashboard/choose-plan">Manage plan</Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="danger" className="mt-4">
          <div className="bg-card border border-destructive/30 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-medium text-destructive">Deactivate business</h2>
            <p className="text-sm text-muted-foreground">
              This soft-deactivates your business and signs out all users. Public booking and dashboard access stop.
              Type <strong>DEACTIVATE</strong> to confirm.
            </p>
            <Input
              value={deactivateConfirm}
              onChange={(e) => setDeactivateConfirm(e.target.value)}
              placeholder="DEACTIVATE"
              disabled={saving}
            />
            <Button
              type="button"
              variant="destructive"
              loading={saving}
              loadingLabel="Deactivating..."
              onClick={() => void handleDeactivate()}
            >
              Deactivate account
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
