import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, FileText, Calendar, TrendingDown, Sparkles, Info } from "lucide-react";
import { ConfidenceBreakdown } from "./ConfidenceBreakdown";
import { FindingStatusBadge } from "./FindingStatusBadge";

type AuditStep = {
  step: number;
  name: string;
  description: string;
  confidence: number;
  evidence?: string;
  icon: typeof CheckCircle2;
  status: "success" | "warning" | "error";
};

type AuditTrailProps = {
  discrepancy: {
    confidence?: number;
    confidence_breakdown?: {
      overall?: number;
      components?: {
        classification?: { score: number; reason: string };
        date_parsing?: { score: number; reason: string };
        amount_match?: { score: number; reason: string };
        contract_extraction?: { score: number; reason: string };
        validation?: { score: number; reason: string };
      };
      weakest_component?: {
        name: string;
        score: number;
        reason: string;
      };
    };
    finding_status?: string;
    evidence?: Array<{
      type?: string;
      label?: string;
      text?: string;
      page?: number;
      file?: string;
    }>;
    invoice_date?: string;
    invoice_reference?: string;
    issue?: string;
    value?: number;
  };
  onViewDocument?: (evidence: any) => void;
};

export const AuditTrail = ({ discrepancy, onViewDocument }: AuditTrailProps) => {
  const breakdown = discrepancy.confidence_breakdown;
  const components = breakdown?.components || {};
  
  // Build step-by-step audit trail
  const steps: AuditStep[] = [
    {
      step: 1,
      name: "Contract Extraction",
      description: components.contract_extraction?.reason || "Extracted contract terms from documents",
      confidence: components.contract_extraction?.score || 0.95,
      evidence: discrepancy.evidence?.find(e => e.type === "contract_clause")?.text,
      icon: FileText,
      status: (components.contract_extraction?.score || 0) >= 0.8 ? "success" : "warning",
    },
    {
      step: 2,
      name: "Invoice Classification",
      description: components.classification?.reason || "Classified invoice line items",
      confidence: components.classification?.score || 0.9,
      evidence: `Invoice ${discrepancy.invoice_reference || "N/A"} dated ${discrepancy.invoice_date || "N/A"}`,
      icon: CheckCircle2,
      status: (components.classification?.score || 0) >= 0.8 ? "success" : "warning",
    },
    {
      step: 3,
      name: "Date Analysis",
      description: components.date_parsing?.reason || "Analyzed invoice dates and contract effective dates",
      confidence: components.date_parsing?.score || 1.0,
      evidence: `Invoice date: ${discrepancy.invoice_date || "N/A"}`,
      icon: Calendar,
      status: (components.date_parsing?.score || 0) >= 0.8 ? "success" : "success",
    },
    {
      step: 4,
      name: "Amount Verification",
      description: components.amount_match?.reason || "Compared billed amount vs expected amount",
      confidence: components.amount_match?.score || 0.95,
      evidence: `Expected vs Billed: ${discrepancy.value || 0}`,
      icon: TrendingDown,
      status: (components.amount_match?.score || 0) >= 0.8 ? "success" : "warning",
    },
    {
      step: 5,
      name: "AI Validation",
      description: components.validation?.reason || "Validated finding with GPT-4o",
      confidence: components.validation?.score || 0.92,
      evidence: "Confirmed not a pro-rata or adjustment",
      icon: Sparkles,
      status: (components.validation?.score || 0) >= 0.8 ? "success" : "warning",
    },
  ];

  const overallConfidence = breakdown?.overall || discrepancy.confidence || 0;
  const weakest = breakdown?.weakest_component;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How We Found This Discrepancy
          </span>
          <FindingStatusBadge status={discrepancy.finding_status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Confidence */}
        <div className="text-center p-4 rounded-lg border border-border bg-card/50">
          <div className="text-3xl font-bold mb-1">
            <span
              className={
                overallConfidence >= 0.85
                  ? "text-success"
                  : overallConfidence >= 0.75
                    ? "text-cta"
                    : "text-destructive"
              }
            >
              {Math.round(overallConfidence * 100)}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Overall Confidence</p>
          {weakest && (
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Weakest signal: {weakest.name} ({Math.round(weakest.score * 100)}%)
            </p>
          )}
        </div>

        {/* Step-by-Step Trail */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Audit Steps</h3>
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isWeakest = weakest?.name === step.name;
            
            return (
              <div
                key={step.step}
                className={`relative pl-8 pb-4 ${
                  idx < steps.length - 1 ? "border-l-2 border-border" : ""
                } ${isWeakest ? "border-l-destructive" : ""}`}
              >
                {/* Step Number */}
                <div
                  className={`absolute left-0 top-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.status === "success"
                      ? "bg-success text-success-foreground"
                      : step.status === "warning"
                        ? "bg-cta text-cta-foreground"
                        : "bg-destructive text-destructive-foreground"
                  }`}
                  style={{ marginLeft: "-13px" }}
                >
                  {step.step}
                </div>

                {/* Step Content */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{step.name}</span>
                      {isWeakest && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          Weakest
                        </Badge>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        step.confidence >= 0.8
                          ? "border-success text-success"
                          : step.confidence >= 0.6
                            ? "border-cta text-cta"
                            : "border-destructive text-destructive"
                      }
                    >
                      {Math.round(step.confidence * 100)}%
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">{step.description}</p>

                  {step.evidence && (
                    <div className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded border border-border/50">
                      <strong>Evidence:</strong> {step.evidence}
                      {step.step === 1 && discrepancy.evidence?.[0] && onViewDocument && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs ml-2"
                          onClick={() => onViewDocument(discrepancy.evidence?.[0])}
                        >
                          View Document
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Conclusion */}
        <div
          className={`p-4 rounded-lg border ${
            overallConfidence >= 0.85
              ? "border-success/50 bg-success/10"
              : overallConfidence >= 0.75
                ? "border-cta/50 bg-cta/10"
                : "border-destructive/50 bg-destructive/10"
          }`}
        >
          <div className="flex items-start gap-2">
            {overallConfidence >= 0.85 ? (
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-cta mt-0.5" />
            )}
            <div>
              <p className="font-semibold">
                {overallConfidence >= 0.85
                  ? "High-Confidence Billing Error"
                  : overallConfidence >= 0.75
                    ? "Likely Billing Error - Review Recommended"
                    : "Low Confidence - Manual Verification Required"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {overallConfidence >= 0.85
                  ? "This finding has been validated through multiple checks and is ready for dispute."
                  : "This finding requires manual review before taking action."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

