// Tenant registration page with email verification and Google signup.

import { Link, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Calendar, ArrowLeft, Sparkles, Mail } from "lucide-react";
import { useState } from "react";
import { api, setAuthTokens } from "../../../lib/api/client";
import { GoogleSignInButton, isGoogleSignInEnabled } from "../../components/auth/GoogleSignInButton";

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#7c3aed]/10 text-[#7c3aed] flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-gray-600 mb-6">
            We sent a confirmation link to <span className="font-medium text-gray-900">{pendingEmail}</span>.
            Click the link to activate your account, then sign in.
          </p>
          <Button className="w-full bg-[#7c3aed] hover:bg-[#6d28d9]" onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#7c3aed] mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#22c55e] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className="font-semibold text-xl">Kairos Bookings</span>
          </div>

          <h1 className="text-3xl font-semibold mb-2">Create your account</h1>
          <p className="text-gray-600 mb-2">Start managing your bookings with AI</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            7-day free trial • No credit card required
          </div>

          {isGoogleSignInEnabled() && (
            <div className="mb-6">
              <GoogleSignInButton businessName={formData.businessName} label="signup" />
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or continue with email</span>
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
              className="w-full bg-[#7c3aed] hover:bg-[#6d28d9]"
              loading={isLoading}
              loadingLabel="Creating account..."
            >
              Create account
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link to="/login" className="text-[#7c3aed] hover:text-[#6d28d9] font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Brand */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-[#7c3aed] via-[#8b5cf6] to-[#22c55e] items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-4xl font-semibold mb-4">Join thousands of businesses</h2>
          <p className="text-lg text-white/90 mb-8">
            Service providers across Africa trust Kairos to manage their appointments and grow their business.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-semibold mb-1">10k+</p>
              <p className="text-sm text-white/80">Active businesses</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-semibold mb-1">250k+</p>
              <p className="text-sm text-white/80">Bookings processed</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-semibold mb-1">98%</p>
              <p className="text-sm text-white/80">Customer satisfaction</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-semibold mb-1">20+</p>
              <p className="text-sm text-white/80">Countries served</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}