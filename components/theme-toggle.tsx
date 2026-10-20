"use client";

import { useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** Cycles Auto → Light → Dark. Saved in a cookie so the server renders the right theme (no flash). */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  const choose = (t: ThemeChoice) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="btn-quiet gap-1.5" onClick={() => choose(NEXT[theme])} title="Theme: Auto follows your system" aria-label={`Theme: ${LABEL[theme]}. Change theme`}>
      <Icon theme={theme} />
      <span className="hidden sm:inline">{LABEL[theme]}</span>
    </button>
  );
}

function Icon({ theme }: { theme: ThemeChoice }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (theme === "light")
    return (
      <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    );
  if (theme === "dark") return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>;
}
