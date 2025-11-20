import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ProblemSection from "@/components/ProblemSection";
import StorySection from "@/components/StorySection";
import SolutionSection from "@/components/SolutionSection";
import ROISection from "@/components/ROISection";
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <ProblemSection />
        <StorySection />
        <SolutionSection />
        <ROISection />
        <TestimonialsSection />
        <FAQSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
