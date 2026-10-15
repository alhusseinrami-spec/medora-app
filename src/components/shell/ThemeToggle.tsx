"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("medora-theme", next); } catch {}
    setTheme(next);
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={flip} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} data-testid="theme-toggle">
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}
