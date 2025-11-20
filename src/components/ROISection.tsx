import { TrendingUp, Clock, Target, Quote } from "lucide-react";
import { motion } from "framer-motion";

const ROISection = () => {
  const stats = [
    {
      icon: TrendingUp,
      value: "20x",
      label: "Average ROI",
      subLabel: "Find $100K in errors, charge $5K",
      variant: "primary",
      iconColor: "text-primary-foreground",
    },
    {
      icon: Clock,
      value: "90%",
      label: "Time Saved",
      subLabel: "Reduction in manual audit time",
      variant: "neutral",
      iconColor: "text-success",
    },
    {
      icon: Target,
      value: "85%+",
      label: "Accuracy",
      subLabel: "Extraction accuracy on financial terms",
      variant: "neutral",
      iconColor: "text-cta",
    },
  ];

  const trustMetrics = [
    { value: "500+", label: "Contracts Analyzed" },
    { value: "$2.4M", label: "Revenue Recovered" },
    { value: "100%", label: "Data Security" },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            The ROI is a No-Brainer.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Our customers find more revenue in their first audit than they pay us all year.
          </motion.p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {stats.map(({ icon: Icon, value, label, subLabel, variant, iconColor }, idx) => (
            <motion.div
              key={label}
              className={`p-8 rounded-2xl text-center ${
                variant === "primary"
                  ? "bg-gradient-hero text-white shadow-hover"
                  : "bg-card text-foreground border border-border shadow-card"
              }`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <Icon
                className={`h-12 w-12 mx-auto mb-4 ${variant === "primary" ? "text-white" : iconColor}`}
              />
              <p className="text-5xl font-bold mb-2">{value}</p>
              <p className="text-lg font-medium">{label}</p>
              <p className={`text-sm mt-2 ${variant === "primary" ? "text-white/80" : "text-muted-foreground"}`}>
                {subLabel}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Testimonial */}
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-accent p-8 md:p-12 rounded-2xl shadow-card border border-border relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" aria-hidden />
            <Quote className="h-12 w-12 text-primary/20 absolute top-6 left-6" />
            <div className="relative z-10">
              <p className="text-xl md:text-2xl text-foreground font-medium mb-6 italic">
                "We found more errors in the free beta than our previous manual audit cost us. ContractGuard paid for itself
                in week one."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-lg">CF</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">CFO, Mid-Market SaaS</p>
                  <p className="text-sm text-muted-foreground">Beta Tester</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trust Indicators */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
          {trustMetrics.map(({ value, label }, idx) => (
            <motion.div
              key={label}
              className="text-center rounded-2xl border border-border bg-card/70 p-6 shadow-sm"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
            >
              <p className="text-3xl font-bold text-primary mb-1">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ROISection;
