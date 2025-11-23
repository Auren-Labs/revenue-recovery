import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated } from "@/utils/auth";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Component to protect routes that require authentication
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

