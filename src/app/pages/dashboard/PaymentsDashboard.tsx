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
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api/client";

type Transaction = {
  id: string;
  client: string;
  service: string;
  amount: number;
  deposit: number;
  status: string;
  date: string;
  method: string;
};

export function PaymentsDashboard() {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [revenueData, setRevenueData] = useState<Array<{ month: string; revenue: number; deposits: number }>>([]);
  const [paymentMethodData, setPaymentMethodData] = useState<Array<{ name: string; value: number; color: string }>>(
    []
  );
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listTransactions()
      .then((rows) => {
        const mapped = rows.map((row) => ({
          id: row.id,
          client: row.client_name,
          service: row.service_name,
          amount: row.service_price,
          deposit: row.amount,
          status: row.status === "succeeded" ? "completed" : row.status,
          date: row.created_at,
          method: row.provider,
        }));
        setRecentTransactions(mapped);

        const totalCount = mapped.length || 1;
        const providerNames = [
          { id: "stripe", color: "var(--color-primary)", name: "Stripe" },
          { id: "paystack", color: "var(--color-accent)", name: "Paystack" },
          { id: "flutterwave", color: "var(--color-chart-2)", name: "Flutterwave" },
          { id: "kairos", color: "var(--color-accent)", name: "Kairos" },
        ];
        setPaymentMethodData(
          providerNames.map((provider) => ({
            name: provider.name,
            color: provider.color,
            value: Math.round(
              (mapped.filter((tx) => tx.method.toLowerCase().includes(provider.id)).length / totalCount) * 100
            ),
          }))
        );

        const monthly: Record<string, { month: string; revenue: number; deposits: number }> = {};
        for (const tx of mapped) {
          const month = new Date(tx.date).toLocaleDateString("en-US", { month: "short" });
          if (!monthly[month]) {
            monthly[month] = { month, revenue: 0, deposits: 0 };
          }
          monthly[month].revenue += tx.amount;
          monthly[month].deposits += tx.deposit;
        }
        setRevenueData(Object.values(monthly));
      })
      .catch(() => setError("Unable to load payment data."));
  }, []);

  const totalRevenue = recentTransactions
    .filter((tx) => tx.status === "completed")
    .reduce((sum, tx) => sum + tx.deposit, 0);
  const totalDeposits = recentTransactions.reduce((sum, tx) => sum + tx.deposit, 0);
  const pendingPayments = recentTransactions.filter((tx) => tx.status === "pending");
  const pendingTotal = pendingPayments.reduce((sum, tx) => sum + tx.amount, 0);
  const averageTransaction = recentTransactions.length > 0 ? totalRevenue / recentTransactions.length : 0;
  const depositTracking = recentTransactions
    .filter((tx) => tx.status === "pending" || tx.status === "failed")
    .map((tx) => ({
      id: tx.id,
      client: tx.client,
      service: tx.service,
      depositPaid: tx.status === "pending" ? tx.deposit : 0,
      depositRequired: tx.deposit,
      remainingBalance: Math.max(tx.amount - tx.deposit, 0),
      dueDate: tx.date,
      status: tx.status === "pending" ? "partial" : "pending",
    }));

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-accent flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>Live from transactions</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deposits Collected</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{totalDeposits.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {totalRevenue > 0 ? Math.round((totalDeposits / totalRevenue) * 100) : 0}% of total revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payments</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{pendingTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-2">{pendingPayments.length} outstanding payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Transaction</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">₦{averageTransaction.toFixed(2)}</div>
            <p className="text-xs text-accent flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>Live average</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue & Deposits Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis key="x" dataKey="month" stroke="#888888" />
                <YAxis key="y" stroke="#888888" />
                <Tooltip
                  key="tooltip"
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Bar key="revenue" dataKey="revenue" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                <Bar key="deposits" dataKey="deposits" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {paymentMethodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-4">
              {paymentMethodData.map((method) => (
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
                      <p className="font-semibold text-lg">₦{transaction.deposit.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Service total: ₦{transaction.amount.toFixed(2)}</p>
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
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {depositTracking.map((deposit) => (
                  <div
                    key={deposit.id}
                    className="p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{deposit.client}</h4>
                        <p className="text-sm text-muted-foreground">{deposit.service}</p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                          deposit.status
                        )}`}
                      >
                        {deposit.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Deposit Paid</p>
                        <p className="font-semibold text-accent">
                          ₦{deposit.depositPaid} / ₦{deposit.depositRequired}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Remaining Balance</p>
                        <p className="font-semibold">₦{deposit.remainingBalance}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Due Date</p>
                        <p className="font-medium">
                          {new Date(deposit.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all"
                        style={{
                          width: `${
                            (deposit.depositPaid / deposit.depositRequired) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {depositTracking.length === 0 && (
                  <p className="text-sm text-muted-foreground">No pending deposit balances.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
