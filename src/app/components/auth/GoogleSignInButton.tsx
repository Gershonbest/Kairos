// Google OAuth sign-in button wired to backend auth API.

import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, setAuthTokens } from "../../../lib/api/client";
import { resolvePostAuthPath } from "../../../lib/auth/redirect";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleSignInButtonProps {
  businessName?: string;
  label?: "signup" | "login";
}

export function GoogleSignInButton({ businessName, label = "login" }: GoogleSignInButtonProps) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!googleClientId) {
    return null;
  }

  const handleSuccess = async (credential?: string) => {
    if (!credential) {
      setError("Google sign-in did not return a credential.");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const result = await api.googleAuth({
        id_token: credential,
        business_name: businessName?.trim() || undefined,
      });
      setAuthTokens({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      navigate(result.is_new_user ? "/onboarding" : await resolvePostAuthPath());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in with Google.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className={`w-full flex justify-center ${isLoading ? "pointer-events-none opacity-60" : ""}`}>
        <GoogleLogin
          onSuccess={(response) => {
            void handleSuccess(response.credential);
          }}
          onError={() => {
            setError("Google sign-in was cancelled or failed.");
          }}
          text={label === "signup" ? "signup_with" : "signin_with"}
          shape="rectangular"
          theme="outline"
          size="large"
          width={384}
        />
      </div>
      {isLoading && <p className="text-sm text-gray-500 text-center">Signing in with Google...</p>}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  );
}

export function isGoogleSignInEnabled(): boolean {
  return Boolean(googleClientId);
}
