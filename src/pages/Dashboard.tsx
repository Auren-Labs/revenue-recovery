// import { useEffect, useMemo, useState, useRef, useCallback } from "react";
// import {
//   AlertTriangle,
//   Layers,
//   ShieldCheck,
//   Sparkles,
//   Zap,
//   Calendar,
//   Activity,
//   CircleCheck,
//   TriangleAlert,
//   RefreshCw,
//   ArrowUpRight,
//   BellRing,
//   Target,
//   Mail,
//   FileText,
//   Users,
//   Lightbulb,
//   Loader2,
// } from "lucide-react";
// import { ChartStyle, ChartConfig } from "@/components/ui/chart";
// import {
//   Area,
//   AreaChart,
//   Bar,
//   BarChart,
//   CartesianGrid,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
// } from "recharts";
// import { Button } from "@/components/ui/button";
// import { useSearchParams } from "react-router-dom";
// import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
// import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import { Textarea } from "@/components/ui/textarea";

// if (pdfjs?.GlobalWorkerOptions) {
//   pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
// }

// const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// const dateRanges = ["This month", "Last 3 months", "Last 6 months", "Last year", "Custom range"];

// type BillingSummary = {
//   total_billed?: number;
//   invoice_count?: number;
//   avg_invoice?: number;
//   largest_invoice?: number;
//   customers?: Array<{ customer: string; total: number; invoice_count: number; avg_invoice: number }>;
//   sources?: string[];
// };

// type RegionBounds = {
//   x: number;
//   y: number;
//   width: number;
//   height: number;
// };

// type EvidenceRegion = {
//   page?: number;
//   bounds?: RegionBounds;
// };

// type ClauseReference = {
//   type?: string;
//   label?: string;
//   text?: string;
//   page?: number | null;
//   confidence?: number;
//   file?: string;
//   regions?: EvidenceRegion[];
// };

// type ExtractedDocument = {
//   filename?: string;
//   storage_path?: string;
//   storage?: string;
//   clauses?: ClauseReference[];
//   totals?: Record<string, number>;
// };

// type BillingFile = {
//   filename?: string;
//   storage?: string;
//   storage_path?: string;
//   local_path?: string;
// };

// type DiscrepancyEvidence = {
//   type?: string;
//   reference?: string;
//   label?: string;
//   text?: string;
//   page?: number | null;
//   confidence?: number;
//   amount?: number;
//   period?: string;
//   file?: string;
//   notes?: string;
//   bounds?: RegionBounds;
//   regions?: EvidenceRegion[];
//   invoice_date?: string;
// };

// type JobMetrics = Record<string, unknown> & {
//   billing_summary?: BillingSummary;
//   clause_distribution?: Record<string, number>;
//   llm_summary?: string;
//   llm_insights?: Array<Record<string, unknown>>;
//   total_clauses?: number;
//   recoverable_amount?: number;
//   documents?: ExtractedDocument[];
//   billing_files?: BillingFile[];
// };

// type AnalysisSummary = {
//   job: {
//     id: string;
//     status: string;
//     vendor_name?: string;
//     metrics: JobMetrics;
//   };
//   discrepancies: Array<{
//     customer?: string;
//     issue?: string;
//     value?: number;
//     priority?: string;
//     due?: string;
//     invoice_date?: string;
//     evidence?: DiscrepancyEvidence[];
//   }>;
// };

// const defaultMetricHighlights = [
//   {
//     label: "Recoverable revenue",
//     value: "$63,400",
//     delta: "+18% vs last audit",
//     icon: Zap,
//   },
//   {
//     label: "Active escalations",
//     value: "12 contracts",
//     delta: "5 due this week",
//     icon: AlertTriangle,
//   },
//   {
//     label: "Automated audits",
//     value: "312",
//     delta: "90% coverage",
//     icon: ShieldCheck,
//   },
//   {
//     label: "AI extractions",
//     value: "85% accuracy",
//     delta: "Low confidence: 6 items",
//     icon: Sparkles,
//   },
//   {
//     label: "Recovery in progress",
//     value: "$41,200",
//     delta: "Rebilling 8 customers",
//     icon: CircleCheck,
//   },
// ];

// const defaultLeakageTrend = [
//   { month: "Jan", escalators: 18, discounts: 12, renewals: 9 },
//   { month: "Feb", escalators: 21, discounts: 14, renewals: 10 },
//   { month: "Mar", escalators: 26, discounts: 13, renewals: 12 },
//   { month: "Apr", escalators: 22, discounts: 11, renewals: 8 },
//   { month: "May", escalators: 31, discounts: 15, renewals: 14 },
//   { month: "Jun", escalators: 33, discounts: 18, renewals: 16 },
// ];

// const defaultContractAlerts = [
//   {
//     id: "sample-acme",
//     customer: "Acme Cloud",
//     issue: "CPI uplift never posted",
//     value: "$18,400",
//     due: "Renewal in 5 days",
//     priority: "high",
//   },
//   {
//     id: "sample-brightops",
//     customer: "BrightOps",
//     issue: "Volume tier drift (SOW-11)",
//     value: "$9,800",
//     due: "Invoice pending",
//     priority: "medium",
//   },
//   {
//     id: "sample-northwind",
//     customer: "Northwind MSP",
//     issue: "Unbilled add-ons",
//     value: "$6,200",
//     due: "Flagged yesterday",
//     priority: "high",
//   },
//   {
//     id: "sample-ledgerstack",
//     customer: "LedgerStack",
//     issue: "Expired discount still applied",
//     value: "$3,450",
//     due: "Needs review",
//     priority: "low",
//   },
// ];

// const activityFeed = [
//   { actor: "AI Auditor", time: "2 min ago", detail: "Highlighted CPI clause in Acme Cloud MSA" },
//   { actor: "Jordan (Finance)", time: "1 hour ago", detail: "Marked BrightOps discrepancy as resolved" },
//   { actor: "AI Auditor", time: "3 hours ago", detail: "Reconciled 87 invoices from NetSuite export" },
//   { actor: "Chloe (RevOps)", time: "Yesterday", detail: "Scheduled follow-up audit for Northwind MSP" },
// ];

// const topResolver = {
//   name: "Jordan (Finance)",
//   resolved: 12,
//   recovered: "$87K",
// };

// const teamStats = [
//   { label: "Discrepancies resolved", value: "23" },
//   { label: "Recovered", value: "$127K" },
//   { label: "Avg resolution time", value: "2.3 days" },
// ];

// // 🔥 Enhanced currency formatter that uses the contract's currency
// const formatCurrency = (value: number | undefined, currencyCode?: string, options?: Intl.NumberFormatOptions) => {
//   const currency = currencyCode || "INR"; // Default to INR
//   const symbols: Record<string, string> = {
//     'INR': '₹',
//     'USD': '$',
//     'EUR': '€',
//     'GBP': '£'
//   };
  
//   const symbol = symbols[currency] || currency;
//   const formattedNumber = new Intl.NumberFormat("en-US", { 
//     maximumFractionDigits: 0, 
//     ...options 
//   }).format(value ?? 0);
  
//   return `${symbol}${formattedNumber}`;
// };

// const truncate = (text: string | undefined, length = 140) => {
//   if (!text) return "";
//   if (text.length <= length) return text;
//   return `${text.slice(0, length).trim()}…`;
// };

// const generateMessageId = () => {
//   if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
//     return crypto.randomUUID();
//   }
//   return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
// };

// const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// const parseInvoiceDate = (value?: string | null) => {
//   if (!value) return null;
//   const trimmed = value.trim();
//   if (!trimmed) return null;

//   const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//   if (isoMatch) {
//     const [, yearStr, monthStr, dayStr] = isoMatch;
//     const dt = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
//     if (!Number.isNaN(dt.getTime())) {
//       return dt;
//     }
//   }

//   const direct = Date.parse(trimmed);
//   if (!Number.isNaN(direct)) {
//     return new Date(direct);
//   }

//   const normalized = trimmed.replace(/\./g, "/").replace(/-/g, "/");
//   const parts = normalized.split("/");
//   if (parts.length === 3 && parts.every((part) => part && /^\d+$/.test(part))) {
//     const [first, second, rawYear] = parts.map((part) => parseInt(part, 10));
//     const year = rawYear < 100 ? rawYear + 2000 : rawYear;
//     const candidateOrders = [
//       { month: first, day: second },
//       { month: second, day: first },
//     ];
//     for (const candidate of candidateOrders) {
//       const { month, day } = candidate;
//       if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
//         const dt = new Date(year, month - 1, day);
//         if (!Number.isNaN(dt.getTime())) return dt;
//       }
//     }
//   }

//   const monthNameMatch = trimmed.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
//   if (monthNameMatch) {
//     const parsed = Date.parse(trimmed.replace(/(\d+)(st|nd|rd|th)/, "$1"));
//     if (!Number.isNaN(parsed)) {
//       return new Date(parsed);
//     }
//   }

//   return null;
// };

// const Dashboard = () => {
//   const [searchParams] = useSearchParams();
//   const jobId = searchParams.get("job");
//   const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [selectedRange, setSelectedRange] = useState("Last 6 months");
//   const [openEvidenceKey, setOpenEvidenceKey] = useState<string | null>(null);
//   const [viewerClause, setViewerClause] = useState<{ doc: ExtractedDocument; evidence: DiscrepancyEvidence } | null>(
//     null,
//   );
//   const [viewerDimensions, setViewerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
//   const [pdfScale, setPdfScale] = useState(2.5);
//   const [autoScale, setAutoScale] = useState(2.5);
//   const viewerContainerRef = useRef<HTMLDivElement | null>(null);
//   const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<any | null>(null);
//   type ChatMessage = {
//     id: string;
//     role: "user" | "assistant";
//     content: string;
//     streaming?: boolean;
//     sources?: Array<{ text?: string; source_type?: string; reference?: string }>;
//   };
//   const [chatOpen, setChatOpen] = useState(false);
//   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
//     {
//       id: generateMessageId(),
//       role: "assistant",
//       content: "Hi! I'm your ContractGuard Copilot. Ask me anything about this audit.",
//     },
//   ]);
//   const [chatInput, setChatInput] = useState("");
//   const [chatLoading, setChatLoading] = useState(false);

