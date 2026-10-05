"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";
import { IconButton } from "./ui";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </IconButton>
  );
}
