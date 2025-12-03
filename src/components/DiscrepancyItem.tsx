import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfidenceBreakdown } from "@/components/ConfidenceBreakdown";
import { FindingStatusBadge } from "@/components/FindingStatusBadge";
import { FileText, Sparkles, ArrowRight } from "lucide-react";

type DiscrepancyItemProps = {
  discrepancy: {
    invoice_date?: string;
    issue?: string;
    value?: number;
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
    evidence?: Array<any>;
  };
  formatCurrency: (value: number, currency: string) => string;
  contractCurrency: string;
  onViewAuditTrail?: (discrepancy: any) => void;
  onClick?: (discrepancy: any) => void;
  onOpenSplitView?: (discrepancy: any) => void;
  onOpenArtifact?: (discrepancy: any) => void;
};

export const DiscrepancyItem = ({
  discrepancy: disc,
  formatCurrency,
  contractCurrency,
  onViewAuditTrail,
  onClick,
  onOpenSplitView,
  onOpenArtifact,
}: DiscrepancyItemProps) => {
  const [showConfidenceDialog, setShowConfidenceDialog] = useState(false);

  return (
    <div 
      className={`text-sm py-2 border-b border-border/30 last:border-0 ${onClick ? 'cursor-pointer hover:bg-secondary/30 rounded px-2 transition-colors' : ''}`}
      onClick={() => onClick?.(disc)}
    >
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">{disc.invoice_date || "N/A"}</span>
            {disc.issue && (
              <span className="text-xs text-muted-foreground">• {disc.issue}</span>
            )}
            {disc.finding_status && (
              <FindingStatusBadge status={disc.finding_status} />
            )}
          </div>
          {disc.confidence !== undefined && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <ConfidenceBreakdown
                breakdown={disc.confidence_breakdown}
                overallConfidence={disc.confidence}
                compact={true}
              />
              {disc.confidence_breakdown && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowConfidenceDialog(true)}
                  >
                    View Details
                  </Button>
                  {onViewAuditTrail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewAuditTrail(disc);
                      }}
                    >
                      Audit Trail
                    </Button>
                  )}
                  {onOpenArtifact && (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 text-xs bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenArtifact(disc);
                      }}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Open as Artifact
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {disc.validation_reason && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {disc.validation_reason}
            </p>
          )}
        </div>
        <span className="font-mono text-destructive font-semibold">
          {formatCurrency(disc.value || 0, contractCurrency)}
        </span>
      </div>

      {/* Confidence Breakdown Dialog */}
      {disc.confidence_breakdown && (
        <Dialog open={showConfidenceDialog} onOpenChange={setShowConfidenceDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Confidence Breakdown</DialogTitle>
                {disc.evidence?.some((item: any) => item.type === "invoice_line_error") &&
                 disc.evidence?.some((item: any) => item.type === "contract_clause") &&
                 onOpenSplitView && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const invoiceEvidence = disc.evidence?.find(
                        (item: any) => item.type === "invoice_line_error"
                      );
                      const contractEvidence = disc.evidence?.find(
                        (item: any) => item.type === "contract_clause"
                      );
                      if (invoiceEvidence && contractEvidence) {
                        setShowConfidenceDialog(false);
                        setTimeout(() => {
                          onOpenSplitView(disc);
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
            <div className="mt-4">
              <ConfidenceBreakdown
                breakdown={disc.confidence_breakdown}
                overallConfidence={disc.confidence}
                compact={false}
                showExplanation={true}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

