import { useMemo } from "react";
import { CheckCircle2, AlertCircle, HelpCircle, TrendingDown, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type ConfidenceComponent = {
  score: number;
  weight: number;
  reason: string;
  name?: string;
  details?: string;
};

type ConfidenceBreakdownData = {
  overall?: number;
  overall_weighted?: number;
  overall_geometric?: number;
  components?: {
    classification?: ConfidenceComponent;
    date_parsing?: ConfidenceComponent;
    amount_match?: ConfidenceComponent;
    contract_extraction?: ConfidenceComponent;
    validation?: ConfidenceComponent;
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

type ConfidenceBreakdownProps = {
  breakdown?: ConfidenceBreakdownData | null;
  overallConfidence?: number;
  compact?: boolean;
  showExplanation?: boolean;
};

const COMPONENT_LABELS: Record<string, string> = {
  classification: "Invoice Classification",
  date_parsing: "Date Parsing",
  amount_match: "Amount Comparison",
  contract_extraction: "Contract Terms",
  validation: "AI Validation",
};

import { Calendar, FileText, Sparkles } from "lucide-react";

const COMPONENT_ICONS: Record<string, typeof CheckCircle2> = {
  classification: CheckCircle2,
  date_parsing: Calendar,
  amount_match: TrendingDown,
  contract_extraction: FileText,
  validation: Sparkles,
};

export const ConfidenceBreakdown = ({
  breakdown,
  overallConfidence,
  compact = false,
  showExplanation = false,
}: ConfidenceBreakdownProps) => {
  const components = useMemo(() => {
    if (!breakdown?.components) return [];

    return Object.entries(breakdown.components)
      .map(([key, component]) => ({
        key,
        label: COMPONENT_LABELS[key] || key,
        icon: COMPONENT_ICONS[key] || Info,
        ...component,
      }))
      .filter((c) => c.score !== undefined);
  }, [breakdown]);

  const overall = breakdown?.overall ?? overallConfidence ?? 0;
  const weakest = breakdown?.weakest_component;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`cursor-help ${
                overall >= 0.85
                  ? "border-success text-success"
                  : overall >= 0.75
                    ? "border-cta text-cta"
                    : "border-destructive text-destructive"
              }`}
            >
              {Math.round(overall * 100)}% confident
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md">
            <div className="space-y-2 text-xs">
              <p className="font-semibold">Confidence Breakdown</p>
              {components.map((comp) => (
                <div key={comp.key} className="flex items-center justify-between gap-2">
                  <span>{comp.label}:</span>
                  <span className="font-mono">{Math.round(comp.score * 100)}%</span>
                </div>
              ))}
              {weakest && (
                <div className="pt-2 border-t border-border">
                  <p className="text-destructive text-[11px]">
                    ⚠️ Weakest: {weakest.name} ({Math.round(weakest.score * 100)}%)
                  </p>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="text-center p-4 rounded-lg border border-border bg-card/50">
        <div className="text-3xl font-bold mb-1">
          <span
            className={
              overall >= 0.85
                ? "text-success"
                : overall >= 0.75
                  ? "text-cta"
                  : "text-destructive"
            }
          >
            {Math.round(overall * 100)}%
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Overall Confidence</p>
        {breakdown?.overall_weighted && breakdown?.overall_geometric && (
          <p className="text-xs text-muted-foreground mt-1">
            Weighted: {Math.round(breakdown.overall_weighted * 100)}% • Geometric:{" "}
            {Math.round(breakdown.overall_geometric * 100)}%
          </p>
        )}
      </div>

      {/* Component Breakdown */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Confidence Components</p>
        {components.map((comp) => {
          const Icon = comp.icon;
          const isWeakest = weakest?.name === comp.label;
          return (
            <div
              key={comp.key}
              className={`p-3 rounded-lg border ${
                isWeakest
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border bg-card/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{comp.label}</span>
                  {isWeakest && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Weakest
                    </Badge>
                  )}
                </div>
                <span
                  className={`font-mono text-sm font-semibold ${
                    comp.score >= 0.8
                      ? "text-success"
                      : comp.score >= 0.6
                        ? "text-cta"
                        : "text-destructive"
                  }`}
                >
                  {Math.round(comp.score * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full transition-all ${
                    comp.score >= 0.8
                      ? "bg-success"
                      : comp.score >= 0.6
                        ? "bg-cta"
                        : "bg-destructive"
                  }`}
                  style={{ width: `${comp.score * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{comp.reason}</span>
                <span className="text-muted-foreground">Weight: {Math.round(comp.weight * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Factors */}
      {breakdown?.additional_factors && breakdown.additional_factors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Additional Factors</p>
          {breakdown.additional_factors.map((factor, idx) => (
            <div
              key={idx}
              className="p-2 rounded border border-border/50 bg-secondary/20 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{factor.name}</span>
                <span className="font-mono">{Math.round(factor.score * 100)}%</span>
              </div>
              <p className="text-muted-foreground mt-1">{factor.reason}</p>
              {factor.details && (
                <p className="text-muted-foreground text-[11px] mt-1">{factor.details}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Explanation */}
      {showExplanation && breakdown?.explanation && (
        <div className="p-3 rounded-lg border border-border bg-card/30">
          <p className="text-xs font-semibold mb-2">Why we flagged this:</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
            {breakdown.explanation}
          </pre>
        </div>
      )}
    </div>
  );
};

