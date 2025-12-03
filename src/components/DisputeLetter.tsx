import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, Download, Copy, FileText, CheckCircle2 } from "lucide-react";
import { getAuthHeader } from "@/utils/auth";
import { useToast } from "@/components/ui/use-toast";
import ReactMarkdown from "react-markdown";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

type DisputeLetterProps = {
  jobId: string;
  discrepancyId: string;
  discrepancy: {
    issue?: string;
    value?: number;
    invoice_date?: string;
    invoice_reference?: string;
    customer?: string;
  };
  currency?: string;
  onClose?: () => void;
};

export const DisputeLetter = ({
  jobId,
  discrepancyId,
  discrepancy,
  currency = "INR",
  onClose,
}: DisputeLetterProps) => {
  const [letter, setLetter] = useState<string>("");
  const [vendorContact, setVendorContact] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/disputes/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          job_id: jobId,
          discrepancy_id: discrepancyId,
          vendor_contact: vendorContact || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate letter: ${response.statusText}`);
      }

      const data = await response.json();
      setLetter(data.letter);
      setIsGenerated(true);
      toast({
        title: "Success",
        description: "Dispute letter generated successfully",
      });
    } catch (error) {
      console.error("Generate error:", error);
      toast({
        title: "Error",
        description: "Failed to generate dispute letter. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(letter);
    toast({
      title: "Copied",
      description: "Letter copied to clipboard",
    });
  };

  const handleDownload = () => {
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispute-letter-${discrepancy.invoice_reference || "invoice"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Downloaded",
      description: "Letter downloaded successfully",
    });
  };

  const formatCurrency = (value: number) => {
    if (currency === "INR") return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (currency === "USD") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${value.toLocaleString()} ${currency}`;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Generate Dispute Letter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Discrepancy Summary */}
        <div className="p-4 rounded-lg border border-border bg-secondary/20">
          <h3 className="font-semibold mb-2">Discrepancy Details</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Issue:</span>
              <span className="ml-2 font-medium">{discrepancy.issue || "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Amount:</span>
              <span className="ml-2 font-medium text-destructive">
                {formatCurrency(discrepancy.value || 0)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Invoice Date:</span>
              <span className="ml-2">{discrepancy.invoice_date || "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Invoice #:</span>
              <span className="ml-2">{discrepancy.invoice_reference || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Vendor Contact (Optional) */}
        {!isGenerated && (
          <div>
            <Label htmlFor="vendor-contact">Vendor Contact Email (Optional)</Label>
            <Input
              id="vendor-contact"
              type="email"
              placeholder="accounts@vendor.com"
              value={vendorContact}
              onChange={(e) => setVendorContact(e.target.value)}
              className="mt-1"
            />
          </div>
        )}

        {/* Generate Button */}
        {!isGenerated && (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Letter...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Dispute Letter
              </>
            )}
          </Button>
        )}

        {/* Generated Letter */}
        {isGenerated && letter && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-semibold">Letter Generated</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[500px] w-full rounded-lg border border-border p-4 bg-card">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{letter}</ReactMarkdown>
              </div>
            </ScrollArea>

            <div className="p-3 rounded-lg border border-cta/20 bg-cta/5">
              <p className="text-sm text-muted-foreground">
                <strong>Next Steps:</strong> Review the letter, add any additional details if needed,
                then copy or download to send to the vendor. Consider attaching contract excerpts
                and invoice copies as supporting documentation.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};



