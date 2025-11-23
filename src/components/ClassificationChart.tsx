import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from "recharts";

type ClassificationChartProps = {
  stats: {
    total_items?: number;
    recurring?: number;
    one_time?: number;
    credits?: number;
    adjustments?: number;
  };
};

const COLORS = {
  recurring: "hsl(var(--primary))",
  one_time: "hsl(var(--cta))",
  credits: "hsl(var(--success))",
  adjustments: "hsl(var(--muted))",
};

const LABELS = {
  recurring: "Recurring",
  one_time: "One-Time",
  credits: "Credits",
  adjustments: "Adjustments",
};

export const ClassificationChart = ({ stats }: ClassificationChartProps) => {
  const chartData = useMemo(() => {
    const data = [
      { name: LABELS.recurring, value: stats.recurring || 0, color: COLORS.recurring },
      { name: LABELS.one_time, value: stats.one_time || 0, color: COLORS.one_time },
      { name: LABELS.credits, value: stats.credits || 0, color: COLORS.credits },
      { name: LABELS.adjustments, value: stats.adjustments || 0, color: COLORS.adjustments },
    ].filter((item) => item.value > 0);

    return data;
  }, [stats]);

  const total = stats.total_items || 0;

  if (total === 0 || chartData.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No invoice data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex-1">
              <p className="text-muted-foreground">{item.name}</p>
              <p className="font-semibold text-foreground">
                {item.value} <span className="text-muted-foreground">({Math.round((item.value / total) * 100)}%)</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{total}</span> total line items classified
        </p>
      </div>
    </div>
  );
};

