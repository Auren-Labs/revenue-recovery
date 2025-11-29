import { useMemo, useState } from "react";
import { Calendar, FileTextIcon, TrendingUp, FileEdit, CheckCircle, AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Calculator, Circle, HelpCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfidenceBreakdown } from "@/components/ConfidenceBreakdown";
import { FindingStatusBadge } from "@/components/FindingStatusBadge";

type InvoiceBreakdown = {
  month: string;
  invoice_date: string;
  expected: number;
  billed: number;
  difference: number;
  has_discrepancy: boolean;
  invoice_number?: string;
  description?: string;
  confidence?: number;
  discrepancy?: Discrepancy;
};

type PricingPeriod = {
  start_date: string;
  end_date?: string;
  amount: number;
  source: string;
  reason: string;
  invoice_count?: number;
  discrepancy_count?: number;
  total_leakage?: number;
  invoice_breakdown?: InvoiceBreakdown[];
};

type Discrepancy = {
  customer?: string;
  issue?: string;
  value?: number;
  priority?: string;
  invoice_date?: string;
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
  invoice_reference?: string;
  description?: string;
  evidence?: Array<{
    type?: string;
    label?: string;
    text?: string;
  }>;
};

type PricingTimelineProps = {
  periods: PricingPeriod[];
  discrepancies: Discrepancy[];
  currency?: string;
  invoiceCount?: number;
  onViewContract?: (source: string) => void;
  onViewDiscrepancies?: (period: PricingPeriod) => void;
  onViewInvoice?: (invoiceNumber: string, invoiceDate: string) => void;
};

