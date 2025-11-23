import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Download,
  FileDown,
  Search,
  Filter,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAuthHeader, logout, isAuthenticated } from "@/utils/auth";
import { formatCurrency } from "@/utils/currency";
import { AuditHistorySkeleton } from "@/components/LoadingSkeleton";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

interface AuditJob {
  id: string;
  vendor_name: string;
  status: string;
  message?: string;
  created_at: string;
  updated_at?: string;
  recoverable_amount: number;
  total_billed: number;
  discrepancy_count: number;
  trend?: {
    type: string;
    change_pct: number;
    message: string;
  };
}

export default function AuditHistory() {
  const navigate = useNavigate();
  const [audits, setAudits] = useState<AuditJob[]>([]);
  const [allAudits, setAllAudits] = useState<AuditJob[]>([]); // Store all audits for filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [auditToDelete, setAuditToDelete] = useState<AuditJob | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  useEffect(() => {
    // Check authentication before fetching
    if (!isAuthenticated()) {
      setError("You must be logged in to view audit history");
      setTimeout(() => navigate("/login"), 1000);
      return;
    }
    fetchAuditHistory();
  }, [navigate]);

  const handleDeleteClick = (audit: AuditJob, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    setAuditToDelete(audit);
    setDeleteDialogOpen(true);
  };

  const handleRetry = async (audit: AuditJob, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setRetrying(audit.id);
      const response = await fetch(`${API_BASE}/upload/${audit.id}/retry`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to retry audit");
      }

      // Refresh the list
      await fetchAuditHistory();
      
      // Navigate to dashboard to see the retry in progress
      navigate(`/dashboard?job=${audit.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to retry audit");
    } finally {
      setRetrying(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!auditToDelete) return;

    try {
      setDeleting(true);
      const response = await fetch(`${API_BASE}/upload/${auditToDelete.id}`, {
        method: "DELETE",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete audit");
      }

      // Remove from local state
      setAudits(audits.filter((a) => a.id !== auditToDelete.id));
      setDeleteDialogOpen(false);
      setAuditToDelete(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete audit");
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const fetchAuditHistory = async () => {
    try {
      setLoading(true);
      const authHeader = getAuthHeader();
      
      // Check if we have a token
      if (!authHeader.Authorization) {
        console.error("No authorization token found");
        setError("You must be logged in to view audit history");
        // Redirect to login if not authenticated
        setTimeout(() => navigate("/login"), 2000);
        return;
      }
      
      console.log("Fetching audit history with token:", authHeader.Authorization.substring(0, 20) + "...");
      
      const response = await fetch(`${API_BASE}/upload/history`, {
        method: "GET",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Session expired. Please log in again.");
          logout();
          setTimeout(() => navigate("/login"), 2000);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch audit history");
      }

      const data = await response.json();
      setAllAudits(data.jobs || []);
      setAudits(data.jobs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load audit history");
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort audits
  useEffect(() => {
    let filtered = [...allAudits];
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (audit) =>
          audit.vendor_name.toLowerCase().includes(query) ||
          audit.id.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((audit) => audit.status === statusFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      
      switch (sortBy) {
        case "newest":
          return dateB - dateA;
        case "oldest":
          return dateA - dateB;
        case "amount_high":
          return (b.recoverable_amount || 0) - (a.recoverable_amount || 0);
        case "amount_low":
          return (a.recoverable_amount || 0) - (b.recoverable_amount || 0);
        default:
          return dateB - dateA;
      }
    });
    
    setAudits(filtered);
  }, [allAudits, searchQuery, statusFilter, sortBy]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-primary animate-spin" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTrendIcon = (trend?: { type: string }) => {
    if (!trend) return null;
    switch (trend.type) {
      case "increase":
        return <TrendingUp className="h-4 w-4 text-destructive" />;
      case "decrease":
        return <TrendingDown className="h-4 w-4 text-success" />;
      case "stable":
        return <Minus className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getTrendColor = (trend?: { type: string }) => {
    if (!trend) return "text-muted-foreground";
    switch (trend.type) {
      case "increase":
        return "text-destructive";
      case "decrease":
        return "text-success";
      case "stable":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-4xl font-bold text-foreground mb-2">Audit History</h1>
            <p className="text-muted-foreground">
              View and compare all your contract audits
            </p>
          </div>

          {/* Skeleton Loading */}
          <AuditHistorySkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
            <p className="text-destructive">{error}</p>
            <Button onClick={fetchAuditHistory} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-4xl font-bold text-foreground mb-2">Audit History</h1>
          <p className="text-muted-foreground">
            View and compare all your contract audits
          </p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor name or audit ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="amount_high">Highest Amount</SelectItem>
                <SelectItem value="amount_low">Lowest Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results count */}
          {(searchQuery || statusFilter !== "all") && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {audits.length} of {allAudits.length} audits
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-auto p-0 text-primary"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setSortBy("newest");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Audit List */}
        {audits.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No audits yet</h3>
            <p className="text-muted-foreground mb-6">
              Start your first audit to see it here
            </p>
            <Button onClick={() => navigate("/upload")}>
              Start New Audit
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="bg-card rounded-lg border border-border p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/dashboard?job=${audit.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      {getStatusIcon(audit.status)}
                      <h3 className="text-xl font-semibold text-foreground">
                        {audit.vendor_name}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          audit.status === "completed"
                            ? "bg-success/10 text-success"
                            : audit.status === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {audit.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Recoverable Amount
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatCurrency(audit.recoverable_amount || 0, "INR")}
                        </p>
                        {audit.trend && (
                          <div className={`flex items-center gap-1 mt-1 ${getTrendColor(audit.trend)}`}>
                            {getTrendIcon(audit.trend)}
                            <span className="text-xs">{audit.trend.message}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Total Billed
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatCurrency(audit.total_billed || 0, "INR")}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Discrepancies
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {audit.discrepancy_count}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Date
                        </p>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm text-foreground">
                            {formatDate(audit.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {audit.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary hover:bg-primary/10"
                        onClick={(e) => handleRetry(audit, e)}
                        disabled={retrying === audit.id}
                        title="Retry this audit"
                      >
                        {retrying === audit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {audit.status === "completed" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(`${API_BASE}/export/${audit.id}/discrepancies.csv`, {
                                headers: getAuthHeader(),
                              });
                              if (!response.ok) throw new Error("Failed to export");
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${audit.vendor_name}_discrepancies_${new Date(audit.created_at).toISOString().split('T')[0]}.csv`;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            } catch (err: any) {
                              setError(err.message || "Failed to export");
                            }
                          }}
                          title="Export discrepancies as CSV"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(`${API_BASE}/export/${audit.id}/report.html`, {
                                headers: getAuthHeader(),
                              });
                              if (!response.ok) throw new Error("Failed to export");
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${audit.vendor_name}_audit_report_${new Date(audit.created_at).toISOString().split('T')[0]}.html`;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            } catch (err: any) {
                              setError(err.message || "Failed to export");
                            }
                          }}
                          title="Export full report"
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard?job=${audit.id}`);
                      }}
                    >
                      View Details
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteClick(audit, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Audit</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the audit for{" "}
              <strong>{auditToDelete?.vendor_name}</strong>? This action cannot be undone.
              All associated data, including discrepancies and metrics, will be permanently
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setAuditToDelete(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