//   useEffect(() => {
//     if (!jobId) {
//       setAnalysis(null);
//       return;
//     }
//     const controller = new AbortController();
//     setLoading(true);
//     setError(null);
//     fetch(`${API_BASE}/analysis/${jobId}/summary`, { signal: controller.signal })
//       .then(async (res) => {
//         if (!res.ok) throw new Error(`Request failed (${res.status})`);
//         const payload = (await res.json()) as AnalysisSummary;
//         // 🔥 ADD THIS: Log raw API response
//         console.log("📡 Raw API Response:", payload);
//         console.log("📋 Discrepancies:", payload.discrepancies);
//         payload.discrepancies?.forEach((disc, idx) => {
//           console.log(`  ${idx + 1}. ${disc.issue} | Date: ${disc.invoice_date} | Value: ${disc.value}`);
//         });
//         setAnalysis(payload);
//       })
//       .catch((err) => {
//         if (err.name !== "AbortError") {
//           setError(err.message || "Failed to load job data.");
//         }
//       })
//       .finally(() => {
//         setLoading(false);
//       });
//     return () => controller.abort();
//   }, [jobId]);

//   const metrics = (analysis?.job.metrics ?? {}) as JobMetrics;
//   // 🔥 ADD THIS: Extract currency from GPT-4o rules
//   const contractCurrency = (metrics.gpt4o_rules as any)?.currency || 
//   (metrics as any)?.currency || 
//   "INR";
  
//   const billingSummary: BillingSummary = metrics.billing_summary ?? {
//     total_billed: 0,
//     invoice_count: 0,
//     avg_invoice: 0,
//     largest_invoice: 0,
//     customers: [],
//   };
//   const clauseDistribution = metrics.clause_distribution ?? {};
//   const discrepancies = analysis?.discrepancies ?? [];
//   const llmSummary = metrics.llm_summary as string | undefined;
//   const clauseHits = metrics.total_clauses ?? 0;
//   const recoverableAmount = metrics.recoverable_amount ?? 0;
//   const documents = (metrics.documents as ExtractedDocument[] | undefined) ?? [];
//   const billingFiles = (metrics.billing_files as BillingFile[] | undefined) ?? [];
//   const billingSources = billingSummary.sources ?? [];
//   const viewerUrl =
//     viewerClause && jobId && viewerClause.doc.filename
//       ? `${API_BASE}/jobs/${jobId}/contracts/${encodeURIComponent(viewerClause.doc.filename)}`
//       : undefined;
//   const viewerHighlight =
//     viewerClause?.evidence.bounds ||
//     viewerClause?.evidence.regions?.find((region) => region.bounds)?.bounds ||
//     null;
//   const viewerPage =
//     viewerClause?.evidence.regions?.find((region) => typeof region.page === "number")?.page ||
//     viewerClause?.evidence.page ||
//     viewerClause?.doc.clauses?.find((clause) => clause.file === viewerClause?.doc.filename)?.page ||
//     1;

//   const openClauseReference = (reference: DiscrepancyEvidence) => {
//     if (!jobId || reference.type !== "contract_clause") return;
//     const doc = documents.find((document) => document.filename === reference.file);
//     if (!doc) return;
//     setViewerClause({ doc, evidence: reference });
//   };

//   const closeViewer = () => {
//     setViewerClause(null);
//     setViewerDimensions({ width: 0, height: 0 });
//     setPdfScale(2.5);
//     setAutoScale(2.5);
//   };

//   const streamAssistantMessage = useCallback(
//     async (messageId: string, text: string, sources?: ChatMessage["sources"]) => {
//       if (!text) {
//         setChatMessages((prev) =>
//           prev.map((msg) => (msg.id === messageId ? { ...msg, streaming: false, sources } : msg)),
//         );
//         return;
//       }

//       let index = 0;
//       const chunkSize = Math.max(12, Math.floor(text.length / 80) || 1);

//       while (index < text.length) {
//         index = Math.min(text.length, index + chunkSize);
//         const next = text.slice(0, index);
//         setChatMessages((prev) =>
//           prev.map((msg) => (msg.id === messageId ? { ...msg, content: next } : msg)),
//         );
//         await delay(18);
//       }

//       setChatMessages((prev) =>
//         prev.map((msg) =>
//           msg.id === messageId ? { ...msg, content: text, streaming: false, sources } : msg,
//         ),
//       );
//     },
//     [setChatMessages],
//   );

//   const handleChatSend = async () => {
//     if (!chatInput.trim() || !jobId) return;
//     const question = chatInput.trim();
//     const assistantId = generateMessageId();
//     setChatMessages((prev) => [
//       ...prev,
//       { id: generateMessageId(), role: "user", content: question },
//       { id: assistantId, role: "assistant", content: "", streaming: true },
//     ]);
//     setChatInput("");
//     setChatLoading(true);
//     try {
//       const res = await fetch(`${API_BASE}/analysis/${jobId}/chat`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ question }),
//       });
//       if (!res.ok) {
//         throw new Error("Failed to fetch chat response");
//       }
//       const data = await res.json();
//       const answer = data.answer ?? "I couldn't fetch a response right now.";
//       await streamAssistantMessage(assistantId, answer, data.sources ?? undefined);
//     } catch (err) {
//       await streamAssistantMessage(
//         assistantId,
//         "Sorry, I'm having trouble reaching the server. Please try again.",
//       );
//     } finally {
//       setChatLoading(false);
//     }
//   };

//   const highlightCards = useMemo(() => {
//     if (!analysis) return defaultMetricHighlights;
//     return [
//       {
//         label: "Recoverable revenue",
//         value: formatCurrency(recoverableAmount, contractCurrency),
//         delta: `${billingSummary.invoice_count ?? 0} invoices audited`,
//         trend: "+12% vs last audit",
//         icon: Zap,
//       },
//       {
//         label: "Active escalations",
//         value: `${discrepancies.length} ${discrepancies.length === 1 ? 'issue' : 'issues'}`,
//         delta: recoverableAmount > 0 
//           ? `${formatCurrency(recoverableAmount, contractCurrency)} total leakage`
//           : "All contracts compliant",
//         trend: discrepancies.length > 0 ? "Action required" : "All clear",
//         icon: AlertTriangle,
//       },
//       {
//         label: "Automated audits",
//         value: `${billingSummary.invoice_count ?? 0}`,
//         delta: `${billingSummary.customers?.length ?? 0} customers reconciled`,
//         trend: "Coverage 100%",
//         icon: ShieldCheck,
//       },
//       {
//         label: "AI extractions",
//         value: `${clauseHits} clauses`,
//         delta: metrics.llm_insights?.length ? `${metrics.llm_insights.length} insights generated` : "LLM insights ready",
//         trend: metrics.llm_insights?.length ? "Review pending" : "All reviewed",
//         icon: Sparkles,
//       },
//       {
//         label: "Recovery in progress",
//         value: formatCurrency(recoverableAmount, contractCurrency),
//         delta: `${billingSummary.customers?.length ?? 0} customers rebilled`,
//         trend: "On track",
//         icon: CircleCheck,
//       },
//     ];
//   }, [analysis, billingSummary, clauseHits, discrepancies.length, metrics.llm_insights, recoverableAmount]);

//   const leakageTrend = useMemo(() => {
//     const categorize = (issue?: string) => {
//       const text = (issue || "").toLowerCase();
//       if (text.includes("discount")) return "discounts";
//       if (text.includes("renewal")) return "renewals";
//       return "escalators";
//     };
  
//     // 🔥 FIX 1: Extract invoice dates from discrepancies with better fallback
//     const discrepancyDates = discrepancies
//       .map((discrepancy) => {
//         // Try primary date first
//         const primaryDate = parseInvoiceDate(discrepancy.invoice_date);
//         if (primaryDate) return { date: primaryDate, disc: discrepancy };
        
//         // Try evidence dates
//         const evidenceDate = discrepancy.evidence?.find((ev: any) => ev.invoice_date)?.invoice_date;
//         const parsed = parseInvoiceDate(evidenceDate);
//         if (parsed) return { date: parsed, disc: discrepancy };
        
//         return null;
//       })
//       .filter((item): item is { date: Date; disc: typeof discrepancies[number] } => !!item);
  
//     const now = new Date();
//     const earliest =
//       discrepancyDates.reduce(
//         (min, current) => (current.date < min ? current.date : min),
//         discrepancyDates[0]?.date ?? now,
//       ) || now;
  
//     const monthsDiff =
//       (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth());
//     const bucketCount = Math.min(Math.max(monthsDiff + 1, 6), 18);
//     const start = new Date(now.getFullYear(), now.getMonth() - (bucketCount - 1), 1);
  
//     // 🔥 FIX 2: Create month buckets with proper keys
//     const monthBuckets = Array.from({ length: bucketCount }).map((_, idx) => {
//       const current = new Date(start.getFullYear(), start.getMonth() + idx, 1);
//       const label = current.toLocaleString("default", { month: "short", year: "2-digit" });
//       // Key format: "YYYY-MM" for reliable matching
//       const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
//       return {
//         key,
//         month: label,
//         escalators: 0,
//         discounts: 0,
//         renewals: 0,
//       };
//     });
  
//     const bucketMap = monthBuckets.reduce<Record<string, typeof monthBuckets[number]>>((acc, bucket) => {
//       acc[bucket.key] = bucket;
//       return acc;
//     }, {});
  
//     // 🔥 FIX 3: Properly map discrepancies to buckets
//     discrepancyDates.forEach(({ date, disc }) => {
//       // Create consistent key format: "YYYY-MM"
//       const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
//       const bucket = bucketMap[key];
      
//       if (bucket) {
//         const category = categorize(disc.issue);
//         const value = Math.round(disc.value ?? 0);
//         bucket[category as "escalators" | "discounts" | "renewals"] += value;
//       } else {
//         // Fallback: add to the last bucket if date is out of range
//         const lastBucket = monthBuckets[monthBuckets.length - 1];
//         const category = categorize(disc.issue);
//         const value = Math.round(disc.value ?? 0);
//         lastBucket[category as "escalators" | "discounts" | "renewals"] += value;
//       }
//     });
  
