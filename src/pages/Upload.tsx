import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { getAuthHeader, logout } from "@/utils/auth";
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
  History,
  Settings,
  X,
  File,
  FileSpreadsheet,
  Archive,
  ChevronRight,
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
    const validFiles = acceptedFiles.filter((file) => 
      file.name.endsWith(".csv") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx")
    );
    setBillingFiles((prev) => [...prev, ...validFiles]);
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
    multiple: true,
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
          headers: getAuthHeader(),
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
          headers: getAuthHeader(),
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
      const res = await fetch(`${API_BASE}/upload/${job}/submit`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start audit.");
      }
      const poll = async () => {
        const statusRes = await fetch(`${API_BASE}/upload/${job}/status`, {
          headers: getAuthHeader(),
        });
        if (!statusRes.ok) return;
        const data = await statusRes.json();
        const activeStage =
          (data.stages.find((s: any) => s.status === "in_progress")?.name ??
            data.stages.find((s: any) => s.status === "pending")?.name) as Stage | undefined;
        if (activeStage) setCurrentStage(activeStage);
        
        // Use new progress fields
        if (data.progress !== undefined || data.progress_message) {
          setReconProgress({
            percent: data.progress ? data.progress / 100 : undefined,
            message: data.progress_message || data.message,
          });
        } else if (data.metrics?.reconciliation_progress) {
          // Fallback to old format
          setReconProgress(data.metrics.reconciliation_progress);
        }
        
        if (data.status === "completed") {
          setIsUploading(false);
          setCurrentStage(null);
          setMessage("Audit complete. Redirecting to dashboard...");
          setReconProgress({ percent: 1, message: "Complete!" });
          setTimeout(() => navigate(`/dashboard?job=${job}`), 1500);
        } else if (data.status === "failed") {
          setIsUploading(false);
          setMessage(data.message || "Audit failed. Please retry.");
          setReconProgress(null);
        } else {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      };
      poll();
    } catch (error: any) {
      setIsUploading(false);
      setMessage(error.message || "Something went wrong starting the audit.");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-section">
      {/* Top navigation bar */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg text-foreground">ContractGuard</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/history")}>
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10 relative z-10">
        <header className="space-y-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/80">Upload & Process</p>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-foreground/95 to-foreground/80 bg-clip-text text-transparent">
            Run a Forensic Contract Audit
          </h1>
          <div className="space-y-2 max-w-3xl mx-auto">
            <p className="text-muted-foreground leading-relaxed">
              Drag in MSAs, SOWs, amendments, or invoice exports.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              ContractGuard will secure the files, extract pricing logic, and reconcile each renewal to surface leakage—zero spreadsheets required.
            </p>
          </div>
          {message && <p className="text-sm text-cta font-medium">{message}</p>}
          
          {/* Step Indicator */}
          {(step === 1 || step === 2) && (
            <div className="flex items-center justify-center gap-4 pt-6">
              <div className={`flex items-center gap-2 ${step === 1 ? 'text-primary' : 'text-success'}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
                  step === 1 
                    ? 'bg-primary/20 border-2 border-primary/40 shadow-sm' 
                    : 'bg-success/20 border-2 border-success/40'
                }`}>
                  {step === 1 ? '1' : <CheckCircle2 className="h-4 w-4" />}
                </div>
                <span className="text-sm font-medium">Contracts</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
              <div className={`flex items-center gap-2 ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
                  step === 2 
                    ? 'bg-primary/20 border-2 border-primary/40 shadow-sm' 
                    : 'bg-muted/30 border-2 border-border/40'
                }`}>
                  2
                </div>
                <span className="text-sm font-medium">Billing</span>
              </div>
            </div>
          )}
        </header>

        {step === 1 && (
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
            <div
              {...contractDropzone.getRootProps()}
              className={`group relative rounded-3xl border-2 ${
                contractDropzone.isDragActive 
                  ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 shadow-lg shadow-primary/20" 
                  : "border-border/50 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm hover:border-primary/30"
              } p-10 transition-all duration-300 cursor-pointer overflow-hidden`}
            >
              {/* Subtle background pattern */}
              <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,_white_1px,_transparent_1px)] bg-[length:20px_20px]" />
              
              {/* Glow effect on hover/drag */}
              {contractDropzone.isDragActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 animate-pulse" />
              )}
              
              <input {...contractDropzone.getInputProps()} />
              <div className="relative z-10 flex flex-col items-center text-center space-y-5">
                <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30 flex items-center justify-center transition-all duration-300 ${
                  contractDropzone.isDragActive ? 'scale-110 shadow-lg shadow-primary/30' : 'group-hover:scale-105'
                }`}>
                  <UploadCloud className={`h-10 w-10 text-primary transition-all duration-300 ${
                    contractDropzone.isDragActive ? 'animate-bounce' : ''
                  }`} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-foreground">Upload Contract Agreements</h3>
                  <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                    Drag files here or <button className="text-primary hover:underline font-medium">browse</button> to select
                  </p>
                </div>
                
                {/* File type chips */}
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-muted-foreground flex items-center gap-1.5">
                    <File className="h-3.5 w-3.5" />
                    PDF
                  </span>
                  <span className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    DOCX
                  </span>
                  <span className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-muted-foreground flex items-center gap-1.5">
                    <Archive className="h-3.5 w-3.5" />
                    ZIP
                  </span>
                </div>
                
                {/* Preview area hint */}
                {contractFiles.length === 0 && (
                  <div className="w-full text-center py-4 px-6 rounded-xl bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground italic">Your files will appear here</p>
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-4 py-2 rounded-full border border-border/30">
                  <Lock className="h-3.5 w-3.5" />
                  <span>End-to-end encrypted • Never used for training</span>
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

            <div className="rounded-3xl border border-border/50 bg-card/90 backdrop-blur-sm p-8 space-y-6 shadow-lg">
              {/* Vendor name input */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground block">
                  Vendor name
                </label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Acme Cloud"
                  className="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-background transition-colors"
                />
              </div>
              
              {/* Divider */}
              <div className="h-px bg-border/50" />
              
              {/* What counts section */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">What counts as "Contract Agreements"?</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <FileText className="h-5 w-5 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-foreground">Master Services Agreement (MSA)</strong></span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <File className="h-5 w-5 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-foreground">All Statements of Work (SOWs)</strong> or Order Forms</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Archive className="h-5 w-5 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-foreground">Rate cards, amendments,</strong> auto-renew addenda</span>
                  </li>
                </ul>
                <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We automatically separate bundled documents and extract the clauses that govern pricing logic.
                  </p>
                </div>
              </div>
              
              {/* Divider */}
              <div className="h-px bg-border/50" />
              
              {/* Continue button */}
              <Button 
                variant="cta" 
                className="w-full h-12 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300" 
                disabled={!contractFiles.length} 
                onClick={handleNextStep}
              >
                Continue to Billing Data
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
            <div
              {...billingDropzone.getRootProps()}
              className={`group relative rounded-3xl border-2 ${
                billingDropzone.isDragActive 
                  ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 shadow-lg shadow-primary/20" 
                  : "border-border/50 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm hover:border-primary/30"
              } p-10 transition-all duration-300 cursor-pointer overflow-hidden`}
            >
              {/* Subtle background pattern */}
              <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,_white_1px,_transparent_1px)] bg-[length:20px_20px]" />
              
              {/* Glow effect on hover/drag */}
              {billingDropzone.isDragActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 animate-pulse" />
              )}
              
              <input {...billingDropzone.getInputProps()} />
              <div className="relative z-10 flex flex-col items-center text-center space-y-5">
                <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30 flex items-center justify-center transition-all duration-300 ${
                  billingDropzone.isDragActive ? 'scale-110 shadow-lg shadow-primary/30' : 'group-hover:scale-105'
                }`}>
                  <UploadCloud className={`h-10 w-10 text-primary transition-all duration-300 ${
                    billingDropzone.isDragActive ? 'animate-bounce' : ''
                  }`} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-foreground">Upload Billing Records</h3>
                  <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                    Drag files here or <button className="text-primary hover:underline font-medium">browse</button> to select
                  </p>
                </div>
                
                {/* File type chips */}
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-muted-foreground flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    CSV
                  </span>
                  <span className="text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-muted-foreground flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    XLSX
                  </span>
                </div>
                
                <Button variant="ghost" size="sm" className="gap-2 text-primary hover:bg-primary/10 rounded-xl">
                  <Download className="h-4 w-4" />
                  Download Billing CSV Template
                </Button>
                
                {/* Preview area hint */}
                {billingFiles.length === 0 && (
                  <div className="w-full text-center py-4 px-6 rounded-xl bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground italic">Your billing files will appear here</p>
                  </div>
                )}
                {billingFiles.length > 0 && (
                  <div className="w-full text-left space-y-3 mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Billing data ({billingFiles.length} {billingFiles.length === 1 ? "file" : "files"})</p>
                      <p className="text-xs text-muted-foreground">Total: {billingSize} MB</p>
                    </div>
                    <ul className="space-y-2 max-h-48 overflow-y-auto rounded-lg bg-muted/20 border border-border/30 p-3">
                      {billingFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`} className="flex items-center justify-between text-sm text-foreground group/item py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileSpreadsheet className="h-4 w-4 text-primary/60 flex-shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setBillingFiles((prev) => prev.filter((_, i) => i !== index));
                              }}
                              className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1.5 hover:bg-destructive/10 rounded-lg text-destructive"
                              aria-label="Remove file"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-card/90 backdrop-blur-sm p-8 space-y-6 shadow-lg">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">Why we need billing data</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We compare what was billed vs. what should have been billed per the contract. The more line-item detail, the more precise
                  the leakage calculation.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span>Include invoice date, SKU/description, unit price, quantity, discounts, total.</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span>You can export from any system—the template shows preferred columns.</span>
                  </li>
                </ul>
              </div>
              
              {/* Divider */}
              <div className="h-px bg-border/50" />
              
              <div className="rounded-lg bg-muted/30 border border-border/30 p-4">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Clock className="h-5 w-5 text-primary/60 flex-shrink-0 mt-0.5" />
                  <span>Analysis takes ~5–10 minutes. We email the Revenue Recovery Report when done.</span>
                </div>
              </div>
              
              {/* Divider */}
              <div className="h-px bg-border/50" />
              
              <Button 
                variant="cta" 
                className="w-full h-12 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300" 
                disabled={!billingFiles.length} 
                onClick={handleNextStep}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Run Audit & Find Leakage
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="relative rounded-3xl border border-border/50 bg-gradient-to-b from-card/95 to-card/80 backdrop-blur-xl p-10 shadow-2xl flex flex-col items-center text-center space-y-10 overflow-hidden">
            {/* Subtle background effects */}
            <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent opacity-50" />
            <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,_white_1px,_transparent_1px)] bg-[length:24px_24px]" />
            
            {/* Overall Progress Circle - Hero Element */}
            <div className="relative z-10">
              {/* Outer glow effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="absolute rounded-full bg-primary/20 blur-2xl animate-pulse"
                  style={{ 
                    width: '180px', 
                    height: '180px',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                  }}
                />
              </div>
              
              <div className="relative h-40 w-40 drop-shadow-2xl">
                <svg className="transform -rotate-90 h-40 w-40" viewBox="0 0 140 140">
                  {/* Background circle - thicker */}
                  <circle
                    cx="70"
                    cy="70"
                    r="62"
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="none"
                    className="text-border/20"
                  />
                  {/* Progress circle with gradient */}
                  {(() => {
                    const progress = reconProgress?.percent ?? 0;
                    const circumference = 2 * Math.PI * 62;
                    const offset = circumference * (1 - progress);
                    return (
                      <>
                        {/* Glow effect behind progress */}
                        <circle
                          cx="70"
                          cy="70"
                          r="62"
                          stroke="url(#progressGlow)"
                          strokeWidth="12"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          className="opacity-30 blur-sm"
                        />
                        {/* Main progress circle */}
                        <circle
                          cx="70"
                          cy="70"
                          r="62"
                          stroke="url(#progressGradient)"
                          strokeWidth="10"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          className="transition-all duration-700 ease-out drop-shadow-lg"
                        />
                      </>
                    );
                  })()}
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(142, 76%, 50%)" />
                      <stop offset="50%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(142, 76%, 40%)" />
                    </linearGradient>
                    <linearGradient id="progressGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(142, 76%, 60%)" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-5xl font-bold bg-gradient-to-b from-foreground to-foreground/80 bg-clip-text text-transparent">
                      {Math.round((reconProgress?.percent ?? 0) * 100)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 font-medium">Complete</div>
                  </div>
                </div>
              </div>
              
              {/* Pulsing activity indicator */}
              {isUploading && (
                <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-primary/30 border-2 border-primary/50 animate-pulse flex items-center justify-center shadow-lg">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
                </div>
              )}
            </div>

            <div className="relative z-10 space-y-3">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground font-semibold">ContractGuard pipeline</p>
              <h3 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
                Audit in progress
              </h3>
            </div>
            
            {/* Progress Message with AI indicator */}
            {reconProgress?.message && (
              <div className="relative z-10 px-5 py-3 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/30 text-sm text-foreground/90 max-w-2xl backdrop-blur-sm">
                <div className="flex items-center gap-2 justify-center">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                  <span>{reconProgress.message}</span>
                </div>
              </div>
            )}

            <div className="relative z-10 space-y-2 max-w-2xl">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Analyzing contract rules, aligning them with your billing export,<br />
                and drafting AI insights. You can close this tab—we'll email the full Revenue Recovery Report as soon as it's ready.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pt-2">
                <Lock className="h-3 w-3" />
                <span>End-to-end encrypted</span>
              </div>
            </div>

            {/* Stage Progress Indicators */}
            <div className="w-full max-w-3xl space-y-4 relative z-10">
              {(stageOrder as Stage[]).map((stage, index) => {
                const Icon = stageLabels[stage].icon;
                const currentIndex = currentStage ? stageOrder.indexOf(currentStage) : -1;
                const stageIndex = stageOrder.indexOf(stage);
                const isActive = currentStage === stage;
                const isDone = currentIndex !== -1 && stageIndex !== -1 && stageIndex < currentIndex;
                const isPending = !isActive && !isDone;
                
                return (
                  <div
                    key={stage}
                    className={`relative flex items-center gap-5 p-5 rounded-2xl border transition-all duration-500 ${
                      isActive
                        ? "bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-primary/40 shadow-lg shadow-primary/10 scale-[1.02]"
                        : isDone
                          ? "bg-success/5 border-success/20 opacity-75"
                          : "bg-card/30 border-border/30 opacity-45"
                    }`}
                  >
                    {/* Left accent border for active step */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-primary/80 to-primary rounded-l-2xl" />
                    )}
                    
                    {/* Animated shimmer effect for active stage */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" 
                        style={{
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 3s ease-in-out infinite'
                        }}
                      />
                    )}
                    
                    {/* Stage Icon Container */}
                    <div className="relative z-10 flex-shrink-0">
                      <div
                        className={`h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-500 ${
                          isActive
                            ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary border-2 border-primary/50 shadow-lg shadow-primary/20"
                            : isDone
                              ? "bg-success/15 text-success border-2 border-success/30"
                              : "bg-muted/50 text-muted-foreground border-2 border-border/40"
                        }`}
                      >
                        {isActive ? (
                          <Loader2 className="h-7 w-7 animate-spin" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-7 w-7 animate-in zoom-in duration-300" />
                        ) : (
                          <Icon className="h-7 w-7" />
                        )}
                      </div>
                      {/* Pulsing ring for active step */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-xl border-2 border-primary/30 animate-ping" />
                      )}
                    </div>

                    {/* Stage Info */}
                    <div className="flex-1 text-left relative z-10 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className={`font-bold text-base transition-colors ${
                          isActive ? "text-primary" : isDone ? "text-success" : "text-foreground/50"
                        }`}>
                          {stageLabels[stage].title}
                        </p>
                        {isActive && (
                          <span className="text-xs px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Processing...
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mt-1.5 transition-colors ${
                        isActive ? "text-muted-foreground" : isDone ? "text-muted-foreground/70" : "text-muted-foreground/50"
                      }`}>
                        {stageLabels[stage].description}
                      </p>
                    </div>

                    {/* Completion Checkmark with glow */}
                    {isDone && (
                      <div className="relative z-10 flex-shrink-0">
                        <div className="relative">
                          <CheckCircle2 className="h-6 w-6 text-success drop-shadow-lg" />
                          <div className="absolute inset-0 h-6 w-6 text-success/30 blur-sm">
                            <CheckCircle2 className="h-full w-full" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button 
              variant="secondary" 
              className="gap-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 relative z-10" 
              onClick={() => navigate(jobId ? `/dashboard?job=${jobId}` : "/dashboard")}
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-3 pt-4">
          <div className="group rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm p-6 space-y-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-default">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">SOC2-grade security</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Files are encrypted in transit and at rest. You control automatic deletion windows for sensitive contracts.
            </p>
          </div>
          <div className="group rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm p-6 space-y-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-default">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">Faster than manual audits</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Teams typically uncover leakage in under 5 minutes—before the next customer renewal hits your inbox.
            </p>
          </div>
          <div className="group rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm p-6 space-y-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-default">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <AlertTriangle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">Actionable discrepancies</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every flag includes contract references, invoice math, and suggested next steps so you can rebill confidently.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default UploadPage;

