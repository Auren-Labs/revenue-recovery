import { useEffect, useMemo, useState, useRef } from "react";
import {
  AlertTriangle,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
  Calendar,
  Activity,
  CircleCheck,
  TriangleAlert,
  RefreshCw,
  ArrowUpRight,
  BellRing,
  Target,
  Mail,
  FileText,
  Users,
  Lightbulb,
} from "lucide-react";
import { ChartStyle, ChartConfig } from "@/components/ui/chart";
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
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

if (pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const dateRanges = ["This month", "Last 3 months", "Last 6 months", "Last year", "Custom range"];

type BillingSummary = {
  total_billed?: number;
  invoice_count?: number;
  avg_invoice?: number;
  largest_invoice?: number;
  customers?: Array<{ customer: string; total: number; invoice_count: number; avg_invoice: number }>;
  sources?: string[];
};

type RegionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EvidenceRegion = {
  page?: number;
  bounds?: RegionBounds;
};

type ClauseReference = {
  type?: string;
  label?: string;
  text?: string;
  page?: number | null;
  confidence?: number;
  file?: string;
  regions?: EvidenceRegion[];
};

type ExtractedDocument = {
  filename?: string;
  storage_path?: string;
  storage?: string;
  clauses?: ClauseReference[];
  totals?: Record<string, number>;
};

type BillingFile = {
  filename?: string;
  storage?: string;
  storage_path?: string;
  local_path?: string;
};

type DiscrepancyEvidence = {
  type?: string;
  reference?: string;
  label?: string;
  text?: string;
  page?: number | null;
  confidence?: number;
  amount?: number;
  period?: string;
  file?: string;
  notes?: string;
  bounds?: RegionBounds;
  regions?: EvidenceRegion[];
};

type JobMetrics = Record<string, unknown> & {
  billing_summary?: BillingSummary;
  clause_distribution?: Record<string, number>;
  llm_summary?: string;
  llm_insights?: Array<Record<string, unknown>>;
  total_clauses?: number;
  recoverable_amount?: number;
  documents?: ExtractedDocument[];
  billing_files?: BillingFile[];
};

type AnalysisSummary = {
  job: {
    id: string;
    status: string;
    metrics: JobMetrics;
  };
  discrepancies: Array<{
    customer?: string;
    issue?: string;
    value?: number;
    priority?: string;
    due?: string;
    evidence?: DiscrepancyEvidence[];
  }>;
};

const defaultMetricHighlights = [
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
  {
    label: "Recovery in progress",
    value: "$41,200",
    delta: "Rebilling 8 customers",
    icon: CircleCheck,
  },
];

const defaultLeakageTrend = [
  { month: "Jan", escalators: 18, discounts: 12, renewals: 9 },
  { month: "Feb", escalators: 21, discounts: 14, renewals: 10 },
  { month: "Mar", escalators: 26, discounts: 13, renewals: 12 },
  { month: "Apr", escalators: 22, discounts: 11, renewals: 8 },
  { month: "May", escalators: 31, discounts: 15, renewals: 14 },
  { month: "Jun", escalators: 33, discounts: 18, renewals: 16 },
];

const defaultContractAlerts = [
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

const topResolver = {
  name: "Jordan (Finance)",
  resolved: 12,
  recovered: "$87K",
};

const teamStats = [
  { label: "Discrepancies resolved", value: "23" },
  { label: "Recovered", value: "$127K" },
  { label: "Avg resolution time", value: "2.3 days" },
];

// 🔥 Enhanced currency formatter that uses the contract's currency
const formatCurrency = (value: number | undefined, currencyCode?: string, options?: Intl.NumberFormatOptions) => {
  const currency = currencyCode || "INR"; // Default to INR
  const symbols: Record<string, string> = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£'
  };
  
  const symbol = symbols[currency] || currency;
  const formattedNumber = new Intl.NumberFormat("en-US", { 
    maximumFractionDigits: 0, 
    ...options 
  }).format(value ?? 0);
  
  return `${symbol}${formattedNumber}`;
};

const truncate = (text: string | undefined, length = 140) => {
  if (!text) return "";
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()}…`;
};

const Dashboard = () => {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState("Last 6 months");
  const [openEvidenceKey, setOpenEvidenceKey] = useState<string | null>(null);
  const [viewerClause, setViewerClause] = useState<{ doc: ExtractedDocument; evidence: DiscrepancyEvidence } | null>(
    null,
  );
  const [viewerDimensions, setViewerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pdfScale, setPdfScale] = useState(2.5);
  const [autoScale, setAutoScale] = useState(2.5);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jobId) {
      setAnalysis(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/analysis/${jobId}/summary`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as AnalysisSummary;
        setAnalysis(payload);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load job data.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [jobId]);

  const metrics = (analysis?.job.metrics ?? {}) as JobMetrics;
  // 🔥 ADD THIS: Extract currency from GPT-4o rules
  const contractCurrency = (metrics.gpt4o_rules as any)?.currency || 
  (metrics as any)?.currency || 
  "INR";
  
  const billingSummary: BillingSummary = metrics.billing_summary ?? {
    total_billed: 0,
    invoice_count: 0,
    avg_invoice: 0,
    largest_invoice: 0,
    customers: [],
  };
  const clauseDistribution = metrics.clause_distribution ?? {};
  const discrepancies = analysis?.discrepancies ?? [];
  const llmSummary = metrics.llm_summary as string | undefined;
  const clauseHits = metrics.total_clauses ?? 0;
  const recoverableAmount = metrics.recoverable_amount ?? 0;
  const documents = (metrics.documents as ExtractedDocument[] | undefined) ?? [];
  const billingFiles = (metrics.billing_files as BillingFile[] | undefined) ?? [];
  const billingSources = billingSummary.sources ?? [];
  const viewerUrl =
    viewerClause && jobId && viewerClause.doc.filename
      ? `${API_BASE}/jobs/${jobId}/contracts/${encodeURIComponent(viewerClause.doc.filename)}`
      : undefined;
  const viewerHighlight =
    viewerClause?.evidence.bounds ||
    viewerClause?.evidence.regions?.find((region) => region.bounds)?.bounds ||
    null;
  const viewerPage =
    viewerClause?.evidence.regions?.find((region) => typeof region.page === "number")?.page ||
    viewerClause?.evidence.page ||
    viewerClause?.doc.clauses?.find((clause) => clause.file === viewerClause?.doc.filename)?.page ||
    1;

  const openClauseReference = (reference: DiscrepancyEvidence) => {
    if (!jobId || reference.type !== "contract_clause") return;
    const doc = documents.find((document) => document.filename === reference.file);
    if (!doc) return;
    setViewerClause({ doc, evidence: reference });
  };

  const closeViewer = () => {
    setViewerClause(null);
    setViewerDimensions({ width: 0, height: 0 });
    setPdfScale(2.5);
    setAutoScale(2.5);
  };

  const highlightCards = useMemo(() => {
    if (!analysis) return defaultMetricHighlights;
    return [
      {
        label: "Recoverable revenue",
        value: formatCurrency(recoverableAmount, contractCurrency),
        delta: `Based on ${billingSummary.invoice_count ?? 0} invoices`,
        icon: Zap,
      },
      {
        label: "Active escalations",
        value: `${discrepancies.length} contract${discrepancies.length === 1 ? "" : "s"}`,
        delta: billingSummary.customers?.[0]?.customer
          ? `Top risk: ${billingSummary.customers[0].customer}`
          : "Monitoring all vendors",
        icon: AlertTriangle,
      },
      {
        label: "Automated audits",
        value: `${billingSummary.invoice_count ?? 0}`,
        delta: `${billingSummary.customers?.length ?? 0} customers reconciled`,
        icon: ShieldCheck,
      },
      {
        label: "AI extractions",
        value: `${clauseHits} clauses`,
        delta: metrics.llm_insights?.length ? `${metrics.llm_insights.length} insights generated` : "LLM insights ready",
        icon: Sparkles,
      },
      {
        label: "Recovery in progress",
        value: formatCurrency(recoverableAmount, contractCurrency), // 🔥 FIX: Use recoverable, not total_billed
        delta: `${billingSummary.customers?.length ?? 0} customers billed`,
        icon: CircleCheck,
      },
    ];
  }, [analysis, billingSummary, clauseHits, discrepancies.length, metrics.llm_insights, recoverableAmount]);

  const leakageTrend = useMemo(() => {
    if (!analysis) return defaultLeakageTrend;
    return [
      {
        month: "Current",
        escalators: clauseDistribution.cpi_uplift ?? clauseDistribution.escalators ?? 0,
        discounts: clauseDistribution.discount_floor ?? clauseDistribution.discounts ?? 0,
        renewals: clauseDistribution.renewal_notice ?? clauseDistribution.renewals ?? 0,
      },
    ];
  }, [analysis, clauseDistribution]);

  const discrepancyAlerts = useMemo(() => {
    if (!analysis) return defaultContractAlerts;
    if (!discrepancies.length) {
      return [
        {
          customer: "All clear",
          issue: "No discrepancies detected in this run.",
          value: "$0",
          due: "You’re in great shape",
          priority: "low",
        },
      ];
    }
    return discrepancies.map((alert, idx) => ({
      id: `${alert.customer ?? "unknown"}-${alert.issue ?? idx}`,
      customer: alert.customer ?? "Unknown customer",
      issue: alert.issue ?? "Issue pending triage",
      value: formatCurrency(alert.value ?? 0, contractCurrency),
      due: alert.due ?? "No due date",
      priority: (alert.priority ?? "medium").toLowerCase(),
      evidence: alert.evidence ?? [],
    }));
  }, [analysis, discrepancies]);

  const teamStatsComputed = useMemo(() => {
    if (!analysis) return teamStats;
    return [
      { label: "Invoices reconciled", value: `${billingSummary.invoice_count ?? 0}` },
      { label: "Customers audited", value: `${billingSummary.customers?.length ?? 0}` },
      { label: "Clause hits", value: `${clauseHits}` },
    ];
  }, [analysis, billingSummary.customers?.length, billingSummary.invoice_count, clauseHits]);

  const primaryDiscrepancy = discrepancies[0];