//     // 🔥 FIX 4: Add debug logging (remove this after testing)
//     console.log('📊 Leakage Trend Debug:', {
//       discrepancyCount: discrepancies.length,
//       datesExtracted: discrepancyDates.length,
//       buckets: monthBuckets,
//       bucketMap: Object.keys(bucketMap)
//     });
  
//     return monthBuckets;
//   }, [discrepancies]);

//   const discrepancyAlerts = useMemo(() => {
//     if (!analysis) return defaultContractAlerts;
//     if (!discrepancies.length) {
//       return [
//         {
//           id: "all-clear",
//           customer: "All clear",
//           issue: "No discrepancies detected in this run.",
//           value: "$0",
//           due: "You’re in great shape",
//           priority: "low",
//           raw: null,
//         },
//       ];
//     }
//     return discrepancies.map((alert, idx) => ({
//       id: `${alert.customer ?? "unknown"}-${alert.issue ?? "issue"}-${idx}`,
//       customer: alert.customer ?? "Unknown customer",
//       issue: alert.issue ?? "Issue pending triage",
//       value: formatCurrency(alert.value ?? 0, contractCurrency),
//       due: alert.due ?? "No due date",
//       priority: (alert.priority ?? "medium").toLowerCase(),
//       evidence: alert.evidence ?? [],
//       raw: alert,
//     }));
//   }, [analysis, discrepancies]);

//   const teamStatsComputed = useMemo(() => {
//     if (!analysis) return teamStats;
//     return [
//       { label: "Invoices reconciled", value: `${billingSummary.invoice_count ?? 0}` },
//       { label: "Customers audited", value: `${billingSummary.customers?.length ?? 0}` },
//       { label: "Clause hits", value: `${clauseHits}` },
//     ];
//   }, [analysis, billingSummary.customers?.length, billingSummary.invoice_count, clauseHits]);

//   const primaryDiscrepancy = discrepancies[0];
//   const patternSummary = llmSummary || "LLM insights will appear here once a job completes.";

//   const vendorRisk = useMemo(() => {
//     if (!analysis) return null;
//     const leakage = recoverableAmount;
//     const discrepancyCount = discrepancies.length;
//     const highSeverity = discrepancies.filter(
//       (item) => (item.priority || "").toLowerCase() === "high" || (item.issue || "").toLowerCase().includes("critical"),
//     ).length;
//     const score = Math.min(100, Math.round(45 + leakage / 1000 + discrepancyCount * 6 + highSeverity * 12));
//     const level = score >= 75 ? "High" : score >= 55 ? "Medium" : "Low";
//     const summary =
//       level === "High"
//         ? "Immediate review recommended. Multiple leakage risks detected."
//         : level === "Medium"
//           ? "Monitor closely and schedule a follow-up audit."
//           : "Healthy contract. Continue periodic audits.";
//     return {
//       score,
//       level,
//       summary,
//       discrepancyCount,
//       leakage,
//       highSeverity,
//     };
//   }, [analysis, recoverableAmount, discrepancies]);

// const ChartTooltipContent = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
//   if (!active || !payload || !payload.length) return null;
//   return (
//     <div className="rounded-xl border border-border bg-card/95 px-3 py-2 text-xs space-y-1 shadow-lg">
//       {payload.map((item) => (
//         <p key={item.dataKey} className="flex items-center justify-between gap-4">
//           <span className="text-muted-foreground">{chartFriendlyLabel[item.dataKey as keyof typeof chartFriendlyLabel]}</span>
//           <span className="font-semibold text-foreground">{item.value}</span>
//         </p>
//       ))}
//     </div>
//   );
// };

// const chartFriendlyLabel = {
//   escalators: "Escalator misses",
//   discounts: "Discount drift",
//   renewals: "Unbilled renewals",
// };

//   const chartConfig = useMemo<ChartConfig>(
//     () => ({
//       escalators: { label: "Escalator misses", color: "hsl(var(--cta))" },
//       discounts: { label: "Discount drift", color: "hsl(var(--primary))" },
//       renewals: { label: "Unbilled renewals", color: "hsl(var(--success))" },
//     }),
//     [],
//   );

//   const evidenceSectionRef = useRef<HTMLDivElement | null>(null);

//   const scrollToEvidence = () => {
//     evidenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
//   };

//   return (
//     <div className="min-h-screen bg-background text-foreground">
//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
//         {error && (
//           <div className="rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive px-4 py-3 text-sm">
//             {error}
//           </div>
//         )}
//         {!jobId && (
//           <div className="rounded-2xl border border-border bg-card/90 text-sm text-muted-foreground px-4 py-3">
//             Upload a contract + billing run to see live metrics here. Showing sample data until a job is provided.
//           </div>
//         )}
//         <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
//           <div>
//             <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Operations cockpit</p>
//             <h1 className="text-4xl font-bold text-primary mt-2">ContractGuard Dashboard</h1>
//             <p className="text-muted-foreground mt-3 max-w-2xl">
//               Monitor automated audits, review AI insights, and dispatch revenue recovery workstreams—all in one place.
//             </p>
//           </div>
//           <div className="flex flex-wrap gap-3 items-center">
//             <select
//               className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
//               value={selectedRange}
//               onChange={(event) => setSelectedRange(event.target.value)}
//             >
//               {dateRanges.map((range) => (
//                 <option key={range} value={range}>
//                   {range}
//                 </option>
//               ))}
//             </select>
//             <Button variant="secondary" className="gap-2">
//               <Calendar className="h-4 w-4" />
//               Schedule audit
//             </Button>
//             <Button variant="cta" className="gap-2">
//               <Layers className="h-4 w-4" />
//               Run new analysis
//             </Button>
//           </div>
//         </header>

//         <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
//           {highlightCards.map((metric, index) => (
//             <div
//               key={metric.label}
//               className="rounded-2xl border border-border bg-gradient-to-br from-card/90 to-card/60 p-5 shadow-card space-y-3 transition-transform duration-200 hover:-translate-y-1 hover:shadow-2xl relative overflow-hidden"
//               style={{
//                 backgroundImage: `linear-gradient(135deg, rgba(56, 189, 248, ${0.08 + index * 0.03}), rgba(15, 23, 42, 0.85))`,
//               }}
//             >
//               <div className="flex items-start justify-between">
//                 <div>
//                   <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">{metric.label}</p>
//                   <p className="text-3xl font-bold text-foreground mt-2">{metric.value}</p>
//                 </div>
//                 <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
//                   <metric.icon className="h-5 w-5" />
//                 </div>
//               </div>
//               <div className="flex items-center justify-between text-xs text-muted-foreground">
//                 <span>{metric.delta}</span>
//                 <span className="text-cta font-semibold">{metric.trend}</span>
//               </div>
//               {metric.label === "AI extractions" && clauseHits > 0 && metrics.llm_insights?.length ? (
//                 <Button variant="ghost" size="sm" className="gap-2 text-cta p-0 h-auto" onClick={scrollToEvidence}>
//                   <TriangleAlert className="h-4 w-4" />
//                   Review AI insights
//                 </Button>
//               ) : null}
//               <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.35),_transparent_65%)]" />
//             </div>
//           ))}
//         </section>

//         <section className="grid gap-6 lg:grid-cols-3">
//           <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 shadow-hover p-6">
//             <div className="flex items-center justify-between mb-4">
//               <div>
//                 <p className="text-sm text-muted-foreground">Leakage trend</p>
//                 <h2 className="text-xl font-semibold">Monthly recoverable revenue</h2>
//               </div>
//               <Button variant="ghost" size="sm" className="gap-2">
//                 <RefreshCw className="h-4 w-4" />
//                 View all {discrepancyAlerts.length} discrepancies
//               </Button>
//             </div>
//             <div data-chart="leakage" className="h-72 flex justify-center">
//               <ChartStyle id="leakage" config={chartConfig} />
//               <ResponsiveContainer>
//                 <BarChart data={leakageTrend} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
//                   <defs>
//                     <linearGradient id="escalatorGradient" x1="0" y1="0" x2="0" y2="1">
//                       <stop offset="5%" stopColor="var(--color-escalators)" stopOpacity={0.9} />
//                       <stop offset="95%" stopColor="var(--color-escalators)" stopOpacity={0.2} />
//                     </linearGradient>
//                     <linearGradient id="discountGradient" x1="0" y1="0" x2="0" y2="1">
//                       <stop offset="5%" stopColor="var(--color-discounts)" stopOpacity={0.9} />
//                       <stop offset="95%" stopColor="var(--color-discounts)" stopOpacity={0.2} />
//                     </linearGradient>
//                     <linearGradient id="renewalGradient" x1="0" y1="0" x2="0" y2="1">
//                       <stop offset="5%" stopColor="var(--color-renewals)" stopOpacity={0.9} />
//                       <stop offset="95%" stopColor="var(--color-renewals)" stopOpacity={0.2} />
//                     </linearGradient>
//                   </defs>
//                   <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
//                   <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
//                   <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
//                   <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.15)" }} />
//                   <Bar dataKey="escalators" stackId="a" fill="url(#escalatorGradient)" radius={[8, 8, 0, 0]} />
//                   <Bar dataKey="discounts" stackId="a" fill="url(#discountGradient)" radius={[8, 8, 0, 0]} />
//                   <Bar dataKey="renewals" stackId="a" fill="url(#renewalGradient)" radius={[8, 8, 0, 0]} />
//                 </BarChart>
//               </ResponsiveContainer>
//             </div>
//             <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
//               <p className="flex items-center gap-2 text-foreground">
//                 <span>
//                   📈 Escalator hits detected: {clauseDistribution.cpi_uplift ?? clauseDistribution.escalators ?? 0}
//                 </span>
//               </p>
//               <p>💡 Tip: Schedule CPI clause audits monthly to prevent leakage.</p>
//             </div>
//           </div>

