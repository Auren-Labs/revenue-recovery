import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Building2, Briefcase, ServerCog, Check } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import heroVisual from "@/assets/hero-visual.jpg";
import { motion } from "framer-motion";

const HeroSection = () => {
  const [email, setEmail] = useState("");
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const heroStats = [
    { label: "Price escalations", value: "3.4% leakage" },
    { label: "Volume tiers", value: "2.1% leakage" },
    { label: "Renewal uplifts", value: "1.8% leakage" },
  ];
  const urgencyHighlights = [
    "⚡ Limited Beta: Only 50 founding customers",
    "🎁 Lock in $499/mo (goes to $799 at launch)",
    "⏱️ Next cohort starts in 2 weeks",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      toast.success("Thank you! You've been added to the waitlist.");
      setEmail("");
    }
  };

  return (
    <section id="waitlist" className="relative pt-32 pb-24 bg-gradient-section overflow-hidden">
      <div className="absolute inset-x-0 top-10 h-64 blur-3xl bg-primary/10" aria-hidden />
      <div className="absolute -right-32 top-10 w-96 h-96 bg-cta/10 blur-3xl rounded-full" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <motion.div
            className="space-y-8"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="space-y-4">
              <motion.p
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-sm font-semibold text-primary"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
              >
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                Revenue Recovery Copilot
              </motion.p>
              <h1 className="text-5xl md:text-6xl font-bold text-primary leading-tight">
                AI-Powered Revenue Recovery.
              </h1>
              <p className="text-xl md:text-2xl text-foreground/80 font-medium">
                Stop losing 3-5% of annual revenue to contract billing errors.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                The only platform that automatically flags missed{" "}
                <span className="font-semibold text-success">price escalations</span>, ignored volume discounts, and
                unbilled renewals by running a forensic three-way audit.
              </p>
            </div>

            {/* Email Capture Form */}
            <motion.div
              className="max-w-xl rounded-2xl border border-border/80 bg-card/90 backdrop-blur p-6 shadow-card space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.6 }}
            >
              <p className="text-sm font-semibold text-primary uppercase tracking-widest">Get Your Free Revenue Leakage Report</p>
              <p className="text-sm text-muted-foreground">
                See how much you're likely losing, benchmark against peers, and get early access pricing (50% off for the first 50 customers).
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <Input
                  ref={emailInputRef}
                  type="email"
                  placeholder="Enter your work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 h-12 text-base bg-background/70"
                />
                <Button type="submit" variant="cta" size="lg" className="whitespace-nowrap shadow-lg shadow-cta/30">
                  Get My Report
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
              <div className="grid sm:grid-cols-3 gap-3 text-sm text-foreground">
                {["See leakage instantly", "Industry benchmarks", "No credit card required"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                We'll also send you early access details. First 50 customers lock in $499/mo forever.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-3 gap-4">
              {heroStats.map((stat) => (
                <motion.div
                  key={stat.label}
                  className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur px-4 py-3 shadow-sm"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Urgency Banner */}
            <motion.div
              className="rounded-2xl border border-border/70 bg-secondary/40 backdrop-blur px-5 py-4 flex flex-col gap-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.5 }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="grid gap-1 text-sm text-foreground/80">
                  {urgencyHighlights.map((point) => (
                    <span key={point}>{point}</span>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full md:w-auto"
                  onClick={() => emailInputRef.current?.focus()}
                >
                  Join Waitlist
                </Button>
              </div>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              className="flex flex-wrap items-center gap-8 pt-4 border-t border-border/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.6 }}
            >
              <p className="text-sm text-muted-foreground font-medium">Working with:</p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2 text-foreground/70">
                  <ServerCog className="h-5 w-5" />
                  <span className="text-sm font-medium">B2B SaaS</span>
                </div>
                <div className="flex items-center gap-2 text-foreground/70">
                  <Briefcase className="h-5 w-5" />
                  <span className="text-sm font-medium">Professional Services</span>
                </div>
                <div className="flex items-center gap-2 text-foreground/70">
                  <Building2 className="h-5 w-5" />
                  <span className="text-sm font-medium">MSPs</span>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Visual */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="relative rounded-2xl overflow-hidden shadow-hover border border-white/30">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" aria-hidden />
              <img src={heroVisual} alt="AI analyzing contracts and financial data" className="w-full h-auto object-cover" />
            </div>
            {/* Floating stat cards */}
            <motion.div
              className="absolute -bottom-6 -left-6 bg-card/95 p-5 rounded-2xl shadow-card border border-border"
              animate={{ y: [-4, 4, -4] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            >
              <p className="text-sm text-muted-foreground">Average revenue missed</p>
              <p className="text-3xl font-bold text-success">$47K</p>
              <p className="text-xs text-muted-foreground">per mid-market company / year</p>
            </motion.div>
            <motion.div
              className="absolute -top-8 -right-4 bg-primary text-primary-foreground px-5 py-3 rounded-2xl shadow-lg shadow-primary/40"
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 5.5, delay: 1, ease: "easeInOut" }}
            >
              <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Detection Speed</p>
              <p className="text-lg font-semibold">5 min audit</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
