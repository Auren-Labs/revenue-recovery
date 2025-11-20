import { TrendingUp, Clock, Target, Quote } from "lucide-react";

const ROISection = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            The ROI is a No-Brainer.
          </h2>
          <p className="text-lg text-muted-foreground">
            Our customers find more revenue in their first audit than they pay us all year.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {/* Stat 1 */}
          <div className="bg-gradient-hero p-8 rounded-2xl shadow-hover text-center">
            <TrendingUp className="h-12 w-12 text-primary-foreground mx-auto mb-4" />
            <p className="text-5xl font-bold text-primary-foreground mb-2">20x</p>
            <p className="text-lg text-primary-foreground/90 font-medium">Average ROI</p>
            <p className="text-sm text-primary-foreground/70 mt-2">
              Find $100K in errors, charge $5K
            </p>
          </div>

          {/* Stat 2 */}
          <div className="bg-card p-8 rounded-2xl shadow-card border border-border text-center">
            <Clock className="h-12 w-12 text-success mx-auto mb-4" />
            <p className="text-5xl font-bold text-success mb-2">90%</p>
            <p className="text-lg text-foreground font-medium">Time Saved</p>
            <p className="text-sm text-muted-foreground mt-2">
              Reduction in manual audit time
            </p>
          </div>

          {/* Stat 3 */}
          <div className="bg-card p-8 rounded-2xl shadow-card border border-border text-center">
            <Target className="h-12 w-12 text-cta mx-auto mb-4" />
            <p className="text-5xl font-bold text-cta mb-2">85%+</p>
            <p className="text-lg text-foreground font-medium">Accuracy</p>
            <p className="text-sm text-muted-foreground mt-2">
              Extraction accuracy on financial terms
            </p>
          </div>
        </div>

        {/* Testimonial */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-accent p-8 md:p-12 rounded-2xl shadow-card border border-border relative">
            <Quote className="h-12 w-12 text-primary/20 absolute top-6 left-6" />
            <div className="relative z-10">
              <p className="text-xl md:text-2xl text-foreground font-medium mb-6 italic">
                "We found more errors in the free beta than our previous manual audit cost us. 
                ContractGuard paid for itself in week one."
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
        </div>

        {/* Trust Indicators */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
          <div className="text-center">
            <p className="text-3xl font-bold text-primary mb-1">500+</p>
            <p className="text-sm text-muted-foreground">Contracts Analyzed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary mb-1">$2.4M</p>
            <p className="text-sm text-muted-foreground">Revenue Recovered</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary mb-1">100%</p>
            <p className="text-sm text-muted-foreground">Data Security</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ROISection;
