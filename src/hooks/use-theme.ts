import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "contractguard-theme";
const subscribers = new Set<() => void>();

const getStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return null;
};

const getSystemTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getInitialTheme = (): Theme => getStoredTheme() ?? getSystemTheme();

let currentTheme: Theme = "light";
let listenersBound = false;

const applyThemeClass = (theme: Theme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
};

const notifySubscribers = () => {
  subscribers.forEach((callback) => callback());
};

const setThemeInternal = (theme: Theme, persist = true) => {
  currentTheme = theme;
  applyThemeClass(theme);
  if (persist && typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  notifySubscribers();
};

const handleSystemThemeChange = (event: MediaQueryListEvent) => {
  if (getStoredTheme()) return;
  setThemeInternal(event.matches ? "dark" : "light", false);
};

const handleStorageChange = (event: StorageEvent) => {
  if (event.key !== THEME_STORAGE_KEY) return;
  if (event.newValue === "light" || event.newValue === "dark") {
    setThemeInternal(event.newValue, false);
    return;
  }
  setThemeInternal(getSystemTheme(), false);
};

const bindListeners = () => {
  if (listenersBound || typeof window === "undefined") return;

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleSystemThemeChange);
  }

  window.addEventListener("storage", handleStorageChange);
  listenersBound = true;
};

export const initializeTheme = () => {
  if (typeof window === "undefined") return;
  currentTheme = getInitialTheme();
  applyThemeClass(currentTheme);
  bindListeners();
};

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

const getSnapshot = () => currentTheme;
const getServerSnapshot = () => "light" as Theme;

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setThemeInternal(nextTheme);
  };

  const setTheme = (value: Theme) => {
    setThemeInternal(value);
  };

  return { theme, setTheme, toggleTheme };
};

