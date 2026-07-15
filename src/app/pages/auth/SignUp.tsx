// Tenant registration page with email verification and Google signup.

import { Link, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ArrowLeft, Sparkles, Mail } from "lucide-react";
import { useState } from "react";
import { api, setAuthTokens } from "../../../lib/api/client";
import { GoogleSignInButton, isGoogleSignInEnabled } from "../../components/auth/GoogleSignInButton";
import kairosLogo from "../../../assets/branding/logo.png";

export function SignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    businessName: "",
  });

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const result = await api.signup({
        first_name: formData.firstName,
        last_name: formData.lastName,
        business_name: formData.businessName,
        email: formData.email,
        password: formData.password,
      });
      if (result.needs_email_verification) {
        setPendingEmail(result.email ?? formData.email);
        return;
      }
      if (result.access_token && result.refresh_token) {
        setAuthTokens({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        navigate("/onboarding");
      }
    } catch {
      setError("Unable to create account right now.");
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-white to-accent/15" />
        <div className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-xl shadow-primary/10 p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-6">
            We sent a confirmation link to <span className="font-medium text-foreground">{pendingEmail}</span>.
            Click the link to activate your account, then sign in.
          </p>
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

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
          <div className="flex flex-col items-center text-center mb-6">
            <img src={kairosLogo} alt="Kairos logo" className="h-12 w-auto mb-4" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Create your account</h1>
            <p className="text-muted-foreground mt-2">Start managing your bookings with AI</p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/20 text-accent-foreground rounded-full text-xs font-medium mt-4">
              <Sparkles className="w-3.5 h-3.5" />
              7-day free trial • No credit card required
            </div>
          </div>

          {isGoogleSignInEnabled() && (
            <div className="mb-6">
              <GoogleSignInButton businessName={formData.businessName} label="signup" />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="mt-1"
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="mt-1"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                type="text"
                placeholder="Acme Consultancy"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              loading={isLoading}
              loadingLabel="Creating account..."
            >
              Create account
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:text-primary/80 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
