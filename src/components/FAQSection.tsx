import { motion } from "framer-motion";

const faqs = [
  {
    question: "How accurate is it?",
    answer:
      "We maintain 85–92% accuracy on financial terms. Anything low-confidence is highlighted for your review. Beta customers still found an average of $47K in missed revenue.",
  },
  {
    question: "What if my contracts are really complex?",
    answer:
      "We parse MSAs, SOWs, amendments, multi-year rate cards, and more. Complex cases automatically route to an expert reviewer (included).",
  },
  {
    question: "Do I need to change my billing system?",
    answer: "No change required. Just export invoices or usage from the system you already use and upload a CSV.",
  },
  {
    question: "What if you don’t find any errors?",
    answer: "We issue a full refund—no questions asked. That said, 89% of companies uncover $10K+ during the very first audit.",
  },
  {
    question: "How long does setup take?",
    answer: "5–10 minutes. Upload contracts, upload invoices, and review results. We guide you step-by-step.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. There are no long-term contracts. Cancel with one click from the billing portal.",
  },
];

const FAQSection = () => (
  <section className="py-24 bg-background">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <motion.p
          className="text-sm font-semibold text-primary uppercase tracking-[0.3em]"
          initial={{ opacity: 0, y: -12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          FAQ
        </motion.p>
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-primary mt-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          Everything you need to know before launch.
        </motion.h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {faqs.map((faq, idx) => (
          <motion.div
            key={faq.question}
            className="rounded-2xl border border-border bg-card/80 p-6 shadow-card"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: idx * 0.05 }}
          >
            <p className="text-lg font-semibold text-foreground mb-2">{faq.question}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default FAQSection;

