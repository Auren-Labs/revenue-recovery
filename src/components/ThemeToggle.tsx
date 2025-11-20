import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle color theme"
      onClick={toggleTheme}
      className="relative rounded-full border border-border/60 bg-card/70 backdrop-blur transition hover:bg-secondary/80"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{`Switch to ${theme === "dark" ? "light" : "dark"} mode`}</span>
    </Button>
  );
};

export default ThemeToggle;