export function PricingTimeline({
  periods,
  discrepancies,
  currency = "₹",
  invoiceCount = 0,
  onViewContract,
  onViewDiscrepancies,
  onViewInvoice,
}: PricingTimelineProps) {
  // Calculate discrepancies per period
  const periodStats = useMemo(() => {
    return periods.map((period, idx) => {
      const periodStart = new Date(period.start_date);
      const periodEnd = period.end_date 
        ? new Date(period.end_date)
        : idx < periods.length - 1 
          ? new Date(periods[idx + 1].start_date) 
          : new Date(); // Current date for last period
      
      // Use invoice_breakdown if available (from backend), otherwise calculate from discrepancies
      let totalLeakage = period.total_leakage || 0;
      let discrepancyCount = period.discrepancy_count || 0;
      let periodDiscrepancies = [];
      let invoiceBreakdown: InvoiceBreakdown[] = period.invoice_breakdown || [];
      
      if (period.invoice_breakdown && period.invoice_breakdown.length > 0) {
        // Use backend-provided breakdown
        totalLeakage = period.total_leakage || 0;
        discrepancyCount = period.discrepancy_count || period.invoice_breakdown.filter(inv => inv.has_discrepancy).length;
        invoiceBreakdown = period.invoice_breakdown;
      } else {
        // Fallback: calculate from discrepancies array and build breakdown
        periodDiscrepancies = discrepancies.filter((disc) => {
          if (!disc.invoice_date) return false;
          const invoiceDate = new Date(disc.invoice_date);
          return invoiceDate >= periodStart && invoiceDate < periodEnd;
        });
        totalLeakage = periodDiscrepancies.reduce((sum, d) => sum + (d.value || 0), 0);
        discrepancyCount = periodDiscrepancies.length;
        
        // Build invoice breakdown from discrepancies
        if (periodDiscrepancies.length > 0) {
          invoiceBreakdown = periodDiscrepancies.map((disc) => {
            const invoiceDate = disc.invoice_date ? new Date(disc.invoice_date) : new Date();
            const monthKey = invoiceDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
            const expected = period.amount;
            const billed = expected - (disc.value || 0);
            
            return {
              month: monthKey,
              invoice_date: invoiceDate.toISOString(),
              expected: expected,
              billed: billed,
              difference: disc.value || 0,
              has_discrepancy: true,
              invoice_number: disc.invoice_reference || "N/A",
              description: disc.issue || "",
              confidence: disc.confidence || 0.85, // Default to 85% if not provided
              discrepancy: disc, // Store full discrepancy for tooltip
            };
          });
        }
      }
      
      return {
        period: {
          ...period,
          invoice_breakdown: invoiceBreakdown, // Ensure breakdown is always available
        },
        periodStart,
        periodEnd,
        discrepancies: periodDiscrepancies,
        periodDiscrepancies, // Store for use in tooltips
        totalLeakage,
        discrepancyCount,
      };
    });
  }, [periods, discrepancies]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const formatCurrency = (amount: number) => {
    return `${currency}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  const getPeriodType = (reason: string) => {
    if (reason.toLowerCase().includes("base") || reason.toLowerCase().includes("original")) {
      return "base";
    }
    if (reason.toLowerCase().includes("escalation") || reason.toLowerCase().includes("%")) {
      return "escalation";
    }
    if (reason.toLowerCase().includes("amendment")) {
      return "amendment";
    }
    return "other";
  };

  const getPeriodIcon = (type: string) => {
    switch (type) {
      case "base":
        return <FileTextIcon className="h-6 w-6 text-primary" />;
      case "escalation":
        return <TrendingUp className="h-6 w-6 text-cta" />;
      case "amendment":
        return <FileEdit className="h-6 w-6 text-primary" />;
      default:
        return <Calendar className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const getPeriodBadge = (type: string, reason: string) => {
    switch (type) {
      case "escalation":
        const match = reason.match(/(\d+(?:\.\d+)?)%/);
        const rate = match ? match[1] : "";
        return <Badge variant="outline" className="bg-cta/10 text-cta border-cta/20">+{rate}% Escalation</Badge>;
      case "amendment":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Amendment</Badge>;
      default:
        return null;
    }
  };

  if (!periods || periods.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6">
        <p className="text-sm text-muted-foreground">No pricing timeline data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card/90 shadow-hover p-6 space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground">Contract Pricing Timeline</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Shows how your contract pricing changed over time and when discrepancies occurred
        </p>
      </div>

      <div className="space-y-6">
        {periodStats.map((stat, idx) => {
          const periodType = getPeriodType(stat.period.reason);
          const hasIssues = stat.discrepancyCount > 0;
          
          return (
            <div
              key={idx}
              className={`relative pl-8 border-l-2 ${
                hasIssues ? "border-destructive" : "border-success"
              }`}
            >
              {/* Period Header */}
              <div className="flex items-start gap-4">
                <div className={`-left-[13px] absolute top-0 h-6 w-6 rounded-full border-2 ${
                  hasIssues 
                    ? "bg-destructive border-destructive" 
                    : "bg-success border-success"
                } flex items-center justify-center`}>
                  {getPeriodIcon(periodType)}
                </div>
                
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-foreground">
                          {formatDate(stat.periodStart)} - {idx === periodStats.length - 1 ? "Present" : formatDate(stat.periodEnd)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl font-bold text-foreground">
                          {formatCurrency(stat.period.amount)}
                        </span>
                        <span className="text-sm text-muted-foreground">/month</span>
                        {getPeriodBadge(periodType, stat.period.reason)}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">{stat.period.reason}</p>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileTextIcon className="h-3 w-3" />
                        <span>From: {stat.period.source}</span>
                        {onViewContract && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-cta"
                            onClick={() => onViewContract(stat.period.source)}
                          >
                            View Document →
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Invoice Status with Expandable Details */}
                  <div className={`rounded-lg p-3 ${
                    hasIssues 
                      ? "bg-destructive/10 border border-destructive/20" 
                      : "bg-success/10 border border-success/20"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {hasIssues ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-success" />
                        )}
                        <span className={`text-sm font-semibold ${
                          hasIssues ? "text-destructive" : "text-success"
                        }`}>
                          {hasIssues 
                            ? `${stat.discrepancyCount} invoice${stat.discrepancyCount === 1 ? "" : "s"} with discrepancies`
                            : "All invoices billed correctly"
                          }
                        </span>
                      </div>
                      {hasIssues && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-destructive">
                            {formatCurrency(stat.totalLeakage)} missing
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 🔥 NEW: Expandable Invoice Breakdown */}
                    {hasIssues && (
                      <details className="mt-3" open={stat.period.invoice_breakdown && stat.period.invoice_breakdown.length > 0}>
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 list-none">
                          <Calculator className="h-4 w-4" />
                          <span>Show month-by-month breakdown</span>
                          <ChevronDown className="h-4 w-4 ml-auto" />
                        </summary>
                        
                        <div className="mt-4 space-y-4">
                          {/* Month-by-Month Table */}
                          {stat.period.invoice_breakdown && stat.period.invoice_breakdown.length > 0 ? (
                            <>
                              <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="border-b border-border/60">
                                    <th className="text-left py-2 px-3 text-muted-foreground font-semibold">Month</th>
                                    <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Expected</th>
                                    <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Billed</th>
                                    <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Missing</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stat.period.invoice_breakdown.map((invoice, invIdx) => (
                                  <tr
                                    key={invIdx}
                                    className={`border-b border-border/30 ${
                                      invoice.has_discrepancy ? "bg-destructive/5" : ""
                                    }`}
                                  >
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-medium">{invoice.month}</span>
                                        {invoice.invoice_number && invoice.invoice_number !== "N/A" && (
                                          <span className="text-xs text-muted-foreground">({invoice.invoice_number})</span>
                                        )}
                                        {/* 🔥 Enhancement 2: Why This Invoice? Tooltip */}
                                        {invoice.has_discrepancy && invoice.discrepancy && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                                              </TooltipTrigger>
                                              <TooltipContent className="max-w-xs">
                                                <div className="text-xs space-y-1">
                                                  <p className="font-semibold mb-2">Why this is a discrepancy:</p>
                                                  {invoice.discrepancy.description && (
                                                    <p className="text-muted-foreground">• {invoice.discrepancy.description}</p>
                                                  )}
                                                  {invoice.invoice_date && (
                                                    <p className="text-muted-foreground">
                                                      • Invoice date: {new Date(invoice.invoice_date).toLocaleDateString()}
                                                    </p>
                                                  )}
                                                  {invoice.discrepancy.confidence && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                      <ConfidenceBreakdown
                                                        breakdown={invoice.discrepancy.confidence_breakdown}
                                                        overallConfidence={invoice.discrepancy.confidence}
                                                        compact={true}
                                                      />
                                                      {invoice.discrepancy.finding_status && (
                                                        <FindingStatusBadge status={invoice.discrepancy.finding_status} />
                                                      )}
                                                    </div>
                                                  )}
                                                  {stat.discrepancies && stat.discrepancies.length > 1 && (
                                                    <p className="text-muted-foreground">
                                                      • Pattern matches {stat.discrepancies.length - 1} other invoice{stat.discrepancies.length - 1 === 1 ? "" : "s"}
                                                    </p>
                                                  )}
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono">
                                      {formatCurrency(invoice.expected)}
                                    </td>
                                    <td className={`py-2 px-3 text-right font-mono ${
                                      invoice.has_discrepancy ? "text-destructive" : "text-foreground"
                                    }`}>
                                      {formatCurrency(invoice.billed)}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        {invoice.has_discrepancy && invoice.difference > 0 ? (
                                          <>
                                            <Badge variant="destructive" className="font-mono">
                                              -{formatCurrency(Math.abs(invoice.difference))}
                                            </Badge>
                                            {/* 🔥 Enhancement 1: Confidence Score */}
                                            {invoice.confidence && (
                                              <ConfidenceBreakdown
                                                breakdown={invoice.discrepancy?.confidence_breakdown}
                                                overallConfidence={invoice.confidence}
                                                compact={true}
                                              />
                                            )}
                                            {invoice.discrepancy?.finding_status && (
                                              <FindingStatusBadge status={invoice.discrepancy.finding_status} />
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-success">✓</span>
                                        )}
                                      </div>
                                    </td>
                                    {/* 🔥 Enhancement 3: View Invoice Link */}
                                    {onViewInvoice && invoice.invoice_number && invoice.invoice_number !== "N/A" && (
                                      <td className="py-2 px-3 text-center">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => onViewInvoice(invoice.invoice_number!, invoice.invoice_date)}
                                        >
                                          <FileText className="h-3 w-3 mr-1" />
                                          View
                                        </Button>
                                      </td>
                                    )}
                                  </tr>
                                  ))}
                                  <tr className="bg-destructive/10 font-bold">
                                    <td colSpan={onViewInvoice ? 4 : 3} className="py-2 px-3">
                                      Total Missing:
                                    </td>
                                    <td className="py-2 px-3 text-right text-destructive font-mono">
                                      {formatCurrency(stat.totalLeakage)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Calculation Explanation */}
                            <div className="p-3 rounded-lg bg-secondary/30 border border-border/60">
                              <div className="flex items-start gap-2">
                                <Calculator className="h-4 w-4 text-primary mt-0.5" />
                                <div className="flex-1">
                                  <strong className="text-sm">How we calculated {formatCurrency(stat.totalLeakage)}:</strong>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {(() => {
                                      const discrepantInvoices = stat.period.invoice_breakdown.filter(inv => inv.has_discrepancy && inv.difference > 0);
                                      if (discrepantInvoices.length === 0) return "No discrepancies found.";
                                      
                                      // Check for patterns
                                      const allSameAmount = discrepantInvoices.every(inv => 
                                        Math.abs(inv.difference - discrepantInvoices[0].difference) < 0.01
                                      );
                                      const allSameBilled = discrepantInvoices.every(inv => 
                                        Math.abs(inv.billed - discrepantInvoices[0].billed) < 0.01
                                      );
                                      
                                      const breakdown = discrepantInvoices.map(inv => 
                                        `${inv.month}: ${formatCurrency(Math.abs(inv.difference))}`
                                      ).join(" | ");
                                      
                                      let patternText = "";
                                      if (allSameAmount && discrepantInvoices.length > 1) {
                                        patternText = `\n⚠️ Pattern detected: All ${discrepantInvoices.length} invoices missing the same amount (${formatCurrency(Math.abs(discrepantInvoices[0].difference))})`;
                                      } else if (allSameBilled && discrepantInvoices.length > 1) {
                                        patternText = `\n⚠️ Pattern detected: All ${discrepantInvoices.length} invoices billed at old rate (${formatCurrency(discrepantInvoices[0].billed)})`;
                                      }
                                      
                                      return (
                                        <>
                                          {discrepantInvoices.length} month{discrepantInvoices.length === 1 ? "" : "s"} with discrepancies: {breakdown}
                                          {patternText && (
                                            <span className="text-cta font-semibold block mt-2">
                                              {patternText}
                                            </span>
                                          )}
                                          {onViewContract && (
                                            <Button 
                                              variant="link" 
                                              className="text-xs p-0 h-auto mt-1"
                                              onClick={() => onViewContract(stat.period.source)}
                                            >
                                              View escalation clause in contract →
                                            </Button>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Heatmap Visualization */}
                            <div className="p-3 rounded-lg bg-secondary/30 border border-border/60">
                              <h4 className="text-sm font-semibold mb-3">Invoice Status by Month</h4>
                              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                                {stat.period.invoice_breakdown.map((invoice, invIdx) => {
                                  const monthAbbr = invoice.month.split(" ")[0];
                                  const isError = invoice.has_discrepancy && invoice.difference > 0;
                                  
                                  return (
                                    <div
                                      key={invIdx}
                                      className={`relative p-2 rounded-lg border-2 text-center transition-all ${
                                        isError
                                          ? "bg-destructive/20 border-destructive/40 hover:bg-destructive/30"
                                          : "bg-success/20 border-success/40 hover:bg-success/30"
                                      }`}
                                      title={`${invoice.month}: ${isError ? `Missing ${formatCurrency(Math.abs(invoice.difference))}` : "Correct"}`}
                                    >
                                      <div className="text-xs font-semibold mb-1">{monthAbbr}</div>
                                      {isError ? (
                                        <>
                                          <AlertTriangle className="h-4 w-4 text-destructive mx-auto mb-1" />
                                          <div className="text-[10px] text-destructive font-bold">
                                            -{formatCurrency(Math.abs(invoice.difference)).replace(currency, "").replace(/,/g, "")}
                                          </div>
                                        </>
                                      ) : (
                                        <CheckCircle className="h-4 w-4 text-success mx-auto" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex gap-4 mt-3 text-xs">
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3 text-success" />
                                  <span className="text-muted-foreground">Correct</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-destructive" />
                                  <span className="text-muted-foreground">Discrepancy</span>
                                </div>
                              </div>
                            </div>
                          </>
                          ) : (
                            <div className="p-4 rounded-lg bg-secondary/30 border border-border/60 text-center text-sm text-muted-foreground">
                              Invoice breakdown data not available. Run a new audit to see detailed month-by-month breakdown.
                            </div>
                          )}

                          {/* Action Button */}
                          {onViewDiscrepancies && (
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => onViewDiscrepancies(stat.period)}
                              >
                                View All Discrepancies →
                              </Button>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="pt-4 border-t border-border/60">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Periods</p>
            <p className="text-lg font-bold text-foreground">{periods.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Invoices Audited</p>
            <p className="text-lg font-bold text-foreground">{invoiceCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Discrepancies</p>
            <p className="text-lg font-bold text-destructive">{discrepancies.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Leakage</p>
            <p className="text-lg font-bold text-destructive">
              {formatCurrency(discrepancies.reduce((sum, d) => sum + (d.value || 0), 0))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

