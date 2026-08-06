// Set a new password from an emailed reset link.

import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { PasswordInput } from "../../components/forms/PasswordInput";
import { api } from "../../../lib/api/client";
import kairosLogo from "../../../assets/branding/logo.png";

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing or invalid. Request a new one.");
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
      await api.resetPassword({ token, new_password: password });
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("google")) {
        setError("This account uses Google sign-in and cannot reset a password.");
      } else if (message.toLowerCase().includes("expired") || message.toLowerCase().includes("invalid")) {
        setError("This reset link is invalid or has expired. Please request a new one.");
      } else {
        setError("Unable to reset your password right now. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-white to-accent/15" />
      <div className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>

        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-xl shadow-primary/10 p-6 sm:p-8">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-semibold mb-2">Password updated</h1>
              <p className="text-muted-foreground mb-6">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => navigate("/login")}
              >
                Sign in
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-8">
                <img src={kairosLogo} alt="Kairos logo" className="h-12 w-auto mb-4" />
                <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Reset password</h1>
                <p className="text-muted-foreground mt-2">Choose a new password for your account.</p>
              </div>

              {!token ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-red-600">
                    This reset link is missing or invalid. Request a new one from the forgot password page.
                  </p>
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/auth/forgot-password">Request new link</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="password">New password</Label>
                    <PasswordInput
                      id="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1"
                      required
                      minLength={8}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <PasswordInput
                      id="confirmPassword"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="mt-1"
                      required
                      minLength={8}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    loading={isLoading}
                    loadingLabel="Saving..."
                  >
                    Update password
                  </Button>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
