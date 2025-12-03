import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Loader2, AlertCircle, Sparkles, Eye, EyeOff, CheckCircle2, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

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

// Floating particles component
const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 20 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-white/10"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

// Security badge with rotating text
const SecurityBadge = () => {
  const badges = [
    "SOC2 Type II",
    "Bank-grade AES-256",
    "Audited Q4 2025",
  ];
  const [currentBadge, setCurrentBadge] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBadge((prev) => (prev + 1) % badges.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [badges.length]);

  return (
    <motion.div
      key={currentBadge}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center justify-center gap-2 text-xs text-white/60"
    >
      <Shield className="w-3 h-3" />
      <span>{badges[currentBadge]}</span>
    </motion.div>
  );
};

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cardHovered, setCardHovered] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
      const response = await fetch(`${API_BASE}/auth/login`, {
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

      // Show success toast
      toast({
        title: `Welcome back, ${data.user.full_name?.split(" ")[0] || "there"}!`,
        description: "Redirecting to your dashboard...",
      });

      // Redirect to upload page
      setTimeout(() => {
        window.location.href = "/upload";
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (tokenResponse: any) => {
    setError("");
    setIsLoading(true);

    const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

    try {
      if (!tokenResponse.access_token) {
        throw new Error("No access token received from Google");
      }

      // First, check if backend is reachable
      try {
        const healthCheck = await fetch(`${API_BASE}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000), // 5 second timeout for health check
        });
        if (!healthCheck.ok) {
          throw new Error(`Backend health check failed: ${healthCheck.status}`);
        }
      } catch (healthError: any) {
        if (healthError.name === 'AbortError' || healthError.name === 'TimeoutError') {
          throw new Error(`Backend server is not responding. Please ensure it's running on ${API_BASE}`);
        }
        if (healthError.name === 'TypeError' && healthError.message.includes('Failed to fetch')) {
          throw new Error(`Cannot connect to backend server at ${API_BASE}. Please ensure it's running.`);
        }
        throw new Error(`Backend connection error: ${healthError.message}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout (5s for health + 20s for auth)

      let response: Response;
      try {
        response = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: tokenResponse.access_token }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("Authentication request timed out. This may be due to slow network or Google API issues. Please try again.");
        }
        if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
          throw new Error(`Cannot connect to backend server. Please ensure it's running on ${API_BASE}`);
        }
        throw new Error(`Network error: ${fetchError.message}`);
      }

      if (!response.ok) {
        let errorData;
        try {
          const text = await response.text();
          errorData = JSON.parse(text);
        } catch {
          errorData = { detail: `Server error: ${response.status} ${response.statusText}` };
        }
        throw new Error(errorData.detail || `Google login failed: ${response.status}`);
      }

      const data: LoginResponse = await response.json();

      if (!data.access_token) {
        throw new Error("No access token received from server");
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("customer", JSON.stringify(data.customer));

      // Show success toast
      toast({
        title: `Welcome back, ${data.user.full_name?.split(" ")[0] || "there"}!`,
        description: "Redirecting to your dashboard...",
      });

      setTimeout(() => {
        window.location.href = "/upload";
      }, 500);
    } catch (err) {
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
    <section className="min-h-screen flex items-center lg:justify-between justify-center relative overflow-hidden bg-gradient-to-br from-[#0f0f2b] via-[#1a0b2e] to-[#0f172a] gap-4 lg:gap-4 px-4 lg:px-8">
      {/* Grid background */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      ></div>

      {/* Floating particles */}
      <FloatingParticles />

      {/* Left side - Hero (desktop only) */}
      <div className="hidden lg:flex flex-1 items-center justify-center px-6 lg:px-12">
        <motion.div
          className="text-left max-w-lg"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Logo/Icon */}
          <motion.div
            className="mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 mb-4 shadow-xl shadow-blue-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          <h1 className="text-6xl font-bold text-white mb-3 leading-tight">
            ContractGuard
          </h1>
          <motion.p
            className="text-2xl text-green-400 mb-4 flex items-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <CheckCircle2 className="w-6 h-6" />
            Never overpay a vendor again.
          </motion.p>
          <motion.p
            className="text-gray-400 text-lg leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            AI that finds every missed escalation, SLA credit, and billing error — automatically.
          </motion.p>

          {/* Illustration/Visual element */}
          <motion.div
            className="mt-6 flex items-center gap-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <div className="flex items-center gap-4 p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Average recovery</p>
                <p className="text-2xl font-bold text-white">₹1.2L</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right side - Glass card */}
      <div className="w-full lg:w-[40%] max-w-md mx-6 lg:mx-0 lg:mr-16 relative z-10">
        <motion.div
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-10 shadow-2xl relative overflow-hidden"
          onMouseEnter={() => setCardHovered(true)}
          onMouseLeave={() => setCardHovered(false)}
          initial={{ opacity: 0, y: 50 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: cardHovered ? 1.01 : 1,
            borderColor: cardHovered ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.2)",
          }}
          transition={{ duration: 0.3 }}
        >
          {/* Subtle glow on hover */}
          <motion.div
            className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 opacity-0 pointer-events-none"
            animate={{ opacity: cardHovered ? 0.3 : 0 }}
            transition={{ duration: 0.3 }}
          />

          <div className="relative z-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <motion.div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-teal-500 mb-4 shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <h2 className="text-2xl font-light text-white">Welcome back</h2>
            </div>

            {/* Error alert */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4"
                >
                  <Alert variant="destructive" className="bg-red-500/20 border-red-500/50 text-white">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Google SSO - Dominant CTA */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                type="button"
                className="w-full bg-gradient-to-r from-[#4285F4] to-[#00D4AA] text-white py-4 text-lg font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/50 transition-all duration-200"
                onClick={() => googleLogin()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </Button>
            </motion.div>

            {/* Email/password toggle */}
            <div className="text-center my-6">
              <button
                type="button"
                onClick={() => setShowEmailForm(!showEmailForm)}
                className="text-sm text-white/60 hover:text-white/80 transition-colors"
              >
                {showEmailForm ? "or continue with Google" : "or use email"}
              </button>
            </div>

            {/* Email/Password form - Collapsible */}
            <AnimatePresence>
              {showEmailForm && (
                <motion.form
                  onSubmit={handleSubmit}
                  className="space-y-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Email field */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white/80">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
                      onFocus={() => setCardHovered(true)}
                    />
                  </div>

                  {/* Password field with reveal */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white/80">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20 pr-10"
                        onFocus={() => setCardHovered(true)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/80 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    className="w-full h-11 bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all duration-200"
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
                </motion.form>
              )}
            </AnimatePresence>

            {/* Security badge */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <AnimatePresence mode="wait">
                <SecurityBadge />
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
