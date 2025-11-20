import { Upload, Sparkles, FileCheck } from "lucide-react";
import { motion } from "framer-motion";

const SolutionSection = () => {
  const colorTokens = {
    cta: { badge: "bg-cta/10", text: "text-cta", border: "border-border" },
    primary: { badge: "bg-primary/10", text: "text-primary", border: "border-border" },
    success: { badge: "bg-success/10", text: "text-success", border: "border-success/30" },
  };

  const previewRows = [
    { clause: "CPI uplift", expected: "+5%", billed: "+0%", impact: "-$18.4K" },
    { clause: "Volume tier", expected: "$92/unit", billed: "$100/unit", impact: "+$38.1K" },
    { clause: "Renewal uplift", expected: "$125K", billed: "$118K", impact: "-$7K" },
  ];

  const previewSignals = [
    { label: "Contracts scanned", value: "312", tone: "text-primary" },
    { label: "Variance flagged", value: "$63K", tone: "text-destructive" },
    { label: "Accuracy", value: "87%", tone: "text-success" },
  ];

  const steps = [
    {
      icon: Upload,
      step: "01",
      title: "Upload",
      copy:
        "Drag-and-drop your Master Agreements and Order Forms. We handle the separation and organization automatically.",
      color: "cta",
    },
    {
      icon: Sparkles,
      step: "02",
      title: "Analyze",
      copy:
        "AI instantly extracts pricing, terms, and the critical escalation logic (The “money clause”).",
      color: "primary",
    },
    {
      icon: FileCheck,
      step: "03",
      title: "Recover",
      copy:
        "Get an actionable report listing every missed billing opportunity, complete with contract section evidence.",
      color: "success",
    },
  ];

  return (
    <section id="features" className="py-24 bg-gradient-section relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            The Forensic 3-Step Audit. Automated.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Stop manually reviewing hundreds of contracts. Let AI find the money you're owed.
          </motion.p>
        </div>

        {/* Product Story Visual */}
        <motion.div
          className="max-w-5xl mx-auto mb-16"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <div className="relative rounded-3xl shadow-hover border border-border/70 bg-gradient-to-br from-primary/5 via-background to-cta/5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
            <div className="grid md:grid-cols-[1.15fr_0.85fr] gap-6 p-8">
              <div className="bg-card/80 rounded-2xl border border-border/70 p-6 shadow-inner relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Contract evidence</p>
                    <p className="text-xl font-semibold text-foreground">Acme Corp · Renewal FY24</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-success/10 text-success">Audited</span>
                </div>
                <div className="space-y-3 text-sm">
                  {previewRows.map((row) => (
                    <div key={row.clause} className="grid grid-cols-4 gap-3 items-center text-foreground/90">
                      <p className="font-medium">{row.clause}</p>
                      <p className="text-muted-foreground">
                        <span className="text-xs text-muted-foreground/80 block">Expected</span>
                        {row.expected}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-xs text-muted-foreground/80 block">Billed</span>
                        {row.billed}
                      </p>
                      <p className={`font-semibold ${row.impact.startsWith("-") ? "text-destructive" : "text-success"}`}>
                        {row.impact}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-dashed border-border/80 p-4 bg-secondary/40">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Auto note</p>
                  <p className="text-sm text-foreground">
                    CPI uplift never posted. Finance should rebill May–Aug invoices with evidence attached.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl bg-primary text-primary-foreground p-6 shadow-lg">
                  <p className="text-xs uppercase tracking-wide text-primary-foreground/70 mb-2">Discrepancy summary</p>
                  <p className="text-4xl font-bold">$63,400</p>
                  <p className="text-sm text-primary-foreground/80">
                    Total recoverable revenue from this audit across 9 invoices.
                  </p>
                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Escalator misses</span>
                      <span className="font-semibold">$18.4K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount drift</span>
                      <span className="font-semibold">$25.0K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unbilled renewals</span>
                      <span className="font-semibold">$20.0K</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">System signals</p>
                  <div className="space-y-3">
                    {previewSignals.map((signal) => (
                      <div key={signal.label} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{signal.label}</span>
                        <span className={`text-lg font-semibold ${signal.tone}`}>{signal.value}</span>
                      </div>
                    ))}
                  </div>
                  <button className="mt-4 w-full rounded-xl border border-primary/40 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition">
                    Export evidence PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map(({ icon: Icon, title, copy, step, color }, idx) => {
            const token = colorTokens[color as keyof typeof colorTokens];
            return (
              <motion.div
                key={title}
                className={`relative bg-card p-8 rounded-2xl shadow-card border ${token.border} h-full`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <div className={`${token.badge} w-14 h-14 rounded-2xl flex items-center justify-center mb-6`}>
                  <Icon className={`h-7 w-7 ${token.text}`} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-4xl font-bold ${token.text}`}>{step}</span>
                    <h3 className="text-xl font-bold text-foreground">{title}</h3>
                  </div>
                  <p className="text-muted-foreground">{copy}</p>
                </div>
                {idx < steps.length - 1 && (
                  <span className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-border" aria-hidden />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
