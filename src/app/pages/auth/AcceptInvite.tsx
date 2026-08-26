// Accept a team invite and set a password.

import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { PasswordInput } from "../../components/forms/PasswordInput";
import { api, setAuthTokens } from "../../../lib/api/client";
import { useForceLightTheme } from "../../components/theme/ThemeProvider";
import orheoLogo from "../../../assets/branding/logo.png";

export function AcceptInvite() {
  useForceLightTheme();
  const navigate = useNavigate();
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    full_name: string;
    business_name: string;
    email: string;
    staff_role: string;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This invite link is missing or invalid.");
      return;
    }
    api
      .getInvite(token)
      .then(setPreview)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "This invite is invalid or has expired.");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("This invite link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const tokens = await api.acceptInvite(token, password);
      setAuthTokens(tokens);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept this invite.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Orheo
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <img src={orheoLogo} alt="Orheo" className="mb-6 h-10 w-10 rounded-lg" />
        <h1 className="text-2xl font-semibold tracking-tight">Join the team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {preview
            ? `Hi ${preview.full_name}. Set a password to join ${preview.business_name}.`
            : "Set a password to accept your invite."}
        </p>
        {preview && (
          <p className="mt-1 text-xs text-muted-foreground">
            {preview.email} · {preview.staff_role.replace("_", " ")}
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="invite-password">Password</Label>
            <PasswordInput
              id="invite-password"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="invite-confirm">Confirm password</Label>
            <PasswordInput
              id="invite-confirm"
              className="mt-1"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || !preview}>
            {isLoading ? "Joining…" : "Join team"}
          </Button>
        </form>
      </div>
    </div>
  );
}
