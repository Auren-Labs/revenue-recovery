import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileText,
  Sparkles,
  ShieldCheck,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Stage = "upload" | "document_extraction" | "llm_extraction" | "reconciliation";

const stageLabels: Record<Stage, { title: string; description: string; icon: React.ElementType }> = {
  upload: {
    title: "Secure Upload",
    description: "Files encrypted and stored in a private workspace",
    icon: ShieldCheck,
  },
  document_extraction: {
    title: "Document Parsing",
    description: "Contracts split into clauses and rate cards",
    icon: FileText,
  },
  llm_extraction: {
    title: "AI Clause Extraction",
    description: "LLM captures pricing logic, escalators, and obligations",
    icon: Sparkles,
  },
  reconciliation: {
    title: "Billing Reconciliation",
    description: "Invoices matched, leakage quantified",
    icon: BarChart2,
  },
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const stageOrder: Stage[] = ["upload", "document_extraction", "llm_extraction", "reconciliation"];

type ReconProgress = {
  percent?: number;
  message?: string;
};

const UploadPage = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vendorName, setVendorName] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [contractFiles, setContractFiles] = useState<File[]>([]);
  const [billingFiles, setBillingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStage, setCurrentStage] = useState<Stage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reconProgress, setReconProgress] = useState<ReconProgress | null>(null);
  const navigate = useNavigate();

  const onDropContracts = useCallback((acceptedFiles: File[]) => {
    setContractFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const onDropBilling = useCallback((acceptedFiles: File[]) => {
    setBillingFiles(acceptedFiles.filter((file) => file.name.endsWith(".csv") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx")));
  }, []);

  const contractDropzone = useDropzone({
    onDrop: onDropContracts,
    multiple: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc", ".docx"],
      "text/plain": [".txt"],
      "application/zip": [".zip"],
    },
  });

  const billingDropzone = useDropzone({
    onDrop: onDropBilling,
    multiple: false,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls", ".xlsx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xls", ".xlsx"],
    },
  });

  const contractSize = useMemo(
    () => (contractFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2),
    [contractFiles],
  );

  const billingSize = useMemo(
    () => (billingFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2),
    [billingFiles],
  );

  const handleNextStep = async () => {
    try {
      if (step === 1 && contractFiles.length) {
        if (!vendorName.trim()) {
          setMessage("Please enter the vendor name before continuing.");
          return;
        }
        const formData = new FormData();
        formData.append("vendor_name", vendorName);
        contractFiles.forEach((file) => formData.append("files", file));
        const res = await fetch(`${API_BASE}/upload/contracts`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Failed to upload contracts.");
        }
        const data = await res.json();
        setJobId(data.job_id);
        setStep(2);
        setReconProgress(null);
        setMessage(null);
      } else if (step === 2 && billingFiles.length && jobId) {
        const formData = new FormData();
        billingFiles.forEach((file) => formData.append("files", file));
        const res = await fetch(`${API_BASE}/upload/${jobId}/billing`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Failed to upload billing data.");
        }
        await startAudit(jobId);
      }
    } catch (error: any) {
      setMessage(error.message || "Something went wrong. Please try again.");
    }
  };

  const startAudit = async (job: string) => {
    setStep(3);
    setIsUploading(true);
    setCurrentStage("upload");
    setReconProgress(null);
    try {
      const res = await fetch(`${API_BASE}/upload/${job}/submit`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start audit.");
      }
      const poll = async () => {
        const statusRes = await fetch(`${API_BASE}/upload/${job}/status`);
        if (!statusRes.ok) return;
        const data = await statusRes.json();
        const activeStage =
          (data.stages.find((s: any) => s.status === "in_progress")?.name ??
            data.stages.find((s: any) => s.status === "pending")?.name) as Stage | undefined;
        if (activeStage) setCurrentStage(activeStage);
        if (data.metrics?.reconciliation_progress) {
          setReconProgress(data.metrics.reconciliation_progress);
        }
        if (data.status === "completed") {
          setIsUploading(false);
          setCurrentStage(null);
          setMessage("Audit complete. Redirecting to dashboard...");
          setReconProgress(null);
          setTimeout(() => navigate(`/dashboard?job=${job}`), 1500);
        } else if (data.status === "failed") {
          setIsUploading(false);
          setMessage(data.message || "Audit failed. Please retry.");
          setReconProgress(null);
        } else {
          setTimeout(poll, 2500);
        }
      };
      poll();
    } catch (error: any) {
      setIsUploading(false);
      setMessage(error.message || "Something went wrong starting the audit.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-section">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Upload & Process</p>
          <h1 className="text-4xl md:text-5xl font-bold text-primary">Run a Forensic Contract Audit</h1>
          <p className="text-muted-foreground max-w-3xl mx-auto">
            Drag in MSAs, SOWs, amendments, or invoice exports. ContractGuard will secure the files, extract pricing logic, and
            reconcile each renewal to surface leakage—zero spreadsheets required.
          </p>
          {message && <p className="text-sm text-cta">{message}</p>}
        </header>

        {step === 1 && (
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
            <div
              {...contractDropzone.getRootProps()}
              className={`rounded-3xl border-2 border-dashed ${
                contractDropzone.isDragActive ? "border-primary bg-primary/5" : "border-border"
              } bg-card/80 backdrop-blur p-10 transition cursor-pointer`}
            >
              <input {...contractDropzone.getInputProps()} />
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-foreground">1/2: Upload Contract Agreements</h3>
                <p className="text-sm text-muted-foreground max-w-lg">
                  Drag in the MSA, Statements of Work, and amendments for this vendor—even if they’re combined in a single file or ZIP. We’ll
                  keep them together.
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>Secure upload. Files encrypted and never used for model training.</span>
                </div>
                {contractFiles.length > 0 && (
                  <div className="w-full text-left space-y-2">
                    <p className="text-sm text-muted-foreground">Contracts queued</p>
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {contractFiles.map((file) => (
                        <li key={file.name} className="flex items-center justify-between text-sm text-foreground">
                          <span>{file.name}</span>
                          <span className="text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Total size: {contractSize} MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card/80 backdrop-blur p-8 space-y-5 shadow-hover">
              <label className="text-sm font-semibold text-foreground flex flex-col gap-2 text-left">
                Vendor name
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Acme Cloud"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <h3 className="text-xl font-semibold text-foreground">What counts as "Contract Agreements"?</h3>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Master Services Agreement (MSA)</li>
                <li>All Statements of Work (SOWs) or Order Forms</li>
                <li>Rate cards, amendments, auto-renew addenda</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                We automatically separate bundled documents and extract the clauses that govern pricing logic.
              </p>
              <Button variant="cta" className="w-full" disabled={!contractFiles.length} onClick={handleNextStep}>
                Next: Upload Billing Data
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
            <div
              {...billingDropzone.getRootProps()}
              className={`rounded-3xl border-2 border-dashed ${
                billingDropzone.isDragActive ? "border-primary bg-primary/5" : "border-border"
              } bg-card/80 backdrop-blur p-10 transition cursor-pointer`}
            >
              <input {...billingDropzone.getInputProps()} />
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-foreground">2/2: Upload Billing Records</h3>
                <p className="text-sm text-muted-foreground max-w-lg">
                  Upload a CSV (preferred) or XLSX export of invoices or billing line items for this vendor from Stripe, NetSuite, QuickBooks,
                  or your billing system. We map every line item back to the contract rules.
                </p>
                <Button variant="ghost" size="sm" className="gap-2 text-primary">
                  <Download className="h-4 w-4" />
                  Download Billing CSV Template
                </Button>
                {billingFiles.length > 0 && (
                  <div className="w-full text-left space-y-2">
                    <p className="text-sm text-muted-foreground">Billing data</p>
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {billingFiles.map((file) => (
                        <li key={file.name} className="flex items-center justify-between text-sm text-foreground">
                          <span>{file.name}</span>
                          <span className="text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Total size: {billingSize} MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card/80 backdrop-blur p-8 space-y-5 shadow-hover">
              <h3 className="text-xl font-semibold text-foreground">Why we need billing data</h3>
              <p className="text-sm text-muted-foreground">
                We compare what was billed vs. what should have been billed per the contract. The more line-item detail, the more precise
                the leakage calculation.
              </p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Include invoice date, SKU/description, unit price, quantity, discounts, total.</li>
                <li>You can export from any system—the template shows preferred columns.</li>
              </ul>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Analysis takes ~5–10 minutes. We email the Revenue Recovery Report when done.</span>
              </div>
              <Button variant="cta" className="w-full" disabled={!billingFiles.length} onClick={handleNextStep}>
                Run Audit & Find Leakage
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-3xl border border-border bg-card/85 backdrop-blur p-10 shadow-hero flex flex-col items-center text-center space-y-8">
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/30">
              {isUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <CheckCircle2 className="h-8 w-8" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">ContractGuard pipeline</p>
              <h3 className="text-3xl md:text-4xl font-semibold text-foreground mt-2">Audit in progress</h3>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Analyzing contract rules, aligning them with your billing export, and drafting AI insights. You can close this tab—we’ll email
              the full Revenue Recovery Report as soon as it’s ready.
            </p>
            <div className="w-full max-w-3xl">
              {(stageOrder as Stage[]).map((stage) => {
                const Icon = stageLabels[stage].icon;
                const currentIndex = currentStage ? stageOrder.indexOf(currentStage) : -1;
                const stageIndex = stageOrder.indexOf(stage);
                const isActive = currentStage === stage;
                const isDone = currentIndex !== -1 && stageIndex !== -1 && stageIndex < currentIndex;
                const statusLabel = isActive ? "In progress" : isDone ? "Complete" : "Queued";
                return (
                  <div key={stage} className="flex items-center gap-4 py-3 border-b border-border/60 last:border-none">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/40"
                          : isDone
                            ? "bg-success/10 text-success border border-success/30"
                            : "bg-card text-muted-foreground border border-border/60"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-foreground">{stageLabels[stage].title}</p>
                      <p className="text-xs text-muted-foreground">{stageLabels[stage].description}</p>
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground min-w-[140px] text-right">
                      {stage === "reconciliation" && isActive && reconProgress ? (
                        <div>
                          <div className="w-full h-2 bg-secondary/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{
                                width: `${Math.min(100, Math.max(0, Math.round((reconProgress.percent ?? 0) * 100)))}%`,
                              }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{reconProgress.message}</p>
                        </div>
                      ) : (
                        statusLabel
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="secondary" className="gap-2" onClick={() => navigate(jobId ? `/dashboard?job=${jobId}` : "/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <p className="text-lg font-semibold text-foreground">SOC2-grade security</p>
            <p className="text-sm text-muted-foreground">
              Files are encrypted in transit and at rest. You control automatic deletion windows for sensitive contracts.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-3">
            <Clock className="h-6 w-6 text-primary" />
            <p className="text-lg font-semibold text-foreground">Faster than manual audits</p>
            <p className="text-sm text-muted-foreground">
              Teams typically uncover leakage in under 5 minutes—before the next customer renewal hits your inbox.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-3">
            <AlertTriangle className="h-6 w-6 text-primary" />
            <p className="text-lg font-semibold text-foreground">Actionable discrepancies</p>
            <p className="text-sm text-muted-foreground">
              Every flag includes contract references, invoice math, and suggested next steps so you can rebill confidently.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default UploadPage;

