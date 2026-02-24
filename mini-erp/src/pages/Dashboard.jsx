import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ShoppingCart, Truck, Users, Package, TrendingUp, AlertCircle } from 'lucide-react'

function StatCard({ label, value, icon: Icon, color = 'text-accent', loading }) {
  return (
    <div className="stat-card flex items-start justify-between">
      <div>
        <p className="stat-label">{label}</p>
        {loading
          ? <div className="h-8 w-20 bg-surface-200 rounded animate-pulse mt-1" />
          : <p className="stat-value">{value}</p>
        }
      </div>
      <div className={`p-2 rounded-lg bg-surface-100 ${color}`}>
        <Icon size={20} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: partners, isLoading: l1 } = useQuery({
    queryKey: ['dashboard-partners'],
    queryFn: async () => {
      const { count } = await supabase
        .from('business_partners')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
      return count
    }
  })

  const { data: products, isLoading: l2 } = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: async () => {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
      return count
    }
  })

  const { data: openOrders, isLoading: l3 } = useQuery({
    queryKey: ['dashboard-orders'],
    queryFn: async () => {
      const { count } = await supabase
        .from('sales_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'confirmed'])
      return count
    }
  })

  const { data: openPOs, isLoading: l4 } = useQuery({
    queryKey: ['dashboard-pos'],
    queryFn: async () => {
      const { count } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'confirmed'])
      return count
    }
  })

  const { data: lowStock, isLoading: l5 } = useQuery({
    queryKey: ['dashboard-lowstock'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('name, stock_quantity, low_stock_threshold')
        .eq('track_inventory', true)
        .eq('type', 'good')
      return (data || []).filter(p => p.stock_quantity <= p.low_stock_threshold)
    }
  })

  const { data: recentOrders, isLoading: l6 } = useQuery({
    queryKey: ['dashboard-recent-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('number, status, order_date, business_partners(name)')
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    }
  })

  const statusColors = {
    draft: 'badge-gray',
    confirmed: 'badge-blue',
    partially_delivered: 'badge-yellow',
    delivered: 'badge-green',
    invoiced: 'badge-green',
    cancelled: 'badge-red',
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Business Partners" value={partners ?? '—'} icon={Users} loading={l1} />
        <StatCard label="Active Products"   value={products ?? '—'} icon={Package} loading={l2} color="text-green-600" />
        <StatCard label="Open Sales Orders" value={openOrders ?? '—'} icon={ShoppingCart} loading={l3} color="text-blue-600" />
        <StatCard label="Open Purchase Orders" value={openPOs ?? '—'} icon={Truck} loading={l4} color="text-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales Orders */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-2">
            <TrendingUp size={16} className="text-ink-400" />
            <h2 className="font-semibold text-sm text-ink-900">Recent Sales Orders</h2>
          </div>
          {l6
            ? <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-5 bg-surface-100 rounded animate-pulse" />)}</div>
            : recentOrders?.length === 0
              ? <p className="p-5 text-sm text-ink-400">No orders yet.</p>
              : <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map(o => (
                      <tr key={o.number}>
                        <td className="font-mono text-xs">{o.number}</td>
                        <td>{o.business_partners?.name ?? '—'}</td>
                        <td className="text-ink-500">{o.order_date}</td>
                        <td><span className={statusColors[o.status] ?? 'badge-gray'}>{o.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          }
        </div>

        {/* Low Stock Alerts */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-2">
            <AlertCircle size={16} className="text-warning" />
            <h2 className="font-semibold text-sm text-ink-900">Low Stock Alerts</h2>
          </div>
          {l5
            ? <div className="p-5 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-5 bg-surface-100 rounded animate-pulse" />)}</div>
            : lowStock?.length === 0
              ? <p className="p-5 text-sm text-ink-400">All stock levels are healthy.</p>
              : <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Stock</th>
                      <th>Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map(p => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="font-mono text-danger font-medium">{p.stock_quantity}</td>
                        <td className="font-mono text-ink-400">{p.low_stock_threshold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          }
        </div>
      </div>
    </div>
  )
}
