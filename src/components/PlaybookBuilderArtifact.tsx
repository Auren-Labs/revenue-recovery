import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Sparkles,
  ArrowRight,
  Copy,
  CheckCircle2,
  Plus,
  X,
  Layers,
  Target,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/utils/currency";
import { useToast } from "@/components/ui/use-toast";

type PlaybookRule = {
  id: string;
  type: "escalation" | "sla" | "pricing" | "term" | "custom";
  label: string;
  description: string;
  pattern?: string;
  value?: any;
};

type PlaybookBuilderArtifactProps = {
  jobId: string;
  contract: {
    id?: string;
    vendor_name?: string;
    base_amount?: number;
    escalation_rate?: number;
    currency?: string;
    issue?: string;
    discrepancies?: Array<{
      issue?: string;
      value?: number;
    }>;
  };
  onClose: () => void;
};

/**
 * Contract Playbook Builder Artifact
 * Drag-and-drop canvas to turn contracts into reusable templates
 */
export const PlaybookBuilderArtifact = ({
  jobId,
  contract,
  onClose,
}: PlaybookBuilderArtifactProps) => {
  const { toast } = useToast();
  const [playbookName, setPlaybookName] = useState(
    `${contract.vendor_name || "Contract"}-${new Date().getFullYear()}-Template`
  );
  const [playbookDescription, setPlaybookDescription] = useState(
    `Template based on ${contract.vendor_name || "contract"} recovery patterns`
  );
  const [rules, setRules] = useState<PlaybookRule[]>([
    {
      id: "1",
      type: "escalation",
      label: "Escalation Rate",
      description: "Annual price increase percentage",
      value: contract.escalation_rate || 0.05,
    },
    {
      id: "2",
      type: "pricing",
      label: "Base Amount",
      description: "Monthly base subscription fee",
      value: contract.base_amount || 0,
    },
    {
      id: "3",
      type: "custom",
      label: "Common Issue Pattern",
      description: contract.issue || "Billing discrepancy pattern",
      pattern: contract.issue || "",
    },
  ]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const totalRecovery = useMemo(() => {
    return contract.discrepancies?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;
  }, [contract.discrepancies]);

  const handleAddRule = () => {
    const newRule: PlaybookRule = {
      id: Date.now().toString(),
      type: "custom",
      label: "New Rule",
      description: "Add description",
    };
    setRules([...rules, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleUpdateRule = (id: string, updates: Partial<PlaybookRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleApplyToVendors = async () => {
    if (selectedVendors.length === 0) {
      toast({
        title: "No Vendors Selected",
        description: "Please select at least one vendor to apply this playbook",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    toast({
      title: "Playbook Applied",
      description: `Applied to ${selectedVendors.length} vendor${selectedVendors.length > 1 ? "s" : ""}. Scanning for matching issues...`,
    });

    setIsGenerating(false);
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
                <Layers className="h-3 w-3 mr-1" />
                Contract Playbook Builder
              </Badge>
              <h1 className="text-3xl font-bold mb-2">Create Reusable Template</h1>
              <p className="text-muted-foreground">
                Turn this contract recovery into a reusable playbook for similar vendors
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Recovery Value</div>
              <div className="text-5xl font-bold text-success mb-2">
                {formatCurrency(totalRecovery, contract.currency || "INR")}
              </div>
              <Badge variant="outline" className="text-xs">
                {contract.discrepancies?.length || 0} issues found
              </Badge>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Playbook Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Playbook Details</CardTitle>
          </div>
          <CardDescription>Name and describe your playbook template</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Playbook Name</Label>
            <Input
              id="name"
              value={playbookName}
              onChange={(e) => setPlaybookName(e.target.value)}
              placeholder="SA-2024-001-Template"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={playbookDescription}
              onChange={(e) => setPlaybookDescription(e.target.value)}
              rows={3}
              placeholder="Describe when to use this playbook..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Rules Canvas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <CardTitle>Playbook Rules</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={handleAddRule}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
          <CardDescription>
            Define patterns and rules to detect in other contracts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <AnimatePresence>
              {rules.map((rule, idx) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="capitalize">
                        {rule.type}
                      </Badge>
                      <Input
                        value={rule.label}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, { label: e.target.value })
                        }
                        className="font-semibold border-0 bg-transparent p-0 h-auto"
                        placeholder="Rule label"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveRule(rule.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={rule.description}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, { description: e.target.value })
                    }
                    rows={2}
                    className="mb-2"
                    placeholder="Rule description..."
                  />
                  {rule.value !== undefined && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-sm">
                      Value: {typeof rule.value === "number" ? formatCurrency(rule.value, contract.currency || "INR") : rule.value}
                    </div>
                  )}
                  {rule.pattern && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-sm">
                      Pattern: {rule.pattern}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {rules.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No rules defined. Add rules to create your playbook.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Source Contract Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Source Contract</CardTitle>
          </div>
          <CardDescription>Contract this playbook is based on</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Vendor</div>
              <div className="font-semibold">{contract.vendor_name || "Unknown"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Base Amount</div>
              <div className="font-semibold">
                {formatCurrency(contract.base_amount || 0, contract.currency || "INR")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Escalation Rate</div>
              <div className="font-semibold">
                {((contract.escalation_rate || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Recovery</div>
              <div className="font-semibold text-success">
                {formatCurrency(totalRecovery, contract.currency || "INR")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Apply to Vendors */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle>Apply to Vendors</CardTitle>
          </div>
          <CardDescription>
            Select vendors to scan with this playbook pattern
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <div className="text-sm text-muted-foreground mb-3">
                Select vendors to apply this playbook (mock list)
              </div>
              <div className="grid md:grid-cols-3 gap-2">
                {["Vendor A", "Vendor B", "Vendor C", "Vendor D", "Vendor E"].map((vendor) => (
                  <Button
                    key={vendor}
                    variant={selectedVendors.includes(vendor) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (selectedVendors.includes(vendor)) {
                        setSelectedVendors(selectedVendors.filter((v) => v !== vendor));
                      } else {
                        setSelectedVendors([...selectedVendors, vendor]);
                      }
                    }}
                  >
                    {selectedVendors.includes(vendor) && (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    {vendor}
                  </Button>
                ))}
              </div>
            </div>
            {selectedVendors.length > 0 && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-success" />
                  <span className="font-semibold text-success">
                    {selectedVendors.length} vendor{selectedVendors.length > 1 ? "s" : ""} selected
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Applying this playbook will scan all contracts from selected vendors for matching
                  patterns and flag similar issues automatically.
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-border/50">
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
        >
          <Copy className="h-5 w-5 mr-2" />
          Save as Template
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
          onClick={handleApplyToVendors}
          disabled={isGenerating || selectedVendors.length === 0}
        >
          <Sparkles className="h-5 w-5 mr-2" />
          {isGenerating
            ? "Applying..."
            : `Apply to ${selectedVendors.length || 0} Vendor${selectedVendors.length !== 1 ? "s" : ""}`}
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};

