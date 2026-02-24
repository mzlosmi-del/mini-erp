import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, ChevronDown } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  tax_id: z.string().optional(),
  notes: z.string().optional(),
  // customer
  payment_terms_days: z.coerce.number().optional(),
  credit_limit: z.coerce.number().optional(),
  // vendor
  bank_account: z.string().optional(),
  // employee
  monthly_salary: z.coerce.number().optional(),
  hire_date: z.string().optional(),
  job_title: z.string().optional(),
  app_role: z.enum(['admin', 'accountant', 'sales', 'warehouse', '']).optional(),
  // types
  is_customer: z.boolean().default(false),
  is_vendor: z.boolean().default(false),
  is_employee: z.boolean().default(false),
})

const TYPE_COLORS = {
  customer: 'badge-blue',
  vendor:   'badge-yellow',
  employee: 'badge-green',
}

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

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  )
}

export default function BusinessPartners() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const qc = useQueryClient()

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['business-partners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('business_partners')
        .select('*, business_partner_types(type)')
        .eq('is_active', true)
        .order('name')
      return data || []
    }
  })

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { is_customer: false, is_vendor: false, is_employee: false }
  })

  const watchEmployee = watch('is_employee')
  const watchCustomer = watch('is_customer')
  const watchVendor = watch('is_vendor')

  const upsert = useMutation({
    mutationFn: async (values) => {
      const { is_customer, is_vendor, is_employee, ...partnerData } = values

      // clean up nulls
      Object.keys(partnerData).forEach(k => {
        if (partnerData[k] === '' || partnerData[k] === undefined) partnerData[k] = null
      })

      let partnerId
      if (editing) {
        await supabase.from('business_partners').update(partnerData).eq('id', editing.id)
        partnerId = editing.id
        await supabase.from('business_partner_types').delete().eq('partner_id', partnerId)
      } else {
        const { data } = await supabase.from('business_partners').insert(partnerData).select().single()
        partnerId = data.id
      }

      const types = [
        ...(is_customer ? [{ partner_id: partnerId, type: 'customer' }] : []),
        ...(is_vendor   ? [{ partner_id: partnerId, type: 'vendor' }]   : []),
        ...(is_employee ? [{ partner_id: partnerId, type: 'employee' }] : []),
      ]
      if (types.length) await supabase.from('business_partner_types').insert(types)
    },
    onSuccess: () => {
      qc.invalidateQueries(['business-partners'])
      setModalOpen(false)
      setEditing(null)
      reset()
    }
  })

  const archive = useMutation({
    mutationFn: (id) => supabase.from('business_partners').update({ is_active: false }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['business-partners'])
  })

  function openCreate() {
    setEditing(null)
    reset({ is_customer: false, is_vendor: false, is_employee: false })
    setModalOpen(true)
  }

  function openEdit(partner) {
    setEditing(partner)
    const types = partner.business_partner_types.map(t => t.type)
    reset({
      ...partner,
      is_customer: types.includes('customer'),
      is_vendor:   types.includes('vendor'),
      is_employee: types.includes('employee'),
      app_role: partner.app_role ?? '',
    })
    setModalOpen(true)
  }

  const filtered = partners.filter(p => {
    const types = p.business_partner_types.map(t => t.type)
    const matchType = typeFilter === 'all' || types.includes(typeFilter)
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Business Partners</h2>
          <p className="page-subtitle">Customers, vendors and employees</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add Partner
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            className="input pl-9"
            placeholder="Search partners..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {['all', 'customer', 'vendor', 'employee'].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-secondary'} capitalize`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : filtered.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No partners found.</div>
            : <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Types</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Tax ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium text-ink-900">{p.name}</td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {p.business_partner_types.map(t => (
                            <span key={t.type} className={TYPE_COLORS[t.type]}>{t.type}</span>
                          ))}
                        </div>
                      </td>
                      <td className="text-ink-500">{p.email ?? '—'}</td>
                      <td className="text-ink-500">{p.phone ?? '—'}</td>
                      <td className="font-mono text-xs text-ink-400">{p.tax_id ?? '—'}</td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(p)}>Edit</button>
                          <button className="btn-ghost text-xs px-2 py-1 text-danger hover:text-danger"
                            onClick={() => archive.mutate(p.id)}>Archive</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); reset() }}>
        <form onSubmit={handleSubmit(d => upsert.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">{editing ? 'Edit Partner' : 'New Partner'}</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => { setModalOpen(false); reset() }}>
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Types */}
            <div>
              <label className="label">Partner Types</label>
              <div className="flex gap-4">
                {['customer', 'vendor', 'employee'].map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                    <input type="checkbox" {...register(`is_${t}`)} className="rounded" />
                    <span className="capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name *" error={errors.name?.message}>
                <input className="input" {...register('name')} />
              </Field>
              <Field label="Tax ID">
                <input className="input" {...register('tax_id')} />
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <input className="input" type="email" {...register('email')} />
              </Field>
              <Field label="Phone">
                <input className="input" {...register('phone')} />
              </Field>
            </div>

            <Field label="Address">
              <textarea className="input" rows={2} {...register('address')} />
            </Field>

            {/* Customer fields */}
            {watchCustomer && (
              <div className="p-4 bg-accent-light rounded-lg space-y-3">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Customer Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Payment Terms (days)">
                    <input className="input" type="number" {...register('payment_terms_days')} />
                  </Field>
                  <Field label="Credit Limit">
                    <input className="input" type="number" step="0.01" {...register('credit_limit')} />
                  </Field>
                </div>
              </div>
            )}

            {/* Vendor fields */}
            {watchVendor && (
              <div className="p-4 bg-yellow-50 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wider">Vendor Details</p>
                <Field label="Bank Account">
                  <input className="input" {...register('bank_account')} />
                </Field>
              </div>
            )}

            {/* Employee fields */}
            {watchEmployee && (
              <div className="p-4 bg-green-50 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Employee Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Job Title">
                    <input className="input" {...register('job_title')} />
                  </Field>
                  <Field label="Monthly Salary">
                    <input className="input" type="number" step="0.01" {...register('monthly_salary')} />
                  </Field>
                  <Field label="Hire Date">
                    <input className="input" type="date" {...register('hire_date')} />
                  </Field>
                  <Field label="App Role">
                    <select className="input" {...register('app_role')}>
                      <option value="">None</option>
                      <option value="admin">Admin</option>
                      <option value="accountant">Accountant</option>
                      <option value="sales">Sales</option>
                      <option value="warehouse">Warehouse</option>
                    </select>
                  </Field>
                </div>
              </div>
            )}

            <Field label="Notes">
              <textarea className="input" rows={2} {...register('notes')} />
            </Field>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => { setModalOpen(false); reset() }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Partner'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
