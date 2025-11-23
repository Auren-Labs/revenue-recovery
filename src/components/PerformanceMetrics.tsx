import { Clock, Zap, FileCheck, TrendingUp } from "lucide-react";

type PerformanceMetricsProps = {
  auditTime?: number;
  totalClauses?: number;
  invoiceCount?: number;
  gpt4oEnhanced?: boolean;
};

export const PerformanceMetrics = ({
  auditTime,
  totalClauses,
  invoiceCount,
  gpt4oEnhanced,
}: PerformanceMetricsProps) => {
  const formatTime = (seconds?: number) => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const throughput = auditTime && invoiceCount ? Math.round((invoiceCount / auditTime) * 60) : 0;

  const metrics = [
    {
      label: "Processing Time",
      value: formatTime(auditTime),
      icon: Clock,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Throughput",
      value: throughput > 0 ? `${throughput}/min` : "N/A",
      icon: Zap,
      color: "text-cta",
      bgColor: "bg-cta/10",
    },
    {
      label: "Clauses Extracted",
      value: totalClauses?.toString() || "0",
      icon: FileCheck,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "AI Enhancement",
      value: gpt4oEnhanced ? "GPT-4o" : "Standard",
      icon: TrendingUp,
      color: gpt4oEnhanced ? "text-success" : "text-muted-foreground",
      bgColor: gpt4oEnhanced ? "bg-success/10" : "bg-secondary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-xl border border-border/60 p-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${metric.bgColor}`}>
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{metric.value}</p>
        </div>
      ))}
    </div>
  );
};

