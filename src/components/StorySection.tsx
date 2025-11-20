import { motion, useScroll, useTransform } from "framer-motion";
import { ShieldCheck, Files, LineChart, Receipt } from "lucide-react";
import { useRef } from "react";

const storySteps = [
  {
    title: "1. Contracts go in",
    description: "Upload MSAs, order forms, and amendments. AI finds every uplift, volume tier, and renewal trigger.",
  },
  {
    title: "2. Billing gets reconciled",
    description: "We connect to ERP/CRM exports to rebuild what should have been invoiced for every renewal cycle.",
  },
  {
    title: "3. Discrepancies surface automatically",
    description: "Each variance is cited back to the contract clause with evidence so finance can take action immediately.",
  },
];

const highlights = [
  { icon: Files, label: "Clause extraction", value: "98% coverage" },
  { icon: LineChart, label: "Variance detection", value: "72 hrs faster" },
  { icon: ShieldCheck, label: "Evidence package", value: "1-click export" },
];

const StorySection = () => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const contractY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const invoiceY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <section ref={sectionRef} className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/5 to-transparent" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.p
            className="text-sm font-semibold text-primary uppercase tracking-[0.2em]"
            initial={{ opacity: 0, y: -12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            Scroll Story
          </motion.p>
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            Watch the contract-to-cash audit unfold.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Scroll to see how ContractGuard compares contract intent with billing reality and highlights the leakage.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            {storySteps.map((step, idx) => (
              <motion.div
                key={step.title}
                className="bg-card/70 border border-border rounded-2xl p-6 shadow-sm backdrop-blur"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <p className="text-sm font-semibold text-primary mb-1">Step {idx + 1}</p>
                <h3 className="text-2xl font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}

            <div className="grid sm:grid-cols-3 gap-4">
              {highlights.map(({ icon: Icon, label, value }) => (
                <motion.div
                  key={label}
                  className="rounded-2xl border border-border/70 bg-secondary/40 p-4 shadow-sm"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.4 }}
                >
                  <Icon className="h-5 w-5 text-primary mb-2" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold text-foreground">{value}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative h-[420px]">
            <motion.div
              style={{ y: contractY }}
              className="absolute left-0 right-8 top-0 bg-card rounded-3xl border border-border shadow-hover p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Master Agreement</p>
                  <p className="text-xl font-semibold text-foreground">Acme Corp · 2024 Renewal</p>
                </div>
                <span className="text-sm font-semibold text-success bg-success/10 px-3 py-1 rounded-full">+5% CPI</span>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Section 4.2 <span className="text-foreground font-semibold">“Rates increase by CPI (max 5%) annually.”</span>
                </p>
                <p>
                  Volume Tier B kicks in above <span className="text-foreground font-semibold">1,000 seats ($92/unit)</span>
                </p>
                <div className="rounded-2xl border border-dashed border-border p-3 bg-secondary/30">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Money clause</p>
                  <p className="text-foreground font-semibold">Expect $105/unit on 2024 renewal (CPI cap applied).</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              style={{ y: invoiceY }}
              className="absolute bottom-0 right-0 left-8 bg-primary text-primary-foreground rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Invoice Extract</p>
                  <p className="text-xl font-semibold">Invoice #84721</p>
                </div>
                <Receipt className="h-5 w-5 text-primary-foreground/70" />
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Unit price billed</span>
                  <span className="font-semibold text-white">$100</span>
                </div>
                <div className="flex justify-between">
                  <span>Expected unit price</span>
                  <span className="font-semibold text-success">$105</span>
                </div>
                <div className="flex justify-between border-t border-primary-foreground/20 pt-3">
                  <span className="font-medium">Monthly variance</span>
                  <span className="font-bold text-destructive">-$5/unit</span>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-primary-foreground/10 p-3 text-sm text-primary-foreground/90">
                5,000 units × $5 variance = <span className="font-semibold text-white">$25,000/mo leakage</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StorySection;

