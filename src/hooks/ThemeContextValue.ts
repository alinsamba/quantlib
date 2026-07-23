import { createContext } from 'react';
import type { ThemeContextType } from './Theme';

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
