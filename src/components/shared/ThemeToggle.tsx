import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "../../stores/themeStore";

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore();

  return (
    <button
      onClick={toggle}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      style={{ backgroundColor: theme === "dark" ? "#3b82f6" : "#e5e7eb" }}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ${
          theme === "dark" ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {theme === "dark" ? (
          <Moon size={10} className="text-blue-600" />
        ) : (
          <Sun size={10} className="text-amber-500" />
        )}
      </span>
    </button>
  );
}
