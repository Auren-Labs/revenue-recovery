import { AlertCircle, FileText, DollarSign, TrendingDown } from "lucide-react";
import problemVisual from "@/assets/problem-visual.jpg";

const ProblemSection = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            The Billing Blind Spot.
          </h2>
          <p className="text-lg text-muted-foreground">
            Even the best finance teams miss critical billing opportunities hidden in contract terms.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
          {/* Step 1 */}
          <div className="bg-card p-8 rounded-xl shadow-card border border-border">
            <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-foreground">Contract Signed</h3>
              <p className="text-muted-foreground">
                MSA states: <span className="font-semibold text-foreground">"5% CPI increase on renewal"</span>
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-card p-8 rounded-xl shadow-card border border-border">
            <div className="bg-destructive/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-foreground">Billing Team Acts</h3>
              <p className="text-muted-foreground">
                Billing system set to old price: <span className="font-semibold text-foreground">$100/unit</span>
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-card p-8 rounded-xl shadow-card border border-destructive/50">
            <div className="bg-destructive/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <TrendingDown className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-destructive">Revenue Lost</h3>
              <p className="text-muted-foreground">
                Billed <span className="font-semibold line-through text-foreground">$105</span> → <span className="font-bold text-destructive">$100</span>
                <br />
                <span className="font-bold text-destructive text-lg">$5 Lost Per Month</span>
              </p>
            </div>
          </div>
        </div>

        {/* Visual */}
        <div className="max-w-4xl mx-auto">
          <img
            src={problemVisual}
            alt="Billing error visualization"
            className="w-full rounded-xl shadow-hover"
          />
        </div>

        {/* Key Stat */}
        <div className="text-center mt-12 bg-gradient-hero p-8 rounded-2xl max-w-3xl mx-auto">
          <p className="text-4xl md:text-5xl font-bold text-primary-foreground mb-2">
            $47,000
          </p>
          <p className="text-lg text-primary-foreground/90">
            Average mid-market company misses <span className="font-semibold">$47K in billings annually</span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
