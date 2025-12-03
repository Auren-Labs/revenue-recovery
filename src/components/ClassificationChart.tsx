import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from "recharts";

type ClassificationChartProps = {
  stats: {
    total_items?: number;
    recurring?: number; // Legacy support
    recurring_fixed?: number; // Fixed subscriptions
    recurring_variable?: number; // Variable overages
    one_time?: number;
    credits?: number;
    adjustments?: number;
  };
};

const COLORS = {
  recurring_fixed: "hsl(var(--primary))", // Blue for fixed subscriptions
  recurring_variable: "hsl(var(--cta))", // Orange for variable overages
  recurring: "hsl(var(--primary))", // Legacy support
  one_time: "hsl(var(--muted-foreground))",
  credits: "hsl(var(--success))",
  adjustments: "hsl(var(--muted))",
};

const LABELS = {
  recurring_fixed: "Fixed (Subscriptions)",
  recurring_variable: "Variable (Overages)",
  recurring: "Recurring", // Legacy support
  one_time: "One-Time",
  credits: "Credits",
  adjustments: "Adjustments",
};

export const ClassificationChart = ({ stats }: ClassificationChartProps) => {
  const chartData = useMemo(() => {
    // Prioritize new fields (recurring_fixed, recurring_variable) over legacy (recurring)
    const hasNewFields = (stats.recurring_fixed !== undefined) || (stats.recurring_variable !== undefined);
    
    const data = [];
    
    if (hasNewFields) {
      // Use new Fixed vs Variable split
      if (stats.recurring_fixed && stats.recurring_fixed > 0) {
        data.push({ 
          name: LABELS.recurring_fixed, 
          value: stats.recurring_fixed, 
          color: COLORS.recurring_fixed 
        });
      }
      if (stats.recurring_variable && stats.recurring_variable > 0) {
        data.push({ 
          name: LABELS.recurring_variable, 
          value: stats.recurring_variable, 
          color: COLORS.recurring_variable 
        });
      }
    } else {
      // Fallback to legacy recurring field
      if (stats.recurring && stats.recurring > 0) {
        data.push({ 
          name: LABELS.recurring, 
          value: stats.recurring, 
          color: COLORS.recurring 
        });
      }
    }
    
    // Add other categories
    if (stats.one_time && stats.one_time > 0) {
      data.push({ 
        name: LABELS.one_time, 
        value: stats.one_time, 
        color: COLORS.one_time 
      });
    }
    if (stats.credits && stats.credits > 0) {
      data.push({ 
        name: LABELS.credits, 
        value: stats.credits, 
        color: COLORS.credits 
      });
    }
    if (stats.adjustments && stats.adjustments > 0) {
      data.push({ 
        name: LABELS.adjustments, 
        value: stats.adjustments, 
        color: COLORS.adjustments 
      });
    }

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
        {chartData.map((item) => {
          const isVariable = item.name === LABELS.recurring_variable;
          const isFixed = item.name === LABELS.recurring_fixed;
          return (
            <div 
              key={item.name} 
              className={`flex items-center gap-2 p-2 rounded-lg ${
                isVariable ? "bg-cta/5 border border-cta/20" : 
                isFixed ? "bg-primary/5 border border-primary/20" : 
                ""
              }`}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <div className="flex-1 min-w-0">
                <p className={`${isVariable || isFixed ? "font-medium" : "text-muted-foreground"}`}>
                  {item.name}
                </p>
                <p className="font-semibold text-foreground">
                  {item.value} <span className="text-muted-foreground">({Math.round((item.value / total) * 100)}%)</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-semibold text-foreground">{total}</span> total line items classified
        </p>
        {stats.recurring_variable && stats.recurring_variable > 0 && (
          <p className="text-[11px] text-cta/80">
            ⚠️ Variable costs (overages) can silently grow - monitor closely
          </p>
        )}
      </div>
    </div>
  );
};