//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-5">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">AI audit status</p>
//                 <h3 className="text-xl font-semibold">Extraction health</h3>
//               </div>
//               <Activity className="h-5 w-5 text-success" />
//             </div>
//             <ResponsiveContainer width="100%" height={180}>
//               <AreaChart data={leakageTrend}>
//                 <defs>
//                   <linearGradient id="accuracy" x1="0" y1="0" x2="0" y2="1">
//                     <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.8} />
//                     <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
//                   </linearGradient>
//                 </defs>
//                 <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
//                 <YAxis hide />
//                 <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
//                 <Tooltip />
//                 <Area
//                   type="monotone"
//                   dataKey="escalators"
//                   stroke="hsl(var(--success))"
//                   fillOpacity={1}
//                   fill="url(#accuracy)"
//                 />
//               </AreaChart>
//             </ResponsiveContainer>
//             <div className="space-y-3 text-sm text-muted-foreground">
//               <p>
//                 <span className="text-foreground font-semibold">{clauseHits}</span> clause references parsed from the
//                 latest upload.
//               </p>
//               <p>
//                 <span className="text-foreground font-semibold">{billingSummary.invoice_count ?? 0} invoices</span>{" "}
//                 reconciled in this run.
//               </p>
//             </div>
//             <Button variant="secondary" size="sm" className="gap-2">
//               <TriangleAlert className="h-4 w-4 text-cta" />
//               View AI summary
//             </Button>
//           </div>
//         </section>

//         <section className="grid gap-6 lg:grid-cols-3">
//           <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 shadow-hover p-6">
//             <div className="flex items-center justify-between mb-4">
//               <div>
//                 <p className="text-sm text-muted-foreground">Discrepancies</p>
//                 <h3 className="text-xl font-semibold">Prioritized contract alerts</h3>
//               </div>
//               <div className="flex flex-wrap gap-2">
//                 <Button variant="ghost" size="sm" className="gap-2">
//                   Review all {discrepancyAlerts.length} discrepancies
//                   <ArrowUpRight className="h-4 w-4" />
//                 </Button>
//                 <div className="flex gap-2">
//                   <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
//                     <option>All discrepancies</option>
//                     <option>Escalator</option>
//                     <option>Discount</option>
//                     <option>Renewal</option>
//                   </select>
//                   <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
//                     <option>Priority: All</option>
//                     <option>High</option>
//                     <option>Medium</option>
//                     <option>Low</option>
//                   </select>
//                   <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
//                     <option>Amount: Any</option>
//                     <option>&gt; $10K</option>
//                     <option>&gt; $5K</option>
//                     <option>&gt; $1K</option>
//                   </select>
//                 </div>
//               </div>
//             </div>
//             <div className="divide-y divide-border/60">
//               {discrepancyAlerts.map((alert, index) => (
//                 <div key={alert.id ?? `alert-${index}`} className="py-4 flex flex-col gap-3">
//                   <div className="flex flex-wrap items-center gap-4">
//                     <div className="flex-1 min-w-[200px]">
//                       <p className="font-semibold text-foreground flex items-center gap-2">
//                         {alert.customer}
//                         <span
//                           className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
//                           alert.priority === "high"
//                               ? "bg-destructive/10 text-destructive"
//                               : alert.priority === "medium"
//                                 ? "bg-cta/10 text-cta"
//                                 : "bg-secondary/60 text-foreground"
//                           }`}
//                         >
//                           {alert.priority.toUpperCase()}
//                         </span>
//                       </p>
//                       <p className="text-sm text-muted-foreground">{alert.issue}</p>
//                     </div>
//                     <p className="text-foreground font-mono">{alert.value}</p>
//                     <p className="text-sm text-muted-foreground">{alert.due}</p>
//                   </div>
//                   <div className="flex flex-wrap gap-2">
//                     <Button variant="secondary" size="sm">
//                       View Evidence
//                     </Button>
//                     <Button variant="secondary" size="sm">
//                       Mark Resolved
//                     </Button>
//                     <Button variant="secondary" size="sm">
//                       Export Report
//                     </Button>
//                     <Button variant="secondary" size="sm">
//                       Notify Customer
//                     </Button>
//                     <Button variant="secondary" size="sm" onClick={() => setSelectedDiscrepancy(alert.raw ?? alert)}>
//                       View details
//                     </Button>
//                     <Button
//                       variant="ghost"
//                       size="sm"
//                       className="text-cta"
//                       onClick={() => setOpenEvidenceKey(openEvidenceKey === alert.id ? null : alert.id)}
//                     >
//                       {openEvidenceKey === alert.id ? "Hide references" : "View references"}
//                     </Button>
//                   </div>
//                   {openEvidenceKey === alert.id && (
//                     <div className="bg-secondary/40 border border-border/60 rounded-2xl p-3 text-xs text-muted-foreground space-y-2">
//                       {alert.evidence?.length ? (
//                         alert.evidence.map((item, index) => (
//                           <div key={`${alert.id}-evidence-${index}`} className="space-y-1">
//                             <p className="text-sm font-semibold text-foreground flex items-center gap-2">
//                               {item.type === "contract_clause" ? `Clause: ${item.label}` : `Invoice: ${item.reference}`}
//                               {item.type === "contract_clause" && (
//                                 <Button
//                                   variant="link"
//                                   size="sm"
//                                   className="p-0 h-auto text-cta"
//                                   onClick={() => openClauseReference(item)}
//                                 >
//                                   View in contract
//                                 </Button>
//                               )}
//                             </p>
//                             {item.text && <p className="italic">“{item.text}”</p>}
//                             <p>
//                               {item.amount !== undefined && (
//                                   <span>{formatCurrency(item.amount, contractCurrency)} • </span>
//                                 )}
//                               {item.period && <span>{item.period} • </span>}
//                               {item.file && <span>Source: {item.file}</span>}
//                             </p>
//                             {item.notes && <p>Note: {item.notes}</p>}
//                           </div>
//                         ))
//                       ) : (
//                         <p>No structured evidence attached.</p>
//                       )}
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </div>

//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-5">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">Latest activity</p>
//                 <h3 className="text-xl font-semibold">Audit timeline</h3>
//               </div>
//               <Button variant="secondary" size="sm">
//                 Export log
//               </Button>
//             </div>
//             <div className="space-y-4">
//               {activityFeed.map((item) => (
//                 <div key={`${item.actor}-${item.time}`} className="flex gap-3">
//                   <div className="w-2 h-2 rounded-full bg-primary mt-2" />
//                   <div>
//                     <p className="text-sm font-semibold text-foreground">{item.actor}</p>
//                     <p className="text-xs text-muted-foreground mb-1">{item.time}</p>
//                     <p className="text-sm text-muted-foreground">{item.detail}</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         <section ref={evidenceSectionRef} className="grid gap-6 lg:grid-cols-2">
//         <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-sm text-muted-foreground flex items-center gap-2">
//                 <Target className="h-4 w-4 text-cta" />
//                 Recommended next action
//               </p>
//               <p className="text-2xl font-bold text-foreground mt-1">
//                 {primaryDiscrepancy
//                   ? `Contact ${primaryDiscrepancy.customer ?? "customer"} about ${primaryDiscrepancy.issue}`
//                   : "Keep monitoring your contracts"}
//               </p>
//             </div>
//             {primaryDiscrepancy?.due && (
//               <span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">
//                 {primaryDiscrepancy.due}
//               </span>
//             )}
//           </div>
//           <p className="text-sm text-muted-foreground">
//             {primaryDiscrepancy ? (
//               <>
//                 {/* 🔥 IMPROVED: Show total across all related discrepancies */}
//                 <span className="font-semibold text-foreground">
//                   {formatCurrency(recoverableAmount, contractCurrency)} at risk
//                 </span>
//                 {discrepancies.length > 1 && (
//                   <span> across {discrepancies.length} invoice{discrepancies.length === 1 ? '' : 's'}</span>
//                 )}
//                 {". "}
//                 {/* Show earliest invoice date */}
//                 {(() => {
//                   const dates = discrepancies
//                     .map(d => d.invoice_date)
//                     .filter((d): d is string => !!d)
//                     .sort();
//                   if (dates.length > 0) {
//                     const earliestDate = new Date(dates[0]);
//                     const monthYear = earliestDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
//                     return `Escalation missing since ${monthYear}.`;
//                   }
//                   return primaryDiscrepancy.issue + ".";
//                 })()}
//               </>
//             ) : (
//               "No discrepancies at the moment. Stay proactive by scheduling periodic audits."
//             )}
//           </p>
//           <div className="flex flex-wrap gap-3">
//             <Button variant="cta" className="gap-2">
//               <Mail className="h-4 w-4" />
//               Draft email
//             </Button>
//             <Button variant="secondary" className="gap-2">
//               <FileText className="h-4 w-4" />
//               View contract
//             </Button>
//             <Button variant="secondary" className="gap-2">
//               <ArrowUpRight className="h-4 w-4" />
//               Open discrepancy
//             </Button>
//           </div>
//         </div>
//           <div className="rounded-3xl border border-border bg-card/95 shadow-hover p-0 overflow-hidden">
//             <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 bg-gradient-to-r from-primary/10 to-transparent">
//               <div>
//                 <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
//                   <Lightbulb className="h-4 w-4" />
//                   LLM Insight Center
//                 </p>
//                 <p className="text-2xl font-bold text-foreground mt-1">
//                   {primaryDiscrepancy?.customer ?? "GPT-4o Analysis"}
//                 </p>
//               </div>
//               <div className="text-xs text-muted-foreground text-right">
//                 <p>Model: GPT-4o</p>
//                 <p>{metrics.llm_insights?.length ?? 0} insights generated</p>
//               </div>
//             </div>
//             <div className="grid md:grid-cols-[2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border/60">
//               <div className="p-6 max-h-80 overflow-auto pr-2">
//                 <ReactMarkdown
//                   remarkPlugins={[remarkGfm]}
//                   className="prose prose-invert prose-sm leading-relaxed space-y-3"
//                 >
//                   {patternSummary}
//                 </ReactMarkdown>
//               </div>
//               <div className="p-6 space-y-4 bg-secondary/20">
//                 <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
//                   <p className="font-semibold text-foreground mb-1">Suggestion</p>
//                   Correlate clause hits with billing gaps to trigger alerts before renewals. Automate a CPI guardrail
//                   for Acme Cloud’s renewal workflow.
//                 </div>
//                 <Button variant="secondary" className="w-full gap-2">
//                   <BellRing className="h-4 w-4" />
//                   Create alert rule
//                 </Button>
//               </div>
//             </div>
//           </div>
//         </section>

