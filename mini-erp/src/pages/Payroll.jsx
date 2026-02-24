import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { Plus, X, Play } from 'lucide-react'

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {children}
      </div>
    </div>
  )
}

const STATUS_COLORS = { draft: 'badge-gray', confirmed: 'badge-blue', paid: 'badge-green' }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Payroll() {
  const [modalOpen, setModalOpen] = useState(false)
  const [viewing, setViewing] = useState(null)
  const qc = useQueryClient()

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_runs')
        .select('*, payroll_lines(*, employee:business_partners!employee_id(name))')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
      return data || []
    }
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data: types } = await supabase.from('business_partner_types').select('partner_id').eq('type', 'employee')
      const ids = (types || []).map(t => t.partner_id)
      if (!ids.length) return []
      const { data } = await supabase
        .from('business_partners')
        .select('id, name, monthly_salary, job_title')
        .in('id', ids)
        .eq('is_active', true)
        .order('name')
      return data || []
    }
  })

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      period_year: new Date().getFullYear(),
      period_month: new Date().getMonth() + 1,
    }
  })

  const create = useMutation({
    mutationFn: async (values) => {
      const { data: run } = await supabase.from('payroll_runs').insert({
        period_year: Number(values.period_year),
        period_month: Number(values.period_month),
        run_date: new Date().toISOString().split('T')[0],
        notes: values.notes || null,
      }).select().single()

      // create a line for each active employee with their salary
      const lines = employees
        .filter(e => e.monthly_salary)
        .map(e => ({
          payroll_run_id: run.id,
          employee_id: e.id,
          gross_salary: e.monthly_salary,
        }))
      if (lines.length) await supabase.from('payroll_lines').insert(lines)
    },
    onSuccess: () => {
      qc.invalidateQueries(['payroll-runs'])
      setModalOpen(false)
      reset()
    }
  })

  const confirm = useMutation({
    mutationFn: (id) => supabase.from('payroll_runs').update({ status: 'confirmed' }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['payroll-runs'])
  })

  const pay = useMutation({
    mutationFn: async (run) => {
      await supabase.from('payroll_runs').update({ status: 'paid' }).eq('id', run.id)
      await supabase.rpc('post_payroll', { payroll_run_id: run.id })
    },
    onSuccess: () => qc.invalidateQueries(['payroll-runs'])
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Payroll</h2>
          <p className="page-subtitle">Monthly salary runs</p>
        </div>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New Payroll Run
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : runs.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No payroll runs yet.</div>
            : <table className="table">
                <thead><tr><th>Period</th><th>Employees</th><th>Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {runs.map(r => {
                    const total = r.payroll_lines?.reduce((s, l) => s + Number(l.gross_salary), 0) ?? 0
                    return (
                      <tr key={r.id}>
                        <td className="font-semibold">{MONTHS[r.period_month - 1]} {r.period_year}</td>
                        <td className="text-ink-500">{r.payroll_lines?.length ?? 0}</td>
                        <td className="font-mono font-semibold">{total.toFixed(2)}</td>
                        <td><span className={STATUS_COLORS[r.status] ?? 'badge-gray'}>{r.status}</span></td>
                        <td>
                          <div className="flex gap-2 justify-end">
                            <button className="btn-ghost text-xs px-2 py-1" onClick={() => setViewing(r)}>View</button>
                            {r.status === 'draft' && (
                              <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => confirm.mutate(r.id)}>Confirm</button>
                            )}
                            {r.status === 'confirmed' && (
                              <button className="btn-ghost text-xs px-2 py-1 text-success" onClick={() => pay.mutate(r)}>
                                <Play size={12} /> Post & Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        }
      </div>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit(d => create.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">New Payroll Run</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Year</label>
                <input className="input font-mono" type="number" {...register('period_year')} />
              </div>
              <div>
                <label className="label">Month</label>
                <select className="input" {...register('period_month')}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} {...register('notes')} />
            </div>
            {employees.length > 0 && (
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-xs font-semibold text-ink-500 mb-2">Employees to be included</p>
                <div className="space-y-1">
                  {employees.filter(e => e.monthly_salary).map(e => (
                    <div key={e.id} className="flex justify-between text-sm">
                      <span className="text-ink-700">{e.name} <span className="text-ink-400">{e.job_title ? `· ${e.job_title}` : ''}</span></span>
                      <span className="font-mono text-ink-900">{Number(e.monthly_salary).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-surface-200 pt-1 mt-1">
                    <span>Total</span>
                    <span className="font-mono">{employees.filter(e => e.monthly_salary).reduce((s, e) => s + Number(e.monthly_salary), 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Run'}</button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)}>
        {viewing && (
          <div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Payroll — {MONTHS[viewing.period_month - 1]} {viewing.period_year}</h3>
              <button className="btn-ghost p-1" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <div className="p-6">
              <table className="table">
                <thead><tr><th>Employee</th><th>Gross Salary</th></tr></thead>
                <tbody>
                  {viewing.payroll_lines?.map(l => (
                    <tr key={l.id}>
                      <td>{l.employee?.name ?? '—'}</td>
                      <td className="font-mono">{Number(l.gross_salary).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="font-mono">{viewing.payroll_lines?.reduce((s, l) => s + Number(l.gross_salary), 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
