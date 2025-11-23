import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Mail, FileText } from "lucide-react";

type CustomerDrillDownProps = {
  customer: string | null;
  discrepancies: Array<{
    issue?: string;
    value?: number;
    priority?: string;
    invoice_date?: string;
    evidence?: any[];
  }>;
  currency: string;
  onClose: () => void;
};

const formatCurrency = (value: number, currency: string) => {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };
  const symbol = symbols[currency] || currency;
  return `${symbol}${value.toLocaleString()}`;
};

export const CustomerDrillDown = ({
  customer,
  discrepancies,
  currency,
  onClose,
}: CustomerDrillDownProps) => {
  if (!customer) return null;

  const customerDiscrepancies = discrepancies.filter(
    (d) => d.issue?.toLowerCase().includes(customer.toLowerCase()) || 
           d.evidence?.some((e: any) => e.reference?.includes(customer))
  );

  const totalLeakage = customerDiscrepancies.reduce((sum, d) => sum + (d.value || 0), 0);
  const highPriority = customerDiscrepancies.filter((d) => d.priority === "high").length;
  const avgDiscrepancy = customerDiscrepancies.length > 0 ? totalLeakage / customerDiscrepancies.length : 0;

  const riskLevel = highPriority > 2 ? "High" : highPriority > 0 ? "Medium" : "Low";
  const riskColor = riskLevel === "High" ? "text-destructive" : riskLevel === "Medium" ? "text-cta" : "text-success";

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-3">
            {customer}
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
              riskLevel === "High" ? "bg-destructive/10 text-destructive" :
              riskLevel === "Medium" ? "bg-cta/10 text-cta" :
              "bg-success/10 text-success"
            }`}>
              {riskLevel} Risk
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-border/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Total Leakage
            </div>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalLeakage, currency)}</p>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              Issues Found
            </div>
            <p className="text-2xl font-bold text-foreground">{customerDiscrepancies.length}</p>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Avg per Issue
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(avgDiscrepancy, currency)}</p>
          </div>
        </div>

        {/* Discrepancy List */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Detailed Breakdown</h3>
          
          {customerDiscrepancies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success" />
              <p>No discrepancies found for this customer</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customerDiscrepancies.map((disc, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/60 p-4 space-y-2 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground flex items-center gap-2">
                        {disc.issue || "Issue pending triage"}
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            disc.priority === "high"
                              ? "bg-destructive/10 text-destructive"
                              : disc.priority === "medium"
                                ? "bg-cta/10 text-cta"
                                : "bg-secondary/60 text-foreground"
                          }`}
                        >
                          {(disc.priority || "medium").toUpperCase()}
                        </span>
                      </p>
                      {disc.invoice_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Invoice Date: {new Date(disc.invoice_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <p className="text-lg font-bold text-destructive">
                      {formatCurrency(disc.value || 0, currency)}
                    </p>
                  </div>

                  {disc.evidence && disc.evidence.length > 0 && (
                    <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground mb-1">Evidence:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {disc.evidence.slice(0, 2).map((ev: any, evIdx: number) => (
                          <li key={evIdx}>
                            {ev.type === "contract_clause" ? `Contract: ${ev.label}` : `Invoice: ${ev.reference}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border/60">
          <Button variant="cta" className="gap-2">
            <Mail className="h-4 w-4" />
            Draft Recovery Email
          </Button>
          <Button variant="secondary" className="gap-2">
            <FileText className="h-4 w-4" />
            Export Customer Report
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

