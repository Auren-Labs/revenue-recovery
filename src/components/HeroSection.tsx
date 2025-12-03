import { Button } from "@/components/ui/button";
import { Building2, Briefcase, ServerCog } from "lucide-react";
import { motion } from "framer-motion";

const HeroSection = () => {
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

  const scrollToForm = () => {
    const formElement = document.getElementById("waitlist-form");
    formElement?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="waitlist" className="relative pt-32 pb-24 bg-gradient-section overflow-hidden">
      <div className="absolute inset-x-0 top-10 h-64 blur-3xl bg-primary/10" aria-hidden />
      <div className="absolute -right-32 top-10 w-96 h-96 bg-cta/10 blur-3xl rounded-full" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Content - Center Aligned */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.p
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-sm font-semibold text-primary"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
            >
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              Revenue Recovery Copilot
            </motion.p>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
              All revenue recovery,<br />
              <span className="italic font-normal text-foreground/90">all in one place</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-foreground/80 font-medium max-w-2xl mx-auto">
              Stop losing 3-5% of annual revenue to contract billing errors.
            </p>
            
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              The only platform that automatically flags missed{" "}
              <span className="font-semibold text-success">price escalations</span>, ignored volume discounts, and
              unbilled renewals by running a forensic three-way audit.
            </p>
          </motion.div>

          {/* Stats - Center Aligned */}
          <motion.div
            className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur px-4 py-3 shadow-sm"
              >
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-semibold text-foreground">{stat.value}</p>
              </div>
            ))}
          </motion.div>

          {/* Urgency Banner - Center Aligned */}
          <motion.div
            className="rounded-2xl border border-border/70 bg-secondary/40 backdrop-blur px-5 py-4 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.5 }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-3">
              <div className="grid gap-1 text-sm text-foreground/80 text-center md:text-left">
                {urgencyHighlights.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="w-full md:w-auto" onClick={scrollToForm}>
                Join Waitlist
              </Button>
            </div>
          </motion.div>

          {/* Social Proof - Center Aligned */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-8 pt-4 border-t border-border/50"
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
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
