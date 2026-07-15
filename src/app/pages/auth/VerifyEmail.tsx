// Email verification confirmation page for new tenant accounts.

import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Calendar, ArrowLeft, MailCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, setAuthTokens } from "../../../lib/api/client";

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [redirectPath, setRedirectPath] = useState("/onboarding");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("This verification link is invalid.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await api.verifyEmail({ token });
        setAuthTokens({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        const nextPath = result.onboarding_completed ? "/dashboard" : "/onboarding";
        if (!cancelled) {
          setRedirectPath(nextPath);
          setStatus("success");
          window.setTimeout(() => {
            if (!cancelled) navigate(nextPath, { replace: true });
          }, 1200);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("This verification link is invalid or has expired.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#3B3680] mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <span className="font-semibold text-xl">Kairos Bookings</span>
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-[#3B3680] mx-auto mb-4" />
            <h1 className="text-2xl font-semibold mb-2">Verifying your email</h1>
            <p className="text-gray-600">Please wait while we confirm your account.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Email confirmed</h1>
            <p className="text-gray-600 mb-6">
              {redirectPath === "/onboarding"
                ? "Taking you to finish setting up your business..."
                : "Taking you to your dashboard..."}
            </p>
            <Button
              className="w-full bg-[#3B3680] hover:bg-[#2E2A5C]"
              onClick={() => navigate(redirectPath, { replace: true })}
            >
              Continue now
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-semibold mb-2">Verification failed</h1>
            <p className="text-gray-600 mb-2">{error}</p>
            <p className="text-sm text-gray-500 mb-6">Request a new link from the sign-in page after you try to log in.</p>
            <Button className="w-full bg-[#3B3680] hover:bg-[#2E2A5C]" onClick={() => navigate("/login")}>
              Go to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
