// Tenant account profile and password settings page.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../../lib/api/client";

export function AccountSettings() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.myTenant().catch(() => null)])
      .then(([profile, tenant]) => {
        setFullName(profile.full_name);
        setEmail(profile.email);
        setOnboardingCompleted(tenant?.onboarding_completed ?? profile.onboarding_completed ?? true);
      })
      .catch(() => setError("Unable to load account settings."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await api.updateProfile({
        full_name: fullName.trim(),
        ...(newPassword
          ? { current_password: currentPassword, new_password: newPassword }
          : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Account settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save account settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading account settings...</div>;
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-3xl font-semibold">Account settings</h1>
      <p className="text-muted-foreground mt-1">Update your profile and password.</p>

      {!onboardingCompleted && (
        <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-foreground/90">
            Your business setup is not finished yet.{" "}
            <Link to="/onboarding" className="text-primary font-medium hover:underline">
              Continue onboarding
            </Link>
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 space-y-6 bg-card border border-border rounded-xl p-6">
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1"
            required
            disabled={isSaving}
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} className="mt-1 bg-muted/40" disabled />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here yet.</p>
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium">Change password</h2>
            <p className="text-sm text-muted-foreground">Leave blank to keep your current password.</p>
          </div>
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
              disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-accent">{success}</p>}

        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90"
          loading={isSaving}
          loadingLabel="Saving..."
        >
          Save changes
        </Button>
      </form>
    </div>
  );
}