//         <section className="grid gap-6 lg:grid-cols-2">
//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 flex items-center gap-6">
//             <div>
//               <p className="text-sm font-semibold uppercase tracking-[0.3em] text-success flex items-center gap-2">
//                 ● System Status
//               </p>
//               <h3 className="text-2xl font-bold text-foreground mt-2">All systems operational</h3>
//               <p className="text-sm text-muted-foreground mt-2">
//                 NetSuite + CRM connectors synced minutes ago. AI auditing agents are live and monitoring renewals.
//               </p>
//             </div>
//             <div className="text-sm text-muted-foreground border-l border-border pl-4">
//               <p>Last sync</p>
//               <p className="text-foreground font-semibold">2 minutes ago</p>
//               <p className="mt-3">Upcoming jobs</p>
//               <ul className="list-disc ml-4">
//                 <li>Renewal ingestion @ 10:00 PM</li>
//                 <li>Invoice reconciliation @ 1:00 AM</li>
//               </ul>
//             </div>
//           </div>
//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">Team activity</p>
//                 <h3 className="text-xl font-semibold">Performance snapshot</h3>
//               </div>
//               <Users className="h-5 w-5 text-primary" />
//             </div>
//             <div className="rounded-2xl border border-border/70 p-4 bg-secondary/30">
//               <p className="text-sm text-muted-foreground">Top resolver</p>
//               <p className="text-lg font-semibold text-foreground">{topResolver.name}</p>
//               <p className="text-sm text-muted-foreground">
//                 Resolved {topResolver.resolved} discrepancies • Recovered {topResolver.recovered}
//               </p>
//             </div>
//             <div className="grid sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
//               {teamStatsComputed.map((stat) => (
//                 <div key={stat.label} className="rounded-2xl border border-border/70 p-4">
//                   <p className="text-xs uppercase tracking-widest">{stat.label}</p>
//                   <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         <section className="grid gap-6 lg:grid-cols-2">
//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">Vendor risk scorecard</p>
//                 <h3 className="text-2xl font-semibold">{analysis?.job.vendor_name}</h3>
//               </div>
//               {vendorRisk && (
//                 <div className="text-right">
//                   <p className="text-4xl font-bold text-foreground">{vendorRisk.score}</p>
//                   <p
//                     className={`text-xs font-semibold ${
//                       vendorRisk.level === "High"
//                         ? "text-destructive"
//                         : vendorRisk.level === "Medium"
//                           ? "text-cta"
//                           : "text-success"
//                     }`}
//                   >
//                     {vendorRisk.level} risk
//                   </p>
//                 </div>
//               )}
//             </div>
//             {vendorRisk && (
//               <>
//                 <p className="text-sm text-muted-foreground">{vendorRisk.summary}</p>
//                 <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
//                   <div className="rounded-2xl border border-border/60 p-3">
//                     <p className="text-xs uppercase tracking-widest">Leakage</p>
//                     <p className="text-xl font-semibold text-foreground mt-1">
//                       {formatCurrency(vendorRisk.leakage, contractCurrency)}
//                     </p>
//                   </div>
//                   <div className="rounded-2xl border border-border/60 p-3">
//                     <p className="text-xs uppercase tracking-widest">Issues</p>
//                     <p className="text-xl font-semibold text-foreground mt-1">{vendorRisk.discrepancyCount}</p>
//                   </div>
//                   <div className="rounded-2xl border border-border/60 p-3">
//                     <p className="text-xs uppercase tracking-widest">Critical</p>
//                     <p className="text-xl font-semibold text-foreground mt-1">{vendorRisk.highSeverity}</p>
//                   </div>
//                 </div>
//               </>
//             )}
//             <Button variant="secondary" className="w-fit">
//               Export scorecard
//             </Button>
//           </div>
//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">Source documents</p>
//                 <h3 className="text-xl font-semibold">Contract evidence trail</h3>
//               </div>
//             </div>
//             <div className="space-y-4">
//               {documents.length ? (
//                 documents.map((doc, idx) => (
//                   <div key={`${doc.filename}-${idx}`} className="rounded-2xl border border-border/60 p-4">
//                     <p className="text-sm font-semibold text-foreground">{doc.filename ?? "Contract"}</p>
//                     <p className="text-xs text-muted-foreground">
//                       {doc.clauses?.length ?? 0} clause references • Stored at {doc.storage_path}
//                     </p>
//                   {doc.clauses?.slice(0, 2).map((clause, clauseIdx) => (
//                     <div key={`${doc.filename}-clause-${clauseIdx}`} className="text-xs text-muted-foreground mt-2">
//                       <p>
//                         <span className="font-semibold uppercase tracking-wide">{clause.label}</span>:{" "}
//                         {truncate(clause.text ?? "", 160)}
//                       </p>
//                       <Button
//                         variant="link"
//                         size="sm"
//                         className="p-0 h-auto text-cta"
//                         onClick={() =>
//                           openClauseReference({
//                             type: "contract_clause",
//                             label: clause.label,
//                             text: clause.text,
//                             page: clause.page,
//                             confidence: clause.confidence,
//                             file: doc.filename,
//                             regions: clause.regions,
//                             bounds: clause.regions?.[0]?.bounds,
//                           })
//                         }
//                       >
//                         View in contract
//                       </Button>
//                     </div>
//                   ))}
//                   </div>
//                 ))
//               ) : (
//                 <p className="text-sm text-muted-foreground">Upload contracts to see extracted clauses.</p>
//               )}
//             </div>
//           </div>
//           <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-4">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-sm text-muted-foreground">Billing exports</p>
//                 <h3 className="text-xl font-semibold">Invoice evidence trail</h3>
//               </div>
//             </div>
//             <div className="space-y-3 text-sm text-muted-foreground">
//               <p>
//                 Files processed: {billingFiles.length ? billingFiles.map((file) => file.filename).join(", ") : "N/A"}
//               </p>
//               <p>
//                 Sources detected: {billingSources.length ? billingSources.join(", ") : "Not recorded (local import)"}
//               </p>
//             </div>
//             <div className="space-y-3">
//               {billingSummary.customers?.length ? (
//                 billingSummary.customers.slice(0, 3).map((customer) => (
//                   <div key={customer.customer} className="rounded-2xl border border-border/70 p-4">
//                     <p className="text-sm font-semibold text-foreground">{customer.customer}</p>
//                     <p className="text-xs text-muted-foreground">
//                       {customer.invoice_count} invoices • {formatCurrency(customer.total, contractCurrency)}
//                     </p>
//                   </div>
//                 ))
//               ) : (
//                 <p className="text-sm text-muted-foreground">Upload billing files to trace invoice math.</p>
//               )}
//             </div>
//           </div>
//         </section>
//         {loading && (
//           <div className="text-sm text-muted-foreground animate-pulse">
//             Syncing the latest audit signals…
//           </div>
//         )}
//       </div>

//       <Dialog open={!!selectedDiscrepancy} onOpenChange={(open) => (!open ? setSelectedDiscrepancy(null) : null)}>
//         <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
//           {selectedDiscrepancy && (
//             <>
//               <DialogHeader>
//                 <DialogTitle className="text-2xl">
//                   {selectedDiscrepancy.issue ?? "Discrepancy detail"} —{" "}
//                   {formatCurrency(selectedDiscrepancy.value ?? 0, contractCurrency)}
//                 </DialogTitle>
//               </DialogHeader>
//               <div className="space-y-4 text-sm text-muted-foreground">
//                 <p>
//                   <span className="font-semibold text-foreground">Priority:</span>{" "}
//                   {selectedDiscrepancy.priority ?? "—"}
//                 </p>
//                 <p>
//                   <span className="font-semibold text-foreground">Customer:</span>{" "}
//                   {selectedDiscrepancy.customer ?? "—"}
//                 </p>
//                 <p>
//                   <span className="font-semibold text-foreground">Recommended action:</span>{" "}
//                   {selectedDiscrepancy.recommended_action ?? "Review contract and rebill vendor."}
//                 </p>
//                 <div className="rounded-2xl border border-border/60 p-4 bg-secondary/20 space-y-2">
//                   <p className="font-semibold text-foreground text-sm">Invoice evidence</p>
//                   {selectedDiscrepancy.evidence?.filter((item: any) => item.type !== "contract_clause").length ? (
//                     selectedDiscrepancy.evidence
//                       ?.filter((item: any) => item.type !== "contract_clause")
//                       .map((item: any, idx: number) => (
//                         <div key={`invoice-evidence-${idx}`} className="flex justify-between text-xs py-1 border-b border-border/30">
//                           <div>
//                             <p className="font-semibold text-foreground">{item.reference ?? `Invoice ${idx + 1}`}</p>
//                             <p>{item.description}</p>
//                           </div>
//                           <div className="text-right">
//                             <p>{item.invoice_date ?? "—"}</p>
//                             <p className="font-mono text-destructive">
//                               -{formatCurrency(item.leakage_amount ?? 0, contractCurrency)}
//                             </p>
//                           </div>
//                         </div>
//                       ))
//                   ) : (
//                     <p className="text-xs">No invoice evidence was attached.</p>
//                   )}
//                 </div>
//                 <div className="rounded-2xl border border-border/60 p-4 bg-secondary/20 space-y-2">
//                   <p className="font-semibold text-foreground text-sm">Contract references</p>
//                   {selectedDiscrepancy.evidence?.filter((item: any) => item.type === "contract_clause").length ? (
//                     selectedDiscrepancy.evidence
//                       ?.filter((item: any) => item.type === "contract_clause")
//                       .map((item: any, idx: number) => (
//                         <div key={`clause-evidence-${idx}`} className="text-xs space-y-1">
//                           <p className="font-semibold text-foreground">{item.label}</p>
//                           <p>{item.text}</p>
//                         </div>
//                       ))
//                   ) : (
//                     <p className="text-xs">No clause references were linked.</p>
//                   )}
//                 </div>
//               </div>
//             </>
//           )}
//         </DialogContent>
//       </Dialog>

