import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, HelpCircle, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type FindingStatus = "confirmed" | "needs_review" | "dismissed" | "insufficient" | string;

type FindingStatusBadgeProps = {
  status?: FindingStatus;
  className?: string;
  showTooltip?: boolean;
};

export const FindingStatusBadge = ({
  status,
  className = "",
  showTooltip = true,
}: FindingStatusBadgeProps) => {
  const statusConfig = {
    confirmed: {
      label: "Confirmed",
      variant: "default" as const,
      icon: CheckCircle2,
      color: "bg-success/20 text-success border-success/30",
      description: "High confidence discrepancy - ready for dispute",
    },
    needs_review: {
      label: "Needs Review",
      variant: "secondary" as const,
      icon: AlertCircle,
      color: "bg-cta/20 text-cta border-cta/30",
      description: "Medium confidence - manual verification recommended",
    },
    dismissed: {
      label: "Dismissed",
      variant: "outline" as const,
      icon: XCircle,
      color: "bg-secondary/20 text-muted-foreground border-border",
      description: "Low confidence - likely false positive",
    },
    insufficient: {
      label: "Insufficient Data",
      variant: "outline" as const,
      icon: HelpCircle,
      color: "bg-secondary/20 text-muted-foreground border-border",
      description: "Cannot determine - need more information",
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.needs_review;
  const Icon = config.icon;

  const badge = (
    <Badge
      variant={config.variant}
      className={`flex items-center gap-1.5 ${config.color} ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
};



