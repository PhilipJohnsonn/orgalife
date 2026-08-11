"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_EVENT = "orgalife-theme-change";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getDarkSnapshot() {
  const stored = localStorage.getItem("theme");
  return stored === "dark" || (!stored && window.matchMedia(DARK_MEDIA_QUERY).matches);
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(THEME_EVENT, handleChange);
  media.addEventListener("change", handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(THEME_EVENT, handleChange);
    media.removeEventListener("change", handleChange);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, getDarkSnapshot, () => false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
