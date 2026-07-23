import { Moon, Sun } from 'lucide-react'
import { Button } from '../../components/Button'
import { useTheme } from '../../hooks/ThemeContext'

export function Appearance() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">Appearance</h2>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-slate-800 dark:text-white">Theme</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Select your preferred visual style.</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={theme === 'light' ? 'primary' : 'secondary'}
            onClick={() => setTheme('light')}
            icon={<Sun size={18} />}
          >
            Light
          </Button>
          <Button
            variant={theme === 'dark' ? 'primary' : 'secondary'}
            onClick={() => setTheme('dark')}
            icon={<Moon size={18} />}
          >
            Dark
          </Button>
        </div>
      </div>
    </div>
  )
}
