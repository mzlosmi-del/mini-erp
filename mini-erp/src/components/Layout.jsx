import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, ShoppingCart,
  Truck, Warehouse, DollarSign, BookOpen, Menu, X,
  ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/dashboard',  label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/partners',   label: 'Business Partners',  icon: Users },
  { to: '/products',   label: 'Products',           icon: Package },
  { to: '/sales',      label: 'Sales',              icon: ShoppingCart },
  { to: '/purchasing', label: 'Purchasing',         icon: Truck },
  { to: '/inventory',  label: 'Inventory',          icon: Warehouse },
  { to: '/payroll',    label: 'Payroll',            icon: DollarSign },
  { to: '/ledger',     label: 'General Ledger',     icon: BookOpen },
]

const pageTitles = {
  '/dashboard':  'Dashboard',
  '/partners':   'Business Partners',
  '/products':   'Products',
  '/sales':      'Sales',
  '/purchasing': 'Purchasing',
  '/inventory':  'Inventory',
  '/payroll':    'Payroll',
  '/ledger':     'General Ledger',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const currentPage = Object.entries(pageTitles).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1] ?? 'Mini ERP'

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* Sidebar */}
      <aside
        className={`
          ${collapsed ? 'w-[60px]' : 'w-[220px]'}
          flex flex-col bg-ink-900 transition-all duration-200 ease-in-out flex-shrink-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-ink-700">
          {!collapsed && (
            <span className="font-semibold text-white text-sm tracking-tight flex-1">
              Mini <span className="text-accent">ERP</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-ink-300 hover:text-white transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group
                ${isActive
                  ? 'bg-accent text-white'
                  : 'text-ink-300 hover:bg-ink-700 hover:text-white'
                }`
              }
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-ink-700">
            <p className="text-xs text-ink-500">v0.1.0</p>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center h-14 px-6 bg-white border-b border-surface-200 flex-shrink-0">
          <h1 className="text-sm font-semibold text-ink-900">{currentPage}</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
