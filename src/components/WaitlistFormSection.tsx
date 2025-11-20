import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const revenueOptions = ["<$5M", "$5M - $20M", "$20M - $50M", "$50M - $200M", "$200M+"];
const roleOptions = ["CFO / Finance", "RevOps", "COO", "Founder / CEO", "Other"];
const contractOptions = ["<50", "50-200", "200-500", "500-1000", "1000+"];
const benefits = ["See leakage instantly", "Industry benchmarks", "No credit card required"];

const initialState = {
  name: "",
  email: "",
  company: "",
  annualRevenue: "",
  role: "",
  contractVolume: "",
  challenge: "",
};

const fieldLabels: Record<keyof typeof initialState, string> = {
  name: "Name",
  email: "Email",
  company: "Company",
  annualRevenue: "Annual revenue",
  role: "Role",
  contractVolume: "Contract volume",
  challenge: "Biggest challenge",
};

const WaitlistFormSection = () => {
  const [formData, setFormData] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const missingField = (Object.keys(formData) as (keyof typeof formData)[]).find(
      (key) => !formData[key].trim(),
    );

    if (missingField) {
      toast.error(`Please complete the ${fieldLabels[missingField]}.`);
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("waitlist_requests").insert({
      name: formData.name,
      email: formData.email,
      company: formData.company,
      annual_revenue: formData.annualRevenue,
      role: formData.role,
      contract_volume: formData.contractVolume,
      billing_challenge: formData.challenge,
    });

    if (error) {
      toast.error("Something went wrong. Please try again.");
    } else {
      toast.success("Thanks! We'll reach out with your report.");
      setFormData(initialState);
    }
    setIsSubmitting(false);
  };

  return (
    <section className="py-24 bg-gradient-section" id="waitlist-form">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto rounded-3xl border border-border/70 bg-card/95 backdrop-blur shadow-hover p-8 md:p-12 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold text-primary uppercase tracking-[0.3em]">Free Revenue Leakage Report</p>
            <h2 className="text-3xl md:text-4xl font-bold text-primary mt-3">Get early access in under 5 minutes.</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              Tell us about your revenue org and we'll share a customized leakage snapshot, benchmark data, and the link
              to lock in $499/mo pricing (50% off for the first 50 customers).
            </p>
          </motion.div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Jordan Lee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="jordan@company.com"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  name="company"
                  required
                  value={formData.company}
                  onChange={(e) => handleChange("company", e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label>Annual revenue</Label>
                <Select
                  value={formData.annualRevenue}
                  onValueChange={(value) => handleChange("annualRevenue", value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    {revenueOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>What's your role?</Label>
                <Select value={formData.role} onValueChange={(value) => handleChange("role", value)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>How many contracts do you manage?</Label>
                <Select
                  value={formData.contractVolume}
                  onValueChange={(value) => handleChange("contractVolume", value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    {contractOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="challenge">What is your biggest contract billing challenge?</Label>
              <Textarea
                id="challenge"
                name="challenge"
                rows={4}
                required
                value={formData.challenge}
                onChange={(e) => handleChange("challenge", e.target.value)}
                placeholder="Example: CPI escalators fall through the cracks when renewals are handled manually."
              />
            </div>

            <Button
              type="submit"
              variant="cta"
              size="xl"
              className="w-full md:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Get Early Access"}
            </Button>
          </form>

          <div className="grid sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            We’ll also send playbooks for catching leakage and notify you before the next cohort (two weeks out).
          </p>
        </div>
      </div>
    </section>
  );
};

export default WaitlistFormSection;