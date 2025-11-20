import { AlertCircle, FileText, TrendingDown, Clock, CalendarDays, CheckCircle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { motion } from "framer-motion";

type ProblemSectionProps = {
  defaultArr?: number;
  leakageRate?: number;
  averageLeakage?: number;
  leakageSource?: string;
};

const ProblemSection = ({
  defaultArr = 2_500_000,
  leakageRate = 0.04,
  averageLeakage = 47_000,
  leakageSource = "ContractGuard beta cohort",
}: ProblemSectionProps) => {
  const [arr, setArr] = useState(defaultArr);
  const annualLoss = Math.round(arr * leakageRate);
  const monthlyLoss = Math.round(annualLoss / 12);
  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const cards = [
    {
      icon: FileText,
      title: "Contract Signed",
      description: (
        <>
          MSA states: <span className="font-semibold text-foreground">"5% CPI increase on renewal"</span>
        </>
      ),
      skin: "primary",
    },
    {
      icon: AlertCircle,
      title: "Billing Team Acts",
      description: (
        <>
          Billing system set to old price: <span className="font-semibold text-foreground">$100/unit</span>
        </>
      ),
      skin: "warning",
    },
    {
      icon: TrendingDown,
      title: "Revenue Lost",
      description: (
        <>
          Billed <span className="font-semibold line-through text-foreground">$105</span> →{" "}
          <span className="font-bold text-destructive">$100</span>
          <br />
          <span className="font-bold text-destructive text-lg">$5 Lost Per Month</span>
        </>
      ),
      skin: "destructive",
    },
  ];

  const runbook = [
    { icon: CalendarDays, title: "Renewal timeline", detail: "Contract renewal hit May 1. Billing never updated." },
    { icon: Clock, title: "Detection speed", detail: "Variance identified 14 days before customer notice." },
    { icon: CheckCircle, title: "Evidence attached", detail: "Sections 4.2 + Addendum B flagged with highlights." },
  ];

  const anomalyBreakdown = [
    { label: "Escalator miss", amount: "$18.4K", tone: "text-destructive" },
    { label: "Discount drift", amount: "$25.0K", tone: "text-foreground" },
    { label: "Unbilled renewal", amount: "$20.0K", tone: "text-foreground" },
  ];

  return (
    <section className="py-24 bg-background relative">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(15,76,129,0.05),_transparent_50%)]" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            The Billing Blind Spot.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Even the best finance teams miss critical billing opportunities hidden in contract terms.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
          {cards.map(({ icon: Icon, title, description, skin }, idx) => (
            <motion.div
              key={title}
              className={`bg-card p-8 rounded-2xl shadow-card border ${
                skin === "destructive" ? "border-destructive/60" : "border-border"
              }`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  skin === "primary"
                    ? "bg-primary/10"
                    : skin === "warning"
                      ? "bg-destructive/10"
                      : "bg-destructive/15"
                }`}
              >
                <Icon className={`h-6 w-6 ${skin === "primary" ? "text-primary" : "text-destructive"}`} />
              </div>
              <div className="space-y-3">
                <h3
                  className={`text-xl font-bold ${
                    skin === "destructive" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {title}
                </h3>
                <p className="text-muted-foreground">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Visual */}
        <motion.div
          className="max-w-5xl mx-auto"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <div className="grid md:grid-cols-[1.2fr_0.9fr] gap-6 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/5 via-background to-cta/5 p-6 shadow-hover relative overflow-hidden">
            <div className="rounded-2xl bg-card/90 border border-border/70 p-6 space-y-5 shadow-inner">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active audit</p>
                <p className="text-2xl font-semibold text-foreground">Acme Corp · CPI check</p>
                <p className="text-sm text-muted-foreground">Three-way match across contract, CRM, and NetSuite export.</p>
              </div>
              <div className="space-y-4">
                {runbook.map(({ icon: Icon, title, detail }) => (
                  <div key={title} className="flex gap-4">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{title}</p>
                      <p className="text-sm text-muted-foreground">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-border/80 p-4 bg-secondary/40">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">AI summary</p>
                <p className="text-sm text-foreground">
                  Billing still uses FY23 rate. Apply CPI uplift retroactively and document exception in CRM.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-primary text-primary-foreground p-6 shadow-lg">
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70 mb-2">Variance at a glance</p>
                <p className="text-4xl font-bold">$63,400</p>
                <p className="text-sm text-primary-foreground/80">Recoverable revenue across 9 invoices.</p>
                <div className="mt-5 space-y-3">
                  {anomalyBreakdown.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-primary-foreground">
                      <span className="text-sm">{item.label}</span>
                      <span className={`text-lg font-semibold ${item.tone}`}>{item.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Audit checklist</p>
                <ul className="space-y-3 text-sm text-foreground">
                  <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Escalator clause located (Section 4.2)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Invoice export cross-checked with expected rate
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    Rebilling required for May–Aug billing cycle
                  </li>
                </ul>
                <button className="mt-4 w-full rounded-xl border border-primary/40 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition">
                  Download discrepancy memo
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Key Stat + Calculator */}
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8 max-w-6xl mx-auto mt-12">
          <motion.div
            className="text-center bg-gradient-hero p-10 rounded-2xl text-white shadow-hover relative overflow-hidden"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" aria-hidden />
            <div className="relative space-y-4">
              <p className="text-sm uppercase tracking-widest text-white/80">Annual Revenue Leakage</p>
              <p className="text-4xl md:text-5xl font-bold text-white mb-2">{formatCurrency(averageLeakage)}</p>
              <p className="text-lg text-white/85">
                Average mid-market company misses <span className="font-semibold">{formatCurrency(averageLeakage)} in billings annually</span>
              </p>
              <p className="text-sm text-white/70">Source: {leakageSource}</p>
            </div>
          </motion.div>

          <motion.div
            className="bg-card border border-border rounded-2xl p-8 shadow-card"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-sm font-semibold text-primary mb-2">Interactive</p>
            <h3 className="text-2xl font-bold text-foreground mb-1">Leakage Calculator</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Drag the slider to match your annual recurring revenue. We estimate leakage using a conservative {Math.round(leakageRate * 100)}% benchmark.
            </p>
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">ARR</span>
                <span className="text-2xl font-semibold text-foreground">{formatCurrency(arr)}</span>
              </div>
              <Slider
                min={500000}
                max={10000000}
                step={50000}
                value={[arr]}
                onValueChange={(value) => setArr(value[0] ?? arr)}
                aria-label="Annual recurring revenue"
              />
            </div>
            <div className="mt-6 space-y-4 rounded-2xl border border-border p-4 bg-secondary/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Annual loss</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(annualLoss)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly impact</p>
                  <p className="text-xl font-semibold text-foreground">{formatCurrency(monthlyLoss)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Based on aggregated beta customer data. Actual leakage may be higher if escalators or volume tiers were never applied.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
