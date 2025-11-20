import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

const PricingSection = () => {
  const scrollToWaitlist = () => {
    const element = document.getElementById("waitlist");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section id="pricing" className="py-20 bg-gradient-section">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            Start Finding Revenue. Zero Risk.
          </h2>
          <p className="text-lg text-muted-foreground">
            Lock in early access pricing before we launch publicly.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-card p-8 md:p-12 rounded-2xl shadow-hover border-2 border-cta relative overflow-hidden">
            {/* Badge */}
            <div className="absolute top-0 right-0 bg-cta text-cta-foreground px-6 py-2 rounded-bl-xl font-semibold">
              Early Access
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-muted-foreground mb-2">Early Access Pricing</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-bold text-primary">$499</span>
                  <span className="text-2xl text-muted-foreground">/month</span>
                </div>
                <p className="text-muted-foreground mt-2">Up to 500 Contracts</p>
              </div>

              <div className="space-y-3 pt-6">
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-1 mt-0.5">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-foreground">Unlimited forensic audits</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-1 mt-0.5">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-foreground">AI-powered contract extraction</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-1 mt-0.5">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-foreground">Discrepancy reports with evidence</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-1 mt-0.5">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-foreground">No long-term commitment</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-1 mt-0.5">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-foreground">
                    <span className="font-semibold text-cta">Locked-in pricing</span> (Price increases to $799/mo at public launch)
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <Button 
                  variant="cta" 
                  size="xl" 
                  className="w-full"
                  onClick={scrollToWaitlist}
                >
                  Secure My Spot on the Waitlist
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  30-day money-back guarantee • Cancel anytime
                </p>
              </div>
            </div>
          </div>

          {/* Value Prop */}
          <div className="text-center mt-12 p-6 bg-success/5 rounded-xl border border-success/20">
            <p className="text-lg font-semibold text-foreground mb-2">
              Expected First-Month Recovery
            </p>
            <p className="text-4xl font-bold text-success mb-1">$3,900</p>
            <p className="text-sm text-muted-foreground">
              Average customer recovers <span className="font-semibold">7.8x</span> the subscription cost in month one
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