const patternSummary = llmSummary || "LLM insights will appear here once a job completes.";

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      escalators: { label: "Escalator misses", color: "hsl(var(--cta))" },
      discounts: { label: "Discount drift", color: "hsl(var(--primary))" },
      renewals: { label: "Unbilled renewals", color: "hsl(var(--success))" },
    }),
    [],
  );

  const evidenceSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToEvidence = () => {
    evidenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {error && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {!jobId && (
          <div className="rounded-2xl border border-border bg-card/90 text-sm text-muted-foreground px-4 py-3">
            Upload a contract + billing run to see live metrics here. Showing sample data until a job is provided.
          </div>
        )}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Operations cockpit</p>
            <h1 className="text-4xl font-bold text-primary mt-2">ContractGuard Dashboard</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Monitor automated audits, review AI insights, and dispatch revenue recovery workstreams—all in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              value={selectedRange}
              onChange={(event) => setSelectedRange(event.target.value)}
            >
              {dateRanges.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {highlightCards.map((metric) => (
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
              {metric.label === "AI extractions" && clauseHits > 0 && metrics.llm_insights?.length ? (
                <Button variant="ghost" size="sm" className="gap-2 text-cta p-0 h-auto" onClick={scrollToEvidence}>
                  <TriangleAlert className="h-4 w-4" />
                  Review AI insights
                </Button>
              ) : null}
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
              <Button variant="ghost" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                View all {discrepancyAlerts.length} discrepancies
              </Button>
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
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 text-foreground">
                <span>
                  📈 Escalator hits detected: {clauseDistribution.cpi_uplift ?? clauseDistribution.escalators ?? 0}
                </span>
              </p>
              <p>💡 Tip: Schedule CPI clause audits monthly to prevent leakage.</p>
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
                <span className="text-foreground font-semibold">{clauseHits}</span> clause references parsed from the
                latest upload.
              </p>
              <p>
                <span className="text-foreground font-semibold">{billingSummary.invoice_count ?? 0} invoices</span>{" "}
                reconciled in this run.
              </p>
            </div>
            <Button variant="secondary" size="sm" className="gap-2">
              <TriangleAlert className="h-4 w-4 text-cta" />
              View AI summary
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 shadow-hover p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Discrepancies</p>
                <h3 className="text-xl font-semibold">Prioritized contract alerts</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="gap-2">
                  Review all {discrepancyAlerts.length} discrepancies
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
                <div className="flex gap-2">
                  <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
                    <option>All discrepancies</option>
                    <option>Escalator</option>
                    <option>Discount</option>
                    <option>Renewal</option>
                  </select>
                  <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
                    <option>Priority: All</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
                    <option>Amount: Any</option>
                    <option>&gt; $10K</option>
                    <option>&gt; $5K</option>
                    <option>&gt; $1K</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {discrepancyAlerts.map((alert) => (
                <div key={alert.id} className="py-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-semibold text-foreground flex items-center gap-2">
                        {alert.customer}
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          alert.priority === "high"
                              ? "bg-destructive/10 text-destructive"
                              : alert.priority === "medium"
                                ? "bg-cta/10 text-cta"
                                : "bg-secondary/60 text-foreground"
                          }`}
                        >
                          {alert.priority.toUpperCase()}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">{alert.issue}</p>
                    </div>
                    <p className="text-foreground font-mono">{alert.value}</p>
                    <p className="text-sm text-muted-foreground">{alert.due}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm">
                      View Evidence
                    </Button>
                    <Button variant="secondary" size="sm">
                      Mark Resolved
                    </Button>
                    <Button variant="secondary" size="sm">
                      Export Report
                    </Button>
                    <Button variant="secondary" size="sm">
                      Notify Customer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cta"
                      onClick={() => setOpenEvidenceKey(openEvidenceKey === alert.id ? null : alert.id)}
                    >
                      {openEvidenceKey === alert.id ? "Hide references" : "View references"}
                    </Button>
                  </div>
                  {openEvidenceKey === alert.id && (
                    <div className="bg-secondary/40 border border-border/60 rounded-2xl p-3 text-xs text-muted-foreground space-y-2">
                      {alert.evidence?.length ? (
                        alert.evidence.map((item, index) => (
                          <div key={`${alert.id}-evidence-${index}`} className="space-y-1">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                              {item.type === "contract_clause" ? `Clause: ${item.label}` : `Invoice: ${item.reference}`}
                              {item.type === "contract_clause" && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="p-0 h-auto text-cta"
                                  onClick={() => openClauseReference(item)}
                                >
                                  View in contract
                                </Button>
                              )}
                            </p>
                            {item.text && <p className="italic">“{item.text}”</p>}
                            <p>
                              {item.amount !== undefined && (
                                  <span>{formatCurrency(item.amount, contractCurrency)} • </span>
                                )}
                              {item.period && <span>{item.period} • </span>}
                              {item.file && <span>Source: {item.file}</span>}
                            </p>
                            {item.notes && <p>Note: {item.notes}</p>}
                          </div>
                        ))
                      ) : (
                        <p>No structured evidence attached.</p>
                      )}
                    </div>
                  )}
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

        <section ref={evidenceSectionRef} className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4 text-cta" />
                  Recommended next action
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {primaryDiscrepancy
                    ? `Contact ${primaryDiscrepancy.customer ?? "customer"} about ${primaryDiscrepancy.issue}`
                    : "Keep monitoring your contracts"}
                </p>
              </div>
              {primaryDiscrepancy?.due && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">
                  {primaryDiscrepancy.due}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {primaryDiscrepancy
                ? `${formatCurrency(primaryDiscrepancy.value ?? 0, contractCurrency)} at risk. ${primaryDiscrepancy.issue}.`
                : "No discrepancies at the moment. Stay proactive by scheduling periodic audits."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="cta" className="gap-2">
                <Mail className="h-4 w-4" />
                Draft email
              </Button>
              <Button variant="secondary" className="gap-2">
                <FileText className="h-4 w-4" />
                View contract
              </Button>
              <Button variant="secondary" className="gap-2">
                <ArrowUpRight className="h-4 w-4" />
                Open discrepancy
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Pattern detected
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {primaryDiscrepancy?.customer ?? "LLM insight center"}
                </p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-72 overflow-auto pr-2 prose prose-invert prose-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{patternSummary}</ReactMarkdown>
            </div>
            <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4 text-sm text-muted-foreground">
              💡 Suggestion: correlate clause hits with billing gaps to trigger alerts before renewals.
            </div>
            <Button variant="secondary" className="w-fit gap-2">
              <BellRing className="h-4 w-4" />
              Create alert rule
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 flex items-center gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-success flex items-center gap-2">
                ● System Status
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-2">All systems operational</h3>
              <p className="text-sm text-muted-foreground mt-2">
                NetSuite + CRM connectors synced minutes ago. AI auditing agents are live and monitoring renewals.
              </p>
            </div>
            <div className="text-sm text-muted-foreground border-l border-border pl-4">
              <p>Last sync</p>
              <p className="text-foreground font-semibold">2 minutes ago</p>
              <p className="mt-3">Upcoming jobs</p>
              <ul className="list-disc ml-4">
                <li>Renewal ingestion @ 10:00 PM</li>
                <li>Invoice reconciliation @ 1:00 AM</li>
              </ul>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team activity</p>
                <h3 className="text-xl font-semibold">Performance snapshot</h3>
              </div>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="rounded-2xl border border-border/70 p-4 bg-secondary/30">
              <p className="text-sm text-muted-foreground">Top resolver</p>
              <p className="text-lg font-semibold text-foreground">{topResolver.name}</p>
              <p className="text-sm text-muted-foreground">
                Resolved {topResolver.resolved} discrepancies • Recovered {topResolver.recovered}
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
              {teamStatsComputed.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/70 p-4">
                  <p className="text-xs uppercase tracking-widest">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Source documents</p>
                <h3 className="text-xl font-semibold">Contract evidence trail</h3>
              </div>
            </div>
            <div className="space-y-4">
              {documents.length ? (
                documents.map((doc, idx) => (
                  <div key={`${doc.filename}-${idx}`} className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm font-semibold text-foreground">{doc.filename ?? "Contract"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.clauses?.length ?? 0} clause references • Stored at {doc.storage_path}
                    </p>
                  {doc.clauses?.slice(0, 2).map((clause, clauseIdx) => (
                    <div key={`${doc.filename}-clause-${clauseIdx}`} className="text-xs text-muted-foreground mt-2">
                      <p>
                        <span className="font-semibold uppercase tracking-wide">{clause.label}</span>:{" "}
                        {truncate(clause.text ?? "", 160)}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-cta"
                        onClick={() =>
                          openClauseReference({
                            type: "contract_clause",
                            label: clause.label,
                            text: clause.text,
                            page: clause.page,
                            confidence: clause.confidence,
                            file: doc.filename,
                            regions: clause.regions,
                            bounds: clause.regions?.[0]?.bounds,
                          })
                        }
                      >
                        View in contract
                      </Button>
                    </div>
                  ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Upload contracts to see extracted clauses.</p>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Billing exports</p>
                <h3 className="text-xl font-semibold">Invoice evidence trail</h3>
              </div>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Files processed: {billingFiles.length ? billingFiles.map((file) => file.filename).join(", ") : "N/A"}
              </p>
              <p>
                Sources detected: {billingSources.length ? billingSources.join(", ") : "Not recorded (local import)"}
              </p>
            </div>
            <div className="space-y-3">
              {billingSummary.customers?.length ? (
                billingSummary.customers.slice(0, 3).map((customer) => (
                  <div key={customer.customer} className="rounded-2xl border border-border/70 p-4">
                    <p className="text-sm font-semibold text-foreground">{customer.customer}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.invoice_count} invoices • {formatCurrency(customer.total, contractCurrency)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Upload billing files to trace invoice math.</p>
              )}
            </div>
          </div>
        </section>
        {loading && (
          <div className="text-sm text-muted-foreground animate-pulse">
            Syncing the latest audit signals…
          </div>
        )}
      </div>

      <Sheet open={!!viewerClause} onOpenChange={(open) => (!open ? closeViewer() : null)}>
        <SheetContent
          side="right"
          className="w-full lg:w-[95vw] max-w-[1600px] p-0 flex flex-col border-l border-border bg-background"
        >
          <SheetHeader className="p-6 border-b border-border/60">
            <SheetTitle className="text-lg">
              {viewerClause?.doc.filename ?? "Contract preview"}
              {viewerClause?.evidence.label && (
                <span className="ml-2 text-xs font-normal uppercase tracking-widest text-muted-foreground">
                  {viewerClause.evidence.label}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          {viewerClause && viewerUrl ? (
            <div className="flex-1 flex flex-col">
              <div className="px-6 py-3 border-b border-border/60 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
                <span>Highlighting page {viewerPage}. Use the controls to zoom the PDF.</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Zoom {pdfScale.toFixed(1)}×
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfScale((prev) => Math.max(1, +(prev - 0.3).toFixed(1)))}
                    >
                      −
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfScale(autoScale)}
                    >
                      100%
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfScale((prev) => Math.min(5, +(prev + 0.3).toFixed(1)))}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-secondary/30 px-2 py-2">
                <div ref={viewerContainerRef} className="relative mx-auto min-w-fit">
                  <PdfDocument file={viewerUrl} loading={<p>Loading contract…</p>}>
                    <PdfPage
                      key={`${viewerPage}-${pdfScale}`}
                      pageNumber={viewerPage ?? 1}
                      scale={pdfScale}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      onRenderSuccess={(page) => {
                        const viewport = page.getViewport({ scale: pdfScale });
                        setViewerDimensions({ width: viewport.width, height: viewport.height });
                        const containerWidth = viewerContainerRef.current?.clientWidth ?? viewport.width;
                        const containerHeight = viewerContainerRef.current?.clientHeight ?? viewport.height;
                        const widthScale = containerWidth / viewport.width;
                        const heightScale = containerHeight / viewport.height;
                        const bestFit = pdfScale * Math.min(widthScale, heightScale);
                        if (Number.isFinite(bestFit) && bestFit > 0) {
                          setAutoScale(bestFit);
                        }
                      }}
                    />
                  </PdfDocument>
                  {viewerHighlight && viewerDimensions.width > 0 && viewerDimensions.height > 0 && (
                    <div
                      className="absolute border-2 border-cta bg-cta/30 rounded-md pointer-events-none transition-all shadow-lg"
                      style={{
                        left: viewerHighlight.x * viewerDimensions.width,
                        top: viewerHighlight.y * viewerDimensions.height,
                        width: viewerHighlight.width * viewerDimensions.width,
                        height: viewerHighlight.height * viewerDimensions.height,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Unable to load the original document. Please re-upload the contract.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Dashboard;

