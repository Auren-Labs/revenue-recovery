import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Building2, Briefcase, ServerCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import heroVisual from "@/assets/hero-visual.jpg";

const HeroSection = () => {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      toast.success("Thank you! You've been added to the waitlist.");
      setEmail("");
    }
  };

  return (
    <section id="waitlist" className="relative pt-32 pb-20 bg-gradient-section overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold text-primary leading-tight">
                AI-Powered Revenue Recovery.
              </h1>
              <p className="text-xl md:text-2xl text-foreground/80 font-medium">
                Stop losing 3-5% of annual revenue to contract billing errors.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                The only platform that automatically flags missed <span className="font-semibold text-success">price escalations</span>, 
                ignored volume discounts, and unbilled renewals by running a forensic three-way audit.
              </p>
            </div>

            {/* Email Capture Form */}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <Input
                type="email"
                placeholder="Enter your work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 h-12 text-base"
              />
              <Button type="submit" variant="cta" size="lg" className="whitespace-nowrap">
                Join Waitlist
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>

            {/* Social Proof */}
            <div className="flex flex-wrap items-center gap-8 pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground font-medium">Working with:</p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2 text-foreground/70">
                  <ServerCog className="h-5 w-5" />
                  <span className="text-sm font-medium">B2B SaaS</span>
                </div>
                <div className="flex items-center gap-2 text-foreground/70">
                  <Briefcase className="h-5 w-5" />
                  <span className="text-sm font-medium">Professional Services</span>
                </div>
                <div className="flex items-center gap-2 text-foreground/70">
                  <Building2 className="h-5 w-5" />
                  <span className="text-sm font-medium">MSPs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Visual */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-hover">
              <img
                src={heroVisual}
                alt="AI analyzing contracts and financial data"
                className="w-full h-auto object-cover"
              />
            </div>
            {/* Floating stat cards */}
            <div className="absolute -bottom-6 -left-6 bg-card p-4 rounded-lg shadow-card border border-border">
              <p className="text-3xl font-bold text-success">$47K</p>
              <p className="text-sm text-muted-foreground">Avg. Revenue Missed</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
