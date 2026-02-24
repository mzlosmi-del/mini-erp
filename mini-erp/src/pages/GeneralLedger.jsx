import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { BookOpen, BarChart2, List } from 'lucide-react'

const TABS = [
  { id: 'entries', label: 'Journal Entries', icon: List },
  { id: 'trial', label: 'Trial Balance', icon: BarChart2 },
  { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
]

function JournalEntriesTab() {
  const [selected, setSelected] = useState(null)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('*, journal_entry_lines(*, accounts(code, name))')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="table-container">
        {isLoading
          ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
          : entries.length === 0
            ? <div className="p-8 text-center text-ink-400 text-sm">No journal entries yet. Issue an invoice or run payroll to create entries.</div>
            : <table className="table">
                <thead><tr><th>Number</th><th>Date</th><th>Description</th><th>Ref</th></tr></thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className={`cursor-pointer ${selected?.id === e.id ? 'bg-accent-light' : ''}`} onClick={() => setSelected(e)}>
                      <td className="font-mono text-xs">{e.number}</td>
                      <td className="text-ink-500">{e.entry_date}</td>
                      <td className="text-ink-700">{e.description}</td>
                      <td className="text-xs text-ink-400">{e.reference_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      {selected && (
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-1 font-mono">{selected.number}</h3>
          <p className="text-sm text-ink-500 mb-4">{selected.description} · {selected.entry_date}</p>
          <table className="table">
            <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {selected.journal_entry_lines?.map(l => (
                <tr key={l.id}>
                  <td>
                    <span className="font-mono text-xs text-ink-400 mr-2">{l.accounts?.code}</span>
                    {l.accounts?.name}
                  </td>
                  <td className="font-mono text-right">{l.debit_amount > 0 ? Number(l.debit_amount).toFixed(2) : ''}</td>
                  <td className="font-mono text-right">{l.credit_amount > 0 ? Number(l.credit_amount).toFixed(2) : ''}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-surface-200">
                <td>Total</td>
                <td className="font-mono text-right">
                  {selected.journal_entry_lines?.reduce((s, l) => s + Number(l.debit_amount), 0).toFixed(2)}
                </td>
                <td className="font-mono text-right">
                  {selected.journal_entry_lines?.reduce((s, l) => s + Number(l.credit_amount), 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TrialBalanceTab() {
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: async () => {
      const { data: accounts } = await supabase.from('accounts').select('id, code, name, type').order('code')
      const { data: lines } = await supabase.from('journal_entry_lines').select('account_id, debit_amount, credit_amount')

      return (accounts || []).map(a => {
        const aLines = (lines || []).filter(l => l.account_id === a.id)
        const debit = aLines.reduce((s, l) => s + Number(l.debit_amount), 0)
        const credit = aLines.reduce((s, l) => s + Number(l.credit_amount), 0)
        return { ...a, debit, credit, balance: debit - credit }
      }).filter(a => a.debit !== 0 || a.credit !== 0)
    }
  })

  const totalDebit = balances.reduce((s, a) => s + a.debit, 0)
  const totalCredit = balances.reduce((s, a) => s + a.credit, 0)

  const TYPE_ORDER = { asset: 1, liability: 2, equity: 3, revenue: 4, expense: 5 }

  const grouped = ['asset', 'liability', 'equity', 'revenue', 'expense'].map(type => ({
    type,
    accounts: balances.filter(a => a.type === type)
  })).filter(g => g.accounts.length > 0)

  return (
    <div className="table-container">
      {isLoading
        ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
        : balances.length === 0
          ? <div className="p-8 text-center text-ink-400 text-sm">No posted entries yet.</div>
          : <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(g => (
                  <>
                    <tr key={g.type} className="bg-surface-50">
                      <td colSpan={6} className="text-xs font-semibold text-ink-500 uppercase tracking-wider py-2">
                        {g.type}
                      </td>
                    </tr>
                    {g.accounts.map(a => (
                      <tr key={a.id}>
                        <td className="font-mono text-xs text-ink-400">{a.code}</td>
                        <td>{a.name}</td>
                        <td><span className="badge-gray capitalize">{a.type}</span></td>
                        <td className="font-mono text-right">{a.debit > 0 ? a.debit.toFixed(2) : ''}</td>
                        <td className="font-mono text-right">{a.credit > 0 ? a.credit.toFixed(2) : ''}</td>
                        <td className={`font-mono text-right font-semibold ${a.balance < 0 ? 'text-danger' : 'text-ink-900'}`}>
                          {a.balance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr className="font-bold border-t-2 border-ink-200 bg-surface-50">
                  <td colSpan={3} className="text-sm">Totals</td>
                  <td className="font-mono text-right">{totalDebit.toFixed(2)}</td>
                  <td className="font-mono text-right">{totalCredit.toFixed(2)}</td>
                  <td className={`font-mono text-right ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-success' : 'text-danger'}`}>
                    {Math.abs(totalDebit - totalCredit) < 0.01 ? '✓ Balanced' : (totalDebit - totalCredit).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
      }
    </div>
  )
}

function ChartOfAccountsTab() {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts-full'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').order('code')
      return data || []
    }
  })

  const TYPE_COLORS = {
    asset: 'badge-blue', liability: 'badge-red', equity: 'badge-yellow',
    revenue: 'badge-green', expense: 'badge-gray'
  }

  return (
    <div className="table-container">
      {isLoading
        ? <div className="p-8 text-center text-ink-400 text-sm">Loading...</div>
        : <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td className="font-mono text-sm font-semibold text-ink-700">{a.code}</td>
                  <td className={a.parent_id ? 'pl-6 text-ink-600' : 'font-medium text-ink-900'}>{a.name}</td>
                  <td><span className={TYPE_COLORS[a.type] ?? 'badge-gray'}>{a.type}</span></td>
                  <td>{a.is_active ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
      }
    </div>
  )
}

export default function GeneralLedger() {
  const [tab, setTab] = useState('entries')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">General Ledger</h2>
          <p className="page-subtitle">Journal entries, trial balance and chart of accounts</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id ? 'border-accent text-accent' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {tab === 'entries' && <JournalEntriesTab />}
      {tab === 'trial' && <TrialBalanceTab />}
      {tab === 'accounts' && <ChartOfAccountsTab />}
    </div>
  )
}
