import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  DollarSign,
  Calendar,
  Sparkles,
  ArrowRight,
  Target,
  Percent,
  Clock,
  Award,
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/utils/currency";
import { format, addYears, differenceInDays } from "date-fns";

type NegotiationSimulatorArtifactProps = {
  jobId: string;
  contract: {
    base_amount?: number;
    escalation_rate?: number;
    effective_start_date?: string;
    termination_date?: string;
    currency?: string;
    sla_uptime?: number;
    service_credit_rate?: number;
    vendor_name?: string;
  };
  onClose: () => void;
};

/**
 * Negotiation Simulator Artifact
 * Interactive dashboard with sliders to simulate different negotiation scenarios
 */
export const NegotiationSimulatorArtifact = ({
  jobId,
  contract,
  onClose,
}: NegotiationSimulatorArtifactProps) => {
  const baseAmount = contract.base_amount || 100000;
  const currentEscalation = contract.escalation_rate || 0.05;
  const currency = contract.currency || "INR";
  const terminationDate = contract.termination_date 
    ? new Date(contract.termination_date) 
    : addYears(new Date(), 1);
  const slaUptime = contract.sla_uptime || 99.9;
  const serviceCreditRate = contract.service_credit_rate || 0.1;

  // Simulation parameters
  const [escalationPercent, setEscalationPercent] = useState([currentEscalation * 100]);
  const [termLength, setTermLength] = useState([3]); // years
  const [slaTarget, setSlaTarget] = useState([slaUptime]);
  const [serviceCreditPercent, setServiceCreditPercent] = useState([serviceCreditRate * 100]);

  // Calculate savings
  const calculations = useMemo(() => {
    const newEscalation = escalationPercent[0] / 100;
    const newTermYears = termLength[0];
    const newSLA = slaTarget[0] / 100;
    const newServiceCredit = serviceCreditPercent[0] / 100;

    // Current scenario (baseline)
    let currentYearly = baseAmount * 12;
    let currentTotal = 0;
    for (let year = 0; year < 3; year++) {
      const yearAmount = currentYearly * Math.pow(1 + currentEscalation, year);
      currentTotal += yearAmount;
    }

    // Negotiated scenario
    let negotiatedYearly = baseAmount * 12;
    let negotiatedTotal = 0;
    for (let year = 0; year < newTermYears; year++) {
      const yearAmount = negotiatedYearly * Math.pow(1 + newEscalation, year);
      negotiatedTotal += yearAmount;
    }

    // SLA credits (assume 1% downtime = service credit)
    const slaDifference = (newSLA - slaUptime / 100) * 100;
    const estimatedSlaCredits = slaDifference > 0 
      ? (negotiatedYearly * newServiceCredit * Math.abs(slaDifference) / 100) * newTermYears
      : 0;

    const totalSavings = currentTotal - negotiatedTotal + estimatedSlaCredits;
    const monthlySavings = totalSavings / (newTermYears * 12);
    const savingsPercent = (totalSavings / currentTotal) * 100;

    return {
      currentTotal,
      negotiatedTotal,
      totalSavings,
      monthlySavings,
      savingsPercent,
      estimatedSlaCredits,
      newTermYears,
    };
  }, [baseAmount, currentEscalation, escalationPercent, termLength, slaTarget, serviceCreditPercent, slaUptime]);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-cta/10 border-2 border-primary/30 p-8"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6zM36 4V0h-2v4h-4v2h4v4h2V6h4V4h-4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Badge className="mb-3 bg-primary/20 text-primary border-primary/30">
                <Target className="h-3 w-3 mr-1" />
                Negotiation Simulator
              </Badge>
              <h1 className="text-3xl font-bold mb-2">
                {contract.vendor_name || "Contract"} Renewal Strategy
              </h1>
              <p className="text-muted-foreground">
                Simulate different negotiation scenarios and see potential savings
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Potential Savings</div>
              <div className="text-5xl font-bold text-success mb-2">
                {formatCurrency(calculations.totalSavings, currency)}
              </div>
              <Badge variant="outline" className="text-xs">
                {calculations.savingsPercent.toFixed(1)}% reduction
              </Badge>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Simulation Controls */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Escalation Rate */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              <CardTitle>Annual Escalation Rate</CardTitle>
            </div>
            <CardDescription>
              Current: {(currentEscalation * 100).toFixed(1)}% → Negotiate to: {escalationPercent[0].toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Escalation %</Label>
                <div className="text-2xl font-bold text-primary">
                  {escalationPercent[0].toFixed(1)}%
                </div>
              </div>
              <Slider
                value={escalationPercent}
                onValueChange={setEscalationPercent}
                min={0}
                max={15}
                step={0.1}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0% (No increase)</span>
                <span>15% (High)</span>
              </div>
            </div>
            <Separator />
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Impact</div>
              <div className="text-lg font-semibold">
                {escalationPercent[0] < currentEscalation * 100 ? (
                  <span className="text-success">
                    <TrendingDown className="h-4 w-4 inline mr-1" />
                    Save {formatCurrency((currentEscalation - escalationPercent[0] / 100) * baseAmount * 12 * calculations.newTermYears, currency)}
                  </span>
                ) : (
                  <span className="text-destructive">
                    <TrendingUp className="h-4 w-4 inline mr-1" />
                    Additional cost: {formatCurrency((escalationPercent[0] / 100 - currentEscalation) * baseAmount * 12 * calculations.newTermYears, currency)}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Term Length */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>Contract Term Length</CardTitle>
            </div>
            <CardDescription>
              Negotiate contract duration for better rates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Years</Label>
                <div className="text-2xl font-bold text-primary">
                  {termLength[0]} {termLength[0] === 1 ? "Year" : "Years"}
                </div>
              </div>
              <Slider
                value={termLength}
                onValueChange={setTermLength}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>1 Year</span>
                <span>5 Years</span>
              </div>
            </div>
            <Separator />
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Total Contract Value</div>
              <div className="text-lg font-semibold">
                {formatCurrency(calculations.negotiatedTotal, currency)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SLA Target */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <CardTitle>SLA Uptime Target</CardTitle>
            </div>
            <CardDescription>
              Current: {slaUptime.toFixed(2)}% → Negotiate to: {slaTarget[0].toFixed(2)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Uptime %</Label>
                <div className="text-2xl font-bold text-primary">
                  {slaTarget[0].toFixed(2)}%
                </div>
              </div>
              <Slider
                value={slaTarget}
                onValueChange={setSlaTarget}
                min={99.0}
                max={99.99}
                step={0.01}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>99.0%</span>
                <span>99.99%</span>
              </div>
            </div>
            <Separator />
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Service Credits Available</div>
              <div className="text-lg font-semibold text-success">
                {formatCurrency(calculations.estimatedSlaCredits, currency)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Credit Rate */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle>Service Credit Rate</CardTitle>
            </div>
            <CardDescription>
              Percentage of monthly fee credited per SLA breach
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Credit %</Label>
                <div className="text-2xl font-bold text-primary">
                  {serviceCreditPercent[0].toFixed(1)}%
                </div>
              </div>
              <Slider
                value={serviceCreditPercent}
                onValueChange={setServiceCreditPercent}
                min={5}
                max={50}
                step={0.5}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>5%</span>
                <span>50%</span>
              </div>
            </div>
            <Separator />
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Max Credit per Month</div>
              <div className="text-lg font-semibold">
                {formatCurrency((baseAmount * serviceCreditPercent[0]) / 100, currency)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle>Savings Breakdown</CardTitle>
          </div>
          <CardDescription>
            Compare current vs negotiated scenario over {calculations.newTermYears} years
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Current Scenario */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 rounded-lg border-2 border-border bg-card"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Current Scenario</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Monthly</span>
                  <span className="font-semibold">{formatCurrency(baseAmount, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Escalation</span>
                  <span className="font-semibold">{(currentEscalation * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term</span>
                  <span className="font-semibold">3 Years</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">Total Cost</span>
                  <span className="font-bold text-destructive">
                    {formatCurrency(calculations.currentTotal, currency)}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Negotiated Scenario */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 rounded-lg border-2 border-success/30 bg-success/5"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-5 w-5 text-success" />
                <h3 className="font-semibold">Negotiated Scenario</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Monthly</span>
                  <span className="font-semibold">{formatCurrency(baseAmount, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Escalation</span>
                  <span className="font-semibold text-success">{escalationPercent[0].toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term</span>
                  <span className="font-semibold">{termLength[0]} Years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SLA Credits</span>
                  <span className="font-semibold text-success">
                    {formatCurrency(calculations.estimatedSlaCredits, currency)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">Total Cost</span>
                  <span className="font-bold text-success">
                    {formatCurrency(calculations.negotiatedTotal, currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          <Separator className="my-6" />

          {/* Total Savings */}
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="p-6 rounded-lg bg-gradient-to-r from-success/10 to-primary/10 border-2 border-success/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Savings Over {calculations.newTermYears} Years</div>
                <div className="text-4xl font-bold text-success">
                  {formatCurrency(calculations.totalSavings, currency)}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {formatCurrency(calculations.monthlySavings, currency)} per month on average
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-lg px-4 py-2 bg-success text-success-foreground">
                  {calculations.savingsPercent.toFixed(1)}% Reduction
                </Badge>
              </div>
            </div>
          </motion.div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-border/50">
        <Button
          size="lg"
          className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
        >
          <Sparkles className="h-5 w-5 mr-2" />
          Generate Negotiation Pack
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
        >
          <Download className="h-5 w-5 mr-2" />
          Export Scenario
        </Button>
      </div>
    </div>
  );
};

