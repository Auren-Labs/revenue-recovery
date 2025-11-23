import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Loader2, AlertCircle, Sparkles } from "lucide-react";

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
  customer: {
    id: string;
    name: string;
    subscription_tier: string;
  };
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Login failed");
      }

      const data: LoginResponse = await response.json();

      // Store auth data in localStorage
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("customer", JSON.stringify(data.customer));

      // Redirect to upload page (use window.location for hard redirect)
      window.location.href = "/upload";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (tokenResponse: any) => {
    setError("");
    setIsLoading(true);

    try {
      console.log("✅ Google login successful, sending token to backend...");
      console.log("🔑 Token received:", tokenResponse.access_token ? "Yes" : "No");
      
      if (!tokenResponse.access_token) {
        throw new Error("No access token received from Google");
      }
      
      // First, test if backend is reachable
      console.log("🔍 Testing backend connectivity...");
      try {
        const healthController = new AbortController();
        const healthTimeout = setTimeout(() => healthController.abort(), 5000);
        const healthCheck = await fetch("http://localhost:8000/auth/health", {
          method: "GET",
          signal: healthController.signal
        });
        clearTimeout(healthTimeout);
        if (healthCheck.ok) {
          console.log("✅ Backend is reachable");
        } else {
          throw new Error("Backend health check failed");
        }
      } catch (healthError: any) {
        console.error("❌ Backend health check failed:", healthError);
        if (healthError.name === 'AbortError') {
          throw new Error("Backend server is not responding. Please check if it's running on http://localhost:8000");
        }
        throw new Error("Cannot connect to backend server. Please ensure it's running on http://localhost:8000");
      }
      
      // Send the Google access token to backend for verification
      console.log("📤 Sending request to http://localhost:8000/auth/google...");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error("⏱️ Request timeout after 30 seconds");
        controller.abort();
      }, 30000);
      
      let response: Response;
      try {
        response = await fetch("http://localhost:8000/auth/google", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: tokenResponse.access_token }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log("✅ Fetch completed, status:", response.status);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error("❌ Fetch error:", fetchError);
        if (fetchError.name === 'AbortError') {
          throw new Error("Request timed out after 30 seconds. Please check if the backend server is running and responsive.");
        }
        if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
          throw new Error("Cannot connect to backend server. Please ensure it's running on http://localhost:8000");
        }
        throw new Error(`Network error: ${fetchError.message}`);
      }

      console.log("📊 Response status:", response.status, response.statusText);

      if (!response.ok) {
        let errorData;
        try {
          const text = await response.text();
          console.error("❌ Error response body:", text);
          errorData = JSON.parse(text);
        } catch {
          errorData = { detail: `Server error: ${response.status} ${response.statusText}` };
        }
        console.error("❌ Google login API error:", errorData);
        throw new Error(errorData.detail || `Google login failed: ${response.status}`);
      }

      const data: LoginResponse = await response.json();
      console.log("✅ Google login response received:", { 
        user: data.user?.email, 
        hasToken: !!data.access_token,
        customer: data.customer?.name 
      });

      if (!data.access_token) {
        throw new Error("No access token received from server");
      }

      // Store auth data in localStorage
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("customer", JSON.stringify(data.customer));

      console.log("💾 Auth data stored in localStorage");
      console.log("🔄 Redirecting to /upload...");
      
      // Small delay to ensure localStorage is written, then redirect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use window.location for a hard redirect to ensure auth state is refreshed
      window.location.href = "/upload";
    } catch (err) {
      console.error("❌ Google login error:", err);
      const errorMessage = err instanceof Error ? err.message : "Google login failed. Please try again.";
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => {
      setError("Google sign-in was cancelled or failed. Please try again.");
      setIsLoading(false);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/10 dark:bg-blue-600/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/10 dark:bg-indigo-600/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 mb-4 shadow-xl shadow-blue-500/20 dark:shadow-blue-500/10">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            ContractGuard
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Revenue Recovery Platform</p>
        </div>

        {/* Login card */}
        <Card className="shadow-2xl border-slate-200/50 dark:border-slate-800/50 backdrop-blur-sm bg-white/80 dark:bg-slate-900/80">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Welcome back
            </CardTitle>
            <CardDescription className="text-center text-slate-600 dark:text-slate-400">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Google Sign-In button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => googleLogin()}
                disabled={isLoading}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400">
                    Or continue with email
                  </span>
                </div>
              </div>

              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/40"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-6 flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          Protected by enterprise-grade security
        </p>
      </div>
    </div>
  );
}

