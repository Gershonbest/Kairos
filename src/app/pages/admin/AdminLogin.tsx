// Platform administrator login page.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import { api, setAuthTokens } from "../../../lib/api/client";

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const tokens = await api.adminLogin({ email, password });
      setAuthTokens(tokens);
      navigate("/admin");
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <ThemeToggle compact />
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8 border border-border">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Admin</h1>
              <p className="text-sm text-muted-foreground">Orheo</p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Restricted access - Admin credentials required
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@orheobookings.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 mt-6"
              loading={isLoading}
              loadingLabel="Signing in..."
            >
              Access Admin Dashboard
            </Button>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            This dashboard is only accessible to authorized system administrators.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Need help?{" "}
          <a href="mailto:support@orheobookings.com" className="text-primary hover:text-primary/80">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
