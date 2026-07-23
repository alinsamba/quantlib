import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'

export function SchoolInfo() {
  const [schoolName, setSchoolName] = useState('Mentor High School - Kitende')
  const [motto, setMotto] = useState('Education is the Key')
  const [academicYear, setAcademicYear] = useState('2026')
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveAppInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    // Simulate save
    setTimeout(() => {
      setIsSaving(false)
    }, 500)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">School Information</h2>

      <form onSubmit={handleSaveAppInfo} className="space-y-4">
        <TextField
          label="School Name"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
        />
        <TextField
          label="Motto"
          value={motto}
          onChange={(e) => setMotto(e.target.value)}
        />
        <TextField
          label="Current Academic Year"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
        />
        <div className="pt-2">
          <Button type="submit" icon={<Save size={18} />} isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  )
}
