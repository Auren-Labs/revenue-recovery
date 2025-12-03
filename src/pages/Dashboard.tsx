import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  MessageSquare,
  Copy,
  ChevronDown,
  ChevronUp,
  FileEdit,
  FileText as FileTextIcon,
  Coins,
} from "lucide-react";
import { getAuthHeader, logout, getCurrentUser } from "@/utils/auth";
import { ChartStyle, ChartConfig } from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";
import { ConfidenceBreakdown } from "@/components/ConfidenceBreakdown";
import { FindingStatusBadge } from "@/components/FindingStatusBadge";
import { DiscrepancyItem } from "@/components/DiscrepancyItem";
import { ContractChat } from "@/components/ContractChat";
import { DisputeLetter } from "@/components/DisputeLetter";
import { AuditTrail } from "@/components/AuditTrail";
import { ClassificationChart } from "@/components/ClassificationChart";
import { PerformanceMetrics } from "@/components/PerformanceMetrics";
import { EmptyState } from "@/components/EmptyState";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";
import { CustomerDrillDown } from "@/components/CustomerDrillDown";
import { PricingTimeline } from "@/components/PricingTimeline";
import { HelpCircle, Upload, FileSearch, CheckCircle2, History as HistoryIcon, Download, FileDown, Settings, User, LogOut, Wallet, Flame, X, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  gpt4o_rules?: {
    base_amount?: number;
    escalation_rate?: number;
    effective_start_date?: string;
    currency?: string;
    amendment_history?: Array<{
      date?: string;
      amount?: number;
      source?: string;
      description?: string;
    }>;
    pricing_timeline?: Array<{
      start_date: string;
      end_date?: string;
      amount: number;
      source: string;
      reason: string;
      invoice_count?: number;
      discrepancy_count?: number;
      total_leakage?: number;
      invoice_breakdown?: Array<{
        month: string;
        invoice_date: string;
        expected: number;
        billed: number;
        difference: number;
        has_discrepancy: boolean;
        invoice_number?: string;
        description?: string;
      }>;
    }>;
  };
};

