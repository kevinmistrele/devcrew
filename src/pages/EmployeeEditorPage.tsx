import { useParams } from 'react-router-dom'
import { EmployeeEditor } from '@/ui/employee-editor'

export function EmployeeEditorPage() {
  const { id } = useParams<{ id: string }>()
  return <EmployeeEditor employeeId={id} />
}
