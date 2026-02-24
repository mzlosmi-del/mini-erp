import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Package, Wrench } from 'lucide-react'

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['good', 'service']),
  unit_price: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100),
  track_inventory: z.boolean().default(false),
  stock_quantity: z.coerce.number().optional(),
  low_stock_threshold: z.coerce.number().optional(),
})

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto m-4">
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

export default function Products() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const qc = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name').order('code')
      return data || []
    }
  })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('code')
      return data || []
    }
  })

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { type: 'good', tax_rate: 23, track_inventory: true }
  })

  const watchType = watch('type')
  const watchTrack = watch('track_inventory')

  const upsert = useMutation({
    mutationFn: async (values) => {
      const payload = { ...values }
      if (payload.type === 'service') {
        payload.track_inventory = false
        payload.stock_quantity = 0
        payload.inventory_account_id = null
      }
      if (editing) {
        await supabase.from('products').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('products').insert(payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['products'])
      setModalOpen(false)
      setEditing(null)
      reset()
    }
  })

  function openCreate() {
    setEditing(null)
    reset({ type: 'good', tax_rate: 23, track_inventory: true, stock_quantity: 0, low_stock_threshold: 0 })
    setModalOpen(true)
  }

  function openEdit(p) {
    setEditing(p)
    reset(p)
    setModalOpen(true)
  }

  const filtered = products.filter(p => {
    const matchType = typeFilter === 'all' || p.type === typeFilter
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Products</h2>
          <p className="page-subtitle">Goods and services catalog</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input className="input pl-9" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all', 'good', 'service'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-secondary'} capitalize`}>
            {t}
          </button>
        ))}
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : filtered.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No products found.</div>
            : <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Unit Price</th>
                    <th>Tax %</th>
                    <th>Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-ink-500">{p.code}</td>
                      <td className="font-medium text-ink-900">{p.name}</td>
                      <td>
                        <span className={p.type === 'good' ? 'badge-blue' : 'badge-green'}>
                          {p.type === 'good' ? <><Package size={10} className="inline mr-1" />good</> : <><Wrench size={10} className="inline mr-1" />service</>}
                        </span>
                      </td>
                      <td className="font-mono">{Number(p.unit_price).toFixed(2)}</td>
                      <td className="font-mono">{p.tax_rate}%</td>
                      <td>
                        {p.track_inventory
                          ? <span className={p.stock_quantity <= p.low_stock_threshold ? 'text-danger font-semibold font-mono' : 'font-mono'}>
                              {p.stock_quantity}
                            </span>
                          : <span className="text-ink-300">—</span>
                        }
                      </td>
                      <td>
                        <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(p)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset() }}>
        <form onSubmit={handleSubmit(d => upsert.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">{editing ? 'Edit Product' : 'New Product'}</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => { setModalOpen(false); reset() }}><X size={18} /></button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code *" error={errors.code?.message}>
                <input className="input font-mono" {...register('code')} />
              </Field>
              <Field label="Type *">
                <select className="input" {...register('type')}>
                  <option value="good">Good (physical)</option>
                  <option value="service">Service</option>
                </select>
              </Field>
            </div>

            <Field label="Name *" error={errors.name?.message}>
              <input className="input" {...register('name')} />
            </Field>

            <Field label="Description">
              <textarea className="input" rows={2} {...register('description')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Unit Price *" error={errors.unit_price?.message}>
                <input className="input font-mono" type="number" step="0.01" {...register('unit_price')} />
              </Field>
              <Field label="Tax Rate %" error={errors.tax_rate?.message}>
                <input className="input font-mono" type="number" step="0.01" {...register('tax_rate')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Revenue Account">
                <select className="input" {...register('revenue_account_id')}>
                  <option value="">Select account</option>
                  {accounts.filter(a => a.code.startsWith('4')).map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Expense Account">
                <select className="input" {...register('expense_account_id')}>
                  <option value="">Select account</option>
                  {accounts.filter(a => a.code.startsWith('5')).map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            {watchType === 'good' && (
              <div className="p-4 bg-surface-50 rounded-lg space-y-3">
                <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                  <input type="checkbox" {...register('track_inventory')} className="rounded" />
                  Track inventory for this product
                </label>
                {watchTrack && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Initial Stock">
                      <input className="input font-mono" type="number" step="0.01" {...register('stock_quantity')} />
                    </Field>
                    <Field label="Low Stock Alert">
                      <input className="input font-mono" type="number" step="0.01" {...register('low_stock_threshold')} />
                    </Field>
                    <Field label="Inventory Account">
                      <select className="input" {...register('inventory_account_id')}>
                        <option value="">Select account</option>
                        {accounts.filter(a => a.code.startsWith('1')).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => { setModalOpen(false); reset() }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
