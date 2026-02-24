import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import BusinessPartners from './pages/BusinessPartners'
import Products from './pages/Products'
import Sales from './pages/Sales'
import Purchasing from './pages/Purchasing'
import Inventory from './pages/Inventory'
import Payroll from './pages/Payroll'
import GeneralLedger from './pages/GeneralLedger'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="partners" element={<BusinessPartners />} />
        <Route path="products" element={<Products />} />
        <Route path="sales/*" element={<Sales />} />
        <Route path="purchasing/*" element={<Purchasing />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="ledger" element={<GeneralLedger />} />
      </Route>
    </Routes>
  )
}