type AnalysisSummary = {
  job: {
    id: string;
    status: string;
    vendor_name?: string;
    user_type?: string;
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
    confidence?: number;
    confidence_breakdown?: {
      overall?: number;
      overall_weighted?: number;
      overall_geometric?: number;
      components?: {
        classification?: { score: number; weight: number; reason: string };
        date_parsing?: { score: number; weight: number; reason: string };
        amount_match?: { score: number; weight: number; reason: string };
        contract_extraction?: { score: number; weight: number; reason: string };
        validation?: { score: number; weight: number; reason: string };
      };
      additional_factors?: Array<{
        name: string;
        score: number;
        weight: number;
        reason: string;
        details?: string;
      }>;
      weakest_component?: {
        name: string;
        score: number;
        reason: string;
      };
      explanation?: string;
    };
    finding_status?: string;
    validation_reason?: string;
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

import { formatCurrency as formatCurrencyUtil } from "@/utils/currency";

const formatCurrency = (value: number | undefined, currencyCode?: string, options?: Intl.NumberFormatOptions) => {
  return formatCurrencyUtil(value ?? 0, currencyCode || "INR", options);
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

// Backend sends ISO dates, so we just parse them directly
// No complex date parsing needed - backend handles all date formats
const parseInvoiceDate = (value?: string | null): Date | null => {
  if (!value) return null;
  try {
    const date = new Date(value); // Parse ISO string from backend
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState("Last 6 months");
  const user = getCurrentUser();
  
  // Stats for ticker - fetched from API
  const [stats, setStats] = useState({
    audits: 0,
    recovered: 0,
    avgSavings: 0,
    loading: true,
  });
  
  // Renewal intelligence state
  const [upcomingRenewals, setUpcomingRenewals] = useState<Array<{
    job_id: string;
    vendor_name: string;
    termination_date: string;
    days_until_renewal: number;
    recoverable_amount: number;
    currency: string;
    user_type: string;
    latest_alert?: any;
  }>>([]);
  const [renewalsLoading, setRenewalsLoading] = useState(false);
  const [openEvidenceKey, setOpenEvidenceKey] = useState<string | null>(null);
  const [viewerClause, setViewerClause] = useState<{ doc: ExtractedDocument; evidence: DiscrepancyEvidence } | null>(
    null,
  );
  const [viewerDimensions, setViewerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pdfScale, setPdfScale] = useState(1.0);
  const [autoScale, setAutoScale] = useState(1.0);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Reset scale when viewer opens with new document
  useEffect(() => {
    if (viewerClause) {
      setPdfScale(1.0);
    }
  }, [viewerClause]);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<any | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    streaming?: boolean;
    sources?: Array<{ text?: string; source_type?: string; reference?: string }>;
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [selectedDiscrepancyForArtifact, setSelectedDiscrepancyForArtifact] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: generateMessageId(),
      role: "assistant",
      content: "Hi! I'm your ContractGuard Copilot. Ask me anything about this audit.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [disputeLetterOpen, setDisputeLetterOpen] = useState(false);
  const [selectedDiscrepancyForDispute, setSelectedDiscrepancyForDispute] = useState<{
    id: string;
    discrepancy: any;
  } | null>(null);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  const [selectedDiscrepancyForAudit, setSelectedDiscrepancyForAudit] = useState<any>(null);
  const [splitViewOpen, setSplitViewOpen] = useState(false);
  const [splitViewData, setSplitViewData] = useState<{
    discrepancy: any;
    invoiceEvidence: any;
    contractEvidence: any;
  } | null>(null);
  const [splitViewPdfBlobUrl, setSplitViewPdfBlobUrl] = useState<string | null>(null);
  const [splitViewPdfScale, setSplitViewPdfScale] = useState(1.5);
  const [splitViewAutoScale, setSplitViewAutoScale] = useState(1.5);
  const [splitViewDimensions, setSplitViewDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Fetch stats for ticker (last 30 days)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/upload/history?limit=100`, {
          headers: getAuthHeader(),
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch audit history");
        }
        
        const data = await response.json();
        const jobs = data.jobs || [];
        
        // Calculate stats for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentJobs = jobs.filter((job: any) => {
          const jobDate = new Date(job.created_at);
          return jobDate >= thirtyDaysAgo && job.status === "completed";
        });
        
        const totalRecovered = recentJobs.reduce((sum: number, job: any) => {
          return sum + (job.recoverable_amount || 0);
        }, 0);
        
        const totalBilled = recentJobs.reduce((sum: number, job: any) => {
          return sum + (job.total_billed || 0);
        }, 0);
        
        const avgSavings = totalBilled > 0 
          ? parseFloat(((totalRecovered / totalBilled) * 100).toFixed(1))
          : 0;
        
        setStats({
          audits: recentJobs.length,
          recovered: totalRecovered,
          avgSavings: avgSavings,
          loading: false,
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };
    
    fetchStats();
  }, []);

  // Fetch upcoming renewals
  useEffect(() => {
    const fetchUpcomingRenewals = async () => {
      setRenewalsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/renewals/upcoming?limit=5`, {
          headers: getAuthHeader(),
        });
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            // User not authenticated or no access - silently fail
            setUpcomingRenewals([]);
            return;
          }
          throw new Error("Failed to fetch upcoming renewals");
        }
        
        const data = await response.json();
        setUpcomingRenewals(data.renewals || []);
      } catch (err) {
        console.error("Failed to fetch upcoming renewals:", err);
        setUpcomingRenewals([]);
      } finally {
        setRenewalsLoading(false);
      }
    };
    
    fetchUpcomingRenewals();
  }, []);

  useEffect(() => {
    if (!jobId) {
      setAnalysis(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/analysis/${jobId}/summary`, { 
      signal: controller.signal,
      headers: getAuthHeader(),
    })
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
  const displayRecoverable = Math.max(0, recoverableAmount);
  const hasPositiveLeakage = recoverableAmount > 0;
  const isNoLeakage = recoverableAmount <= 0;
  
  // Calculate annualized impact from RECURRING discrepancies
  const annualizedImpact = useMemo(() => {
    if (!discrepancies.length || recoverableAmount <= 0) return 0;
    
    // Filter discrepancies that are RECURRING based on:
    // 1. Invoice line item classification in evidence
    // 2. Discrepancy type (escalation, discount_drift are typically recurring)
    // 3. Issue description keywords
    const recurringDiscrepancies = discrepancies.filter((disc) => {
      // Check evidence array for invoice line items with RECURRING classification
      const invoiceLineEvidence = disc.evidence?.filter(
        (ev: any) => ev.type === "invoice_line_error" && ev.classification
      ) || [];
      
      // Check if any invoice line item is classified as RECURRING or RECURRING_FIXED
      const hasRecurring = invoiceLineEvidence.some((ev: any) => {
        const classification = (ev.classification || "").toUpperCase();
        return classification.includes("RECURRING");
      });
      
      // Check discrepancy type - these are typically recurring issues
      // Note: type might be in the issue description or we infer from issue text
      const recurringTypes = ["escalation", "discount_drift", "renewal_uplift"];
      const discType = (disc as any).type || "";
      const isRecurringType = recurringTypes.includes(discType.toLowerCase());
      
      // Check issue description for recurring keywords
      const issueText = (disc.issue || "").toLowerCase();
      const hasRecurringKeywords = 
        issueText.includes("recurring") ||
        issueText.includes("escalation") ||
        issueText.includes("monthly") ||
        issueText.includes("annual") ||
        issueText.includes("subscription") ||
        issueText.includes("renewal");
      
      return hasRecurring || isRecurringType || hasRecurringKeywords;
    });
    
    if (recurringDiscrepancies.length === 0) return 0;
    
    // Calculate total monthly recurring loss from recurring discrepancies
    const monthlyRecurringLoss = recurringDiscrepancies.reduce((sum, disc) => {
      return sum + (disc.value || 0);
    }, 0);
    
    // Annualize: multiply by 12 months
    // This shows the potential annual cost if the recurring issue continues
    return monthlyRecurringLoss * 12;
  }, [discrepancies, recoverableAmount]);
  
  // Deduplicate documents by filename to avoid showing duplicates
  // (same file might appear with different storage paths - local vs supabase)
  const allDocuments = (metrics.documents as ExtractedDocument[] | undefined) ?? [];
  const documents = useMemo(() => {
    const seen = new Set<string>();
    return allDocuments.filter((doc) => {
      // Use filename as the unique key (same file shouldn't appear twice)
      const key = doc.filename || 'unknown';
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [allDocuments]);
  const billingFiles = (metrics.billing_files as BillingFile[] | undefined) ?? [];
  const billingSources = billingSummary.sources ?? [];
  const viewerUrl =
    viewerClause && jobId && viewerClause.doc.filename
      ? `${API_BASE}/jobs/${jobId}/contracts/${encodeURIComponent(viewerClause.doc.filename)}`
      : undefined;

  // Fetch PDF as blob with auth headers when viewer opens
  useEffect(() => {
    if (!viewerUrl) {
      // Clean up blob URL when viewer closes
      setPdfBlobUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }

    let currentBlobUrl: string | null = null;
    let cancelled = false;

    // Fetch PDF with auth headers
    fetch(viewerUrl, {
      headers: getAuthHeader(),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          const blobUrl = URL.createObjectURL(blob);
          currentBlobUrl = blobUrl;
          setPdfBlobUrl(blobUrl);
        } else {
          URL.revokeObjectURL(URL.createObjectURL(blob));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Error loading PDF:", error);
          toast({
            title: "Failed to load PDF",
            description: error.message || "Could not load the contract file.",
            variant: "destructive",
          });
        }
      });

    // Cleanup function - revoke blob URL when component unmounts or viewerUrl changes
    return () => {
      cancelled = true;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
      setPdfBlobUrl((prev) => {
        if (prev && prev !== currentBlobUrl) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [viewerUrl, toast]);
  const viewerHighlight =
    viewerClause?.evidence.bounds ||
    viewerClause?.evidence.regions?.find((region) => region.bounds)?.bounds ||
    null;
  const viewerPage =
    viewerClause?.evidence.regions?.find((region) => typeof region.page === "number")?.page ||
    viewerClause?.evidence.page ||
    viewerClause?.doc.clauses?.find((clause) => clause.file === viewerClause?.doc.filename)?.page ||
    1;
  
  // Load PDF when split view opens
  useEffect(() => {
    if (!splitViewOpen || !splitViewData?.contractEvidence?.file || !jobId) {
      if (splitViewPdfBlobUrl) {
        URL.revokeObjectURL(splitViewPdfBlobUrl);
        setSplitViewPdfBlobUrl(null);
      }
      return;
    }
    
    const contractDoc = documents.find((d) => d.filename === splitViewData.contractEvidence.file);
    if (!contractDoc) return;
    
    const contractUrl = `${API_BASE}/jobs/${jobId}/contracts/${encodeURIComponent(contractDoc.filename)}`;
    
    // Fetch PDF as blob
    fetch(contractUrl, { headers: getAuthHeader() })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.statusText}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setSplitViewPdfBlobUrl(url);
      })
      .catch((err) => {
        console.error("Failed to load PDF for split view:", err);
        toast({
          title: "Failed to load PDF",
          description: err.message || "Could not load the contract file.",
          variant: "destructive",
        });
      });
    
    return () => {
      // Cleanup will happen when splitViewOpen changes
    };
  }, [splitViewOpen, splitViewData?.contractEvidence?.file, jobId, documents, toast]);

  const openClauseReference = (reference: DiscrepancyEvidence) => {
    if (!jobId || reference.type !== "contract_clause") return;
    const doc = documents.find((document) => document.filename === reference.file);
    if (!doc) return;
    
    // Debug: Log the evidence to see what data we have
    console.log("Opening clause reference:", {
      reference,
      hasBounds: !!reference.bounds,
      hasRegions: !!reference.regions,
      regions: reference.regions,
    });
    
    setViewerClause({ doc, evidence: reference });
  };

  const closeViewer = () => {
    setViewerClause(null);
    setViewerDimensions({ width: 0, height: 0 });
    setPdfScale(1.0);
    setAutoScale(1.0);
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
    const MAX_MESSAGES = 50;
    setChatMessages((prev) => {
      const newMessages: ChatMessage[] = [
        ...prev,
        { id: generateMessageId(), role: "user" as const, content: question },
        { id: assistantId, role: "assistant" as const, content: "", streaming: true },
      ];
      // Keep only last 50 messages to prevent memory leak
      return newMessages.slice(-MAX_MESSAGES);
    });
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analysis/${jobId}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
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
    
    const isVendor = analysis?.job.user_type === "vendor";
    
    return [
      {
        label: isVendor ? "Active undercharges" : "Active overcharges",
        value: hasIssues 
          ? `${discrepancies.length} ${discrepancies.length === 1 ? 'issue' : 'issues'}` 
          : "All clear",
        delta: hasIssues
          ? isVendor
            ? `${formatCurrency(recoverableAmount, contractCurrency)} in lost revenue`
            : `${formatCurrency(recoverableAmount, contractCurrency)} to recover`
          : isVendor
            ? "No revenue leakage detected"
            : "No billing errors detected",
        trend: hasIssues ? "⚠️ Action required" : "✓ Healthy",
        icon: AlertTriangle,
        priority: "critical",
        actionable: true,
      },
      {
        label: isVendor ? "Revenue leakage" : "Recoverable revenue",
        value: formatCurrency(recoverableAmount, contractCurrency),
        delta: annualizedImpact > 0 
          ? isVendor
            ? `Potential annual loss: ${formatCurrency(annualizedImpact, contractCurrency)}`
            : `Potential annual saving: ${formatCurrency(annualizedImpact, contractCurrency)}`
          : `${billingSummary.invoice_count ?? 0} invoices audited`,
        trend: (() => {
          if (!hasIssues) return isVendor ? "✓ No leakage" : "✓ No errors";
          if (annualizedImpact > 0) {
            return `📈 ${formatCurrency(annualizedImpact / 12, contractCurrency)}/mo ${isVendor ? 'recurring loss' : 'recurring'}`;
          }
          const totalBilled = billingSummary.total_billed || 1;
          const percentage = (recoverableAmount / totalBilled) * 100;
          if (percentage > 5) return `⚠️ ${percentage.toFixed(1)}% of total billed`;
          if (percentage > 2) return `↑ ${percentage.toFixed(1)}% ${isVendor ? 'leakage rate' : 'error rate'}`;
          return `→ ${percentage.toFixed(1)}% ${isVendor ? 'leakage rate' : 'error rate'}`;
        })(),
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
  }, [analysis, billingSummary, clauseHits, discrepancies, discrepancies.length, metrics.llm_insights, recoverableAmount, contractCurrency, annualizedImpact]);

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

  // Group discrepancies by customer/vendor based on mode
  const groupedDiscrepancies = useMemo(() => {
    if (!analysis || !discrepancies.length) return [];
    
    const isVendor = analysis.job.user_type === "vendor";
    
    const grouped = discrepancies.reduce((acc, disc) => {
      // For customers: group by vendor (disc.customer is the vendor name from invoice)
      // For vendors: group by customer (disc.customer is the customer name from invoice)
      // Fallback to job.vendor_name for customers if disc.customer is missing
      const groupKey = isVendor 
        ? (disc.customer || "Unknown Customer")
        : (disc.customer || analysis.job.vendor_name || "Unknown Vendor");
      
      const customer = groupKey;
      
      if (!acc[customer]) {
        acc[customer] = {
          customer,
          total: 0,
          count: 0,
          priority: disc.priority || "medium",
          earliest_date: disc.invoice_date || "",
          latest_date: disc.invoice_date || "",
          discrepancies: [],
        };
      }
      
      acc[customer].total += disc.value || 0;
      acc[customer].count += 1;
      acc[customer].discrepancies.push(disc);
      
      // Track date range
      if (disc.invoice_date) {
        if (!acc[customer].earliest_date || disc.invoice_date < acc[customer].earliest_date) {
          acc[customer].earliest_date = disc.invoice_date;
        }
        if (!acc[customer].latest_date || disc.invoice_date > acc[customer].latest_date) {
          acc[customer].latest_date = disc.invoice_date;
        }
      }
      
      // Update priority to highest
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const currentPriority = priorityOrder[acc[customer].priority?.toLowerCase() as keyof typeof priorityOrder] || 0;
      const discPriority = priorityOrder[(disc.priority || "medium").toLowerCase() as keyof typeof priorityOrder] || 0;
      if (discPriority > currentPriority) {
        acc[customer].priority = disc.priority || "medium";
      }
      
      return acc;
    }, {} as Record<string, {
      customer: string;
      total: number;
      count: number;
      priority: string;
      earliest_date: string;
      latest_date: string;
      discrepancies: typeof discrepancies[number][];
    }>);
    
    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [analysis, discrepancies]);

  const formatDateRange = (earliest: string, latest: string) => {
    if (!earliest || !latest) return "N/A";
    try {
      const start = new Date(earliest);
      const end = new Date(latest);
      if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
        return start.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      return `${start.toLocaleDateString("en-US", { month: "short", year: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
    } catch {
      return `${earliest} - ${latest}`;
    }
  };

  const discrepancyAlerts = useMemo(() => {
    if (!analysis) return defaultContractAlerts;
    if (!discrepancies.length) {
      return [
        {
          id: "all-clear",
          customer: "All clear",
          issue: analysis?.job.user_type === "vendor" 
            ? "No revenue leakage detected in this run."
            : "No overcharges detected in this run.",
          value: "$0",
          due: "You're in great shape",
          priority: "low",
          raw: null,
        },
      ];
    }
    return discrepancies.map((alert, idx) => ({
      id: `${analysis?.job.vendor_name ?? alert.customer ?? "unknown"}-${alert.invoice_date ?? idx}-${idx}`,
      customer: analysis?.job.vendor_name ?? alert.customer ?? "Unknown vendor",
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

  if (loading && !analysis) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleExport = async (type: "discrepancies" | "metrics" | "report") => {
    if (!jobId) {
      setError("No audit selected for export");
      return;
    }

    try {
      const endpoint = type === "report" ? "report.html" : `${type}.csv`;
      const url = `${API_BASE}/export/${jobId}/${endpoint}`;
      
      const response = await fetch(url, {
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        throw new Error("Failed to export");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `export_${type}_${Date.now()}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || "Failed to export");
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* Top navigation bar */}
        <div className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg text-foreground">ContractGuard</span>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/upload")}>
                <Upload className="h-4 w-4 mr-2" />
                New Audit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/history")}>
                <HistoryIcon className="h-4 w-4 mr-2" />
                View History
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              
              {/* Avatar dropdown - Top right */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full border border-border/50 bg-card/50 backdrop-blur-sm p-1.5 hover:bg-card/80 transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="" alt={user?.full_name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {user?.full_name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.full_name || "User"}</p>
                      <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/history")}>
                    <HistoryIcon className="mr-2 h-4 w-4" />
                    <span>Audit History</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>Schedule monthly audit</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Users className="mr-2 h-4 w-4" />
                    <span>Invite team</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-success">
                    <Flame className="mr-2 h-4 w-4" />
                    <span>Recovery streak: 11 months</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8 md:space-y-12">
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
        {/* Header with animated background */}
        <header className="relative flex flex-col gap-8 md:flex-row md:items-start md:justify-between pb-6 overflow-hidden rounded-2xl p-8 -mx-4 sm:mx-0">
          {/* Animated background - subtle mesh gradient */}
          <motion.div
            className="absolute inset-0 opacity-30 pointer-events-none"
            animate={{
              background: [
                "radial-gradient(circle at 0% 0%, hsl(var(--primary)/0.1) 0%, transparent 50%)",
                "radial-gradient(circle at 100% 100%, hsl(var(--primary)/0.1) 0%, transparent 50%)",
                "radial-gradient(circle at 0% 0%, hsl(var(--primary)/0.1) 0%, transparent 50%)",
              ],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          <div className="relative z-10 flex-1 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Operations cockpit</p>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-foreground/95 to-foreground/80 bg-clip-text text-transparent leading-tight">
                ContractGuard Dashboard
              </h1>
            </div>
            
            {/* Elegant stats ticker - mode-aware */}
            <motion.div
              className="inline-flex items-center gap-6 px-4 py-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {stats.loading ? (
                <span className="text-sm text-muted-foreground">Loading stats...</span>
              ) : stats.audits > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/70">Last 30 days</span>
                  </div>
                  <div className="h-4 w-px bg-border/50" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-semibold text-foreground">{stats.audits}</span>
                    <span className="text-sm text-muted-foreground">audit{stats.audits !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="h-4 w-px bg-border/50" />
                  <div className="flex items-center gap-1.5">
                    <span className={`text-lg font-semibold ${
                      analysis?.job.user_type === "vendor" ? "text-cta" : "text-success"
                    }`}>
                      {formatCurrency(stats.recovered, contractCurrency)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {analysis?.job.user_type === "vendor" ? "identifiable" : "recovered"}
                    </span>
                  </div>
                  {stats.avgSavings > 0 && (
                    <>
                      <div className="h-4 w-px bg-border/50" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-semibold text-primary">{stats.avgSavings}%</span>
                        <span className="text-sm text-muted-foreground">
                          {analysis?.job.user_type === "vendor" ? "avg leakage" : "avg savings"}
                        </span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No audits in the last 30 days</span>
              )}
            </motion.div>
          </div>
          
          <div className="relative z-10 flex flex-col gap-4 items-start md:items-end">
            {/* Date range selector - elegant dropdown */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium">Time range</span>
              <Select value={selectedRange} onValueChange={setSelectedRange}>
                <SelectTrigger className="h-9 w-[140px] border-border/60 bg-card/80 backdrop-blur-sm text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateRanges.map((range) => (
                    <SelectItem key={range} value={range}>
                      {range}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Action buttons - grouped elegantly */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Export buttons - only show when job is completed */}
              {jobId && analysis?.job.status === "completed" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 border-border/60 bg-card/60 hover:bg-card/80"
                    onClick={() => handleExport("discrepancies")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="text-xs">CSV</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 border-border/60 bg-card/60 hover:bg-card/80"
                    onClick={() => handleExport("report")}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      {analysis?.job.user_type === "vendor" ? "Leakage" : "Recovery"}
                    </span>
                  </Button>
                  <div className="h-6 w-px bg-border/40 mx-1" />
                </>
              )}
              
              {/* Schedule audit */}
              <Button 
                variant="outline" 
                size="sm"
                className="gap-2 h-9 border-border/60 bg-card/60 hover:bg-card/80"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs">Schedule</span>
              </Button>
              
              {/* Primary CTA - Run new analysis */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button 
                  variant="cta" 
                  size="sm"
                  className="gap-2 h-9 relative overflow-hidden shadow-lg shadow-cta/20"
                  onClick={() => navigate("/upload")}
                >
                  <motion.div
                    className="absolute inset-0 bg-cta/20"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <Layers className="h-3.5 w-3.5 relative z-10" />
                  <span className="relative z-10 text-xs font-semibold">New Analysis</span>
                </Button>
              </motion.div>
            </div>
          </div>
        </header>

        {/* Segmented Mode Toggle */}
        {analysis?.job.user_type && (
          <div className="flex items-center justify-center mb-6">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  analysis.job.user_type === "customer"
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="text-sm font-medium">Cost Defense</span>
              </div>
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  analysis.job.user_type === "vendor"
                    ? "bg-cta/10 text-cta shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wallet className="h-4 w-4" />
                <span className="text-sm font-medium">Revenue Guard</span>
              </div>
            </div>
          </div>
        )}

        {/* 🎯 HERO METRIC: Dynamic based on mode */}         
        <motion.section
          className={`
            relative rounded-3xl p-8 md:p-12 overflow-hidden
            ${isNoLeakage 
              ? "border-2 border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-card/90" 
              : analysis?.job.user_type === "vendor"
                ? "border-2 border-cta/30 bg-gradient-to-br from-cta/10 via-cta/5 to-card/90"
                : "border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-card/90"}
          `}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Animated background glow */}
          <motion.div
            className={`absolute -top-12 -right-12 w-48 h-48 rounded-full blur-2xl ${
              isNoLeakage 
                ? "bg-success/20" 
                : analysis?.job.user_type === "vendor"
                  ? "bg-cta/20"
                  : "bg-primary/20"
            }`}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* CARD CONTENT */}
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              {isNoLeakage ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                >
                  <CheckCircle2 className="h-7 w-7 text-success" />
                </motion.div>
              ) : analysis?.job.user_type === "vendor" ? (
                <Wallet className="h-7 w-7 text-cta" />
              ) : (
                <Zap className="h-7 w-7 text-primary" />
              )}
              <span className="text-muted-foreground text-sm uppercase tracking-wider">
                {isNoLeakage 
                  ? "AUDIT COMPLETE" 
                  : "FOUND IN THIS AUDIT"}
              </span>
            </div>

            <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              {formatCurrency(displayRecoverable, contractCurrency)}
            </h2>

            {/* Dynamic messaging based on mode and state */}
            {isNoLeakage ? (
              <div className="space-y-2">
                <p className="text-2xl md:text-3xl font-semibold text-success">
                  {analysis?.job.user_type === "vendor"
                    ? "All customers billed correctly"
                    : "You're 100% clean!"}
                </p>
                <p className="text-base text-muted-foreground">
                  {analysis?.job.user_type === "vendor"
                    ? "No revenue leakage detected. Your billing is accurate."
                    : "All invoices match perfectly. Your vendors are billing correctly."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xl md:text-2xl text-muted-foreground font-medium">
                  {analysis?.job.user_type === "vendor" 
                    ? "Revenue Leakage" 
                    : "Recoverable Revenue"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {analysis?.job.user_type === "vendor"
                    ? `${discrepancies.length} undercharge${discrepancies.length === 1 ? '' : 's'} found across ${billingSummary.invoice_count ?? 0} invoice${(billingSummary.invoice_count ?? 0) === 1 ? '' : 's'}`
                    : `${discrepancies.length} overcharge${discrepancies.length === 1 ? '' : 's'} found across ${billingSummary.invoice_count ?? 0} invoice${(billingSummary.invoice_count ?? 0) === 1 ? '' : 's'}`}
                </p>
              </div>
            )}

            <div className="flex gap-4 pt-2 flex-wrap">
              {!isNoLeakage && (
                <Button onClick={() => navigate(`/discrepancies?job=${jobId}`)} variant="default">
                  View Discrepancies
                </Button>
              )}
              <Button onClick={() => handleExport("report")} variant="secondary">
                {analysis?.job.user_type === "vendor"
                  ? "Export Leakage Report"
                  : "Export Recovery Report"}
              </Button>
              <Button
                onClick={() => navigate(`/artifact?job=${jobId}&type=negotiation-simulator`)}
                variant="outline"
                className="bg-gradient-to-r from-primary/10 to-cta/10 border-primary/30"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Negotiation Simulator
              </Button>
              <Button
                onClick={() => navigate(`/artifact?job=${jobId}&type=playbook`)}
                variant="outline"
                className="bg-gradient-to-r from-primary/10 to-cta/10 border-primary/30"
              >
                <Layers className="h-4 w-4 mr-2" />
                Build Playbook
              </Button>
              <Button
                onClick={() => navigate(`/artifact?type=renewal-center`)}
                variant="outline"
                className="bg-gradient-to-r from-destructive/10 to-cta/10 border-destructive/30"
              >
                <Clock className="h-4 w-4 mr-2" />
                Renewal Center
              </Button>
            </div>
          </div>
        </motion.section>

        {/* Supporting KPI Cards - Standardized styling */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlightCards.filter(card => card.label !== "Recoverable revenue").map((metric, index) => {
            const hasIssues = metric.priority === "critical" && discrepancies.length > 0;
            const isActionable = (metric as any).actionable;
            
            return (
              <div
                key={metric.label}
                className={`rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm p-6 shadow-sm space-y-4 transition-all duration-300 relative overflow-hidden group animate-in fade-in slide-in-from-bottom-4 ${
                  hasIssues 
                    ? 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-card/90 hover:border-destructive/50 hover:shadow-md' 
                    : 'hover:border-primary/30 hover:shadow-md'
                } ${
                  isActionable ? 'cursor-pointer hover:-translate-y-0.5' : ''
                }`}
                style={{
                  animationDelay: `${index * 100}ms`
                }}
                onClick={() => {
                  if (metric.label === "Active escalations" && discrepancies.length > 0) {
                    scrollToDiscrepancies();
                  } else if (metric.label === "AI confidence" && clauseHits > 0) {
                    scrollToEvidence();
                  }
                }}
              >
                {/* Status badge for critical items */}
                {hasIssues && (
                  <div className="absolute top-4 right-4 z-10">
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-destructive/20 text-destructive border border-destructive/30 animate-pulse">
                      Critical
                    </span>
                  </div>
                )}
                
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70 font-semibold mb-3">
                      {metric.label}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{metric.value}</p>
                  </div>
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                    hasIssues ? 'bg-destructive/15 text-destructive border-destructive/20' : 'bg-primary/10 text-primary border-primary/20'
                  }`}>
                    <metric.icon className="h-5 w-5" />
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs pt-3 border-t border-border/30">
                  <span className="text-muted-foreground">{metric.delta}</span>
                  <span className={`font-semibold flex items-center gap-1 ${
                    hasIssues ? 'text-destructive' : metric.trend.includes('✓') ? 'text-success' : 'text-cta'
                  }`}>
                    {metric.trend.includes('↑') && <TrendingUp className="h-3 w-3" />}
                    {metric.trend.includes('↓') && <TrendingDown className="h-3 w-3" />}
                    {metric.trend}
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {analysis?.job.user_type === "vendor" ? "Revenue leakage trend" : "Overcharge trend"}
                </p>
                <h2 className="text-xl font-semibold">
                  {analysis?.job.user_type === "vendor" 
                    ? "Monthly revenue leakage" 
                    : "Monthly recoverable amount"}
                </h2>
              </div>
              <Button variant="ghost" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                View all {discrepancyAlerts.length} {analysis?.job.user_type === "vendor" ? "undercharges" : "overcharges"}
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
                  <RechartsTooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.15)" }} />
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

          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  AI audit status
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p className="font-semibold">AI Extraction Performance</p>
                        <p>Tracks the quality and accuracy of automated contract clause extraction using Azure Document Intelligence and GPT-4o.</p>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground">
                          <li>Monitors OCR accuracy and clause detection rates</li>
                          <li>Validates extracted data against contract patterns</li>
                          <li>Flags low-confidence extractions for manual review</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </p>
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
                <RechartsTooltip />
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

        {/* 🔥 NEW: Confidence & Classification Insights */}
        <section className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  AI Confidence
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p className="font-semibold">Confidence Score Distribution</p>
                        <p>Shows how confident the AI is about each extracted clause. Higher scores mean more reliable data.</p>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <p><strong className="text-success">High (&gt;80%):</strong> Reliable extraction, ready to use</p>
                          <p><strong className="text-cta">Medium (50-80%):</strong> Good extraction, may need validation</p>
                          <p><strong className="text-destructive">Low (&lt;50%):</strong> Uncertain, requires manual review</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Hover over "clauses analyzed" below to see all extracted clauses with their confidence scores.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </p>
                <h3 className="text-xl font-semibold">Extraction confidence</h3>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            {documents.length > 0 ? (
              <ConfidenceGauge 
                documents={documents} 
                onClauseClick={(doc, clause) => {
                  // Open the contract PDF viewer with the clause highlighted
                  if (clause.regions && clause.regions.length > 0) {
                    const region = clause.regions[0];
                    
                    // Create a mock evidence object to use with the existing viewer
                    const evidence: DiscrepancyEvidence = {
                      type: "contract_clause",
                      label: clause.label,
                      text: clause.text,
                      page: region.page,
                      bounds: region.bounds,
                      regions: clause.regions,
                    };
                    
                    setViewerClause({ doc, evidence });
                  }
                }}
              />
            ) : (
              <EmptyState
                icon={FileSearch}
                title="No clauses extracted"
                description="Upload contracts to see AI confidence metrics"
              />
            )}
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  Invoice Classification
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p className="font-semibold">Fixed vs Variable Cost Split</p>
                        <p>Critical for CFOs to see if variable costs (overages) are eating up the budget.</p>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <p><strong className="text-primary">Fixed (Subscriptions):</strong> Predictable monthly fees, base licenses, platform fees</p>
                          <p><strong className="text-cta">Variable (Overages):</strong> Usage-based charges, storage/compute overages, per-unit fees</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          High variable costs may indicate uncontrolled usage growth.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </p>
                <h3 className="text-xl font-semibold">Billing breakdown</h3>
              </div>
              <Layers className="h-5 w-5 text-cta" />
            </div>
            {(metrics.classification_stats as any)?.total_items ? (
              <ClassificationChart stats={metrics.classification_stats as any} />
            ) : (
              <EmptyState
                icon={Upload}
                title="No billing data"
                description="Upload billing files to see invoice classification"
              />
            )}
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  Performance
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Audit processing metrics and throughput</p>
                    </TooltipContent>
                  </Tooltip>
                </p>
                <h3 className="text-xl font-semibold">Audit metrics</h3>
              </div>
              <Zap className="h-5 w-5 text-success" />
            </div>
            <PerformanceMetrics
              auditTime={(metrics as any).audit_time_seconds}
              totalClauses={clauseHits}
              invoiceCount={billingSummary.invoice_count}
              gpt4oEnhanced={(metrics as any).gpt4o_enhanced}
            />
          </div>
        </section>

        {/* 🔔 UPCOMING RENEWALS SECTION */}
        {!renewalsLoading && upcomingRenewals.length > 0 && (
          <section className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Renewal Intelligence</p>
                <h3 className="text-xl font-semibold">Upcoming Renewals</h3>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2"
                onClick={() => {
                  // Navigate to renewals page or show all renewals
                  // For now, we can show a toast or navigate to a renewals view
                  toast({
                    title: "Viewing all renewals",
                    description: "Full renewals view coming soon",
                  });
                }}
              >
                View All
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {upcomingRenewals.map((renewal) => {
                const isUrgent = renewal.days_until_renewal <= 30;
                const isWarning = renewal.days_until_renewal <= 60;
                const renewalDate = new Date(renewal.termination_date);
                
                return (
                  <div
                    key={renewal.job_id}
                    className={`rounded-lg border p-4 transition-all ${
                      isUrgent
                        ? "border-destructive/50 bg-destructive/5"
                        : isWarning
                          ? "border-cta/50 bg-cta/5"
                          : "border-border/50 bg-card/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{renewal.vendor_name}</h4>
                          {isUrgent && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-medium">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Renews {renewalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {renewal.days_until_renewal} days left
                        </p>
                        {renewal.recoverable_amount > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatCurrency(renewal.recoverable_amount, renewal.currency)} in leverage
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/dashboard?job=${renewal.job_id}`)}
                        >
                          View Pack
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 🔥 ADD REF HERE */}
        <section ref={discrepanciesSectionRef} className="grid gap-6 lg:grid-cols-3 md:grid-cols-1">
          <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">{analysis?.job.user_type === "vendor" ? "Undercharges" : "Overcharges"}</p>
                <h3 className="text-xl font-semibold">
                  {analysis?.job.user_type === "vendor" 
                    ? "Prioritized billing alerts" 
                    : "Prioritized contract alerts"}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="gap-2">
                  Review all {discrepancyAlerts.length} discrepancies
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
                <div className="flex gap-2">
                  <select className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
                    <option>All {analysis?.job.user_type === "vendor" ? "undercharges" : "overcharges"}</option>
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
            <div className="space-y-4">
              {groupedDiscrepancies.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title={analysis?.job.user_type === "vendor" ? "No revenue leakage found" : "No overcharges found"}
                  description={analysis?.job.user_type === "vendor"
                    ? "All customers billed correctly. Great job maintaining accurate billing!"
                    : "All invoices match contract terms. Your vendor billing is accurate."}
                />
              ) : (
                groupedDiscrepancies.map((group, groupIndex) => {
                  const groupKey = `group-${group.customer}-${groupIndex}`;
                  const isExpanded = expandedGroups[groupKey] || false;
                  const priorityClass = group.priority?.toLowerCase() === "high" || group.priority?.toLowerCase() === "critical"
                    ? "border-destructive"
                    : group.priority?.toLowerCase() === "medium"
                      ? "border-cta"
                      : "border-border";
                  
                  return (
                    <div
                      key={groupKey}
                      className={`border-l-4 ${priorityClass} rounded-lg p-4 bg-card border border-border/60 shadow-sm`}
                    >
                      {/* Header - shows aggregate */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className={`h-5 w-5 ${
                            group.priority?.toLowerCase() === "high" || group.priority?.toLowerCase() === "critical"
                              ? "text-destructive"
                              : group.priority?.toLowerCase() === "medium"
                                ? "text-cta"
                                : "text-muted-foreground"
                          }`} />
                          <div>
                            <h3 className="font-semibold text-lg">
                              {analysis?.job.user_type === "vendor" 
                                ? group.customer || "Unknown Customer"
                                : analysis?.job.vendor_name || group.customer || "Unknown Vendor"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {group.count} {group.count === 1 ? "issue" : "issues"} spanning {formatDateRange(group.earliest_date, group.latest_date)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${
                            analysis?.job.user_type === "vendor" ? "text-cta" : "text-destructive"
                          }`}>
                            {formatCurrency(group.total, contractCurrency)}
                          </p>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            group.priority?.toLowerCase() === "high" || group.priority?.toLowerCase() === "critical"
                              ? analysis?.job.user_type === "vendor" 
                                ? "bg-cta text-cta-foreground"
                                : "bg-destructive text-destructive-foreground"
                              : group.priority?.toLowerCase() === "medium"
                                ? "bg-cta text-cta-foreground"
                                : "bg-secondary text-foreground"
                          }`}>
                            {group.priority?.toUpperCase() || "MEDIUM"}
                          </span>
                        </div>
                      </div>

                      {/* Expandable invoice list */}
                      <details 
                        className="mt-3"
                        open={isExpanded}
                        onToggle={(e) => setExpandedGroups({ ...expandedGroups, [groupKey]: (e.target as HTMLDetailsElement).open })}
                      >
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 list-none">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span>
                            View {group.count} affected {group.count === 1 ? "invoice" : "invoices"}
                            {analysis?.job.user_type === "vendor" ? " to rebill" : ""} →
                          </span>
                        </summary>
                        <div className="mt-3 space-y-2 pl-4 border-l border-border">
                          {group.discrepancies.map((disc, idx) => (
                            <DiscrepancyItem
                              key={`${group.customer}-${idx}`}
                              discrepancy={disc}
                              formatCurrency={formatCurrency}
                              contractCurrency={contractCurrency}
                              onViewAuditTrail={(disc) => {
                                setSelectedDiscrepancyForAudit(disc);
                                setAuditTrailOpen(true);
                              }}
                              onOpenArtifact={(disc) => {
                                setSelectedDiscrepancyForArtifact(disc);
                                // Use issue as identifier if no ID exists
                                const identifier = disc.id || disc.issue || encodeURIComponent(JSON.stringify({ issue: disc.issue, value: disc.value }));
                                navigate(`/artifact?job=${jobId}&discrepancy=${identifier}&type=recovery-pack`);
                              }}
                              onClick={(disc) => {
                                // Don't open the main dialog - just do nothing or open View Details instead
                                // setSelectedDiscrepancy(disc);
                              }}
                              onOpenSplitView={(disc) => {
                                const invoiceEvidence = disc.evidence?.find(
                                  (item: any) => item.type === "invoice_line_error"
                                );
                                const contractEvidence = disc.evidence?.find(
                                  (item: any) => item.type === "contract_clause"
                                );
                                if (invoiceEvidence && contractEvidence) {
                                  setSplitViewData({
                                    discrepancy: disc,
                                    invoiceEvidence,
                                    contractEvidence,
                                  });
                                  setSplitViewOpen(true);
                                }
                              }}
                            />
                          ))}
                        </div>
                      </details>

                      {/* Actions - Premium Styling */}
                      <div className="flex gap-3 mt-6 flex-wrap">
                        <Button 
                          variant="cta" 
                          size="default" 
                          className="gap-2 h-11 px-6 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-r from-cta to-cta/90 hover:from-cta/90 hover:to-cta/80"
                          onClick={() => {
                            // Use first discrepancy for dispute letter
                            const firstDisc = group.discrepancies[0];
                            if (firstDisc) {
                              // Find the index of this discrepancy in the full discrepancies array
                              const discIndex = discrepancies.findIndex(
                                (d) => d === firstDisc || 
                                (d.customer === firstDisc.customer && 
                                 d.invoice_date === firstDisc.invoice_date &&
                                 d.issue === firstDisc.issue)
                              );
                              const idToUse = discIndex >= 0 ? discIndex.toString() : "0";
                              setSelectedDiscrepancyForDispute({
                                id: idToUse,
                                discrepancy: firstDisc,
                              });
                              setDisputeLetterOpen(true);
                            }
                          }}
                        >
                          <Mail className="h-4 w-4" />
                          {analysis?.job.user_type === "vendor" ? "Generate Rebilling Notice" : "Generate Dispute Letter"}
                        </Button>
                        <Button variant="secondary" size="sm">View Contract</Button>
                        <Button variant="secondary" size="sm">Export Report</Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-5">
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

        {/* 🔥 NEW: Pricing Timeline Visualization */}
        {metrics.gpt4o_rules?.pricing_timeline && metrics.gpt4o_rules.pricing_timeline.length > 0 ? (
          <section className="grid gap-6">
            <PricingTimeline
              periods={metrics.gpt4o_rules.pricing_timeline}
              discrepancies={discrepancies}
              currency={contractCurrency}
              invoiceCount={billingSummary.invoice_count || 0}
              onViewContract={(source) => {
                // Find document by source filename or use first available document
                let doc: ExtractedDocument | undefined;
                
                if (source === "MSA" || source === "amendment") {
                  // For generic sources, use the first contract document
                  doc = documents.find((d) => d.filename && (d.filename.endsWith(".pdf") || d.filename.endsWith(".PDF"))) || documents[0];
                } else {
                  // Try to find exact match first
                  doc = documents.find((d) => d.filename === source);
                  
                  // If not found, try partial match
                  if (!doc) {
                    doc = documents.find((d) => d.filename?.includes(source) || source.includes(d.filename || ""));
                  }
                  
                  // Fallback to first document
                  if (!doc && documents.length > 0) {
                    doc = documents[0];
                  }
                }
                
                if (doc) {
                  // Try to find a clause with regions first
                  const clauseWithRegion = doc.clauses?.find((c) => c.regions && c.regions.length > 0);
                  
                  if (clauseWithRegion && clauseWithRegion.regions?.[0]) {
                    const region = clauseWithRegion.regions[0];
                    const evidence: DiscrepancyEvidence = {
                      type: "contract_clause",
                      label: clauseWithRegion.label || "Contract",
                      text: clauseWithRegion.text || "",
                      page: region.page,
                      bounds: region.bounds,
                      regions: clauseWithRegion.regions,
                      file: doc.filename,
                    };
                    setViewerClause({ doc, evidence });
                  } else if (doc.clauses && doc.clauses.length > 0) {
                    // Use first clause even without regions
                    const firstClause = doc.clauses[0];
                    const evidence: DiscrepancyEvidence = {
                      type: "contract_clause",
                      label: firstClause.label || "Contract",
                      text: firstClause.text || "",
                      page: 1,
                      bounds: { x: 0, y: 0, width: 100, height: 100 },
                      regions: [],
                      file: doc.filename,
                    };
                    setViewerClause({ doc, evidence });
                  } else {
                    // No clauses, just open the document on page 1
                    const evidence: DiscrepancyEvidence = {
                      type: "contract_clause",
                      label: "Contract Document",
                      text: "",
                      page: 1,
                      bounds: { x: 0, y: 0, width: 100, height: 100 },
                      regions: [],
                      file: doc.filename,
                    };
                    setViewerClause({ doc, evidence });
                  }
                } else {
                  // No documents available
                  toast({
                    title: "Document not found",
                    description: `Unable to find document: ${source}`,
                    variant: "destructive",
                  });
                }
              }}
              onViewDiscrepancies={(period) => {
                // Scroll to discrepancies section
                discrepanciesSectionRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              onViewInvoice={(invoiceNumber, invoiceDate) => {
                // Find the discrepancy for this invoice
                const disc = discrepancies.find((d) => 
                  (d as any).invoice_reference === invoiceNumber || 
                  (d.invoice_date === invoiceDate && (d as any).invoice_reference === invoiceNumber)
                );
                
                if (disc) {
                  // Scroll to the discrepancy in the list
                  discrepanciesSectionRef.current?.scrollIntoView({ behavior: "smooth" });
                  // Could also highlight the specific discrepancy
                  toast({
                    title: "Invoice Details",
                    description: `Viewing invoice ${invoiceNumber} from ${new Date(invoiceDate).toLocaleDateString()}`,
                  });
                } else {
                  toast({
                    title: "Invoice not found",
                    description: `Unable to locate invoice ${invoiceNumber}`,
                    variant: "destructive",
                  });
                }
              }}
            />
          </section>
        ) : (
          // Show placeholder or build timeline from available data
          jobId && metrics.gpt4o_rules && (
            <section className="grid gap-6">
              <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
                <h3 className="text-xl font-semibold text-foreground mb-2">Contract Pricing Timeline</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Building timeline from available contract data...
                </p>
                {/* Build timeline from available rules if pricing_timeline is missing */}
                {(() => {
                  const rules = metrics.gpt4o_rules;
                  if (!rules) return null;
                  
                  const periods: Array<{
                    start_date: string;
                    amount: number;
                    source: string;
                    reason: string;
                  }> = [];
                  
                  // Add base period
                  if (rules.base_amount) {
                    const baseDate = rules.effective_start_date || "2024-01-01";
                    periods.push({
                      start_date: baseDate,
                      amount: rules.base_amount,
                      source: "MSA",
                      reason: "Original base pricing"
                    });
                    
                    // Add escalation period if exists
                    if (rules.escalation_rate && rules.escalation_rate > 0 && rules.effective_start_date) {
                      const escalatedAmount = rules.base_amount * (1 + rules.escalation_rate);
                      periods.push({
                        start_date: rules.effective_start_date,
                        amount: escalatedAmount,
                        source: "MSA",
                        reason: `${(rules.escalation_rate * 100).toFixed(1)}% annual escalation`
                      });
                    }
                    
                    // Add amendments if available
                    if (rules.amendment_history && Array.isArray(rules.amendment_history)) {
                      rules.amendment_history.forEach((amendment: any) => {
                        if (amendment.date && amendment.amount) {
                          periods.push({
                            start_date: amendment.date,
                            amount: amendment.amount,
                            source: amendment.source || "amendment",
                            reason: amendment.description || "Price amendment"
                          });
                        }
                      });
                    }
                  }
                  
                  if (periods.length > 0) {
                    return (
                      <PricingTimeline
                        periods={periods}
                        discrepancies={discrepancies}
                        currency={contractCurrency}
                        invoiceCount={billingSummary.invoice_count || 0}
                        onViewContract={(source) => {
                          // Find document by source filename or use first available document
                          let doc: ExtractedDocument | undefined;
                          
                          if (source === "MSA" || source === "amendment") {
                            // For generic sources, use the first contract document
                            doc = documents.find((d) => d.filename && (d.filename.endsWith(".pdf") || d.filename.endsWith(".PDF"))) || documents[0];
                          } else {
                            // Try to find exact match first
                            doc = documents.find((d) => d.filename === source);
                            
                            // If not found, try partial match
                            if (!doc) {
                              doc = documents.find((d) => d.filename?.includes(source) || source.includes(d.filename || ""));
                            }
                            
                            // Fallback to first document
                            if (!doc && documents.length > 0) {
                              doc = documents[0];
                            }
                          }
                          
                          if (doc) {
                            // Try to find a clause with regions first
                            const clauseWithRegion = doc.clauses?.find((c) => c.regions && c.regions.length > 0);
                            
                            if (clauseWithRegion && clauseWithRegion.regions?.[0]) {
                              const region = clauseWithRegion.regions[0];
                              const evidence: DiscrepancyEvidence = {
                                type: "contract_clause",
                                label: clauseWithRegion.label || "Contract",
                                text: clauseWithRegion.text || "",
                                page: region.page,
                                bounds: region.bounds,
                                regions: clauseWithRegion.regions,
                                file: doc.filename,
                              };
                              setViewerClause({ doc, evidence });
                            } else if (doc.clauses && doc.clauses.length > 0) {
                              // Use first clause even without regions
                              const firstClause = doc.clauses[0];
                              const evidence: DiscrepancyEvidence = {
                                type: "contract_clause",
                                label: firstClause.label || "Contract",
                                text: firstClause.text || "",
                                page: 1,
                                bounds: { x: 0, y: 0, width: 100, height: 100 },
                                regions: [],
                                file: doc.filename,
                              };
                              setViewerClause({ doc, evidence });
                            } else {
                              // No clauses, just open the document on page 1
                              const evidence: DiscrepancyEvidence = {
                                type: "contract_clause",
                                label: "Contract Document",
                                text: "",
                                page: 1,
                                bounds: { x: 0, y: 0, width: 100, height: 100 },
                                regions: [],
                                file: doc.filename,
                              };
                              setViewerClause({ doc, evidence });
                            }
                          } else {
                            // No documents available
                            toast({
                              title: "Document not found",
                              description: `Unable to find document: ${source}`,
                              variant: "destructive",
                            });
                          }
                        }}
                        onViewDiscrepancies={(period) => {
                          discrepanciesSectionRef.current?.scrollIntoView({ behavior: "smooth" });
                        }}
                      />
                    );
                  }
                  
                  return (
                    <div className="text-sm text-muted-foreground">
                      <p>Pricing timeline data not available. This will appear after running a new audit with contract and billing files.</p>
                      <p className="text-xs mt-2">Available data: {JSON.stringify(Object.keys(rules))}</p>
                    </div>
                  );
                })()}
              </div>
            </section>
          )
        )}

        <section ref={evidenceSectionRef} className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4 text-cta" />
                Recommended next action
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {primaryDiscrepancy
                  ? analysis?.job.user_type === "vendor"
                    ? `Rebill customer for: ${primaryDiscrepancy.issue}`
                    : `Request refund for: ${primaryDiscrepancy.issue}`
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
                  {formatCurrency(recoverableAmount, contractCurrency)} {analysis?.job.user_type === "vendor" ? "revenue leakage" : "to recover"}
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
                {analysis?.job.user_type === "vendor"
                  ? `Customer ${analysis?.job.vendor_name || "billing"} needs to be rebilled for ${primaryDiscrepancy.issue}.`
                  : `Contact ${analysis?.job.vendor_name || "vendor"} about ${primaryDiscrepancy.issue}.`}
              </>
            ) : (
              analysis?.job.user_type === "vendor"
                ? "No revenue leakage at the moment. Stay proactive by scheduling periodic billing audits."
                : "No overcharges at the moment. Stay proactive by scheduling periodic audits."
            )}
          </p>
          <div className="flex flex-wrap gap-3 w-full sm:w-auto">
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
            <div className="bg-gradient-to-r from-primary/10 to-transparent px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    GPT-4o Analysis
                  </p>
                  <h3 className="text-xl font-bold mt-1">
                    {analysis?.job.user_type === "vendor"
                      ? `Analysis for ${analysis?.job.vendor_name ?? primaryDiscrepancy?.customer ?? "Customer"}`
                      : `Analysis for ${analysis?.job.vendor_name ?? "Vendor"}`}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Ask Follow-up
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => {
                      navigator.clipboard.writeText(patternSummary);
                      toast({ title: "Analysis copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Analysis
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-[2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border/60">
              {/* Left: AI Summary */}
              <div className="p-6 max-h-80 overflow-auto">
                {/* Key findings as clickable chips */}
                {discrepancies.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors">
                      {discrepancies.length} {discrepancies.length === 1 ? "escalation missed" : "escalations missed"}
                    </button>
                    <button className="px-3 py-1.5 rounded-full bg-cta/10 text-cta text-xs font-semibold hover:bg-cta/20 transition-colors">
                      {formatCurrency(recoverableAmount, contractCurrency)} at risk
                    </button>
                    {groupedDiscrepancies.length > 0 && (
                      <button className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                        Spans {groupedDiscrepancies[0]?.count || discrepancies.length} {groupedDiscrepancies[0]?.count === 1 ? "month" : "months"}
                      </button>
                    )}
                  </div>
                )}

                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className="prose prose-invert prose-sm leading-relaxed space-y-3"
                >
                  {patternSummary}
                </ReactMarkdown>

                {/* Confidence indicator */}
                {clauseHits > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="font-semibold">High confidence analysis</span>
                      <span className="text-muted-foreground ml-auto">
                        Based on {clauseHits} clause {clauseHits === 1 ? "hit" : "hits"} + {billingSummary.invoice_count || 0} {billingSummary.invoice_count === 1 ? "invoice" : "invoices"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Actions */}
              <div className="p-6 space-y-4 bg-secondary/20">
                {/* Quick actions as cards */}
                <div className="space-y-3">
                  <button 
                    className="w-full text-left p-3 rounded-lg bg-background/70 border border-border hover:border-primary transition-colors"
                    onClick={() => {
                      if (primaryDiscrepancy) {
                        // Use index 0 since primaryDiscrepancy is discrepancies[0]
                        setSelectedDiscrepancyForDispute({
                          id: "0",
                          discrepancy: primaryDiscrepancy,
                        });
                        setDisputeLetterOpen(true);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <p className="font-bold text-base">
                          {analysis?.job.user_type === "vendor"
                            ? "Generate Rebilling Notice"
                            : "Generate Dispute Letter"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {analysis?.job.user_type === "vendor"
                            ? `Generate rebilling notice for ${formatCurrency(recoverableAmount, contractCurrency)} in undercharges`
                            : `Request ${formatCurrency(recoverableAmount, contractCurrency)} refund from ${analysis?.job.vendor_name || primaryDiscrepancy?.customer || "vendor"}`}
                        </p>
                      </div>
                    </div>
                  </button>

                  <button className="w-full text-left p-3 rounded-lg bg-background/70 border border-border hover:border-primary transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-cta/10 flex items-center justify-center">
                        <BellRing className="h-5 w-5 text-cta" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Create Alert Rule</p>
                        <p className="text-xs text-muted-foreground">
                          Auto-flag future escalation gaps
                        </p>
                      </div>
                    </div>
                  </button>

                  <button className="w-full text-left p-3 rounded-lg bg-background/70 border border-border hover:border-primary transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Schedule Follow-up</p>
                        <p className="text-xs text-muted-foreground">
                          {analysis?.job.user_type === "vendor"
                            ? `Re-audit ${analysis?.job.vendor_name || "customer"} billing in 30 days`
                            : `Audit ${analysis?.job.vendor_name || "vendor"} again in 30 days`}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 flex items-center gap-6">
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
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
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
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendor risk assessment</p>
                <h3 className="text-2xl font-semibold">{analysis?.job.vendor_name}</h3>
              </div>
              {vendorRisk && (
                <div className="text-right">
                  {/* Circular progress indicator */}
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-secondary"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(vendorRisk.score / 100) * 251.2} 251.2`}
                        className={vendorRisk.level === "High" ? "text-destructive" : vendorRisk.level === "Medium" ? "text-cta" : "text-success"}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-bold">{vendorRisk.score}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">Risk</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {vendorRisk && (
              <>
                {/* Risk level explanation */}
                <div className={`p-3 rounded-lg border ${
                  vendorRisk.level === "High"
                    ? "bg-destructive/10 border-destructive/20"
                    : vendorRisk.level === "Medium"
                      ? "bg-cta/10 border-cta/20"
                      : "bg-success/10 border-success/20"
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                      vendorRisk.level === "High"
                        ? "text-destructive"
                        : vendorRisk.level === "Medium"
                          ? "text-cta"
                          : "text-success"
                    }`} />
                    <div>
                      <p className={`font-semibold text-sm ${
                        vendorRisk.level === "High"
                          ? "text-destructive"
                          : vendorRisk.level === "Medium"
                            ? "text-cta"
                            : "text-success"
                      }`}>
                        {vendorRisk.level} Risk {vendorRisk.level === "High" ? "(75-100)" : vendorRisk.level === "Medium" ? "(55-74)" : "(0-54)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {vendorRisk.summary}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Comparison to industry average */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Industry average risk:</span>
                    <span className="font-semibold">45</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r ${
                        vendorRisk.score >= 75
                          ? "from-destructive to-destructive/80"
                          : vendorRisk.score >= 55
                            ? "from-cta to-cta/80"
                            : "from-success to-success/80"
                      }`}
                      style={{ width: `${Math.min(100, vendorRisk.score)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This vendor is {Math.abs(vendorRisk.score - 45)} points {vendorRisk.score > 45 ? "above" : "below"} average
                  </p>
                </div>

                {/* Existing metrics grid */}
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
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
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
          <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-sm p-6 hover:shadow-md transition-shadow duration-300 space-y-4">
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

      {/* Main Discrepancy Detail Dialog - DISABLED to prevent overlap with View Details and Audit Trail dialogs */}
      {/* This dialog is disabled - users should use "View Details" or "Audit Trail" buttons instead */}

      {/* Split View Evidence Comparison */}
      <Sheet 
        open={splitViewOpen} 
        onOpenChange={(open) => {
          setSplitViewOpen(open);
          if (!open) {
            // Cleanup when closing
            if (splitViewPdfBlobUrl) {
              URL.revokeObjectURL(splitViewPdfBlobUrl);
              setSplitViewPdfBlobUrl(null);
            }
            setSplitViewData(null);
            setSplitViewPdfScale(1.5);
            setSplitViewAutoScale(1.5);
            setSplitViewDimensions({ width: 0, height: 0 });
          } else if (splitViewData) {
            // Reset PDF blob when opening with new data
            if (splitViewPdfBlobUrl) {
              URL.revokeObjectURL(splitViewPdfBlobUrl);
              setSplitViewPdfBlobUrl(null);
            }
            setSplitViewPdfScale(1.5);
            setSplitViewAutoScale(1.5);
            setSplitViewDimensions({ width: 0, height: 0 });
          }
        }}
      >
        <SheetContent
          side="right"
          className="p-0 flex flex-col border-l border-border bg-background w-full sm:max-w-[95vw]"
        >
          {splitViewData && (
            <>
              <SheetHeader className="p-6 border-b border-border/60">
                <SheetTitle className="text-lg">
                  Evidence Comparison: {splitViewData.discrepancy.issue}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Compare invoice line item with contract clause
                </p>
              </SheetHeader>
              <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Original Billing File (Excel/CSV) */}
                <div className="w-1/2 border-r border-border/60 overflow-hidden bg-secondary/10 flex flex-col">
                  <div className="px-6 py-3 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">Original Invoice File</h3>
                    </div>
                    {(() => {
                      // Find the billing file that contains this invoice
                      const sourceFile = splitViewData.invoiceEvidence.__source_file || 
                                        splitViewData.invoiceEvidence.source_file ||
                                        billingFiles.find((f) => 
                                          f.filename?.toLowerCase().includes("invoice") ||
                                          f.filename?.toLowerCase().endsWith(".csv") ||
                                          f.filename?.toLowerCase().endsWith(".xlsx") ||
                                          f.filename?.toLowerCase().endsWith(".xls")
                                        )?.filename;
                      const billingFile = billingFiles.find((f) => f.filename === sourceFile) || billingFiles[0];
                      const billingUrl = billingFile && jobId
                        ? `${API_BASE}/jobs/${jobId}/billing/${encodeURIComponent(billingFile.filename)}`
                        : null;
                      
                      return billingUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Open in new tab as fallback
                            window.open(billingUrl, '_blank');
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex-1 overflow-auto p-6">
                    {(() => {
                      // Find the billing file that contains this invoice
                      const sourceFile = splitViewData.invoiceEvidence.__source_file || 
                                        splitViewData.invoiceEvidence.source_file ||
                                        billingFiles.find((f) => 
                                          f.filename?.toLowerCase().includes("invoice") ||
                                          f.filename?.toLowerCase().endsWith(".csv") ||
                                          f.filename?.toLowerCase().endsWith(".xlsx") ||
                                          f.filename?.toLowerCase().endsWith(".xls")
                                        )?.filename;
                      const billingFile = billingFiles.find((f) => f.filename === sourceFile) || billingFiles[0];
                      const billingUrl = billingFile && jobId
                        ? `${API_BASE}/jobs/${jobId}/billing/${encodeURIComponent(billingFile.filename)}`
                        : null;
                      
                      if (!billingUrl) {
                        return (
                          <div className="text-center text-muted-foreground py-8">
                            <p>Billing file not found</p>
                            <p className="text-xs mt-2">Invoice Reference: {splitViewData.invoiceEvidence.reference ?? "N/A"}</p>
                          </div>
                        );
                      }
                      
                      const isExcel = billingFile.filename?.toLowerCase().endsWith('.xlsx') || 
                                     billingFile.filename?.toLowerCase().endsWith('.xls');
                      const isCsv = billingFile.filename?.toLowerCase().endsWith('.csv');
                      
                      if (isExcel || isCsv) {
                        // For Excel and CSV files, fetch data and display in a table
                        const FileViewerComponent = () => {
                          const [fileRows, setFileRows] = useState<Array<Record<string, string>>>([]);
                          const [fileHeaders, setFileHeaders] = useState<string[]>([]);
                          const [loading, setLoading] = useState(true);
                          const [error, setError] = useState<string | null>(null);
                          
                          useEffect(() => {
                            if (!billingUrl || !jobId || !billingFile) return;
                            
                            setLoading(true);
                            // Use the new data endpoint for both Excel and CSV
                            const dataUrl = `${API_BASE}/jobs/${jobId}/billing/${encodeURIComponent(billingFile.filename)}/data`;
                            
                            fetch(dataUrl, { headers: getAuthHeader() })
                              .then((res) => {
                                if (!res.ok) throw new Error('Failed to load file data');
                                return res.json();
                              })
                              .then((data: { headers: string[]; rows: Array<Record<string, string>> }) => {
                                setFileHeaders(data.headers || []);
                                setFileRows(data.rows || []);
                                setLoading(false);
                              })
                              .catch((err) => {
                                setError(err.message);
                                setLoading(false);
                              });
                          }, [billingUrl, jobId, billingFile]);
                          
                          if (loading) {
                            return (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading {isExcel ? 'Excel' : 'CSV'}...</span>
                              </div>
                            );
                          }
                          
                          if (error) {
                            return (
                              <div className="text-center text-destructive py-4">
                                <p>Error loading {isExcel ? 'Excel' : 'CSV'}: {error}</p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => {
                                    window.open(billingUrl, '_blank');
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download Original File
                                </Button>
                              </div>
                            );
                          }
                          
                          // Highlight the row that matches the invoice reference
                          const invoiceRef = splitViewData.invoiceEvidence.reference;
                          const highlightedRowIndex = fileRows.findIndex(row => 
                            Object.values(row).some(val => val && invoiceRef && val.includes(invoiceRef))
                          );
                          
                          return (
                            <div className="mt-4 rounded-lg border border-border/60 overflow-hidden bg-white">
                              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-xs border-collapse" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                                  <thead className="sticky top-0 z-10">
                                    <tr>
                                      {fileHeaders.map((header, idx) => (
                                        <th 
                                          key={idx} 
                                          className="px-3 py-2 text-left font-semibold bg-[#f2f2f2] text-[#333] border border-[#d0d0d0]"
                                          style={{ 
                                            backgroundColor: '#f2f2f2',
                                            border: '1px solid #d0d0d0',
                                            fontWeight: 600
                                          }}
                                        >
                                          {header}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fileRows.map((row, rowIdx) => (
                                      <tr
                                        key={rowIdx}
                                        className={`${
                                          rowIdx === highlightedRowIndex
                                            ? 'bg-[#fff4e6]'
                                            : rowIdx % 2 === 0
                                            ? 'bg-white'
                                            : 'bg-[#fafafa]'
                                        }`}
                                        style={{
                                          backgroundColor: rowIdx === highlightedRowIndex 
                                            ? '#fff4e6' 
                                            : rowIdx % 2 === 0 
                                            ? '#ffffff' 
                                            : '#fafafa'
                                        }}
                                      >
                                        {fileHeaders.map((header, colIdx) => (
                                          <td 
                                            key={colIdx} 
                                            className="px-3 py-2 text-[#333] border border-[#d0d0d0]"
                                            style={{ 
                                              border: '1px solid #d0d0d0',
                                              padding: '6px 12px',
                                              whiteSpace: 'nowrap'
                                            }}
                                          >
                                            {row[header] || ''}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {highlightedRowIndex >= 0 && (
                                <div className="px-4 py-2 bg-cta/10 border-t border-cta/40 text-xs text-muted-foreground">
                                  Highlighted row matches invoice reference: {invoiceRef}
                                </div>
                              )}
                            </div>
                          );
                        };
                        
                        return (
                          <div className="space-y-4">
                            <div className="rounded-lg border border-border/60 p-4 bg-card">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">File</p>
                              <p className="font-semibold text-foreground">{billingFile.filename}</p>
                            </div>
                            <FileViewerComponent />
                          </div>
                        );
                      }
                      
                      return (
                        <div className="text-center text-muted-foreground py-8">
                          <p>Unsupported file type: {billingFile.filename}</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Side: Contract Clause PDF */}
                <div className="w-1/2 overflow-y-auto bg-background">
                  {splitViewData.contractEvidence.file && (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="px-6 py-3 border-b border-border/60 text-sm text-muted-foreground flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-cta" />
                          <span>Contract Clause: {splitViewData.contractEvidence.label ?? "Reference"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          Zoom {Math.round((splitViewPdfScale / splitViewAutoScale) * 100)}%
                          <div className="flex rounded-lg border border-border overflow-hidden">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSplitViewPdfScale((prev) => Math.max(0.3, +(prev * 0.8).toFixed(2)))}
                              title="Zoom out"
                            >
                              −
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-[11px]"
                              onClick={() => setSplitViewPdfScale(splitViewAutoScale)}
                              title="Fit entire page to viewer"
                            >
                              Fit Page
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSplitViewPdfScale((prev) => Math.min(5, +(prev * 1.25).toFixed(2)))}
                              title="Zoom in"
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-secondary/30 py-4 px-6">
                        <div className="flex justify-center">
                          <div className="relative">
                            {(() => {
                              const contractDoc = documents.find(
                                (d) => d.filename === splitViewData.contractEvidence.file
                              );
                              const contractUrl = contractDoc && jobId
                                ? `${API_BASE}/jobs/${jobId}/contracts/${encodeURIComponent(contractDoc.filename)}`
                                : null;
                              
                              // Get highlight bounds from contract evidence
                              const highlightBounds = splitViewData.contractEvidence.bounds ||
                                splitViewData.contractEvidence.regions?.[0]?.bounds;
                              const highlightPage = splitViewData.contractEvidence.page ||
                                splitViewData.contractEvidence.regions?.[0]?.page ||
                                1;

                              return contractUrl ? (
                                <>
                                  {splitViewPdfBlobUrl ? (
                                    <PdfDocument
                                      file={splitViewPdfBlobUrl}
                                      loading={<p>Loading contract…</p>}
                                    >
                                      <PdfPage
                                        key={`${highlightPage}-${splitViewPdfScale}`}
                                        pageNumber={highlightPage}
                                        scale={splitViewPdfScale}
                                        renderAnnotationLayer={false}
                                        renderTextLayer={false}
                                        onRenderSuccess={(page) => {
                                          const defaultScale = 1.5;
                                          const scaledViewport = page.getViewport({ scale: splitViewPdfScale });
                                          setSplitViewDimensions({ width: scaledViewport.width, height: scaledViewport.height });
                                          if (splitViewPdfScale === 1.0) {
                                            setSplitViewPdfScale(defaultScale);
                                            setSplitViewAutoScale(defaultScale);
                                          }
                                        }}
                                      />
                                    </PdfDocument>
                                  ) : (
                                    <PdfDocument
                                      file={contractUrl}
                                      loading={<p>Loading contract…</p>}
                                      onLoadSuccess={(doc) => {
                                        // Fetch PDF as blob for highlighting
                                        fetch(contractUrl, { headers: getAuthHeader() })
                                          .then((res) => res.blob())
                                          .then((blob) => {
                                            const url = URL.createObjectURL(blob);
                                            setSplitViewPdfBlobUrl(url);
                                          })
                                          .catch((err) => {
                                            console.error("Failed to load PDF:", err);
                                          });
                                      }}
                                    >
                                      <PdfPage
                                        key={`${highlightPage}-${splitViewPdfScale}`}
                                        pageNumber={highlightPage}
                                        scale={splitViewPdfScale}
                                        renderAnnotationLayer={false}
                                        renderTextLayer={false}
                                        onRenderSuccess={(page) => {
                                          const defaultScale = 1.5;
                                          const scaledViewport = page.getViewport({ scale: splitViewPdfScale });
                                          setSplitViewDimensions({ width: scaledViewport.width, height: scaledViewport.height });
                                          if (splitViewPdfScale === 1.0) {
                                            setSplitViewPdfScale(defaultScale);
                                            setSplitViewAutoScale(defaultScale);
                                          }
                                        }}
                                      />
                                    </PdfDocument>
                                  )}
                                  {highlightBounds && splitViewDimensions.width > 0 && splitViewDimensions.height > 0 && (
                                    <div
                                      className="absolute border-2 border-cta bg-cta/30 rounded-md pointer-events-none transition-all shadow-lg"
                                      style={{
                                        left: highlightBounds.x * splitViewDimensions.width,
                                        top: highlightBounds.y * splitViewDimensions.height,
                                        width: highlightBounds.width * splitViewDimensions.width,
                                        height: highlightBounds.height * splitViewDimensions.height,
                                      }}
                                    />
                                  )}
                                </>
                              ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                  <p>Contract document not found</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      {splitViewData.contractEvidence.text && (
                        <div className="border-t border-border/60 p-4 bg-card/50">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Clause Text</p>
                          <p className="text-sm text-foreground leading-relaxed">
                            {splitViewData.contractEvidence.text}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Floating AI Copilot Button - Premium & Prominent */}
      {!chatOpen && jobId && (
        <div className="fixed bottom-6 right-6 z-50">
          <style>{`
            @keyframes pulse-glow {
              0%, 100% {
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(59, 130, 246, 0.5);
                transform: scale(1);
              }
              50% {
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), 0 0 50px rgba(59, 130, 246, 0.8);
                transform: scale(1.02);
              }
            }
            .pulse-button {
              animation: pulse-glow 2s ease-in-out infinite;
            }
            .pulse-button:hover {
              animation: none;
            }
          `}</style>
          <Button
            variant="cta"
            size="lg"
            className="pulse-button h-14 px-6 rounded-full bg-gradient-to-r from-cta to-cta/90 hover:from-cta/90 hover:to-cta/80 transition-all duration-300 group animate-in fade-in slide-in-from-bottom-4 border-2 border-white/20 hover:border-white/40"
            onClick={() => setChatOpen(true)}
          >
            <div className="relative mr-2">
              <MessageSquare className="h-5 w-5 text-white" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full border-2 border-cta animate-pulse shadow-lg" />
            </div>
            <span className="font-semibold text-white drop-shadow-sm">Ask AI Copilot</span>
            <Sparkles className="h-4 w-4 ml-2 text-white opacity-90 group-hover:opacity-100 transition-opacity" />
          </Button>
        </div>
      )}

      <Sheet open={!!viewerClause} onOpenChange={(open) => (!open ? closeViewer() : null)}>
        <SheetPortal>
          {/* Make overlay transparent when chat is open to prevent fading */}
          {chatOpen ? (
            <div className="fixed inset-0 z-50 bg-transparent pointer-events-none" />
          ) : (
            <SheetOverlay />
          )}
          <SheetPrimitive.Content
            className={`fixed z-50 gap-4 bg-background p-0 flex flex-col border-l border-border shadow-lg transition-all duration-300 inset-y-0 right-0 h-full data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right ${
              chatOpen ? 'shadow-2xl' : ''
            }`}
            style={{
              width: viewerDimensions.width > 0 ? `${viewerDimensions.width + 48}px` : '50vw',
              maxWidth: chatOpen ? '50vw' : '95vw',
              zIndex: chatOpen ? 60 : 50,
            }}
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
          {viewerClause && (viewerUrl || pdfBlobUrl) ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 border-b border-border/60 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
                <span>Highlighting page {viewerPage}. Use the controls to zoom the PDF.</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Zoom {Math.round((pdfScale / autoScale) * 100)}%
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfScale((prev) => Math.max(0.3, +(prev * 0.8).toFixed(2)))}
                      title="Zoom out"
                    >
                      −
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-[11px]"
                      onClick={() => setPdfScale(autoScale)}
                      title="Fit entire page to viewer"
                    >
                      Fit Page
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfScale((prev) => Math.min(5, +(prev * 1.25).toFixed(2)))}
                      title="Zoom in"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-secondary/30 py-4" ref={viewerContainerRef}>
                <div className="flex justify-center">
                  <div className="relative">
                    {pdfBlobUrl ? (
                      <PdfDocument file={pdfBlobUrl} loading={<p>Loading contract…</p>}>
                      <PdfPage
                        key={`${viewerPage}-${pdfScale}`}
                        pageNumber={viewerPage ?? 1}
                        scale={pdfScale}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        onRenderSuccess={(page) => {
                          // Use a fixed scale that makes text readable
                          // The container will resize to match the PDF dimensions
                          const defaultScale = 1.5; // Good balance between readability and size
                          
                          // Store dimensions at current scale for highlight positioning
                          const scaledViewport = page.getViewport({ scale: pdfScale });
                          setViewerDimensions({ width: scaledViewport.width, height: scaledViewport.height });
                          
                          // If this is the first render (scale is 1.0), set to default scale
                          if (pdfScale === 1.0) {
                            setPdfScale(defaultScale);
                            setAutoScale(defaultScale);
                          }
                        }}
                      />
                      </PdfDocument>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        <p>Loading PDF...</p>
                      </div>
                    )}
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
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Unable to load the original document. Please re-upload the contract.
            </div>
          )}
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
          </SheetPrimitive.Content>
        </SheetPortal>
      </Sheet>

      {/* Customer Drill-Down Modal */}
      <CustomerDrillDown
        customer={selectedCustomer}
        discrepancies={discrepancies}
        currency={contractCurrency}
        onClose={() => setSelectedCustomer(null)}
      />

      {/* Dispute Letter Dialog */}
      {disputeLetterOpen && selectedDiscrepancyForDispute && jobId && (
        <Dialog open={disputeLetterOpen} onOpenChange={setDisputeLetterOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DisputeLetter
              jobId={jobId}
              discrepancyId={selectedDiscrepancyForDispute.id}
              discrepancy={selectedDiscrepancyForDispute.discrepancy}
              currency={contractCurrency}
              onClose={() => setDisputeLetterOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Audit Trail Dialog */}
      {auditTrailOpen && selectedDiscrepancyForAudit && (
        <Dialog open={auditTrailOpen} onOpenChange={setAuditTrailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Audit Trail</DialogTitle>
                {selectedDiscrepancyForAudit.evidence?.some((item: any) => item.type === "invoice_line_error") &&
                 selectedDiscrepancyForAudit.evidence?.some((item: any) => item.type === "contract_clause") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const invoiceEvidence = selectedDiscrepancyForAudit.evidence?.find(
                        (item: any) => item.type === "invoice_line_error"
                      );
                      const contractEvidence = selectedDiscrepancyForAudit.evidence?.find(
                        (item: any) => item.type === "contract_clause"
                      );
                      if (invoiceEvidence && contractEvidence) {
                        // Capture the discrepancy data before closing the dialog
                        const discrepancyData = selectedDiscrepancyForAudit;
                        // Close the audit trail dialog first to avoid overlap
                        setAuditTrailOpen(false);
                        // Then open split view after a delay to ensure dialog fully closes
                        setTimeout(() => {
                          setSplitViewData({
                            discrepancy: discrepancyData,
                            invoiceEvidence,
                            contractEvidence,
                          });
                          setSplitViewOpen(true);
                        }, 200);
                      }
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Split View
                  </Button>
                )}
              </div>
            </DialogHeader>
            <AuditTrail
              discrepancy={selectedDiscrepancyForAudit}
              onViewDocument={(evidence) => {
                if (evidence) {
                  openClauseReference(evidence);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Full Screen Chat Dialog */}
      {chatOpen && jobId && (
        <Dialog open={chatOpen} onOpenChange={setChatOpen}>
          <DialogPortal>
            {/* No overlay - chat is full screen */}
            <DialogPrimitive.Content
              className={`fixed max-w-full h-screen max-h-screen p-0 m-0 rounded-none border-0 bg-background translate-y-[-50%] top-1/2 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 [&>button]:hidden transition-all duration-300 ${
                viewerClause 
                  ? 'w-[calc(100vw-50vw-24px)] left-0 translate-x-0' 
                  : 'w-screen left-1/2 translate-x-[-50%]'
              }`}
            >
            <div className="flex flex-col h-full w-full">
              {/* Header */}
              <div className="border-b border-border/50 bg-gradient-to-r from-background via-background to-muted/20 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">AI Copilot</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ask questions about your contracts
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setChatOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              
              {/* Chat Content - Adjusts width when PDF viewer is open */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ContractChat 
                  jobId={jobId} 
                  vendorName={analysis?.job.vendor_name}
                  onOpenDocument={(evidence: {
                    type: string;
                    file?: string;
                    page?: number;
                    label?: string;
                    text?: string;
                    bounds?: any;
                    regions?: any[];
                    metadata?: Record<string, any>;
                  }) => {
                    if (evidence.type === "contract_clause" && evidence.file) {
                      const doc = documents.find((d) => d.filename === evidence.file);
                      if (doc) {
                        // Only create default bounds if we don't have any bounds/regions
                        // This prevents highlighting the entire page when we have no specific location
                        let regions = evidence.regions;
                        let bounds = evidence.bounds;
                        
                        // If we have bounds in metadata, use them
                        if (!bounds && evidence.metadata?.bounds) {
                          bounds = evidence.metadata.bounds;
                        }
                        
                        // If we have regions in metadata, use them
                        if (!regions && evidence.metadata?.regions) {
                          regions = evidence.metadata.regions;
                        }
                        
                        // Only create default regions if we have absolutely no location data
                        // This way, if there's no bounds, the page will open without highlighting
                        if (!regions && !bounds && evidence.page) {
                          // Don't create default bounds - let it open without highlight
                          // The user will see the page but not a full-page highlight
                          regions = [];
                        } else if (!regions && bounds && evidence.page) {
                          // If we have bounds but no regions, create a region from bounds
                          regions = [{
                            page: evidence.page,
                            bounds: bounds
                          }];
                        }
                        
                        const clauseEvidence: DiscrepancyEvidence = {
                          type: "contract_clause",
                          label: evidence.label || "Contract Reference",
                          text: evidence.text || "",
                          page: evidence.page || 1,
                          file: evidence.file,
                          bounds: bounds,
                          regions: regions,
                        };
                        openClauseReference(clauseEvidence);
                      }
                    }
                  }}
                />
              </div>
            </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      )}
    </div>
    </TooltipProvider>
  );
};

export default Dashboard;

