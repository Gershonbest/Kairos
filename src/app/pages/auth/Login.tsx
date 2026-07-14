// Tenant email/password and Google login page.

import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Calendar, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api, setAuthTokens } from "../../../lib/api/client";
import { resolvePostAuthPath } from "../../../lib/auth/redirect";
import { GoogleSignInButton, isGoogleSignInEnabled } from "../../components/auth/GoogleSignInButton";

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
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#3B3680] mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className="font-semibold text-xl">Kairos Bookings</span>
          </div>

          <h1 className="text-3xl font-semibold mb-2">Welcome back</h1>
          <p className="text-gray-600 mb-8">Sign in to your account to continue</p>

          {sessionNotice && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {sessionNotice}
            </p>
          )}

          {isGoogleSignInEnabled() && (
            <div className="mb-6">
              <GoogleSignInButton label="login" />
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
                <span className="text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-[#3B3680] hover:text-[#2E2A5C]">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#3B3680] hover:bg-[#2E2A5C]"
              loading={isLoading}
              loadingLabel="Signing in..."
            >
              Sign in
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {showResend && (
              <div className="rounded-lg border border-[#3B3680]/20 bg-[#3B3680]/5 p-3 text-sm">
                <p className="text-gray-700 mb-2">Didn't get the email?</p>
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
                {resendMessage && <p className="text-gray-600 mt-2">{resendMessage}</p>}
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{" "}
            <Link to="/signup" className="text-[#3B3680] hover:text-[#2E2A5C] font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Brand */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-[#3B3680] via-[#4A4594] to-[#2ECC71] items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-4xl font-semibold mb-4">Streamline your bookings with AI</h2>
          <p className="text-lg text-white/90 mb-8">
            Manage appointments, accept payments, and let AI optimize your schedule automatically.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mt-1">
                <span className="text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-medium mb-1">Smart Scheduling</h3>
                <p className="text-sm text-white/80">AI-powered appointment optimization</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mt-1">
                <span className="text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-medium mb-1">Seamless Payments</h3>
                <p className="text-sm text-white/80">Accept deposits and payments effortlessly</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mt-1">
                <span className="text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-medium mb-1">Client Management</h3>
                <p className="text-sm text-white/80">Keep track of all your clients in one place</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}