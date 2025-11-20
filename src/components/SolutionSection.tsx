import { Upload, Sparkles, FileCheck } from "lucide-react";
import solutionUI from "@/assets/solution-ui.jpg";

const SolutionSection = () => {
  return (
    <section id="features" className="py-20 bg-gradient-section">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            The Forensic 3-Step Audit. Automated.
          </h2>
          <p className="text-lg text-muted-foreground">
            Stop manually reviewing hundreds of contracts. Let AI find the money you're owed.
          </p>
        </div>

        {/* Product UI Visual */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="relative rounded-2xl overflow-hidden shadow-hover border border-border">
            <img
              src={solutionUI}
              alt="ContractGuard dashboard showing contract analysis"
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Step 1 */}
          <div className="relative">
            <div className="bg-card p-8 rounded-xl shadow-card border border-border h-full">
              <div className="bg-cta/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6">
                <Upload className="h-7 w-7 text-cta" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-cta">01</span>
                  <h3 className="text-xl font-bold text-foreground">Upload</h3>
                </div>
                <p className="text-muted-foreground">
                  Drag-and-drop your Master Agreements and Order Forms. We handle the separation and organization automatically.
                </p>
              </div>
            </div>
            {/* Connection Line */}
            <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-border"></div>
          </div>

          {/* Step 2 */}
          <div className="relative">
            <div className="bg-card p-8 rounded-xl shadow-card border border-border h-full">
              <div className="bg-primary/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-primary">02</span>
                  <h3 className="text-xl font-bold text-foreground">Analyze</h3>
                </div>
                <p className="text-muted-foreground">
                  AI instantly extracts pricing, terms, and the critical <span className="font-semibold text-success">escalation logic</span> (The "money clause").
                </p>
              </div>
            </div>
            {/* Connection Line */}
            <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-border"></div>
          </div>

          {/* Step 3 */}
          <div className="bg-card p-8 rounded-xl shadow-card border border-success/30 h-full">
            <div className="bg-success/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6">
              <FileCheck className="h-7 w-7 text-success" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold text-success">03</span>
                <h3 className="text-xl font-bold text-foreground">Recover</h3>
              </div>
              <p className="text-muted-foreground">
                Get an actionable report listing every missed billing opportunity, complete with contract section evidence.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
