export function LoadingFallback() {
  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center p-12">
      <div className="flex flex-col items-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading view...</span>
      </div>
    </div>
  )
}
