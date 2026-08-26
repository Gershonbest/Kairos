// Payment transactions and revenue overview page.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Download,
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
import {
  BrandAvatar,
  ChartSkeleton,
  EmptyState,
  ErrorNote,
  ListRow,
  PageHeader,
  PageShell,
  SectionCard,
  StatCard,
  StatusBadge,
} from "../../components/dashboard-ui";
import { useChartTheme } from "../../../lib/charts/useChartTheme";

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
  const chart = useChartTheme();
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
    isPending: transactionsLoading,
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
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case "pending":
        return <Clock className="w-4 h-4 text-[var(--warning-on-surface)]" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  const exportReport = () => {
    const header = ["Date", "Client", "Service", "Collected", "Service total", "Status", "Method"];
    const lines = [
      header,
      ...recentTransactions.map((tx) => [
        new Date(tx.date).toISOString(),
        tx.client,
        tx.service,
        tx.collectedAmount.toFixed(2),
        tx.serviceTotal.toFixed(2),
        tx.status,
        tx.method,
      ]),
    ];
    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orheo-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Customers"
        title="Payments"
        description="Track revenue, deposits, and transactions."
        actions={
          <Button variant="outline" onClick={exportReport} disabled={recentTransactions.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export report
          </Button>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={
            <MetricTitleWithTooltip
              title="Revenue collected"
              hint="Deposits via Orheo plus balance payments you record after appointments."
            />
          }
          value={`₦${totalCollected.toFixed(2)}`}
          hint={`Orheo deposits ₦${orheoDepositsCollected.toFixed(2)} · Balances ₦${balancesRecorded.toFixed(2)}`}
          icon={DollarSign}
          loading={transactionsLoading}
        />
        <StatCard
          label={
            <MetricTitleWithTooltip
              title="Deposits via Orheo"
              hint="Upfront deposits collected through Orheo/Paystack. Merchant fee applies to these only."
            />
          }
          value={`₦${orheoDepositsCollected.toFixed(2)}`}
          hint={`Outstanding balances: ₦${outstandingBalanceTotal.toFixed(2)}`}
          icon={CreditCard}
          loading={transactionsLoading}
        />
        <StatCard
          label={
            <MetricTitleWithTooltip
              title="Pending checkouts"
              hint="Checkout attempts that started but are not yet completed."
            />
          }
          value={`₦${pendingCheckoutTotal.toFixed(2)}`}
          hint={`${pendingTransactions.length} awaiting payment completion`}
          icon={Clock}
          emphasis={pendingTransactions.length > 0}
          loading={transactionsLoading}
        />
        <StatCard
          label={
            <MetricTitleWithTooltip
              title="Avg. collected"
              hint="Average collected amount per completed payment transaction."
            />
          }
          value={`₦${averageCollected.toFixed(2)}`}
          hint="Completed transactions only"
          icon={TrendingUp}
          loading={transactionsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Collected revenue vs deposits"
        >
          {transactionsLoading ? (
            <ChartSkeleton height={300} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis key="x" dataKey="month" stroke={chart.axis} fontSize={12} />
                <YAxis key="y" stroke={chart.axis} fontSize={12} />
                <RechartsTooltip
                  key="tooltip"
                  contentStyle={chart.tooltipStyle}
                  itemStyle={chart.tooltipItemStyle}
                  labelStyle={chart.tooltipLabelStyle}
                />
                <Bar key="collected" dataKey="collected" fill="var(--color-chart-1)" radius={[8, 8, 0, 0]} />
                <Bar key="deposits" dataKey="deposits" fill="var(--color-chart-2)" radius={[8, 8, 0, 0]} />
                <Bar key="balances" dataKey="balances" fill="var(--color-chart-5)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Paystack settlement split"
          description={
            paymentsEnabled
              ? `${platformFeePercent}% merchant fee on deposits collected through Orheo; the rest settles to you.`
              : "Connect Paystack to enable live settlement splits"
          }
        >
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
                <RechartsTooltip
                  contentStyle={chart.tooltipStyle}
                  itemStyle={chart.tooltipItemStyle}
                  labelStyle={chart.tooltipLabelStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {settlementSplit.map((method) => (
                <div key={method.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: method.color }}
                    />
                    <span className="text-sm">{method.name}</span>
                  </div>
                  <span className="text-sm font-medium">{method.value}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              This split applies only to booking deposits that pass through Orheo. Payments you collect outside Orheo
              are not subject to the merchant fee.
            </p>
        </SectionCard>
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
                  <ListRow key={transaction.id}>
                    <BrandAvatar name={transaction.client} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium">{transaction.client}</h4>
                        {getStatusIcon(transaction.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{transaction.service}</p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-xs text-muted-foreground">via {transaction.method}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">₦{transaction.collectedAmount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        Service total: ₦{transaction.serviceTotal.toFixed(2)}
                      </p>
                      <StatusBadge status={transaction.status} className="mt-1" />
                    </div>
                  </ListRow>
                ))}
                {recentTransactions.length === 0 && (
                  <EmptyState
                    icon={CreditCard}
                    title="No payment transactions yet"
                    description="Once clients pay deposits or you record balances, they appear here."
                  />
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
                      <StatusBadge
                        status={
                          row.payment_state === "forfeited"
                            ? "failed"
                            : row.payment_state === "deposit_paid"
                              ? "partial"
                              : row.payment_state
                        }
                      />
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
                  <EmptyState
                    title="No outstanding deposit balances"
                    description="Balances appear here after a client pays a deposit and still owes the rest."
                  />
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
    </PageShell>
  );
}
