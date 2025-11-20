import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import { motion } from "framer-motion";

const CAL_NAMESPACE = "cal30";
const CAL_LINK = "harshal-shinde-frsqmv/30min";

const CalBookingSection = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const snippetId = "cal-embed-snippet";
    if (document.getElementById(snippetId)) return;

    const script = document.createElement("script");
    script.id = snippetId;
    script.type = "text/javascript";
    script.innerHTML = `(function (C, A, L) {
  let p = function (a, ar) { a.q.push(ar); };
  let d = C.document;
  C.Cal = C.Cal || function () {
    let cal = C.Cal;
    let ar = arguments;
    if (!cal.loaded) {
      cal.ns = cal.ns || {};
      cal.q = cal.q || [];
      let s = d.createElement("script");
      s.src = A;
      s.async = true;
      d.head.appendChild(s);
      cal.loaded = true;
    }
    if (ar[0] === L) {
      const api = function () { p(api, arguments); };
      const namespace = ar[1];
      api.q = api.q || [];
      if (typeof namespace === "string") {
        cal.ns[namespace] = cal.ns[namespace] || api;
        p(cal.ns[namespace], ar);
        p(cal, ["initNamespace", namespace]);
      } else {
        p(cal, ar);
      }
      return;
    }
    p(cal, ar);
  };
})(window, "https://app.cal.com/embed/embed.js", "init");
Cal("init", "${CAL_NAMESPACE}", { origin: "https://app.cal.com" });
Cal.ns["${CAL_NAMESPACE}"]("ui", { hideEventTypeDetails: false, layout: "month_view" });`;

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 items-center rounded-3xl border border-border bg-card/90 backdrop-blur shadow-hover p-8 md:p-12">
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-[0.3em]">
              <Calendar className="h-4 w-4" />
              Book a live audit
            </p>
            <h2 className="text-4xl font-bold text-primary">Schedule a free revenue audit call.</h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Walk through your contract stack with us. We’ll analyze up to 10 contracts on the call, highlight where revenue is leaking,
              and map the exact steps to recover it.
            </p>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-success" />
                30-minute session · next cohort opens in 2 weeks
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-success" />
                We’ll analyze up to 10 contracts for free
              </li>
            </ul>
            <Button
              variant="cta"
              size="xl"
              data-cal-link={CAL_LINK}
              data-cal-namespace={CAL_NAMESPACE}
              data-cal-config='{"layout":"month_view"}'
              className="w-full sm:w-auto"
            >
              Schedule Free Revenue Audit
            </Button>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 to-cta/10 p-8 shadow-inner space-y-4"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-sm uppercase tracking-widest text-muted-foreground">What to expect</p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                • Share up to 10 MSAs/SOWs (NDA covered). We’ll plug them into ContractGuard live and highlight the gaps.
              </p>
              <p>
                • Receive a prioritized discrepancy list with contract citations and estimated recovery amounts.
              </p>
              <p>• Leave with a 2-week plan to deploy automated audits across your billing stack.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">No calendar gymnastics.</p>
              <p>Pick a time that works, invite teammates, and we’ll bring the audit playbook.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CalBookingSection;

