// Payment transactions and revenue overview page.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Download,
  ArrowUpRight,
  CheckCircle,
  Clock,
  XCircle,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { RecordBalanceDialog } from "../../components/payments/RecordBalanceDialog";

type Transaction = {
  id: string;
  client: string;
  service: string;
  serviceTotal: number;
  collectedAmount: number;
  configuredDeposit: number;
  status: string;
  date: string;
  method: string;
  purpose?: string;
  viaOrheo?: boolean;
};

function MetricTitleWithTooltip({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span>{title}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${title} explanation`}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[260px]">
          {hint}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function PaymentsDashboard() {
  const queryClient = useQueryClient();
  const [balanceTarget, setBalanceTarget] = useState<{
    bookingId: string;
    clientName: string;
    serviceName: string;
    balanceDue: number;
  } | null>(null);

  const {
    data: provider,
    isError: providerFailed,
  } = useQuery({
    queryKey: queryKeys.paymentProvider,
    queryFn: () => api.getPaymentProvider(),
  });

  const { data: paymentConfig } = useQuery({
    queryKey: queryKeys.paymentConfig,
    queryFn: () => api.getPaymentConfig(),
  });

  const {
    data: transactionRows = [],
    isError: transactionsFailed,
  } = useQuery({
    queryKey: queryKeys.transactions,
    queryFn: () => api.listTransactions(),
  });

  const {
    data: balanceRows = [],
    isError: balanceFailed,
  } = useQuery({
    queryKey: queryKeys.balanceTracking,
    queryFn: () => api.listBalanceTracking(),
  });

  const platformFeePercent = Number(paymentConfig?.platform_fee_percent ?? provider?.platform_fee_percent ?? 5);
  const paymentsEnabled = Boolean(provider?.payments_enabled && provider?.account_id);
  const settlementSplit = useMemo(
    () => [
      { name: "Your settlement", value: Math.max(0, 100 - platformFeePercent), color: "var(--color-primary)" },
      { name: "Merchant fee", value: platformFeePercent, color: "var(--color-accent)" },
    ],
    [platformFeePercent]
  );

  const recentTransactions = useMemo<Transaction[]>(
    () =>
      transactionRows.map((row) => ({
        id: row.id,
        client: row.client_name ?? "Unknown",
        service: row.service_name ?? "Service",
        serviceTotal: row.service_price ?? row.amount ?? 0,
        collectedAmount: row.amount ?? 0,
        configuredDeposit: row.deposit_amount ?? 0,
        status: row.status === "succeeded" ? "completed" : row.status,
        date: row.paid_at ?? row.created_at,
        method:
          row.purpose === "balance"
            ? row.provider.replace("_", " ")
            : row.provider === "orheo" || row.provider === "kairos"
              ? "Demo"
              : "Paystack",
        purpose: row.purpose,
        viaOrheo: row.via_orheo,
      })),
    [transactionRows]
  );

  const completedTransactions = recentTransactions.filter((tx) => tx.status === "completed");
  const pendingTransactions = recentTransactions.filter((tx) => tx.status === "pending");

  const isLikelyDepositCollection = (tx: Transaction) =>
    tx.configuredDeposit > 0 &&
    tx.collectedAmount > 0 &&
    tx.collectedAmount <= tx.configuredDeposit + 0.01 &&
    tx.serviceTotal > tx.collectedAmount + 0.01;

  const revenueData = useMemo(() => {
    const monthly: Record<string, { month: string; collected: number; deposits: number; balances: number }> = {};
    for (const tx of completedTransactions) {
      const stamp = new Date(tx.date);
      const key = `${stamp.getFullYear()}-${stamp.getMonth() + 1}`;
      if (!monthly[key]) {
        monthly[key] = {
          month: stamp.toLocaleDateString("en-US", { month: "short" }),
          collected: 0,
          deposits: 0,
          balances: 0,
        };
      }
      monthly[key].collected += tx.collectedAmount;
      if (tx.purpose === "balance") {
        monthly[key].balances += tx.collectedAmount;
      } else if (isLikelyDepositCollection(tx) || tx.purpose === "deposit" || tx.purpose === "booking") {
        monthly[key].deposits += tx.collectedAmount;
      }
    }
    return Object.values(monthly);
  }, [completedTransactions]);

  const error =
    transactionsFailed || providerFailed || balanceFailed ? "Unable to load payment data." : "";

  const totalCollected = completedTransactions.reduce((sum, tx) => sum + tx.collectedAmount, 0);
  const orheoDepositsCollected = completedTransactions
    .filter((tx) => tx.viaOrheo || (tx.purpose !== "balance" && tx.method === "Paystack"))
    .reduce((sum, tx) => sum + tx.collectedAmount, 0);
  const balancesRecorded = completedTransactions
    .filter((tx) => tx.purpose === "balance")
    .reduce((sum, tx) => sum + tx.collectedAmount, 0);
  const totalDepositsCollected = completedTransactions
    .filter((tx) => tx.purpose !== "balance" && isLikelyDepositCollection(tx))
    .reduce((sum, tx) => sum + tx.collectedAmount, 0);
  const pendingCheckoutTotal = pendingTransactions.reduce((sum, tx) => sum + tx.collectedAmount, 0);
  const averageCollected =
    completedTransactions.length > 0 ? totalCollected / completedTransactions.length : 0;
  const outstandingBalanceTotal = balanceRows
    .filter((row) => row.payment_state === "deposit_paid" && row.balance_due > 0)
    .reduce((sum, row) => sum + row.balance_due, 0);

  const refreshPaymentData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
      queryClient.invalidateQueries({ queryKey: queryKeys.balanceTracking }),
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardHomeStats }),
    ]);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-accent" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-accent/10 text-accent";
      case "pending":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-100";
      case "failed":
        return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100";
      case "partial":
        return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-100";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Payments Dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your revenue, deposits, and transactions</p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-accent/5 to-card border-accent/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <MetricTitleWithTooltip
                title="Revenue Collected"
                hint="Deposits via Orheo plus balance payments you record after appointments."
              />
            </CardTitle>
            <DollarSign className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{totalCollected.toFixed(2)}</div>
            <p className="text-xs text-accent flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>
                Orheo deposits ₦{orheoDepositsCollected.toFixed(2)} · Balances ₦{balancesRecorded.toFixed(2)}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <MetricTitleWithTooltip
                title="Deposits via Orheo"
                hint="Upfront deposits collected through Orheo/Paystack. Merchant fee applies to these only."
              />
            </CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{orheoDepositsCollected.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Outstanding balances: ₦{outstandingBalanceTotal.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <MetricTitleWithTooltip
                title="Pending Checkouts"
                hint="Checkout attempts that started but are not yet completed."
              />
            </CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{pendingCheckoutTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-2">{pendingTransactions.length} awaiting payment completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <MetricTitleWithTooltip
                title="Avg. Collected"
                hint="Average collected amount per completed payment transaction."
              />
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{averageCollected.toFixed(2)}</div>
            <p className="text-xs text-accent flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>Completed transactions only</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Collected Revenue vs Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis key="x" dataKey="month" stroke="#888888" />
                <YAxis key="y" stroke="#888888" />
                <RechartsTooltip
                  key="tooltip"
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Bar key="collected" dataKey="collected" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                <Bar key="deposits" dataKey="deposits" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
                <Bar key="balances" dataKey="balances" fill="#64748b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paystack settlement split</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {paymentsEnabled
                ? `${platformFeePercent}% merchant fee on deposits collected through Orheo; the rest settles to you.`
                : "Connect Paystack to enable live settlement splits"}
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={settlementSplit}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {settlementSplit.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-4">
              {settlementSplit.map((method) => (
                <div key={method.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: method.color }}
                    />
                    <span className="text-sm">{method.name}</span>
                  </div>
                  <span className="text-sm font-medium">{method.value}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              This split applies only to booking deposits that pass through Orheo. Payments you collect outside Orheo
              are not subject to the merchant fee.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
          <TabsTrigger value="deposits">Deposit Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#086a82] flex items-center justify-center text-white font-medium">
                        {transaction.client.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{transaction.client}</h4>
                          {getStatusIcon(transaction.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{transaction.service}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(transaction.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">via {transaction.method}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-lg">₦{transaction.collectedAmount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Service total: ₦{transaction.serviceTotal.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {isLikelyDepositCollection(transaction) ? "Deposit payment" : "Full/other payment"}
                      </p>
                      <span
                        className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${getStatusColor(
                          transaction.status
                        )}`}
                      >
                        {transaction.status}
                      </span>
                    </div>
                  </div>
                ))}
                {recentTransactions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No payment transactions yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposits">
          <Card>
            <CardHeader>
            <CardTitle>Deposit Tracking</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Record balance payments after service, or view no-shows where only the deposit was collected.
            </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {balanceRows.map((row) => (
                  <div
                    key={row.booking_id}
                    className="p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div>
                        <h4 className="font-medium">{row.client_name}</h4>
                        <p className="text-sm text-muted-foreground">{row.service_name}</p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full shrink-0 ${getStatusColor(
                          row.payment_state === "forfeited"
                            ? "failed"
                            : row.payment_state === "deposit_paid"
                              ? "partial"
                              : "completed",
                        )}`}
                      >
                        {row.payment_state === "forfeited"
                          ? "No-show · deposit only"
                          : row.payment_state === "deposit_paid"
                            ? "Balance due"
                            : row.payment_state}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Deposit via Orheo</p>
                        <p className="font-semibold text-accent">
                          ₦{row.deposit_paid.toFixed(2)} / ₦{row.deposit_required.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Remaining balance</p>
                        <p className="font-semibold">₦{row.balance_due.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Appointment</p>
                        <p className="font-medium">
                          {row.appointment_at
                            ? new Date(row.appointment_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </p>
                      </div>
                    </div>
                    {row.payment_state === "deposit_paid" && row.balance_due > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setBalanceTarget({
                              bookingId: row.booking_id,
                              clientName: row.client_name,
                              serviceName: row.service_name,
                              balanceDue: row.balance_due,
                            })
                          }
                        >
                          Record balance
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void api.waiveBookingBalance(row.booking_id).then(() => refreshPaymentData());
                          }}
                        >
                          Waive balance
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {balanceRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">No outstanding deposit balances.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RecordBalanceDialog
        open={balanceTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBalanceTarget(null);
        }}
        bookingId={balanceTarget?.bookingId ?? ""}
        clientName={balanceTarget?.clientName ?? ""}
        serviceName={balanceTarget?.serviceName ?? ""}
        balanceDue={balanceTarget?.balanceDue ?? 0}
        onSubmit={async (payload) => {
          if (!balanceTarget) return;
          await api.recordBookingBalance(balanceTarget.bookingId, payload);
          await refreshPaymentData();
        }}
      />
    </div>
  );
}
