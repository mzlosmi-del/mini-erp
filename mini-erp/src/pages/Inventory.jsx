import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { Plus, X, ArrowUp, ArrowDown, Minus } from 'lucide-react'

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md m-4">
        {children}
      </div>
    </div>
  )
}

export default function Inventory() {
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('track_inventory', true)
        .eq('type', 'good')
        .eq('is_active', true)
        .order('name')
      return data || []
    }
  })

  const { data: movements = [] } = useQuery({
    queryKey: ['stock-movements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*, products(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      return data || []
    }
  })

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()

  const adjust = useMutation({
    mutationFn: async (values) => {
      const qty = Number(values.quantity)
      const product = products.find(p => p.id === values.product_id)
      const newQty = values.type === 'in'
        ? product.stock_quantity + qty
        : values.type === 'out'
          ? product.stock_quantity - qty
          : qty // adjustment sets absolute value

      await supabase.from('stock_movements').insert({
        product_id: values.product_id,
        type: values.type,
        quantity: values.type === 'adjustment' ? Math.abs(newQty - product.stock_quantity) : qty,
        reference_type: 'adjustment',
        notes: values.notes || null,
      })

      await supabase.from('products').update({ stock_quantity: newQty }).eq('id', values.product_id)
    },
    onSuccess: () => {
      qc.invalidateQueries(['inventory-products'])
      qc.invalidateQueries(['stock-movements'])
      setModalOpen(false)
      reset()
    }
  })

  const MOVEMENT_ICONS = {
    in: <ArrowUp size={14} className="text-success" />,
    out: <ArrowDown size={14} className="text-danger" />,
    adjustment: <Minus size={14} className="text-ink-400" />,
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory</h2>
          <p className="page-subtitle">Stock levels and movements</p>
        </div>
        <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
          <Plus size={16} /> Adjustment
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock levels */}
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Current Stock</h3>
          <div className="table-container">
            {isLoading
              ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
              : products.length === 0
                ? <div className="p-8 text-center text-ink-400 text-sm">No tracked products.</div>
                : <table className="table">
                    <thead><tr><th>Product</th><th>Stock</th><th>Alert At</th><th>Status</th></tr></thead>
                    <tbody>
                      {products.map(p => {
                        const low = p.stock_quantity <= p.low_stock_threshold
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="font-medium text-ink-900">{p.name}</div>
                              <div className="text-xs text-ink-400 font-mono">{p.code}</div>
                            </td>
                            <td className={`font-mono font-semibold ${low ? 'text-danger' : 'text-ink-900'}`}>
                              {p.stock_quantity}
                            </td>
                            <td className="font-mono text-ink-400">{p.low_stock_threshold}</td>
                            <td>
                              {low
                                ? <span className="badge-red">Low</span>
                                : <span className="badge-green">OK</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
            }
          </div>
        </div>

        {/* Recent movements */}
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Recent Movements</h3>
          <div className="table-container">
            {movements.length === 0
              ? <div className="p-8 text-center text-ink-400 text-sm">No movements yet.</div>
              : <table className="table">
                  <thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>Ref</th></tr></thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            {MOVEMENT_ICONS[m.type]}
                            <span className="capitalize text-xs">{m.type}</span>
                          </div>
                        </td>
                        <td className="text-ink-700">{m.products?.name ?? '—'}</td>
                        <td className="font-mono">{m.quantity}</td>
                        <td className="text-xs text-ink-400">{m.reference_type ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit(d => adjust.mutate(d))}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-ink-900">Stock Adjustment</h3>
            <button type="button" className="btn-ghost p-1" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="label">Product *</label>
              <select className="input" {...register('product_id', { required: true })}>
                <option value="">Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (stock: {p.stock_quantity})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select className="input" {...register('type', { required: true })}>
                <option value="in">Stock In (add)</option>
                <option value="out">Stock Out (remove)</option>
                <option value="adjustment">Adjustment (set absolute)</option>
              </select>
            </div>
            <div>
              <label className="label">Quantity *</label>
              <input className="input font-mono" type="number" step="0.01" min="0" {...register('quantity', { required: true })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} {...register('notes')} />
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Apply'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