//       <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
//         {chatOpen && (
//           <div className="w-80 rounded-3xl border border-border bg-card/95 shadow-2xl p-4 space-y-3">
//             <div className="flex items-center justify-between">
//               <div>
//                 <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">AI Copilot</p>
//                 <p className="text-sm font-semibold text-foreground">ContractGuard assistant</p>
//               </div>
//               <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)}>
//                 ×
//               </Button>
//             </div>
//             <div className="h-64 overflow-auto space-y-3 pr-1">
//               {chatMessages.map((message) => (
//                 <div
//                   key={message.id}
//                   className={`rounded-2xl px-3 py-2 text-sm ${
//                     message.role === "assistant" ? "bg-secondary/40 text-foreground" : "bg-primary/20 text-foreground"
//                   }`}
//                 >
//                   <ReactMarkdown
//                     remarkPlugins={[remarkGfm]}
//                     className="prose prose-invert prose-sm max-w-none leading-relaxed whitespace-pre-wrap"
//                   >
//                     {message.content || (message.streaming ? "…" : "")}
//                   </ReactMarkdown>
//                   {message.streaming && (
//                     <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
//                       <Loader2 className="h-3 w-3 animate-spin" />
//                       <span>Generating…</span>
//                     </div>
//                   )}
//                   {message.sources && message.sources.length > 0 && (
//                     <div className="mt-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2 space-y-1">
//                       <p className="font-semibold text-foreground/80">References</p>
//                       {message.sources.map((source, sourceIdx) => (
//                         <p key={`${message.id}-source-${sourceIdx}`}>
//                           {source.reference || `Source ${sourceIdx + 1}`} • {source.source_type}
//                         </p>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//             <Textarea
//               value={chatInput}
//               onChange={(e) => setChatInput(e.target.value)}
//               placeholder="Ask about this audit…"
//               className="min-h-[60px]"
//             />
//             <Button
//               variant="cta"
//               className="w-full"
//               disabled={!chatInput.trim() || chatLoading}
//               onClick={handleChatSend}
//             >
//               {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask AI"}
//             </Button>
//           </div>
//         )}
//         {!chatOpen && (
//           <Button variant="hero" className="shadow-xl" onClick={() => setChatOpen(true)}>
//             Ask AI Copilot
//           </Button>
//         )}
//       </div>

//       <Sheet open={!!viewerClause} onOpenChange={(open) => (!open ? closeViewer() : null)}>
//         <SheetContent
//           side="right"
//           className="w-full lg:w-[95vw] max-w-[1600px] p-0 flex flex-col border-l border-border bg-background"
//         >
//           <SheetHeader className="p-6 border-b border-border/60">
//             <SheetTitle className="text-lg">
//               {viewerClause?.doc.filename ?? "Contract preview"}
//               {viewerClause?.evidence.label && (
//                 <span className="ml-2 text-xs font-normal uppercase tracking-widest text-muted-foreground">
//                   {viewerClause.evidence.label}
//                 </span>
//               )}
//             </SheetTitle>
//           </SheetHeader>
//           {viewerClause && viewerUrl ? (
//             <div className="flex-1 flex flex-col">
//               <div className="px-6 py-3 border-b border-border/60 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
//                 <span>Highlighting page {viewerPage}. Use the controls to zoom the PDF.</span>
//                 <div className="flex items-center gap-2 text-xs text-muted-foreground">
//                   Zoom {pdfScale.toFixed(1)}×
//                   <div className="flex rounded-lg border border-border overflow-hidden">
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-8 w-8"
//                       onClick={() => setPdfScale((prev) => Math.max(1, +(prev - 0.3).toFixed(1)))}
//                     >
//                       −
//                     </Button>
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-8 w-8"
//                       onClick={() => setPdfScale(autoScale)}
//                     >
//                       100%
//                     </Button>
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-8 w-8"
//                       onClick={() => setPdfScale((prev) => Math.min(5, +(prev + 0.3).toFixed(1)))}
//                     >
//                       +
//                     </Button>
//                   </div>
//                 </div>
//               </div>
//               <div className="flex-1 overflow-auto bg-secondary/30 px-2 py-2">
//                 <div ref={viewerContainerRef} className="relative mx-auto min-w-fit">
//                   <PdfDocument file={viewerUrl} loading={<p>Loading contract…</p>}>
//                     <PdfPage
//                       key={`${viewerPage}-${pdfScale}`}
//                       pageNumber={viewerPage ?? 1}
//                       scale={pdfScale}
//                       renderAnnotationLayer={false}
//                       renderTextLayer={false}
//                       onRenderSuccess={(page) => {
//                         const viewport = page.getViewport({ scale: pdfScale });
//                         setViewerDimensions({ width: viewport.width, height: viewport.height });
//                         const containerWidth = viewerContainerRef.current?.clientWidth ?? viewport.width;
//                         const containerHeight = viewerContainerRef.current?.clientHeight ?? viewport.height;
//                         const widthScale = containerWidth / viewport.width;
//                         const heightScale = containerHeight / viewport.height;
//                         const bestFit = pdfScale * Math.min(widthScale, heightScale);
//                         if (Number.isFinite(bestFit) && bestFit > 0) {
//                           setAutoScale(bestFit);
//                         }
//                       }}
//                     />
//                   </PdfDocument>
//                   {viewerHighlight && viewerDimensions.width > 0 && viewerDimensions.height > 0 && (
//                     <div
//                       className="absolute border-2 border-cta bg-cta/30 rounded-md pointer-events-none transition-all shadow-lg"
//                       style={{
//                         left: viewerHighlight.x * viewerDimensions.width,
//                         top: viewerHighlight.y * viewerDimensions.height,
//                         width: viewerHighlight.width * viewerDimensions.width,
//                         height: viewerHighlight.height * viewerDimensions.height,
//                       }}
//                     />
//                   )}
//                 </div>
//               </div>
//             </div>
//           ) : (
//             <div className="p-6 text-sm text-muted-foreground">
//               Unable to load the original document. Please re-upload the contract.
//             </div>
//           )}
//         </SheetContent>
//       </Sheet>
//     </div>
//   );
// };

// export default Dashboard;

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
  Loader2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  invoice_date?: string;
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
    vendor_name?: string;
    metrics: JobMetrics;
  };
  discrepancies: Array<{
    customer?: string;
    issue?: string;
    value?: number;
    priority?: string;
    due?: string;
    invoice_date?: string;
    evidence?: DiscrepancyEvidence[];
  }>;
};

