import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfidenceBreakdown } from "@/components/ConfidenceBreakdown";
import { FindingStatusBadge } from "@/components/FindingStatusBadge";

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
};

export const DiscrepancyItem = ({
  discrepancy: disc,
  formatCurrency,
  contractCurrency,
  onViewAuditTrail,
}: DiscrepancyItemProps) => {
  const [showConfidenceDialog, setShowConfidenceDialog] = useState(false);

  return (
    <div className="text-sm py-2 border-b border-border/30 last:border-0">
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
                      onClick={() => onViewAuditTrail(disc)}
                    >
                      Audit Trail
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
              <DialogTitle>Confidence Breakdown</DialogTitle>
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

