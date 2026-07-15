// Tenant email/password and Google login page.

import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api, setAuthTokens } from "../../../lib/api/client";
import { resolvePostAuthPath } from "../../../lib/auth/redirect";
import { GoogleSignInButton, isGoogleSignInEnabled } from "../../components/auth/GoogleSignInButton";
import kairosLogo from "../../../assets/branding/logo.png";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (searchParams.get("redirect")) {
      setSessionNotice("Your session expired. Please sign in again to continue.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setResendMessage("");
    setIsLoading(true);
    try {
      const tokens = await api.login({ email, password });
      setAuthTokens(tokens);
      const redirect = searchParams.get("redirect");
      if (redirect && redirect.startsWith("/")) {
        navigate(redirect);
      } else {
        navigate(await resolvePostAuthPath());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in. Please check your credentials.";
      if (message.toLowerCase().includes("email not verified")) {
        setError("Please confirm your email before signing in.");
        setShowResend(true);
      } else if (message.toLowerCase().includes("google sign-in")) {
        setError("This account uses Google sign-in. Use the Google button above.");
      } else {
        setError("Unable to sign in. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setResendMessage("");
    try {
      await api.resendVerification({ email });
      setResendMessage("A new confirmation link has been sent.");
    } catch {
      setResendMessage("Unable to resend the confirmation email right now.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-white to-accent/15" />
      <div className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-xl shadow-primary/10 p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <img src={kairosLogo} alt="Kairos logo" className="h-12 w-auto mb-4" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground mt-2">Sign in to your account to continue</p>
          </div>

          {sessionNotice && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {sessionNotice}
            </p>
          )}

          {isGoogleSignInEnabled() && (
            <div className="mb-6">
              <GoogleSignInButton label="login" />
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300" disabled={isLoading} />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <a href="#" className="text-primary hover:text-primary/80 font-medium">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              loading={isLoading}
              loadingLabel="Signing in..."
            >
              Sign in
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {showResend && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                <p className="text-foreground mb-2">Didn't get the email?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  loading={isResending}
                  loadingLabel="Sending..."
                  onClick={handleResend}
                >
                  Resend confirmation email
                </Button>
                {resendMessage && <p className="text-muted-foreground mt-2">{resendMessage}</p>}
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:text-primary/80 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
