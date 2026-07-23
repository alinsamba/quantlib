import { BorrowingRules } from './settings/BorrowingRules'
import { SchoolInfo } from './settings/SchoolInfo'
import { Appearance } from './settings/Appearance'
import { Security } from './settings/Security'
import { VaultBackup } from './settings/VaultBackup'
import { LanSync } from './settings/LanSync'
import { DatabaseExport } from './settings/DatabaseExport'
import { AuditLogs } from './settings/AuditLogs'

export default function Settings() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your application branding, preferences, and view system logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <BorrowingRules />
          <SchoolInfo />
          <Appearance />
          <Security />
        </div>

        <div className="space-y-6">
          <VaultBackup />
          <LanSync />
          <DatabaseExport />
          <AuditLogs />
        </div>
      </div>
    </div>
  )
}
