import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  FileText,
  DollarSign,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/utils/currency";
import { format, differenceInDays, addDays, isAfter, isBefore } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

type Contract = {
  id: string;
  vendor_name: string;
  termination_date?: string;
  base_amount?: number;
  currency?: string;
  status?: string;
};

type RenewalCountdownArtifactProps = {
  contracts?: Contract[];
  onGeneratePack?: (contractId: string) => void;
  onClose: () => void;
};

/**
 * Renewal Countdown Center Artifact
 * Full-page live canvas with countdown, contracts ending in 90 days, at-risk spend
 */
export const RenewalCountdownArtifact = ({
  contracts = [],
  onGeneratePack,
  onClose,
}: RenewalCountdownArtifactProps) => {
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Process contracts
  const processedContracts = useMemo(() => {
    const now = currentTime;
    const ninetyDaysFromNow = addDays(now, 90);

    return contracts
      .map((contract) => {
        if (!contract.termination_date) return null;
        
        const terminationDate = new Date(contract.termination_date);
        const daysUntil = differenceInDays(terminationDate, now);
        
        if (daysUntil < 0) return null; // Already expired
        if (daysUntil > 90) return null; // More than 90 days away

        const monthlyAmount = contract.base_amount || 0;
        const annualAmount = monthlyAmount * 12;
        const atRiskAmount = (monthlyAmount * daysUntil) / 30; // Approximate

        return {
          ...contract,
          terminationDate,
          daysUntil,
          monthlyAmount,
          annualAmount,
          atRiskAmount,
          urgency: daysUntil <= 30 ? "critical" : daysUntil <= 60 ? "high" : "medium",
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [contracts, currentTime]);

  const totalAtRisk = useMemo(() => {
    return processedContracts.reduce((sum, c) => sum + c.atRiskAmount, 0);
  }, [processedContracts]);

  const criticalCount = processedContracts.filter((c) => c.urgency === "critical").length;
  const highCount = processedContracts.filter((c) => c.urgency === "high").length;

  // Get nearest renewal
  const nearestRenewal = processedContracts[0];

  return (
    <div className="space-y-6">
      {/* Hero Countdown */}
      {nearestRenewal && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-destructive/20 via-destructive/10 to-cta/10 border-2 border-destructive/30 p-8"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6zM36 4V0h-2v4h-4v2h4v4h2V6h4V4h-4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <Badge className="mb-3 bg-destructive/20 text-destructive border-destructive/30">
                  <Clock className="h-3 w-3 mr-1" />
                  Next Renewal
                </Badge>
                <h1 className="text-3xl font-bold mb-2">{nearestRenewal.vendor_name}</h1>
                <p className="text-muted-foreground">
                  Renewal Date: {format(nearestRenewal.terminationDate, "MMMM dd, yyyy")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-2">Days Until Renewal</div>
                <div className="text-7xl font-bold text-destructive mb-2">
                  {nearestRenewal.daysUntil}
                </div>
                <Badge
                  variant={
                    nearestRenewal.urgency === "critical"
                      ? "destructive"
                      : nearestRenewal.urgency === "high"
                      ? "default"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {nearestRenewal.urgency === "critical"
                    ? "Critical"
                    : nearestRenewal.urgency === "high"
                    ? "High Priority"
                    : "Medium Priority"}
                </Badge>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Contracts Ending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{processedContracts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">In next 90 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{criticalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">≤ 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{highCount}</div>
            <p className="text-xs text-muted-foreground mt-1">31-60 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">At-Risk Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {formatCurrency(totalAtRisk, processedContracts[0]?.currency || "INR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total at risk</p>
          </CardContent>
        </Card>
      </div>

      {/* Contracts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Upcoming Renewals</CardTitle>
            </div>
            <Badge variant="outline">{processedContracts.length} contracts</Badge>
          </div>
          <CardDescription>
            Contracts ending in the next 90 days - Generate negotiation packs now
          </CardDescription>
        </CardHeader>
        <CardContent>
          {processedContracts.length > 0 ? (
            <div className="space-y-4">
              {processedContracts.map((contract, idx) => (
                <motion.div
                  key={contract.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-6 rounded-lg border-2 border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{contract.vendor_name}</h3>
                        <Badge
                          variant={
                            contract.urgency === "critical"
                              ? "destructive"
                              : contract.urgency === "high"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {contract.urgency === "critical"
                            ? "Critical"
                            : contract.urgency === "high"
                            ? "High"
                            : "Medium"}
                        </Badge>
                      </div>
                      <div className="grid md:grid-cols-3 gap-4 mt-4">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Renewal Date</div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                              {format(contract.terminationDate, "MMM dd, yyyy")}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Days Remaining</div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-destructive">
                              {contract.daysUntil} days
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Monthly Spend</div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                              {formatCurrency(contract.monthlyAmount, contract.currency || "INR")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">At-Risk Amount</div>
                            <div className="text-lg font-bold text-destructive">
                              {formatCurrency(contract.atRiskAmount, contract.currency || "INR")}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              onGeneratePack?.(contract.id);
                              toast({
                                title: "Generating Negotiation Pack",
                                description: `Creating negotiation pack for ${contract.vendor_name}`,
                              });
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate Pack
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No contracts ending in the next 90 days</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle>Quick Actions</CardTitle>
          </div>
          <CardDescription>Bulk actions for all upcoming renewals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => {
                toast({
                  title: "Generating All Packs",
                  description: `Creating negotiation packs for ${processedContracts.length} contracts`,
                });
              }}
            >
              <Sparkles className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Generate All Packs</div>
                <div className="text-xs text-muted-foreground">
                  {processedContracts.length} contracts
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
            >
              <FileText className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Export Summary</div>
                <div className="text-xs text-muted-foreground">CSV Report</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
            >
              <TrendingUp className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Schedule Reviews</div>
                <div className="text-xs text-muted-foreground">Calendar invites</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

