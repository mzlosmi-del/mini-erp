import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, FileText, Truck, ShoppingCart } from 'lucide-react'

function Modal({ open, onClose, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl ${wide ? 'w-full max-w-4xl' : 'w-full max-w-2xl'} max-h-[90vh] overflow-y-auto m-4`}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, error }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  )
}

const STATUS_COLORS = {
  draft: 'badge-gray', confirmed: 'badge-blue', partially_delivered: 'badge-yellow',
  delivered: 'badge-green', invoiced: 'badge-green', cancelled: 'badge-red',
  issued: 'badge-blue', paid: 'badge-green', shipped: 'badge-yellow', ready: 'badge-blue',
}

// ─── Sales Orders Tab ────────────────────────────────────────────────────────

function SalesOrdersTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const [viewing, setViewing] = useState(null)
  const qc = useQueryClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, customer:business_partners!customer_id(name), sales_order_lines(*, products(name))')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: customers = [] } = useQuery({
  queryKey: ['customers'],
  queryFn: async () => {
    const { data: types } = await supabase
      .from('business_partner_types')
      .select('partner_id')
      .eq('type', 'customer')
    const ids = (types || []).map(t => t.partner_id)
    if (!ids.length) return []
    const { data } = await supabase
      .from('business_partners')
      .select('id, name')
      .in('id', ids)
      .eq('is_active', true)
      .order('name')
    return data || []
  }
})

  const { data: partners = [] } = useQuery({
    queryKey: ['all-partners-light'],
    queryFn: async () => {
      const { data } = await supabase.from('business_partners').select('id, name').eq('is_active', true).order('name')
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

  function onProductChange(idx, productId) {
    const p = products.find(p => p.id === productId)
    if (p) {
      setValue(`lines.${idx}.unit_price`, p.unit_price)
      setValue(`lines.${idx}.tax_rate`, p.tax_rate)
      setValue(`lines.${idx}.description`, p.name)
    }
  }

  const netTotal = watchLines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price)), 0)
  const taxTotal = watchLines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price) * Number(l.tax_rate) / 100), 0)

  const create = useMutation({
    mutationFn: async (values) => {
      const number = await supabase.rpc('next_sales_order_number').then(r => r.data)
      const { data: order } = await supabase.from('sales_orders').insert({
        number,
        customer_id: values.customer_id,
        order_date: values.order_date,
        ship_to_partner_id: values.ship_to_partner_id || null,
        ship_to_address: values.ship_to_address || null,
        ship_to_contact: values.ship_to_contact || null,
        ship_to_phone: values.ship_to_phone || null,
        notes: values.notes || null,
      }).select().single()

      await supabase.from('sales_order_lines').insert(
        values.lines.map(l => ({
          order_id: order.id,
          product_id: l.product_id || null,
          description: l.description,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate),
        }))
      )
    },
    onSuccess: () => { qc.invalidateQueries(['sales-orders']); setModalOpen(false); reset() }
  })

  const confirm = useMutation({
    mutationFn: (id) => supabase.from('sales_orders').update({ status: 'confirmed' }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['sales-orders'])
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-ink-500">{orders.length} orders</p>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New Order
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : orders.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No sales orders yet.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Lines</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td className="font-mono text-xs">{o.number}</td>
                      <td>{o.customer?.name ?? '—'}</td>
                      <td className="text-ink-500">{o.order_date}</td>
                      <td className="text-ink-500">{o.sales_order_lines?.length ?? 0} line(s)</td>
                      <td><span className={STATUS_COLORS[o.status] ?? 'badge-gray'}>{o.status}</span></td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button className="btn-ghost text-xs px-2 py-1" onClick={() => setViewing(o)}>View</button>
                          {o.status === 'draft' && (
                            <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => confirm.mutate(o.id)}>Confirm</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} wide>
        <form onSubmit={handleSubmit(d => create.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">New Sales Order</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer *">
                <select className="input" {...register('customer_id', { required: true })}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Order Date">
                <input className="input" type="date" defaultValue={new Date().toISOString().split('T')[0]} {...register('order_date')} />
              </Field>
            </div>

            <div className="p-4 bg-surface-50 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Ship To (optional — defaults to customer)</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Ship To Partner">
                  <select className="input" {...register('ship_to_partner_id')}>
                    <option value="">Same as customer</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Contact Person">
                  <input className="input" {...register('ship_to_contact')} />
                </Field>
                <Field label="Phone">
                  <input className="input" {...register('ship_to_phone')} />
                </Field>
                <Field label="Address Override">
                  <input className="input" {...register('ship_to_address')} />
                </Field>
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Order Lines</label>
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
                        <option value="">Custom line</option>
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
                      <button type="button" onClick={() => remove(idx)} className="btn-ghost p-2 text-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <div className="text-right space-y-1">
                  <div className="flex gap-8 text-sm text-ink-500">
                    <span>Net</span>
                    <span className="font-mono w-24 text-right">{netTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-8 text-sm text-ink-500">
                    <span>Tax</span>
                    <span className="font-mono w-24 text-right">{taxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-8 text-base font-semibold text-ink-900 border-t border-surface-200 pt-1">
                    <span>Total</span>
                    <span className="font-mono w-24 text-right">{(netTotal + taxTotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <Field label="Notes">
              <textarea className="input" rows={2} {...register('notes')} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} wide>
        {viewing && (
          <div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <div>
                <h3 className="font-semibold text-ink-900 font-mono">{viewing.number}</h3>
                <p className="text-xs text-ink-500 mt-0.5">{viewing.customer?.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={STATUS_COLORS[viewing.status]}>{viewing.status}</span>
                <button className="btn-ghost p-1" onClick={() => setViewing(null)}><X size={18} /></button>
              </div>
            </div>
            <div className="p-6">
              <table className="table">
                <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax%</th><th>Total</th></tr></thead>
                <tbody>
                  {viewing.sales_order_lines?.map(l => (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td className="font-mono">{l.quantity}</td>
                      <td className="font-mono">{Number(l.unit_price).toFixed(2)}</td>
                      <td className="font-mono">{l.tax_rate}%</td>
                      <td className="font-mono">{Number(l.line_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Deliveries Tab ──────────────────────────────────────────────────────────

function DeliveriesTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('deliveries')
        .select('*, sales_orders(number, business_partners(name)), ship_to:business_partners!ship_to_partner_id(name)')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

 const { data: confirmedOrders = [] } = useQuery({
  queryKey: ['confirmed-orders'],
  queryFn: async () => {
    const { data } = await supabase
      .from('sales_orders')
      .select('id, number, customer_id, customer:business_partners!customer_id(name), sales_order_lines(*, products(name, type))')
      .in('status', ['confirmed', 'partially_delivered'])
    return data || []
  }
})

  const { data: allPartners = [] } = useQuery({
    queryKey: ['all-partners-light'],
    queryFn: async () => {
      const { data } = await supabase.from('business_partners').select('id, name').eq('is_active', true).order('name')
      return data || []
    }
  })

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const watchOrder = watch('sales_order_id')
  const selectedOrder = confirmedOrders.find(o => o.id === watchOrder)
  const goodLines = selectedOrder?.sales_order_lines?.filter(l => l.products?.type === 'good') ?? []

  const create = useMutation({
    mutationFn: async (values) => {
      const number = await supabase.rpc('next_delivery_number').then(r => r.data)
      const { data: delivery } = await supabase.from('deliveries').insert({
        number,
        sales_order_id: values.sales_order_id,
        ship_to_partner_id: values.ship_to_partner_id || null,
        ship_to_address: values.ship_to_address || null,
        ship_to_contact: values.ship_to_contact || null,
        ship_to_phone: values.ship_to_phone || null,
        planned_date: values.planned_date || null,
        carrier: values.carrier || null,
        notes: values.notes || null,
      }).select().single()

      const lines = goodLines.map(l => ({
        delivery_id: delivery.id,
        sales_order_line_id: l.id,
        product_id: l.product_id,
        description: l.description || l.products?.name,
        ordered_quantity: l.quantity,
        delivered_quantity: Number(values[`qty_${l.id}`] || 0),
      }))
      if (lines.length) await supabase.from('delivery_lines').insert(lines)
    },
    onSuccess: () => { qc.invalidateQueries(['deliveries']); setModalOpen(false); reset() }
  })

  const ship = useMutation({
    mutationFn: async (delivery) => {
      await supabase.from('deliveries').update({ status: 'shipped', actual_date: new Date().toISOString().split('T')[0] }).eq('id', delivery.id)
      await supabase.rpc('post_goods_issue', { delivery_id: delivery.id })
    },
    onSuccess: () => qc.invalidateQueries(['deliveries'])
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-ink-500">{deliveries.length} deliveries</p>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New Delivery
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : deliveries.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No deliveries yet.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Sales Order</th><th>Ship To</th><th>Planned</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {deliveries.map(d => (
                    <tr key={d.id}>
                      <td className="font-mono text-xs">{d.number}</td>
                      <td className="font-mono text-xs">{d.sales_orders?.number} <span className="text-ink-400 font-sans">({d.sales_orders?.business_partners?.name})</span></td>
                      <td>{d.ship_to?.name ?? d.ship_to_address ?? '—'}</td>
                      <td className="text-ink-500">{d.planned_date ?? '—'}</td>
                      <td><span className={STATUS_COLORS[d.status] ?? 'badge-gray'}>{d.status}</span></td>
                      <td>
                        {d.status === 'ready' && (
                          <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => ship.mutate(d)}>Mark Shipped</button>
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
            <h3 className="font-semibold text-ink-900">New Delivery</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sales Order *">
                <select className="input" {...register('sales_order_id', { required: true })}>
                  <option value="">Select order</option>
                  {confirmedOrders.map(o => <option key={o.id} value={o.id}>{o.number} — {o.business_partners?.name}</option>)}
                </select>
              </Field>
              <Field label="Planned Date">
                <input className="input" type="date" {...register('planned_date')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Ship To Partner">
                <select className="input" {...register('ship_to_partner_id')}>
                  <option value="">Same as customer</option>
                  {allPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Ship To Contact">
                <input className="input" {...register('ship_to_contact')} />
              </Field>
              <Field label="Ship To Phone">
                <input className="input" {...register('ship_to_phone')} />
              </Field>
              <Field label="Ship To Address">
                <input className="input" {...register('ship_to_address')} />
              </Field>
              <Field label="Carrier">
                <input className="input" {...register('carrier')} />
              </Field>
            </div>

            {goodLines.length > 0 && (
              <div>
                <label className="label">Delivery Quantities (goods only)</label>
                <div className="space-y-2">
                  {goodLines.map(l => (
                    <div key={l.id} className="flex items-center gap-4">
                      <span className="flex-1 text-sm text-ink-700">{l.products?.name ?? l.description}</span>
                      <span className="text-xs text-ink-400">ordered: {l.quantity}</span>
                      <input className="input w-28 font-mono text-xs" type="number" step="0.01"
                        defaultValue={l.quantity} {...register(`qty_${l.id}`)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Field label="Notes">
              <textarea className="input" rows={2} {...register('notes')} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Delivery'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ─── Invoices Tab ────────────────────────────────────────────────────────────

function InvoicesTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*, customer:business_partners!customer_id(name), invoice_lines(*)')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['invoiceable-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, number, customer_id, business_partners(name), sales_order_lines(*)')
        .in('status', ['confirmed', 'delivered', 'partially_delivered'])
      return data || []
    }
  })

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const watchOrder = watch('sales_order_id')
  const selectedOrder = orders.find(o => o.id === watchOrder)

  const create = useMutation({
    mutationFn: async (values) => {
      const number = await supabase.rpc('next_invoice_number').then(r => r.data)
      const { data: inv } = await supabase.from('invoices').insert({
        number,
        sales_order_id: values.sales_order_id || null,
        customer_id: selectedOrder?.customer_id || values.customer_id,
        issue_date: values.issue_date,
        due_date: values.due_date || null,
        notes: values.notes || null,
        status: 'draft',
      }).select().single()

      if (selectedOrder?.sales_order_lines?.length) {
        await supabase.from('invoice_lines').insert(
          selectedOrder.sales_order_lines.map(l => ({
            invoice_id: inv.id,
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            tax_rate: l.tax_rate,
          }))
        )
      }
    },
    onSuccess: () => { qc.invalidateQueries(['invoices', 'invoiceable-orders']); setModalOpen(false); reset() }
  })

  const issue = useMutation({
    mutationFn: async (inv) => {
      await supabase.from('invoices').update({ status: 'issued' }).eq('id', inv.id)
      await supabase.rpc('post_sales_invoice', { invoice_id: inv.id })
    },
    onSuccess: () => qc.invalidateQueries(['invoices'])
  })

  const markPaid = useMutation({
    mutationFn: (id) => supabase.from('invoices').update({ status: 'paid' }).eq('id', id),
    onSuccess: () => qc.invalidateQueries(['invoices'])
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-ink-500">{invoices.length} invoices</p>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : invoices.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No invoices yet.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Customer</th><th>Issue Date</th><th>Due Date</th><th>Lines</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs">{inv.number}</td>
                      <td>{inv.customer?.name ?? '—'}</td>
                      <td className="text-ink-500">{inv.issue_date}</td>
                      <td className="text-ink-500">{inv.due_date ?? '—'}</td>
                      <td className="text-ink-500">{inv.invoice_lines?.length ?? 0}</td>
                      <td><span className={STATUS_COLORS[inv.status] ?? 'badge-gray'}>{inv.status}</span></td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          {inv.status === 'draft' && (
                            <button className="btn-ghost text-xs px-2 py-1 text-accent" onClick={() => issue.mutate(inv)}>Issue & Post</button>
                          )}
                          {inv.status === 'issued' && (
                            <button className="btn-ghost text-xs px-2 py-1 text-success" onClick={() => markPaid.mutate(inv.id)}>Mark Paid</button>
                          )}
                        </div>
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
            <h3 className="font-semibold text-ink-900">New Invoice</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <Field label="From Sales Order (optional)">
              <select className="input" {...register('sales_order_id')}>
                <option value="">— Manual invoice —</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.number} — {o.business_partners?.name}</option>)}
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
            <Field label="Notes">
              <textarea className="input" rows={2} {...register('notes')} />
            </Field>
            {selectedOrder && (
              <div className="p-3 bg-surface-50 rounded-lg text-sm text-ink-500">
                Lines will be copied from order {selectedOrder.number} ({selectedOrder.sales_order_lines?.length} lines).
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ─── Main Sales Page ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'orders',    label: 'Sales Orders', icon: ShoppingCart },
  { id: 'deliveries', label: 'Deliveries',  icon: Truck },
  { id: 'invoices',  label: 'Invoices',     icon: FileText },
]

export default function Sales() {
  const [tab, setTab] = useState('orders')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Sales</h2>
          <p className="page-subtitle">Orders, deliveries and invoices</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <SalesOrdersTab />}
      {tab === 'deliveries' && <DeliveriesTab />}
      {tab === 'invoices' && <InvoicesTab />}
    </div>
  )
}
