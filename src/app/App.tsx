// Root app component with router and Google OAuth provider.

import { GoogleOAuthProvider } from "@react-oauth/google";
import { RouterProvider } from "react-router";
import { router } from "./routes";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function App() {
  const app = <RouterProvider router={router} />;

  if (!googleClientId) {
    return app;
  }

  return <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>;
}
