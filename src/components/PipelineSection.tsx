import { motion } from "framer-motion";
import RevenueRecoveryPipeline from "@/components/RevenueRecoveryPipeline";

const PipelineSection = () => {
  return (
    <section className="relative py-20 bg-white dark:bg-background overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          {/* Pipeline Diagram - Clean white background like Ironclad */}
          <div className="relative flex items-center justify-center py-12">
            <RevenueRecoveryPipeline />
          </div>
        </div>
      </div>
    </section>
  );
};

export default PipelineSection;

