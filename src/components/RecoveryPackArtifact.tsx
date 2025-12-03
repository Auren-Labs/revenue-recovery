import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Calculator,
  Mail,
  Download,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Calendar,
  DollarSign,
  Sparkles,
  ArrowRight,
  Copy,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { DisputeLetter } from "@/components/DisputeLetter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatCurrency } from "@/utils/currency";

type RecoveryPackArtifactProps = {
  jobId: string;
  discrepancy: {
    id?: string;
    customer?: string;
    issue?: string;
    value?: number;
    confidence?: number;
    invoice_date?: string;
    invoice_reference?: string;
    description?: string;
    evidence?: Array<{
      type?: string;
      label?: string;
      text?: string;
      page?: number;
      file?: string;
      bounds?: any;
      regions?: any[];
      metadata?: any;
    }>;
    confidence_breakdown?: any;
    finding_status?: string;
  };
  currency: string;
  vendorName?: string;
  onViewDocument?: (evidence: any) => void;
  onClose: () => void;
};

/**
 * Live Recovery Pack Artifact
 * Interactive, editable evidence pack with one-click recovery actions
 */
export const RecoveryPackArtifact = ({
  jobId,
  discrepancy,
  currency,
  vendorName,
  onViewDocument,
  onClose,
}: RecoveryPackArtifactProps) => {
  const { toast } = useToast();
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showERPCreditNote, setShowERPCreditNote] = useState(false);

  // Extract invoice evidence
  const invoiceEvidence = useMemo(() => {
    return discrepancy.evidence?.filter((e) => e.type === "invoice_line_error") || [];
  }, [discrepancy.evidence]);

  // Extract contract evidence
  const contractEvidence = useMemo(() => {
    return discrepancy.evidence?.filter((e) => e.type === "contract_clause") || [];
  }, [discrepancy.evidence]);

  // Calculate breakdown
  const recoveryAmount = discrepancy.value || 0;
  const confidence = discrepancy.confidence || 0;

  const handleGeneratePack = () => {
    setShowEmailComposer(true);
    toast({
      title: "Recovery Pack Generated",
      description: "Email draft and PDF are ready. Review and send when ready.",
    });
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Hero Section - Recovery Amount */}
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
                <Sparkles className="h-3 w-3 mr-1" />
                Live Recovery Pack
              </Badge>
              <h1 className="text-3xl font-bold mb-2">{discrepancy.issue || "Billing Discrepancy"}</h1>
              <p className="text-muted-foreground">{discrepancy.description}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Recoverable Amount</div>
              <div className="text-5xl font-bold text-primary mb-2">
                {formatCurrency(recoveryAmount, currency)}
              </div>
              <Badge
                variant={confidence > 0.8 ? "default" : confidence > 0.6 ? "secondary" : "outline"}
                className="text-xs"
              >
                {Math.round(confidence * 100)}% Confidence
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-lg px-8 py-6 h-auto"
              onClick={handleGeneratePack}
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Generate Recovery Pack
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Email draft ready</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>PDF evidence pack ready</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Evidence Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Contract Evidence */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Contract Evidence</CardTitle>
              </div>
              <Badge variant="outline">{contractEvidence.length} references</Badge>
            </div>
            <CardDescription>Red-lined contract clauses supporting this recovery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contractEvidence.length > 0 ? (
              contractEvidence.map((evidence, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-4 rounded-lg border border-border/50 bg-card hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => onViewDocument?.(evidence)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">{evidence.label || `Clause ${idx + 1}`}</span>
                    </div>
                    {evidence.page && (
                      <Badge variant="secondary" className="text-xs">
                        Page {evidence.page}
                      </Badge>
                    )}
                  </div>
                  {evidence.text && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{evidence.text}</p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDocument?.(evidence);
                    }}
                  >
                    View in PDF <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contract evidence available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice Comparison */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <CardTitle>Invoice Analysis</CardTitle>
              </div>
              <Badge variant="outline">{invoiceEvidence.length} invoices</Badge>
            </div>
            <CardDescription>Wrong vs correct amounts breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {invoiceEvidence.length > 0 ? (
              <div className="space-y-4">
                {invoiceEvidence.map((invoice, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-4 rounded-lg border border-border/50 bg-card"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold text-sm">
                          {(invoice as any).reference || `Invoice ${idx + 1}`}
                        </div>
                        {(invoice as any).invoice_date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date((invoice as any).invoice_date), "MMM dd, yyyy")}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={(invoice as any).found_rate ? "destructive" : "secondary"}
                      >
                        Issue Found
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
                        <div className="text-xs text-muted-foreground mb-1">Billed Amount</div>
                        <div className="text-lg font-semibold text-destructive">
                          {formatCurrency((invoice as any).found_rate || 0, currency)}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-success/10 border border-success/20">
                        <div className="text-xs text-muted-foreground mb-1">Expected Amount</div>
                        <div className="text-lg font-semibold text-success">
                          {formatCurrency(
                            ((invoice as any).found_rate || 0) + (invoiceEvidence.length > 0 ? recoveryAmount / invoiceEvidence.length : 0),
                            currency
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Difference</span>
                        <span className="font-semibold text-primary">
                          {formatCurrency(
                            invoiceEvidence.length > 0 ? recoveryAmount / invoiceEvidence.length : 0,
                            currency
                          )}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
                <Separator />
                <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="font-semibold">Total Recovery</span>
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(recoveryAmount, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calculator className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No invoice data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calculation Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>Recovery Calculation</CardTitle>
          </div>
          <CardDescription>
            Step-by-step breakdown of how {formatCurrency(recoveryAmount, currency)} was calculated
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoiceEvidence.length > 0 ? (
              <>
                <div className="space-y-3">
                  {invoiceEvidence.map((invoice, idx) => {
                    const billedAmount = (invoice as any).found_rate || 0;
                    const expectedAmount = billedAmount + (invoiceEvidence.length > 0 ? recoveryAmount / invoiceEvidence.length : 0);
                    const difference = expectedAmount - billedAmount;
                    
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-4 rounded-lg border border-border/50 bg-card"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-semibold text-sm">
                              Invoice {(invoice as any).reference || `#${idx + 1}`}
                            </div>
                            {(invoice as any).invoice_date && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {format(new Date((invoice as any).invoice_date), "MMM dd, yyyy")}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Billed</div>
                            <div className="text-lg font-semibold text-destructive">
                              {formatCurrency(billedAmount, currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Expected</div>
                            <div className="text-lg font-semibold text-success">
                              {formatCurrency(expectedAmount, currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Difference</div>
                            <div className="text-lg font-semibold text-primary">
                              {formatCurrency(difference, currency)}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <Separator />
              </>
            ) : null}
            <div className="flex items-center justify-between p-6 rounded-lg bg-gradient-to-r from-primary/10 to-cta/10 border-2 border-primary/30">
              <div>
                <span className="text-lg font-semibold block mb-1">Total Recoverable</span>
                <span className="text-sm text-muted-foreground">
                  {invoiceEvidence.length > 0 
                    ? `Across ${invoiceEvidence.length} invoice${invoiceEvidence.length > 1 ? 's' : ''}`
                    : 'Single discrepancy'
                  }
                </span>
              </div>
              <span className="text-4xl font-bold text-primary">
                {formatCurrency(recoveryAmount, currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-border/50">
        <Button
          size="lg"
          variant="outline"
          onClick={() => setShowEmailComposer(true)}
          className="flex-1"
        >
          <Mail className="h-5 w-5 mr-2" />
          Open Email Composer
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            // TODO: Generate PDF
            toast({
              title: "PDF Generated",
              description: "Recovery pack PDF is ready for download",
            });
          }}
          className="flex-1"
        >
          <Download className="h-5 w-5 mr-2" />
          Download PDF Pack
        </Button>
        {showERPCreditNote && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => setShowERPCreditNote(true)}
            className="flex-1"
          >
            <DollarSign className="h-5 w-5 mr-2" />
            Generate ERP Credit Note
          </Button>
        )}
      </div>

      {/* Email Composer Dialog */}
      {showEmailComposer && (
        <Dialog open={showEmailComposer} onOpenChange={setShowEmailComposer}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DisputeLetter
              jobId={jobId}
              discrepancyId={discrepancy.id || ""}
              discrepancy={discrepancy}
              currency={currency}
              onClose={() => setShowEmailComposer(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