const defaultMetricHighlights = [
  {
    label: "Recoverable revenue",
    value: "$63,400",
    delta: "+18% vs last audit",
    trend: "↑ Increased",
    icon: Zap,
    priority: "high",
  },
  {
    label: "Active escalations",
    value: "12 contracts",
    delta: "5 due this week",
    trend: "Action required",
    icon: AlertTriangle,
    priority: "critical",
  },
  {
    label: "Automated audits",
    value: "312",
    delta: "90% coverage",
    trend: "Coverage 100%",
    icon: ShieldCheck,
    priority: "medium",
  },
  {
    label: "AI extractions",
    value: "85% accuracy",
    delta: "Low confidence: 6 items",
    trend: "Review pending",
    icon: Sparkles,
    priority: "medium",
  },
  {
    label: "Recovery progress",
    value: "$41,200",
    delta: "Rebilling 8 customers",
    trend: "On track",
    icon: CircleCheck,
    priority: "low",
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
    id: "sample-acme",
    customer: "Acme Cloud",
    issue: "CPI uplift never posted",
    value: "$18,400",
    due: "Renewal in 5 days",
    priority: "high",
  },
  {
    id: "sample-brightops",
    customer: "BrightOps",
    issue: "Volume tier drift (SOW-11)",
    value: "$9,800",
    due: "Invoice pending",
    priority: "medium",
  },
  {
    id: "sample-northwind",
    customer: "Northwind MSP",
    issue: "Unbilled add-ons",
    value: "$6,200",
    due: "Flagged yesterday",
    priority: "high",
  },
  {
    id: "sample-ledgerstack",
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

const formatCurrency = (value: number | undefined, currencyCode?: string, options?: Intl.NumberFormatOptions) => {
  const currency = currencyCode || "INR";
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

const generateMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseInvoiceDate = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    const dt = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    if (!Number.isNaN(dt.getTime())) {
      return dt;
    }
  }

  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
  }

  const normalized = trimmed.replace(/\./g, "/").replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length === 3 && parts.every((part) => part && /^\d+$/.test(part))) {
    const [first, second, rawYear] = parts.map((part) => parseInt(part, 10));
    const year = rawYear < 100 ? rawYear + 2000 : rawYear;
    const candidateOrders = [
      { month: first, day: second },
      { month: second, day: first },
    ];
    for (const candidate of candidateOrders) {
      const { month, day } = candidate;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }
  }

  const monthNameMatch = trimmed.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (monthNameMatch) {
    const parsed = Date.parse(trimmed.replace(/(\d+)(st|nd|rd|th)/, "$1"));
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
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
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<any | null>(null);
  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    streaming?: boolean;
    sources?: Array<{ text?: string; source_type?: string; reference?: string }>;
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: generateMessageId(),
      role: "assistant",
      content: "Hi! I'm your ContractGuard Copilot. Ask me anything about this audit.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

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

  const streamAssistantMessage = useCallback(
    async (messageId: string, text: string, sources?: ChatMessage["sources"]) => {
      if (!text) {
        setChatMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, streaming: false, sources } : msg)),
        );
        return;
      }

      let index = 0;
      const chunkSize = Math.max(12, Math.floor(text.length / 80) || 1);

      while (index < text.length) {
        index = Math.min(text.length, index + chunkSize);
        const next = text.slice(0, index);
        setChatMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, content: next } : msg)),
        );
        await delay(18);
      }

      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: text, streaming: false, sources } : msg,
        ),
      );
    },
    [setChatMessages],
  );

  const handleChatSend = async () => {
    if (!chatInput.trim() || !jobId) return;
    const question = chatInput.trim();
    const assistantId = generateMessageId();
    setChatMessages((prev) => [
      ...prev,
      { id: generateMessageId(), role: "user", content: question },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analysis/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        throw new Error("Failed to fetch chat response");
      }
      const data = await res.json();
      const answer = data.answer ?? "I couldn't fetch a response right now.";
      await streamAssistantMessage(assistantId, answer, data.sources ?? undefined);
    } catch (err) {
      await streamAssistantMessage(
        assistantId,
        "Sorry, I'm having trouble reaching the server. Please try again.",
      );
    } finally {
      setChatLoading(false);
    }
  };

  // 🔥 ENHANCED: Better highlight cards with priority-based ordering
  const highlightCards = useMemo(() => {
    if (!analysis) return defaultMetricHighlights;
    
    const hasIssues = discrepancies.length > 0;
    
    return [
      {
        label: "Active escalations",
        value: hasIssues 
          ? `${discrepancies.length} ${discrepancies.length === 1 ? 'issue' : 'issues'}` 
          : "All clear",
        delta: hasIssues
          ? `${formatCurrency(recoverableAmount, contractCurrency)} at risk`
          : "No leakage detected",
        trend: hasIssues ? "⚠️ Action required" : "✓ Healthy",
        icon: AlertTriangle,
        priority: "critical",
        actionable: true,
      },
      {
        label: "Recoverable revenue",
        value: formatCurrency(recoverableAmount, contractCurrency),
        delta: `${billingSummary.invoice_count ?? 0} invoices audited`,
        trend: hasIssues ? "↑ +12% vs last audit" : "No leakage",
        icon: Zap,
        priority: "high",
        actionable: false,
      },
      {
        label: "Audit coverage",
        value: `${billingSummary.invoice_count ?? 0}/${billingSummary.invoice_count ?? 0}`,
        delta: `${billingSummary.customers?.length ?? 0} vendors monitored`,
        trend: "✓ 100% coverage",
        icon: ShieldCheck,
        priority: "medium",
        actionable: false,
      },
      {
        label: "AI confidence",
        value: `${clauseHits} clauses`,
        delta: metrics.llm_insights?.length 
          ? `${metrics.llm_insights.length} insights generated` 
          : "LLM insights ready",
        trend: "✓ High confidence",
        icon: Sparkles,
        priority: "medium",
        actionable: clauseHits > 0 && metrics.llm_insights?.length,
      },
      {
        label: "Recovery progress",
        value: hasIssues ? "In progress" : "Complete",
        delta: hasIssues 
          ? `${discrepancies.length} cases pending`
          : "All cleared",
        trend: "→ On track",
        icon: CircleCheck,
        priority: "low",
        actionable: false,
      },
    ];
  }, [analysis, billingSummary, clauseHits, discrepancies.length, metrics.llm_insights, recoverableAmount, contractCurrency]);

  const leakageTrend = useMemo(() => {
    const categorize = (issue?: string) => {
      const text = (issue || "").toLowerCase();
      if (text.includes("discount")) return "discounts";
      if (text.includes("renewal")) return "renewals";
      return "escalators";
    };
  
    const discrepancyDates = discrepancies
      .map((discrepancy) => {
        const primaryDate = parseInvoiceDate(discrepancy.invoice_date);
        if (primaryDate) return { date: primaryDate, disc: discrepancy };
        
        const evidenceDate = discrepancy.evidence?.find((ev: any) => ev.invoice_date)?.invoice_date;
        const parsed = parseInvoiceDate(evidenceDate);
        if (parsed) return { date: parsed, disc: discrepancy };
        
        return null;
      })
      .filter((item): item is { date: Date; disc: typeof discrepancies[number] } => !!item);
  
    const now = new Date();
    const earliest =
      discrepancyDates.reduce(
        (min, current) => (current.date < min ? current.date : min),
        discrepancyDates[0]?.date ?? now,
      ) || now;
  
    const monthsDiff =
      (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth());
    const bucketCount = Math.min(Math.max(monthsDiff + 1, 6), 18);
    const start = new Date(now.getFullYear(), now.getMonth() - (bucketCount - 1), 1);
  
    const monthBuckets = Array.from({ length: bucketCount }).map((_, idx) => {
      const current = new Date(start.getFullYear(), start.getMonth() + idx, 1);
      const label = current.toLocaleString("default", { month: "short", year: "2-digit" });
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        month: label,
        escalators: 0,
        discounts: 0,
        renewals: 0,
      };
    });
  
    const bucketMap = monthBuckets.reduce<Record<string, typeof monthBuckets[number]>>((acc, bucket) => {
      acc[bucket.key] = bucket;
      return acc;
    }, {});
  
    discrepancyDates.forEach(({ date, disc }) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const bucket = bucketMap[key];
      
      if (bucket) {
        const category = categorize(disc.issue);
        const value = Math.round(disc.value ?? 0);
        bucket[category as "escalators" | "discounts" | "renewals"] += value;
      } else {
        const lastBucket = monthBuckets[monthBuckets.length - 1];
        const category = categorize(disc.issue);
        const value = Math.round(disc.value ?? 0);
        lastBucket[category as "escalators" | "discounts" | "renewals"] += value;
      }
    });
  
    return monthBuckets;
  }, [discrepancies]);

  const discrepancyAlerts = useMemo(() => {
    if (!analysis) return defaultContractAlerts;
    if (!discrepancies.length) {
      return [
        {
          id: "all-clear",
          customer: "All clear",
          issue: "No discrepancies detected in this run.",
          value: "$0",
          due: "You're in great shape",
          priority: "low",
          raw: null,
        },
      ];
    }
    return discrepancies.map((alert, idx) => ({
      id: `${alert.customer ?? "unknown"}-${alert.invoice_date ?? idx}-${idx}`,
      customer: alert.customer ?? "Unknown customer",
      issue: alert.issue ?? "Issue pending triage",
      value: formatCurrency(alert.value ?? 0, contractCurrency),
      due: alert.due ?? "Needs review",
      priority: (alert.priority ?? "medium").toLowerCase(),
      evidence: alert.evidence ?? [],
      raw: alert,
    }));
  }, [analysis, discrepancies, contractCurrency]);

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

  const vendorRisk = useMemo(() => {
    if (!analysis) return null;
    const leakage = recoverableAmount;
    const discrepancyCount = discrepancies.length;
    const highSeverity = discrepancies.filter(
      (item) => (item.priority || "").toLowerCase() === "high" || (item.issue || "").toLowerCase().includes("critical"),
    ).length;
    const score = Math.min(100, Math.round(45 + leakage / 1000 + discrepancyCount * 6 + highSeverity * 12));
    const level = score >= 75 ? "High" : score >= 55 ? "Medium" : "Low";
    const summary =
      level === "High"
        ? "Immediate review recommended. Multiple leakage risks detected."
        : level === "Medium"
          ? "Monitor closely and schedule a follow-up audit."
          : "Healthy contract. Continue periodic audits.";
    return {
      score,
      level,
      summary,
      discrepancyCount,
      leakage,
      highSeverity,
    };
  }, [analysis, recoverableAmount, discrepancies]);

const ChartTooltipContent = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2 text-xs space-y-1 shadow-lg">
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{chartFriendlyLabel[item.dataKey as keyof typeof chartFriendlyLabel]}</span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </p>
      ))}
    </div>
  );
};

