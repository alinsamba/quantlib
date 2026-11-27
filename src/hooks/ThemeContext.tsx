import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { db } from '../lib/ipc-client';

export type Theme = 'chalk';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    localStorage.setItem('quantlib_theme', 'chalk');
    localStorage.removeItem('theme');
    const root = window.document.documentElement;
    root.setAttribute('data-theme', 'chalk');
    root.classList.remove('dark');

    db.setTheme('light').catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'chalk', setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
