import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { RecoveryPackArtifact } from "@/components/RecoveryPackArtifact";
import { NegotiationSimulatorArtifact } from "@/components/NegotiationSimulatorArtifact";
import { CreditNoteGeneratorArtifact } from "@/components/CreditNoteGeneratorArtifact";
import { RenewalCountdownArtifact } from "@/components/RenewalCountdownArtifact";
import { PlaybookBuilderArtifact } from "@/components/PlaybookBuilderArtifact";
import { getAuthHeader } from "@/utils/auth";
import { Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

type ArtifactPageProps = {
  type?: "recovery-pack" | "negotiation-simulator" | "credit-note" | "renewal-center" | "playbook";
};

export default function ArtifactPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("job");
  const discrepancyId = searchParams.get("discrepancy");
  const artifactType = (searchParams.get("type") || "recovery-pack") as ArtifactPageProps["type"];
  
  const [discrepancy, setDiscrepancy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    // For renewal countdown, we might not need a jobId
    if (artifactType === "renewal-center") {
      const fetchRenewals = async () => {
        try {
          // Fetch upcoming renewals
          const response = await fetch(`${API_BASE}/api/v1/renewals/upcoming`, {
            headers: getAuthHeader(),
          });

          if (response.ok) {
            const data = await response.json();
            setContracts(data.renewals || []);
          }
        } catch (err) {
          console.error("Failed to fetch renewals:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchRenewals();
      return;
    }

    if (!jobId) {
      setError("Job ID is required");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch analysis summary to get discrepancy data
        const response = await fetch(`${API_BASE}/analysis/${jobId}/summary`, {
          headers: getAuthHeader(),
        });

        if (!response.ok) {
          throw new Error("Failed to load artifact data");
        }

        const data = await response.json();
        setAnalysis(data);

        // Find the specific discrepancy
        if (discrepancyId) {
          try {
            // Try to parse as JSON first (for complex identifiers)
            let parsedId = discrepancyId;
            try {
              const decoded = decodeURIComponent(discrepancyId);
              if (decoded.startsWith("{")) {
                const parsed = JSON.parse(decoded);
                parsedId = parsed.issue;
              }
            } catch {
              // Not JSON, use as-is
            }
            
            const found = data.discrepancies?.find(
              (d: any) => 
                d.id === discrepancyId || 
                d.issue === discrepancyId || 
                d.issue === parsedId ||
                (d.issue && d.issue.includes(parsedId)) ||
                (parsedId && d.issue && d.issue.includes(parsedId))
            );
            if (found) {
              setDiscrepancy(found);
            } else {
              // If no ID match, use first discrepancy
              setDiscrepancy(data.discrepancies?.[0] || null);
            }
          } catch (err) {
            // Fallback to first discrepancy
            setDiscrepancy(data.discrepancies?.[0] || null);
          }
        } else {
          // Use first discrepancy if no ID provided
          setDiscrepancy(data.discrepancies?.[0] || null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artifact");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, discrepancyId]);

  const handleClose = () => {
    navigate(-1);
  };

  const handleViewDocument = (evidence: any) => {
    // Navigate back to dashboard with document viewer open
    navigate(`/dashboard?job=${jobId}&view=document&evidence=${encodeURIComponent(JSON.stringify(evidence))}`);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading recovery pack...</p>
        </div>
      </div>
    );
  }

  // Handle different artifact types
  const renderArtifact = () => {
    switch (artifactType) {
      case "renewal-center":
        return (
          <ArtifactFrame
            title="Renewal Countdown Center"
            subtitle={`${contracts.length} contracts ending in next 90 days`}
            onClose={handleClose}
          >
            <RenewalCountdownArtifact
              contracts={contracts}
              onGeneratePack={(contractId) => {
                // Navigate to recovery pack for this contract
                navigate(`/artifact?job=${contractId}&type=recovery-pack`);
              }}
              onClose={handleClose}
            />
          </ArtifactFrame>
        );

      case "credit-note":
        if (error || !discrepancy) {
          return (
            <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="text-destructive mb-4">{error || "Discrepancy not found"}</p>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                >
                  Go Back
                </button>
              </div>
            </div>
          );
        }
        return (
          <ArtifactFrame
            title="Vendor Credit Note Generator"
            subtitle={`${discrepancy.issue || "Billing Discrepancy"} • ${analysis?.job?.vendor_name || "Vendor"}`}
            onClose={handleClose}
          >
            <CreditNoteGeneratorArtifact
              jobId={jobId!}
              discrepancy={discrepancy}
              currency={analysis?.job?.metrics?.gpt4o_rules?.currency || "INR"}
              vendorName={analysis?.job?.vendor_name}
              onClose={handleClose}
            />
          </ArtifactFrame>
        );

      case "negotiation-simulator":
        if (error || !analysis) {
          return (
            <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="text-destructive mb-4">{error || "Contract data not found"}</p>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                >
                  Go Back
                </button>
              </div>
            </div>
          );
        }
        return (
          <ArtifactFrame
            title="Negotiation Simulator"
            subtitle={`${analysis?.job?.vendor_name || "Contract"} Renewal Strategy`}
            onClose={handleClose}
          >
            <NegotiationSimulatorArtifact
              jobId={jobId!}
              contract={{
                base_amount: analysis?.job?.metrics?.gpt4o_rules?.base_amount,
                escalation_rate: analysis?.job?.metrics?.gpt4o_rules?.escalation_rate,
                effective_start_date: analysis?.job?.metrics?.gpt4o_rules?.effective_start_date,
                termination_date: analysis?.job?.metrics?.termination_date,
                currency: analysis?.job?.metrics?.gpt4o_rules?.currency || "INR",
                sla_uptime: analysis?.job?.metrics?.gpt4o_rules?.sla_uptime,
                service_credit_rate: analysis?.job?.metrics?.gpt4o_rules?.service_credit_rate,
                vendor_name: analysis?.job?.vendor_name,
              }}
              onClose={handleClose}
            />
          </ArtifactFrame>
        );

      case "playbook":
        if (error || !analysis) {
          return (
            <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="text-destructive mb-4">{error || "Contract data not found"}</p>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                >
                  Go Back
                </button>
              </div>
            </div>
          );
        }
        return (
          <ArtifactFrame
            title="Contract Playbook Builder"
            subtitle={`Create template from ${analysis?.job?.vendor_name || "Contract"}`}
            onClose={handleClose}
          >
            <PlaybookBuilderArtifact
              jobId={jobId!}
              contract={{
                id: jobId!,
                vendor_name: analysis?.job?.vendor_name,
                base_amount: analysis?.job?.metrics?.gpt4o_rules?.base_amount,
                escalation_rate: analysis?.job?.metrics?.gpt4o_rules?.escalation_rate,
                currency: analysis?.job?.metrics?.gpt4o_rules?.currency || "INR",
                issue: discrepancy?.issue,
                discrepancies: analysis?.discrepancies,
              }}
              onClose={handleClose}
            />
          </ArtifactFrame>
        );

      case "recovery-pack":
      default:
        if (error || !discrepancy) {
          return (
            <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="text-destructive mb-4">{error || "Discrepancy not found"}</p>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                >
                  Go Back
                </button>
              </div>
            </div>
          );
        }
        return (
          <ArtifactFrame
            title="Live Recovery Pack"
            subtitle={`${discrepancy.issue || "Billing Discrepancy"} • ${analysis?.job?.vendor_name || "Vendor"}`}
            onClose={handleClose}
          >
            <RecoveryPackArtifact
              jobId={jobId!}
              discrepancy={discrepancy}
              currency={analysis?.job?.metrics?.gpt4o_rules?.currency || "INR"}
              vendorName={analysis?.job?.vendor_name}
              onViewDocument={handleViewDocument}
              onClose={handleClose}
            />
          </ArtifactFrame>
        );
    }
  };

  return renderArtifact();
}

