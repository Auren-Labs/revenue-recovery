import { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

type ArtifactFrameProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
};

/**
 * ArtifactFrame - Claude Artifacts-style wrapper
 * Provides a full-screen, interactive canvas for artifacts
 */
export const ArtifactFrame = ({
  title,
  subtitle,
  children,
  onClose,
  actions,
}: ArtifactFrameProps) => {
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border/50 bg-gradient-to-r from-background via-background to-muted/20 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-lg">📦</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

