import { useTheme } from "../context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800">
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
};