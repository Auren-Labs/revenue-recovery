import { useMemo } from "react";
import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type EvidenceRegion = {
  page?: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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
};

type ConfidenceGaugeProps = {
  documents: ExtractedDocument[];
  onClauseClick?: (doc: ExtractedDocument, clause: ClauseReference) => void;
};

export const ConfidenceGauge = ({ documents, onClauseClick }: ConfidenceGaugeProps) => {
  const confidenceStats = useMemo(() => {
    const allClausesWithDoc = documents.flatMap((doc) => 
      (doc.clauses || []).map(clause => ({ 
        clause,
        doc,
      }))
    );
    const total = allClausesWithDoc.length;

    if (total === 0) {
      return { 
        high: 0, 
        medium: 0, 
        low: 0, 
        total: 0, 
        avgConfidence: 0,
        allClauses: [],
      };
    }

    const high = allClausesWithDoc.filter((item) => (item.clause.confidence ?? 0) >= 0.8).length;
    const medium = allClausesWithDoc.filter((item) => (item.clause.confidence ?? 0) >= 0.5 && (item.clause.confidence ?? 0) < 0.8).length;
    const low = allClausesWithDoc.filter((item) => (item.clause.confidence ?? 0) < 0.5).length;

    const avgConfidence =
      allClausesWithDoc.reduce((sum, item) => sum + (item.clause.confidence ?? 0), 0) / total;

    return {
      high,
      medium,
      low,
      total,
      avgConfidence,
      highPct: (high / total) * 100,
      mediumPct: (medium / total) * 100,
      lowPct: (low / total) * 100,
      allClauses: allClausesWithDoc,
    };
  }, [documents]);

  if (confidenceStats.total === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No clause data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Confidence Score */}
      <div className="text-center">
        <div className="text-4xl font-bold text-foreground">
          {Math.round(confidenceStats.avgConfidence * 100)}%
        </div>
        <p className="text-xs text-muted-foreground mt-1">Average Confidence</p>
      </div>

      {/* Confidence Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-muted-foreground">High (&gt;80%)</span>
          </div>
          <span className="font-semibold text-foreground">{confidenceStats.high}</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${confidenceStats.highPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-cta" />
            <span className="text-muted-foreground">Medium (50-80%)</span>
          </div>
          <span className="font-semibold text-foreground">{confidenceStats.medium}</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-cta transition-all duration-500"
            style={{ width: `${confidenceStats.mediumPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">Low (&lt;50%)</span>
          </div>
          <span className="font-semibold text-foreground">{confidenceStats.low}</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-destructive transition-all duration-500"
            style={{ width: `${confidenceStats.lowPct}%` }}
          />
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="cursor-help hover:text-foreground transition-colors">
                  <span className="font-semibold text-foreground">{confidenceStats.total}</span> total
                  clauses analyzed
                  <HelpCircle className="inline h-3 w-3 ml-1" />
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md max-h-96 overflow-y-auto">
                <div className="space-y-3 p-2">
                  <p className="font-semibold text-sm mb-2">Extracted Clauses:</p>
                  {confidenceStats.allClauses.length > 0 ? (
                    <div className="space-y-2">
                      {confidenceStats.allClauses.map((item, idx) => {
                        const { clause, doc } = item;
                        const hasRegions = clause.regions && clause.regions.length > 0;
                        const isClickable = hasRegions && onClauseClick;
                        
                        return (
                          <div 
                            key={idx} 
                            className={`border-l-2 border-border pl-2 py-1 ${
                              isClickable 
                                ? 'cursor-pointer hover:border-primary hover:bg-primary/5 transition-all rounded-r' 
                                : ''
                            }`}
                            onClick={() => {
                              if (isClickable) {
                                onClauseClick(doc, clause);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-xs">
                                  {clause.label || `Clause ${idx + 1}`}
                                </p>
                                {isClickable && (
                                  <span className="text-[10px] text-primary font-semibold">
                                    📍 View
                                  </span>
                                )}
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                (clause.confidence ?? 0) >= 0.8 
                                  ? 'bg-success/20 text-success' 
                                  : (clause.confidence ?? 0) >= 0.5
                                    ? 'bg-cta/20 text-cta'
                                    : 'bg-destructive/20 text-destructive'
                              }`}>
                                {Math.round((clause.confidence ?? 0) * 100)}%
                              </span>
                            </div>
                            {clause.text && (
                              <p className="text-[10px] text-muted-foreground italic line-clamp-2">
                                "{clause.text.substring(0, 100)}{clause.text.length > 100 ? '...' : ''}"
                              </p>
                            )}
                            {doc.filename && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                📄 {doc.filename}
                                {hasRegions && clause.regions && clause.regions[0]?.page && (
                                  <span className="ml-1">• Page {clause.regions[0].page}</span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No clauses extracted yet</p>
                  )}
                  {confidenceStats.allClauses.some(item => item.clause.regions && item.clause.regions.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-[10px] text-primary font-semibold flex items-center gap-1">
                        💡 Tip: Click on any clause with "📍 View" to see it highlighted in the contract
                      </p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 cursor-help hover:text-foreground transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <div className="space-y-2 text-xs">
                  <p className="font-semibold">How confidence scores work:</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li><strong>High (&gt;80%):</strong> Azure Document Intelligence detected clear, structured clause data with high certainty</li>
                    <li><strong>Medium (50-80%):</strong> Clause detected but may need validation due to formatting or OCR quality</li>
                    <li><strong>Low (&lt;50%):</strong> Uncertain extraction - manual review strongly recommended</li>
                  </ul>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Confidence is based on OCR quality, document structure, and pattern matching accuracy from Azure AI.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {confidenceStats.low > 0 && (
          <p className="text-destructive">
            ⚠️ {confidenceStats.low} clause{confidenceStats.low > 1 ? "s" : ""} need manual review
          </p>
        )}
      </div>
    </div>
  );
};

