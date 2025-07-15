import React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-provider";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className = "" }: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const getIcon = () => {
    if (theme === "light") {
      return <Sun className="h-5 w-5 text-yellow-500" />;
    } else if (theme === "dark") {
      return <Moon className="h-5 w-5 text-blue-400" />;
    } else {
      // System theme - show both icons or a different indicator
      return <Sun className="h-5 w-5 text-gray-500" />;
    }
  };

  const getAriaLabel = () => {
    if (theme === "light") {
      return "Switch to dark mode";
    } else if (theme === "dark") {
      return "Switch to system mode";
    } else {
      return "Switch to light mode";
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`rounded-full bg-background ${className}`}
      aria-label={getAriaLabel()}
    >
      {getIcon()}
    </Button>
  );
};

export default ThemeToggle;