const chartFriendlyLabel = {
  escalators: "Escalator misses",
  discounts: "Discount drift",
  renewals: "Unbilled renewals",
};

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      escalators: { label: "Escalator misses", color: "hsl(var(--cta))" },
      discounts: { label: "Discount drift", color: "hsl(var(--primary))" },
      renewals: { label: "Unbilled renewals", color: "hsl(var(--success))" },
    }),
    [],
  );

  const evidenceSectionRef = useRef<HTMLDivElement | null>(null);
  const discrepanciesSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToEvidence = () => {
    evidenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToDiscrepancies = () => {
    discrepanciesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 🔥 NEW: Helper to determine card styling based on priority
  const getCardGradient = (priority: string, hasIssues: boolean) => {
    if (priority === "critical" && hasIssues) {
      return "linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(15, 23, 42, 0.85))";
    }
    if (priority === "high" && hasIssues) {
      return "linear-gradient(135deg, rgba(251, 146, 60, 0.12), rgba(15, 23, 42, 0.85))";
    }
    return "linear-gradient(135deg, rgba(56, 189, 248, 0.08), rgba(15, 23, 42, 0.85))";
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

        {/* 🔥 ENHANCED: Improved metric cards */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {highlightCards.map((metric, index) => {
            const hasIssues = metric.priority === "critical" && discrepancies.length > 0;
            const isActionable = metric.actionable;
            
            return (
              <div
                key={metric.label}
                className={`rounded-2xl border p-5 shadow-card space-y-3 transition-all duration-200 relative overflow-hidden group ${
                  hasIssues 
                    ? 'border-destructive/30 hover:border-destructive/60' 
                    : 'border-border hover:border-primary/40'
                } ${
                  isActionable ? 'cursor-pointer hover:-translate-y-1 hover:shadow-2xl' : ''
                }`}
                style={{
                  backgroundImage: getCardGradient(metric.priority, hasIssues),
                }}
                onClick={() => {
                  if (metric.label === "Active escalations" && discrepancies.length > 0) {
                    scrollToDiscrepancies();
                  } else if (metric.label === "AI confidence" && clauseHits > 0) {
                    scrollToEvidence();
                  }
                }}
              >
                {/* 🔥 NEW: Status badge for critical items */}
                {hasIssues && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-destructive text-destructive-foreground animate-pulse">
                      Critical
                    </span>
                  </div>
                )}
                
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                      {metric.label}
                    </p>
                    <p className="text-3xl font-bold text-foreground mt-2">{metric.value}</p>
                  </div>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-inner ${
                    hasIssues ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'
                  }`}>
                    <metric.icon className="h-5 w-5" />
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{metric.delta}</span>
                  <span className={`font-semibold flex items-center gap-1 ${
                    hasIssues ? 'text-destructive' : 'text-cta'
                  }`}>
                    {metric.trend.includes('↑') && <TrendingUp className="h-3 w-3" />}
                    {metric.trend.includes('↓') && <TrendingDown className="h-3 w-3" />}
                    {metric.trend}
                  </span>
                </div>
                
                {/* 🔥 NEW: Hover arrow for actionable cards */}
                {isActionable && (
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 pointer-events-none">
                    <ArrowRight className="h-4 w-4 text-primary animate-pulse" />
                  </div>
                )}
                
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.35),_transparent_65%)]" />
              </div>
            );
          })}
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
                  <defs>
                    <linearGradient id="escalatorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-escalators)" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="var(--color-escalators)" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="discountGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-discounts)" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="var(--color-discounts)" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="renewalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-renewals)" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="var(--color-renewals)" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.15)" }} />
                  <Bar dataKey="escalators" stackId="a" fill="url(#escalatorGradient)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="discounts" stackId="a" fill="url(#discountGradient)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="renewals" stackId="a" fill="url(#renewalGradient)" radius={[8, 8, 0, 0]} />
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

        {/* 🔥 ADD REF HERE */}
        <section ref={discrepanciesSectionRef} className="grid gap-6 lg:grid-cols-3">
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
                    <option>&gt; ₹10K</option>
                    <option>&gt; ₹5K</option>
                    <option>&gt; ₹1K</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {discrepancyAlerts.map((alert, index) => (
                <div key={alert.id ?? `alert-${index}`} className="py-4 flex flex-col gap-3">
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
                    {alert.due && alert.due !== "No due date" && (
                      <p className="text-sm text-muted-foreground">{alert.due}</p>
                    )}
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
                    <Button variant="secondary" size="sm" onClick={() => setSelectedDiscrepancy(alert.raw ?? alert)}>
                      View details
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
                            {item.text && <p className="italic">"{item.text}"</p>}
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
            {primaryDiscrepancy?.due && primaryDiscrepancy.due !== "No due date" && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">
                {primaryDiscrepancy.due}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {primaryDiscrepancy ? (
              <>
                <span className="font-semibold text-foreground">
                  {formatCurrency(recoverableAmount, contractCurrency)} at risk
                </span>
                {discrepancies.length > 1 ? (
                  <>
                    {" across "}
                    <span className="font-semibold text-foreground">
                      {discrepancies.length} invoices
                    </span>
                    {(() => {
                      const dates = discrepancies.map(d => d.invoice_date).filter((d): d is string => !!d).sort();
                      if (dates.length > 0) {
                        const earliest = new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        const latest = new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        return dates.length > 1 ? ` (${earliest} - ${latest})` : ` in ${earliest}`;
                      }
                      return "";
                    })()}
                  </>
                ) : null}
                {". "}
                {primaryDiscrepancy.issue}.
              </>
            ) : (
              "No discrepancies at the moment. Stay proactive by scheduling periodic audits."
            )}
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
          <div className="rounded-3xl border border-border bg-card/95 shadow-hover p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 bg-gradient-to-r from-primary/10 to-transparent">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  LLM Insight Center
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {primaryDiscrepancy?.customer ?? "GPT-4o Analysis"}
                </p>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <p>Model: GPT-4o</p>
                <p>{metrics.llm_insights?.length ?? 0} insights generated</p>
              </div>
            </div>
            <div className="grid md:grid-cols-[2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border/60">
              <div className="p-6 max-h-80 overflow-auto pr-2">
                {/* 🔥 NEW: Invoice breakdown */}
                {discrepancies.length > 1 && (
                  <div className="mb-4 p-3 rounded-lg border border-border/60 bg-secondary/30 text-xs">
                    <p className="font-semibold text-foreground mb-2">Affected Invoices:</p>
                    <div className="space-y-1">
                      {discrepancies.slice(0, 6).map((disc, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="text-muted-foreground">
                            {disc.invoice_date ? new Date(disc.invoice_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
                          </span>
                          <span className="font-mono text-destructive">
                            {formatCurrency(disc.value ?? 0, contractCurrency)}
                          </span>
                        </div>
                      ))}
                      {discrepancies.length > 6 && (
                        <p className="text-muted-foreground italic">
                          ... and {discrepancies.length - 6} more
                        </p>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border/40 flex justify-between font-semibold">
                      <span className="text-foreground">Total:</span>
                      <span className="text-destructive">
                        {formatCurrency(recoverableAmount, contractCurrency)}
                      </span>
                    </div>
                  </div>
                )}
                
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className="prose prose-invert prose-sm leading-relaxed space-y-3"
                >
                  {patternSummary}
                </ReactMarkdown>
              </div>
              <div className="p-6 space-y-4 bg-secondary/20">
                <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Suggestion</p>
                  Correlate clause hits with billing gaps to trigger alerts before renewals. Automate a CPI guardrail
                  for {primaryDiscrepancy?.customer ?? "customer"}'s renewal workflow.
                </div>
                <Button variant="secondary" className="w-full gap-2">
                  <BellRing className="h-4 w-4" />
                  Create alert rule
                </Button>
              </div>
            </div>
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
                <p className="text-sm text-muted-foreground">Vendor risk scorecard</p>
                <h3 className="text-2xl font-semibold">{analysis?.job.vendor_name}</h3>
              </div>
              {vendorRisk && (
                <div className="text-right">
                  <p className="text-4xl font-bold text-foreground">{vendorRisk.score}</p>
                  <p
                    className={`text-xs font-semibold ${
                      vendorRisk.level === "High"
                        ? "text-destructive"
                        : vendorRisk.level === "Medium"
                          ? "text-cta"
                          : "text-success"
                    }`}
                  >
                    {vendorRisk.level} risk
                  </p>
                </div>
              )}
            </div>
            {vendorRisk && (
              <>
                <p className="text-sm text-muted-foreground">{vendorRisk.summary}</p>
                <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                  <div className="rounded-2xl border border-border/60 p-3">
                    <p className="text-xs uppercase tracking-widest">Leakage</p>
                    <p className="text-xl font-semibold text-foreground mt-1">
                      {formatCurrency(vendorRisk.leakage, contractCurrency)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 p-3">
                    <p className="text-xs uppercase tracking-widest">Issues</p>
                    <p className="text-xl font-semibold text-foreground mt-1">{vendorRisk.discrepancyCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 p-3">
                    <p className="text-xs uppercase tracking-widest">Critical</p>
                    <p className="text-xl font-semibold text-foreground mt-1">{vendorRisk.highSeverity}</p>
                  </div>
                </div>
              </>
            )}
            <Button variant="secondary" className="w-fit">
              Export scorecard
            </Button>
          </div>
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

      <Dialog open={!!selectedDiscrepancy} onOpenChange={(open) => (!open ? setSelectedDiscrepancy(null) : null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedDiscrepancy && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {selectedDiscrepancy.issue ?? "Discrepancy detail"} —{" "}
                  {formatCurrency(selectedDiscrepancy.value ?? 0, contractCurrency)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">Priority:</span>{" "}
                  {selectedDiscrepancy.priority ?? "—"}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Customer:</span>{" "}
                  {selectedDiscrepancy.customer ?? "—"}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Recommended action:</span>{" "}
                  {selectedDiscrepancy.recommended_action ?? "Review contract and rebill vendor."}
                </p>
                <div className="rounded-2xl border border-border/60 p-4 bg-secondary/20 space-y-2">
                  <p className="font-semibold text-foreground text-sm">Invoice evidence</p>
                  {selectedDiscrepancy.evidence?.filter((item: any) => item.type !== "contract_clause").length ? (
                    selectedDiscrepancy.evidence
                      ?.filter((item: any) => item.type !== "contract_clause")
                      .map((item: any, idx: number) => (
                        <div key={`invoice-evidence-${idx}`} className="flex justify-between text-xs py-1 border-b border-border/30">
                          <div>
                            <p className="font-semibold text-foreground">{item.reference ?? `Invoice ${idx + 1}`}</p>
                            <p>{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p>{item.invoice_date ?? "—"}</p>
                            <p className="font-mono text-destructive">
                              -{formatCurrency(item.leakage_amount ?? 0, contractCurrency)}
                            </p>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-xs">No invoice evidence was attached.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-border/60 p-4 bg-secondary/20 space-y-2">
                  <p className="font-semibold text-foreground text-sm">Contract references</p>
                  {selectedDiscrepancy.evidence?.filter((item: any) => item.type === "contract_clause").length ? (
                    selectedDiscrepancy.evidence
                      ?.filter((item: any) => item.type === "contract_clause")
                      .map((item: any, idx: number) => (
                        <div key={`clause-evidence-${idx}`} className="text-xs space-y-1">
                          <p className="font-semibold text-foreground">{item.label}</p>
                          <p>{item.text}</p>
                        </div>
                      ))
                  ) : (
                    <p className="text-xs">No clause references were linked.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {chatOpen && (
          <div className="w-80 rounded-3xl border border-border bg-card/95 shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">AI Copilot</p>
                <p className="text-sm font-semibold text-foreground">ContractGuard assistant</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)}>
                ×
              </Button>
            </div>
            <div className="h-64 overflow-auto space-y-3 pr-1">
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    message.role === "assistant" ? "bg-secondary/40 text-foreground" : "bg-primary/20 text-foreground"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="prose prose-invert prose-sm max-w-none leading-relaxed whitespace-pre-wrap"
                  >
                    {message.content || (message.streaming ? "…" : "")}
                  </ReactMarkdown>
                  {message.streaming && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Generating…</span>
                    </div>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2 space-y-1">
                      <p className="font-semibold text-foreground/80">References</p>
                      {message.sources.map((source, sourceIdx) => (
                        <p key={`${message.id}-source-${sourceIdx}`}>
                          {source.reference || `Source ${sourceIdx + 1}`} • {source.source_type}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this audit…"
              className="min-h-[60px]"
            />
            <Button
              variant="cta"
              className="w-full"
              disabled={!chatInput.trim() || chatLoading}
              onClick={handleChatSend}
            >
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask AI"}
            </Button>
          </div>
        )}
        {!chatOpen && (
          <Button variant="hero" className="shadow-xl" onClick={() => setChatOpen(true)}>
            Ask AI Copilot
          </Button>
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

