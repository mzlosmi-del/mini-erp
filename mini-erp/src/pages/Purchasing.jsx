import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, FileText, ShoppingBag } from 'lucide-react'

function Modal({ open, onClose, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl ${wide ? 'w-full max-w-4xl' : 'w-full max-w-xl'} max-h-[90vh] overflow-y-auto m-4`}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const STATUS_COLORS = {
  draft: 'badge-gray', confirmed: 'badge-blue', received: 'badge-green',
  cancelled: 'badge-red', paid: 'badge-green',
}

function PurchaseOrdersTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*, vendor:business_partners!vendor_id(name), purchase_order_lines(*)')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data: types } = await supabase.from('business_partner_types').select('partner_id').eq('type', 'vendor')
      const ids = (types || []).map(t => t.partner_id)
      if (!ids.length) return []
      const { data } = await supabase.from('business_partners').select('id, name').in('id', ids).order('name')
      return data || []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, code, name, unit_price, tax_rate').eq('is_active', true).order('name')
      return data || []
    }
  })

  const { register, handleSubmit, control, reset, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: 23 }] }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchLines = watch('lines')

  const netTotal = watchLines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price)), 0)
  const taxTotal = watchLines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price) * Number(l.tax_rate) / 100), 0)

  function onProductChange(idx, productId) {
    const p = products.find(p => p.id === productId)
    if (p) {
      setValue(`lines.${idx}.unit_price`, p.unit_price)
      setValue(`lines.${idx}.tax_rate`, p.tax_rate)
      setValue(`lines.${idx}.description`, p.name)
    }
  }

  const create = useMutation({
    mutationFn: async (values) => {
      const number = await supabase.rpc('next_purchase_order_number').then(r => r.data)
      const { data: order } = await supabase.from('purchase_orders').insert({
        number, vendor_id: values.vendor_id, order_date: values.order_date, notes: values.notes || null
      }).select().single()
      await supabase.from('purchase_order_lines').insert(
        values.lines.map(l => ({
          order_id: order.id, product_id: l.product_id || null,
          description: l.description, quantity: Number(l.quantity),
          unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate),
        }))
      )
    },
    onSuccess: () => { qc.invalidateQueries(['purchase-orders']); setModalOpen(false); reset() }
  })

  const confirm = useMutation({
    mutationFn: (id) => supabase.from('purchase_orders').update({ status: 'confirmed' }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['purchase-orders'])
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-ink-500">{orders.length} purchase orders</p>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New PO
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : orders.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No purchase orders yet.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Vendor</th><th>Date</th><th>Lines</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td className="font-mono text-xs">{o.number}</td>
                      <td>{o.vendor?.name ?? '—'}</td>
                      <td className="text-ink-500">{o.order_date}</td>
                      <td className="text-ink-500">{o.purchase_order_lines?.length ?? 0}</td>
                      <td><span className={STATUS_COLORS[o.status] ?? 'badge-gray'}>{o.status}</span></td>
                      <td>
                        {o.status === 'draft' && (
                          <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => confirm.mutate(o.id)}>Confirm</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} wide>
        <form onSubmit={handleSubmit(d => create.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">New Purchase Order</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vendor *">
                <select className="input" {...register('vendor_id', { required: true })}>
                  <option value="">Select vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="Order Date">
                <input className="input" type="date" defaultValue={new Date().toISOString().split('T')[0]} {...register('order_date')} />
              </Field>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Lines</label>
                <button type="button" className="btn-ghost text-xs"
                  onClick={() => append({ product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: 23 })}>
                  <Plus size={14} /> Add Line
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      {idx === 0 && <label className="label">Product</label>}
                      <select className="input text-xs" {...register(`lines.${idx}.product_id`)}
                        onChange={e => { register(`lines.${idx}.product_id`).onChange(e); onProductChange(idx, e.target.value) }}>
                        <option value="">Custom</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <label className="label">Description</label>}
                      <input className="input text-xs" {...register(`lines.${idx}.description`)} />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="label">Qty</label>}
                      <input className="input text-xs font-mono" type="number" step="0.01" {...register(`lines.${idx}.quantity`)} />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="label">Unit Price</label>}
                      <input className="input text-xs font-mono" type="number" step="0.01" {...register(`lines.${idx}.unit_price`)} />
                    </div>
                    <div className="col-span-1">
                      {idx === 0 && <label className="label">Tax%</label>}
                      <input className="input text-xs font-mono" type="number" {...register(`lines.${idx}.tax_rate`)} />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5">
                      <button type="button" onClick={() => remove(idx)} className="btn-ghost p-2 text-danger"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <div className="text-right space-y-1">
                  <div className="flex gap-8 text-sm text-ink-500"><span>Net</span><span className="font-mono w-24 text-right">{netTotal.toFixed(2)}</span></div>
                  <div className="flex gap-8 text-sm text-ink-500"><span>Tax</span><span className="font-mono w-24 text-right">{taxTotal.toFixed(2)}</span></div>
                  <div className="flex gap-8 text-base font-semibold text-ink-900 border-t pt-1"><span>Total</span><span className="font-mono w-24 text-right">{(netTotal + taxTotal).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
            <Field label="Notes"><textarea className="input" rows={2} {...register('notes')} /></Field>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create PO'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function VendorInvoicesTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['vendor-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendor_invoices')
        .select('*, vendor:business_partners!vendor_id(name), vendor_invoice_lines(*)')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: confirmedPOs = [] } = useQuery({
    queryKey: ['confirmed-pos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('id, number, vendor_id, business_partners(name), purchase_order_lines(*)')
        .eq('status', 'confirmed')
      return data || []
    }
  })

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const watchPO = watch('purchase_order_id')
  const selectedPO = confirmedPOs.find(o => o.id === watchPO)

  const create = useMutation({
    mutationFn: async (values) => {
      const number = await supabase.rpc('next_vendor_invoice_number').then(r => r.data)
      const { data: inv } = await supabase.from('vendor_invoices').insert({
        number, purchase_order_id: values.purchase_order_id || null,
        vendor_id: selectedPO?.vendor_id, issue_date: values.issue_date,
        due_date: values.due_date || null, notes: values.notes || null, status: 'draft',
      }).select().single()
      if (selectedPO?.purchase_order_lines?.length) {
        await supabase.from('vendor_invoice_lines').insert(
          selectedPO.purchase_order_lines.map(l => ({
            vendor_invoice_id: inv.id, product_id: l.product_id,
            description: l.description, quantity: l.quantity,
            unit_price: l.unit_price, tax_rate: l.tax_rate,
          }))
        )
      }
    },
    onSuccess: () => { qc.invalidateQueries(['vendor-invoices']); setModalOpen(false); reset() }
  })

  const markReceived = useMutation({
    mutationFn: (id) => supabase.from('vendor_invoices').update({ status: 'received' }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['vendor-invoices'])
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-ink-500">{invoices.length} vendor invoices</p>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New Vendor Invoice
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : invoices.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No vendor invoices yet.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Vendor</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs">{inv.number}</td>
                      <td>{inv.vendor?.name ?? '—'}</td>
                      <td className="text-ink-500">{inv.issue_date}</td>
                      <td className="text-ink-500">{inv.due_date ?? '—'}</td>
                      <td><span className={STATUS_COLORS[inv.status] ?? 'badge-gray'}>{inv.status}</span></td>
                      <td>
                        {inv.status === 'draft' && (
                          <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => markReceived.mutate(inv.id)}>Mark Received</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit(d => create.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">New Vendor Invoice</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <Field label="From Purchase Order">
              <select className="input" {...register('purchase_order_id')}>
                <option value="">— Select PO —</option>
                {confirmedPOs.map(o => <option key={o.id} value={o.id}>{o.number} — {o.business_partners?.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Issue Date">
                <input className="input" type="date" defaultValue={new Date().toISOString().split('T')[0]} {...register('issue_date')} />
              </Field>
              <Field label="Due Date">
                <input className="input" type="date" {...register('due_date')} />
              </Field>
            </div>
            <Field label="Notes"><textarea className="input" rows={2} {...register('notes')} /></Field>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const TABS = [
  { id: 'orders', label: 'Purchase Orders', icon: ShoppingBag },
  { id: 'invoices', label: 'Vendor Invoices', icon: FileText },
]

export default function Purchasing() {
  const [tab, setTab] = useState('orders')
  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Purchasing</h2>
          <p className="page-subtitle">Purchase orders and vendor invoices</p>
        </div>
      </div>
      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-accent text-accent' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      {tab === 'orders' && <PurchaseOrdersTab />}
      {tab === 'invoices' && <VendorInvoicesTab />}
    </div>
  )
}
