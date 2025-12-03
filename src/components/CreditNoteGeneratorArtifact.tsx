import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  FileText,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Building2,
  Hash,
  Calendar,
  Upload,
  Send,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/utils/currency";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

type CreditNoteGeneratorArtifactProps = {
  jobId: string;
  discrepancy: {
    value?: number;
    issue?: string;
    invoice_reference?: string;
    invoice_date?: string;
    customer?: string;
  };
  currency: string;
  vendorName?: string;
  onClose: () => void;
};

type ERPSystem = "odoo" | "netsuite" | "zoho" | "sap" | "quickbooks";

/**
 * Vendor Credit Note Generator Artifact
 * Pre-filled ERP credit note form ready to post
 */
export const CreditNoteGeneratorArtifact = ({
  jobId,
  discrepancy,
  currency,
  vendorName,
  onClose,
}: CreditNoteGeneratorArtifactProps) => {
  const { toast } = useToast();
  const [erpSystem, setErpSystem] = useState<ERPSystem>("odoo");
  const [glCode, setGlCode] = useState("4000-001"); // Accounts Payable
  const [memo, setMemo] = useState(
    `Credit note for billing discrepancy: ${discrepancy.issue || "Invoice error"}. Invoice: ${discrepancy.invoice_reference || "N/A"}`
  );
  const [reference, setReference] = useState(`CN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const creditAmount = discrepancy.value || 0;

  const handleGenerate = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    toast({
      title: "Credit Note Generated",
      description: `Credit note ${reference} has been created and is ready to post to ${erpSystem.toUpperCase()}`,
    });
    
    setIsSubmitting(false);
  };

  const handlePostToERP = async () => {
    setIsSubmitting(true);
    // Simulate ERP posting
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    toast({
      title: "Posted to ERP",
      description: `Credit note ${reference} has been successfully posted to ${erpSystem.toUpperCase()}`,
    });
    
    setIsSubmitting(false);
  };

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
                <Building2 className="h-3 w-3 mr-1" />
                ERP Credit Note Generator
              </Badge>
              <h1 className="text-3xl font-bold mb-2">Generate Credit Note</h1>
              <p className="text-muted-foreground">
                Pre-filled form ready to post directly to your ERP system
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Credit Amount</div>
              <div className="text-5xl font-bold text-success mb-2">
                {formatCurrency(creditAmount, currency)}
              </div>
              <Badge variant="outline" className="text-xs">
                Ready to Post
              </Badge>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ERP Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>ERP System</CardTitle>
          </div>
          <CardDescription>Select your ERP system for direct posting</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-3">
            {(["odoo", "netsuite", "zoho", "sap", "quickbooks"] as ERPSystem[]).map((system) => (
              <motion.button
                key={system}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setErpSystem(system)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  erpSystem === system
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="text-sm font-semibold capitalize mb-1">{system}</div>
                {erpSystem === system && (
                  <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                )}
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Credit Note Form */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column - Basic Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Credit Note Details</CardTitle>
            </div>
            <CardDescription>Basic information for the credit note</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Credit Note Number</Label>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="CN-2025-0001"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Credit Note Date</Label>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  defaultValue={format(new Date(), "yyyy-MM-dd")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="vendor"
                  value={vendorName || "Vendor Name"}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Credit Amount</Label>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount"
                  value={formatCurrency(creditAmount, currency)}
                  disabled
                  className="bg-muted font-mono text-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice">Original Invoice</Label>
              <Input
                id="invoice"
                value={discrepancy.invoice_reference || "N/A"}
                disabled
                className="bg-muted"
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Accounting & Memo */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              <CardTitle>Accounting Details</CardTitle>
            </div>
            <CardDescription>GL codes and accounting information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="glCode">GL Code</Label>
              <Select value={glCode} onValueChange={setGlCode}>
                <SelectTrigger id="glCode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4000-001">4000-001 - Accounts Payable</SelectItem>
                  <SelectItem value="4000-002">4000-002 - Vendor Credits</SelectItem>
                  <SelectItem value="5000-001">5000-001 - Cost of Goods Sold</SelectItem>
                  <SelectItem value="6000-001">6000-001 - Operating Expenses</SelectItem>
                  <SelectItem value="7000-001">7000-001 - Other Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo / Description</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={6}
                placeholder="Enter credit note description..."
                className="resize-none"
              />
              <div className="text-xs text-muted-foreground">
                {memo.length} characters
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground mb-2">Auto-filled from discrepancy:</div>
              <div className="text-sm">
                <div className="font-semibold mb-1">{discrepancy.issue}</div>
                {discrepancy.invoice_date && (
                  <div className="text-muted-foreground">
                    Invoice Date: {format(new Date(discrepancy.invoice_date), "MMM dd, yyyy")}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Credit Note Preview</CardTitle>
          </div>
          <CardDescription>Review before posting to {erpSystem.toUpperCase()}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 rounded-lg border-2 border-border bg-card">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Credit Note #</div>
                <div className="text-lg font-semibold mb-4">{reference}</div>
                
                <div className="text-xs text-muted-foreground mb-1">Vendor</div>
                <div className="text-sm font-medium mb-4">{vendorName || "Vendor Name"}</div>
                
                <div className="text-xs text-muted-foreground mb-1">Original Invoice</div>
                <div className="text-sm font-medium">{discrepancy.invoice_reference || "N/A"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">GL Code</div>
                <div className="text-lg font-semibold mb-4">{glCode}</div>
                
                <div className="text-xs text-muted-foreground mb-1">Credit Amount</div>
                <div className="text-3xl font-bold text-success mb-4">
                  {formatCurrency(creditAmount, currency)}
                </div>
                
                <div className="text-xs text-muted-foreground mb-1">Description</div>
                <div className="text-sm">{memo}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-border/50">
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          onClick={handleGenerate}
          disabled={isSubmitting}
        >
          <Upload className="h-5 w-5 mr-2" />
          Generate & Download PDF
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
          onClick={handlePostToERP}
          disabled={isSubmitting}
        >
          <Send className="h-5 w-5 mr-2" />
          {isSubmitting ? "Posting..." : `Post to ${erpSystem.toUpperCase()}`}
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};

