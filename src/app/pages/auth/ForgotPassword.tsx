// Request a password-reset email.

import { Link } from "react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../../lib/api/client";
import orheoLogo from "../../../assets/branding/logo.png";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.forgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch {
      setError("Unable to send a reset email right now. Please try again.");
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
          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Mail className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
              <p className="text-muted-foreground mb-6">
                If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a
                link to reset your password. The link expires in 1 hour.
              </p>
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                <Link to="/login">Return to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-8">
                <img src={orheoLogo} alt="Orheo logo" className="h-12 w-auto mb-4 rounded-xl bg-black p-1.5" />
                <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Forgot password?</h1>
                <p className="text-muted-foreground mt-2">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

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
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  loading={isLoading}
                  loadingLabel="Sending..."
                >
                  Send reset link
                </Button>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
