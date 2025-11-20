import { useMemo } from "react";
import { AlertTriangle, FileText, Layers, ShieldCheck, Sparkles, Zap, Calendar, Activity } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartStyle,
  ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";

const metricHighlights = [
  {
    label: "Recoverable revenue",
    value: "$63,400",
    delta: "+18% vs last audit",
    icon: Zap,
  },
  {
    label: "Active escalations",
    value: "12 contracts",
    delta: "5 due this week",
    icon: AlertTriangle,
  },
  {
    label: "Automated audits",
    value: "312",
    delta: "90% coverage",
    icon: ShieldCheck,
  },
  {
    label: "AI extractions",
    value: "85% accuracy",
    delta: "Low confidence: 6 items",
    icon: Sparkles,
  },
];

const leakageTrend = [
  { month: "Jan", escalators: 18, discounts: 12, renewals: 9 },
  { month: "Feb", escalators: 21, discounts: 14, renewals: 10 },
  { month: "Mar", escalators: 26, discounts: 13, renewals: 12 },
  { month: "Apr", escalators: 22, discounts: 11, renewals: 8 },
  { month: "May", escalators: 31, discounts: 15, renewals: 14 },
  { month: "Jun", escalators: 33, discounts: 18, renewals: 16 },
];

const contractAlerts = [
  {
    customer: "Acme Cloud",
    issue: "CPI uplift never posted",
    value: "$18,400",
    due: "Renewal in 5 days",
    priority: "high",
  },
  {
    customer: "BrightOps",
    issue: "Volume tier drift (SOW-11)",
    value: "$9,800",
    due: "Invoice pending",
    priority: "medium",
  },
  {
    customer: "Northwind MSP",
    issue: "Unbilled add-ons",
    value: "$6,200",
    due: "Flagged yesterday",
    priority: "high",
  },
  {
    customer: "LedgerStack",
    issue: "Expired discount still applied",
    value: "$3,450",
    due: "Needs review",
    priority: "low",
  },
];

const activityFeed = [
  { actor: "AI Auditor", time: "2 min ago", detail: "Highlighted CPI clause in Acme Cloud MSA" },
  { actor: "Jordan (Finance)", time: "1 hour ago", detail: "Marked BrightOps discrepancy as resolved" },
  { actor: "AI Auditor", time: "3 hours ago", detail: "Reconciled 87 invoices from NetSuite export" },
  { actor: "Chloe (RevOps)", time: "Yesterday", detail: "Scheduled follow-up audit for Northwind MSP" },
];

const Dashboard = () => {
  const chartConfig = useMemo<ChartConfig>(
    () => ({
      escalators: { label: "Escalator misses", color: "hsl(var(--cta))" },
      discounts: { label: "Discount drift", color: "hsl(var(--primary))" },
      renewals: { label: "Unbilled renewals", color: "hsl(var(--success))" },
    }),
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Operations cockpit</p>
            <h1 className="text-4xl font-bold text-primary mt-2">ContractGuard Dashboard</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Monitor automated audits, review AI insights, and dispatch revenue recovery workstreams—all in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" className="gap-2">
              <Calendar className="h-4 w-4" />
              Schedule audit
            </Button>
            <Button variant="cta" className="gap-2">
              <Layers className="h-4 w-4" />
              Run new analysis
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricHighlights.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-border bg-card/90 backdrop-blur p-5 shadow-card space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <metric.icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.delta}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 shadow-hover p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Leakage trend</p>
                <h2 className="text-xl font-semibold">Monthly recoverable revenue</h2>
              </div>
              <span className="text-sm text-muted-foreground">Last 6 months</span>
            </div>
            <div data-chart="leakage" className="h-72 flex justify-center">
              <ChartStyle id="leakage" config={chartConfig} />
              <ResponsiveContainer>
                <BarChart data={leakageTrend} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="escalators" stackId="a" fill="var(--color-escalators)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="discounts" stackId="a" fill="var(--color-discounts)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="renewals" stackId="a" fill="var(--color-renewals)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">AI audit status</p>
                <h3 className="text-xl font-semibold">Extraction health</h3>
              </div>
              <Activity className="h-5 w-5 text-success" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={leakageTrend}>
                <defs>
                  <linearGradient id="accuracy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis hide />
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="escalators"
                  stroke="hsl(var(--success))"
                  fillOpacity={1}
                  fill="url(#accuracy)"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-semibold">92%</span> of escalator clauses extracted perfectly. 6
                low-confidence fields queued for review.
              </p>
              <p>
                <span className="text-foreground font-semibold">87 invoices</span> reconciled from NetSuite overnight.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 shadow-hover p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Discrepancies</p>
                <h3 className="text-xl font-semibold">Prioritized contract alerts</h3>
              </div>
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </div>
            <div className="divide-y divide-border/60">
              {contractAlerts.map((alert) => (
                <div key={alert.customer} className="py-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-foreground">{alert.customer}</p>
                    <p className="text-sm text-muted-foreground">{alert.issue}</p>
                  </div>
                  <p className="text-foreground font-mono">{alert.value}</p>
                  <p className="text-sm text-muted-foreground">{alert.due}</p>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      alert.priority === "high"
                        ? "bg-destructive/10 text-destructive"
                        : alert.priority === "medium"
                          ? "bg-cta/10 text-cta"
                          : "bg-secondary/60 text-foreground"
                    }`}
                  >
                    {alert.priority.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Latest activity</p>
                <h3 className="text-xl font-semibold">Audit timeline</h3>
              </div>
              <Button variant="secondary" size="sm">
                Export log
              </Button>
            </div>
            <div className="space-y-4">
              {activityFeed.map((item) => (
                <div key={`${item.actor}-${item.time}`} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.actor}</p>
                    <p className="text-xs text-muted-foreground mb-1">{item.time}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;

