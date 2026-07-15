// Onboarding step to connect a payment provider.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Calendar, CreditCard, Check } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api/client";

export function PaymentIntegration() {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState("stripe");
  const [accountDetails, setAccountDetails] = useState({
    accountId: "",
    apiKey: "",
  });

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.connectPaymentProvider({
        provider: selectedProvider,
        ...(accountDetails.accountId ? { account_id: accountDetails.accountId } : {}),
        ...(accountDetails.apiKey ? { api_key: accountDetails.apiKey } : {}),
      });
      navigate("/dashboard");
    } catch {
      setError("Unable to connect payment provider.");
    } finally {
      setIsLoading(false);
    }
  };

  const providers = [
    {
      id: "stripe",
      name: "Stripe",
      description: "Accept payments from anywhere in the world",
      popular: true,
    },
    {
      id: "paystack",
      name: "Paystack",
      description: "Popular payment solution across Africa",
      popular: true,
    },
    {
      id: "flutterwave",
      name: "Flutterwave",
      description: "Pan-African payment platform",
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Step 4 of 4</span>
            <span className="text-sm text-gray-600">100% complete</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#3B3680] to-[#2ECC71] w-full transition-all duration-300" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Connect payment provider</h1>
              <p className="text-sm text-gray-600">Accept deposits and payments from clients</p>
            </div>
          </div>

          <form onSubmit={handleComplete} className="space-y-6">
            <div className="space-y-3">
              <Label>Select Payment Provider</Label>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  onClick={() => !isLoading && setSelectedProvider(provider.id)}
                  className={`
                    relative p-4 border-2 rounded-lg cursor-pointer transition-all
                    ${
                      selectedProvider === provider.id
                        ? "border-[#3B3680] bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                        w-10 h-10 rounded-lg flex items-center justify-center
                        ${
                          selectedProvider === provider.id
                            ? "bg-[#3B3680] text-white"
                            : "bg-gray-100 text-gray-600"
                        }
                      `}
                      >
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{provider.name}</h3>
                          {provider.popular && (
                            <span className="px-2 py-0.5 bg-[#2ECC71] text-white text-xs rounded-full">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{provider.description}</p>
                      </div>
                    </div>
                    {selectedProvider === provider.id && (
                      <div className="w-6 h-6 rounded-full bg-[#3B3680] flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium">Account Details (Optional)</h3>
              <p className="text-sm text-gray-600">
                You can skip this for now and configure it later in settings
              </p>
              <div>
                <Label htmlFor="accountId">Account ID</Label>
                <Input
                  id="accountId"
                  type="text"
                  placeholder="acct_xxxxxxxxxxxxx"
                  value={accountDetails.accountId}
                  onChange={(e) =>
                    setAccountDetails({ ...accountDetails, accountId: e.target.value })
                  }
                  className="mt-1"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk_xxxxxxxxxxxxx"
                  value={accountDetails.apiKey}
                  onChange={(e) =>
                    setAccountDetails({ ...accountDetails, apiKey: e.target.value })
                  }
                  className="mt-1"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/onboarding/availability")}
                className="flex-1"
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-[#3B3680] to-[#2ECC71] hover:opacity-90"
                loading={isLoading}
                loadingLabel="Completing setup..."
              >
                Complete Setup
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
