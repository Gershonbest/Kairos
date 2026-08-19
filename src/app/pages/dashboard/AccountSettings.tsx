// Tabbed settings hub: account, business, public page, payments, notifications, billing, danger zone.

import { useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { LocationFields } from "../../components/forms/LocationFields";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { SettlementAccountFields, type VerifiedSettlementAccount } from "../../components/payments/SettlementAccountFields";
import { api, clearAuthTokens, type TenantBranchPayload } from "../../../lib/api/client";
import { COUNTRIES, getDialCodeForCountry, normalizeStateForCountry } from "../../../lib/data/locations";
import { queryKeys } from "../../../lib/queryClient";

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
  const queryClient = useQueryClient();
  const hydratedForUserRef = useRef<string | null>(null);
  const [tab, setTab] = useState("account");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(true);
  const [emailVerified, setEmailVerified] = useState(true);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

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
  const [settlementBankName, setSettlementBankName] = useState("");
  const [settlementAccountName, setSettlementAccountName] = useState("");
  const [settlementAccountNumber, setSettlementAccountNumber] = useState("");
  const [settlementLast4, setSettlementLast4] = useState("");
  const [platformFee, setPlatformFee] = useState(5);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [reconnectBank, setReconnectBank] = useState("");
  const [reconnectAccount, setReconnectAccount] = useState("");
  const [reconnectVerified, setReconnectVerified] = useState<VerifiedSettlementAccount | null>(null);
  const [reconnectVerifyError, setReconnectVerifyError] = useState("");
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

  const {
    data: settings,
    isPending,
    isError: settingsFailed,
  } = useQuery({
    queryKey: queryKeys.settingsBundle,
    queryFn: async () => {
      const [profile, tenant, payment, prefs, sub, bankRows] = await Promise.all([
        api.me(),
        api.myTenant().catch(() => null),
        api.getPaymentProvider().catch(() => null),
        api.getNotificationPreferences().catch(() => null),
        api.getSubscriptionStatus().catch(() => null),
        api.listPaystackBanks().catch(() => [] as Array<{ name: string; code: string }>),
      ]);
      return { profile, tenant, payment, prefs, sub, bankRows };
    },
  });

  const isLoading = isPending && !settings;

  useLayoutEffect(() => {
    // Re-hydrate whenever the signed-in account changes so one user never
    // sees form values left behind by another.
    if (!settings || hydratedForUserRef.current === settings.profile.id) return;
    hydratedForUserRef.current = settings.profile.id;

    const { profile, tenant, payment, prefs, sub, bankRows } = settings;
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
      setState(normalizeStateForCountry(tenant.country_code || "NG", tenant.state || ""));
      setAddressLine(tenant.address_line || "");
      setBranches(
        (tenant.branches || []).map((branch) => ({
          ...branch,
          state: normalizeStateForCountry(branch.country_code, branch.state || ""),
        }))
      );
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
      setSettlementBankName(payment.settlement_bank_name || "");
      setSettlementAccountName(payment.settlement_account_name || "");
      setSettlementAccountNumber(payment.settlement_account_number || "");
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
  }, [settings]);

  // Keep billing fields in sync when subscription status changes after mount
  // (e.g. admin suspension while settings are open / cached).
  useLayoutEffect(() => {
    const sub = settings?.sub;
    if (!sub) return;
    setPlanCode(sub.plan_code);
    setIsTrial(sub.is_trial);
    setDaysRemaining(sub.days_remaining);
    setTrialEndsAt(sub.trial_ends_at);
    setPaidUntil(sub.subscription_paid_until);
    setBillingStatus(sub.status);
  }, [settings?.sub]);

  useLayoutEffect(() => {
    if (settingsFailed) setError("Unable to load settings.");
  }, [settingsFailed]);

  const invalidateRelatedCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant }),
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentProvider }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationPrefs }),
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionStatus }),
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingLinks }),
    ]);
  };

  const refreshProfileCaches = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError("");
    try {
      const updated = await api.updateProfile({ full_name: fullName.trim() });
      setFullName(updated.full_name);
      flash("Profile saved.");
      refreshProfileCaches();
    } catch (err) {
      fail(err, "Unable to save your profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setError("");
    try {
      const nextEmail = newEmail.trim();
      if (nextEmail.toLowerCase() === email.toLowerCase()) {
        throw new Error("Enter an email address different from your current one.");
      }
      if (!emailPassword) {
        throw new Error("Enter your current password to change your email.");
      }
      const updated = await api.updateProfile({
        new_email: nextEmail,
        current_password: emailPassword,
      });
      setEmail(updated.email);
      setNewEmail(updated.email);
      setEmailVerified(updated.email_verified);
      setEmailPassword("");
      flash(
        updated.email_verified
          ? "Login email updated."
          : `Login email updated. We sent a verification link to ${updated.email}.`
      );
      refreshProfileCaches();
    } catch (err) {
      fail(err, "Unable to change your email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setError("");
    try {
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match.");
      }
      if (newPassword === currentPassword) {
        throw new Error("New password must be different from your current password.");
      }
      await api.updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("Password updated.");
    } catch (err) {
      fail(err, "Unable to update your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setError("");
    try {
      await api.resendVerification({ email });
      flash(`Verification link sent to ${email}.`);
    } catch (err) {
      fail(err, "Unable to resend the verification email.");
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const primaryState = normalizeStateForCountry(countryCode, state);
      if ((country?.states.length ?? 0) > 0 && !primaryState) {
        throw new Error("Select a state or region for your primary location.");
      }
      await api.updateTenant({
        business_name: businessName.trim(),
        business_type: businessType || undefined,
        help_email: helpEmail.trim() || null,
        timezone,
        logo_url: logoUrl || undefined,
        country_code: countryCode,
        state: primaryState || undefined,
        address_line: addressLine.trim(),
        phone_country_code: dialCode,
        phone_number: phoneNumber.trim(),
        branches: branches.map((branch) => ({
          ...branch,
          state: normalizeStateForCountry(branch.country_code, branch.state),
        })),
      });
      flash("Business profile saved.");
      setOnboardingCompleted(true);
      await invalidateRelatedCaches();
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
      await invalidateRelatedCaches();
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
      if (
        !reconnectVerified ||
        reconnectVerified.bank_code !== reconnectBank ||
        reconnectVerified.account_number !== reconnectAccount.trim()
      ) {
        throw new Error("Verify the account number before saving.");
      }
      const result = await api.connectPaymentProvider({
        provider: "paystack",
        business_name: reconnectBusinessName.trim() || businessName,
        settlement_bank: reconnectBank,
        account_number: reconnectAccount.trim(),
      });
      setPaymentsEnabled(Boolean(result.payments_enabled));
      setSettlementBank(result.settlement_bank_code || reconnectBank);
      setSettlementBankName(result.settlement_bank_name || banks.find((b) => b.code === reconnectBank)?.name || "");
      setSettlementAccountName(result.settlement_account_name || reconnectVerified.account_name);
      setSettlementAccountNumber(result.settlement_account_number || reconnectAccount.trim());
      setSettlementLast4(
        result.settlement_account_last4 || reconnectAccount.trim().slice(-4)
      );
      setPlatformFee(Number(result.platform_fee_percent ?? platformFee));
      setReconnectAccount("");
      setReconnectVerified(null);
      setReconnectVerifyError("");
      flash("Paystack settlement account connected.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentProvider });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle });
    } catch (err) {
      fail(err, "Unable to connect Paystack.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectPaystack = async () => {
    if (
      !window.confirm(
        "Remove this settlement account from Paystack and Orheo? New booking payments will stop until you connect another account."
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.disconnectPaymentProvider();
      setPaymentsEnabled(false);
      setSettlementBank("");
      setSettlementBankName("");
      setSettlementAccountName("");
      setSettlementAccountNumber("");
      setSettlementLast4("");
      setReconnectAccount("");
      setReconnectVerified(null);
      setReconnectVerifyError("");
      flash("Settlement account removed from Paystack and Orheo.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentProvider });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle });
    } catch (err) {
      fail(err, "Unable to remove the settlement account.");
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPrefs });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle });
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
    return <BrandLoader label="Opening settings" fullscreen />;
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
            Finish setup from here: business details in this page, then{" "}
            <Link to="/dashboard/services" className="text-primary font-medium hover:underline">
              Services
            </Link>
            {", "}
            <Link to="/dashboard/availability" className="text-primary font-medium hover:underline">
              Availability
            </Link>
            {", and "}
            <Link to="/dashboard/payments" className="text-primary font-medium hover:underline">
              Payments
            </Link>
            .
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

        <TabsContent value="account" className="mt-4 space-y-4">
          <form onSubmit={handleSaveProfile} className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium">Profile</h2>
              <p className="text-sm text-muted-foreground">The name shown to your team and on emails you send.</p>
            </div>
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
                required
                disabled={savingProfile}
              />
            </div>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90"
              loading={savingProfile}
              loadingLabel="Saving..."
            >
              Save profile
            </Button>
          </form>

          <form onSubmit={handleChangeEmail} className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium">Login email</h2>
              <p className="text-sm text-muted-foreground">
                You sign in with this address. Changing it requires your password and a new verification link.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Current email</p>
                <p className="font-medium">{email}</p>
              </div>
              {emailVerified ? (
                <span className="text-xs font-medium rounded-full bg-accent/15 text-accent px-2 py-1">Verified</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-1">
                    Unverified
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={resendingVerification}
                    loadingLabel="Sending..."
                    onClick={() => void handleResendVerification()}
                  >
                    Resend link
                  </Button>
                </div>
              )}
            </div>

            {hasPassword ? (
              <>
                <div>
                  <Label htmlFor="newEmail">New email</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="mt-1"
                    required
                    disabled={savingEmail}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="emailPassword">Current password</Label>
                  <Input
                    id="emailPassword"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="mt-1"
                    required
                    disabled={savingEmail}
                    autoComplete="current-password"
                    placeholder="Confirm it's you"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90"
                  loading={savingEmail}
                  loadingLabel="Updating..."
                  disabled={!newEmail.trim() || newEmail.trim().toLowerCase() === email.toLowerCase()}
                >
                  Update email
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This account signs in with Google, so the email is managed there and cannot be changed here.
              </p>
            )}
          </form>

          <form onSubmit={handleChangePassword} className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium">Password</h2>
              <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
            </div>
            {hasPassword ? (
              <>
                <div>
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                    required
                    disabled={savingPassword}
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                    minLength={8}
                    required
                    disabled={savingPassword}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1"
                    minLength={8}
                    required
                    disabled={savingPassword}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90"
                  loading={savingPassword}
                  loadingLabel="Updating..."
                >
                  Update password
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This account signs in with Google, so there is no password to change.
              </p>
            )}
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
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Bank</dt>
                    <dd className="font-medium text-right">
                      {settlementBankName || banks.find((b) => b.code === settlementBank)?.name || settlementBank || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Account name</dt>
                    <dd className="font-medium text-right">{settlementAccountName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Account number</dt>
                    <dd className="font-medium text-right tracking-wide">
                      {settlementAccountNumber || (settlementLast4 ? `····${settlementLast4}` : "—")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Platform fee</dt>
                    <dd className="font-medium text-right">{platformFee}%</dd>
                  </div>
                </dl>
              )}
              <Link to="/dashboard/payments" className="text-sm text-primary hover:underline mt-2 inline-block">
                Open payments dashboard
              </Link>
              {paymentsEnabled && (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    loading={saving}
                    loadingLabel="Removing..."
                    onClick={() => void handleDisconnectPaystack()}
                  >
                    Remove settlement account
                  </Button>
                </div>
              )}
            </div>
            <form onSubmit={handleReconnectPaystack} className="space-y-4">
              <h2 className="text-lg font-medium">{paymentsEnabled ? "Update settlement account" : "Connect Paystack"}</h2>
              <div>
                <Label>Settlement business name</Label>
                <Input value={reconnectBusinessName} onChange={(e) => setReconnectBusinessName(e.target.value)} className="mt-1" disabled={saving} />
              </div>
              <SettlementAccountFields
                banks={banks}
                disabled={saving}
                bank={reconnectBank}
                accountNumber={reconnectAccount}
                onBankChange={setReconnectBank}
                onAccountNumberChange={setReconnectAccount}
                verified={reconnectVerified}
                onVerifiedChange={setReconnectVerified}
                verifyError={reconnectVerifyError}
                onVerifyErrorChange={setReconnectVerifyError}
              />
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90"
                loading={saving}
                loadingLabel="Connecting..."
                disabled={!reconnectVerified || saving}
              >
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
                <p
                  className={`font-medium capitalize ${
                    billingStatus === "suspended" || billingStatus === "inactive"
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {billingStatus}
                  {isTrial ? " (trial)" : ""}
                </p>
                {(billingStatus === "suspended" || billingStatus === "inactive") && (
                  <p className="text-xs text-destructive mt-1">
                    This account is locked. Contact support to restore access.
                  </p>
                )}
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
