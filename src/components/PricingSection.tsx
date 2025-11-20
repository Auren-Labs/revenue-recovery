import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const PricingSection = () => {
  const scrollToWaitlist = () => {
    const element = document.getElementById("waitlist");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };
  const perks = [
    { label: "Unlimited forensic audits", highlight: false },
    { label: "AI-powered contract extraction", highlight: false },
    { label: "Discrepancy reports with evidence", highlight: false },
    { label: "No long-term commitment", highlight: false },
    { label: "Locked-in pricing (price increases to $799/mo at public launch)", highlight: true },
  ];

  return (
    <section id="pricing" className="py-24 bg-gradient-section relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(15,76,129,0.08),_transparent_55%)]" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            Start Finding Revenue. Zero Risk.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Lock in early access pricing before we launch publicly.
          </motion.p>
        </div>

        <div className="max-w-2xl mx-auto">
          <motion.div
            className="bg-card p-8 md:p-12 rounded-3xl shadow-hover border-2 border-cta relative overflow-hidden"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cta/10 to-transparent pointer-events-none" aria-hidden />
            {/* Badge */}
            <div className="absolute top-0 right-0 bg-cta text-cta-foreground px-6 py-2 rounded-bl-xl font-semibold shadow-lg shadow-cta/30">
              Early Access
            </div>

            <div className="relative space-y-6">
              <div>
                <p className="text-muted-foreground mb-2">Early Access Pricing</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-bold text-primary">$499</span>
                  <span className="text-2xl text-muted-foreground">/month</span>
                </div>
                <p className="text-muted-foreground mt-2">Up to 500 Contracts</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-6">
                {perks.map(({ label, highlight }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="bg-success/10 rounded-full p-1 mt-0.5">
                      <Check className="h-4 w-4 text-success" />
                    </div>
                    <p className={`text-foreground ${highlight ? "font-semibold text-cta" : ""}`}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-6">
                <Button
                  variant="cta"
                  size="xl"
                  className="w-full shadow-lg shadow-cta/40"
                  onClick={scrollToWaitlist}
                >
                  Start Free Audit
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-sm text-muted-foreground mt-4 flex items-center justify-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  No credit card • 5-minute setup • $47K avg recovery
                </p>
              </div>
            </div>
          </motion.div>

          {/* Value Prop */}
          <motion.div
            className="text-center mt-12 p-6 bg-success/5 rounded-2xl border border-success/20"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-lg font-semibold text-foreground mb-2">Expected First-Month Recovery</p>
            <p className="text-4xl font-bold text-success mb-1">$3,900</p>
            <p className="text-sm text-muted-foreground">
              Average customer recovers <span className="font-semibold">7.8x</span> the subscription cost in month one
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
