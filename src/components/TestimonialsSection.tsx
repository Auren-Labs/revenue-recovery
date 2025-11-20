import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "ContractGuard uncovered $186K in missed escalators across three key accounts. The evidence package helped us close the gap in under two weeks.",
    name: "VP Finance",
    company: "Enterprise SaaS, $80M ARR",
  },
  {
    quote:
      "The scroll audit makes it painfully obvious where billing drifted. We now run it before every renewal cycle and catch issues before customers do.",
    name: "Head of RevOps",
    company: "Managed IT Provider",
  },
  {
    quote:
      "We plugged in NetSuite exports and got a prioritized discrepancy list with contract citations. Our CFO calls it the easiest ROI in our stack.",
    name: "Controller",
    company: "Professional Services Firm",
  },
];

const TestimonialsSection = () => {
  return (
    <section className="py-24 bg-background relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.h2
            className="text-4xl md:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            Trusted by finance teams on the front line.
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Layer in ContractGuard before your next renewal cycle and bring evidence to every pricing conversation.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, idx) => (
            <motion.div
              key={testimonial.name}
              className="relative rounded-3xl border border-border bg-card p-8 shadow-card"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <Quote className="h-10 w-10 text-primary/20 absolute -top-4 left-6" />
              <p className="text-lg text-foreground font-medium mb-6">{`"${testimonial.quote}"`}</p>
              <div>
                <p className="font-semibold text-foreground">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">{testimonial.company}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;

