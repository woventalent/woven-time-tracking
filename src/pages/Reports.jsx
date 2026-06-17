import { useState, useEffect } from 'react'
import { api } from '../api.js'

const iStyle = {
  padding: '8px 12px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 13.5, color: '#0f172a', background: '#fff',
}

function KpiCard({ value, label, color }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '20px 24px',
      border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function Bar({ pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: Math.min(pct, 100) + '%', height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, color: '#64748b', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
    </div>
  )
}

function BudgetProgress({ logged, budgeted, pct }) {
  if (!budgeted) return <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
  const safe  = Math.min(pct ?? 0, 100)
  const color = (pct ?? 0) >= 100 ? '#dc2626' : (pct ?? 0) >= 80 ? '#d97706' : '#16a34a'
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
        <span>{(+logged || 0).toFixed(1)}h / {budgeted}h</span>
        <span style={{ color, fontWeight: 700 }}>{pct ?? 0}%</span>
      </div>
      <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${safe}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function Reports() {
  const [view,      setView]    = useState('project')
  const [byProject, setByProj]  = useState([])
  const [byUser,    setByUser]  = useState([])
  const [from,      setFrom]    = useState('')
  const [to,        setTo]      = useState('')

  useEffect(() => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries({ from, to }).filter(([, v]) => v)))
    api.get('/reports/by-project?' + q).then(setByProj)
    api.get('/reports/by-user?'    + q).then(setByUser)
  }, [from, to])

  const totalHours   = byProject.reduce((s, r) => s + r.total_hours, 0)
  const activeProj   = byProject.filter(r => r.total_hours > 0).length
  const activeUsers  = byUser.filter(u => u.total_hours > 0).length

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Reports</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Time investment summary</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
        <KpiCard value={totalHours.toFixed(1) + 'h'} label="Total Hours Logged"       color="#2563eb" />
        <KpiCard value={activeProj}                   label="Projects with Time Logged" color="#16a34a" />
        <KpiCard value={activeUsers}                  label="Team Members Active"       color="#9333ea" />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {[['project', 'By Project'], ['user', 'By User']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '8px 16px', border: 'none', fontSize: 13.5, fontWeight: 500,
              background: view === id ? '#2563eb' : '#fff',
              color:      view === id ? '#fff'    : '#475569',
              cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={iStyle} />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>To</span>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={iStyle} />
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo('') }} style={{ padding: '7px 12px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {view === 'project' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Project', 'Type', 'Client', 'Hours Logged', 'Budget', 'Entries', 'Users', 'Share of Total'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byProject.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No data yet</td></tr>
              ) : byProject.map((r, i) => {
                const pct = totalHours > 0 ? r.total_hours / totalHours * 100 : 0
                return (
                  <tr key={r.project_code} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.project_name}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', background: '#eff6ff', display: 'inline-block', padding: '1px 6px', borderRadius: 3, marginTop: 3 }}>{r.project_code}</div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {r.type_name
                        ? <span style={{ background: (r.type_color || '#64748b') + '22', color: r.type_color || '#64748b', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, border: `1px solid ${(r.type_color || '#64748b')}44`, whiteSpace: 'nowrap' }}>{r.type_name}</span>
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '13px 16px', color: '#475569' }}>{r.client_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>{r.total_hours.toFixed(1)}h</td>
                    <td style={{ padding: '13px 16px' }}>
                      <BudgetProgress logged={r.total_hours} budgeted={r.budgeted_hours} pct={r.budget_pct} />
                    </td>
                    <td style={{ padding: '13px 16px', color: '#64748b' }}>{r.entry_count}</td>
                    <td style={{ padding: '13px 16px', color: '#64748b' }}>{r.user_count}</td>
                    <td style={{ padding: '13px 16px', minWidth: 160 }}><Bar pct={pct} color="#2563eb" /></td>
                  </tr>
                )
              })}
            </tbody>
            {byProject.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={3} style={{ padding: '10px 16px', fontWeight: 600, color: '#475569', fontSize: 13 }}>Total</td>
                  <td style={{ padding: '10px 16px', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{totalHours.toFixed(1)}h</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['User', 'Total Hours', 'Entries', 'Projects', 'Share of Total'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byUser.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No data yet</td></tr>
              ) : byUser.map((u, i) => {
                const pct = totalHours > 0 ? u.total_hours / totalHours * 100 : 0
                return (
                  <tr key={u.email} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#9333ea', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {u.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.user_name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>{u.total_hours.toFixed(1)}h</td>
                    <td style={{ padding: '13px 16px', color: '#64748b' }}>{u.entry_count}</td>
                    <td style={{ padding: '13px 16px', color: '#64748b' }}>{u.project_count}</td>
                    <td style={{ padding: '13px 16px', minWidth: 160 }}><Bar pct={pct} color="#9333ea" /></td>
                  </tr>
                )
              })}
            </tbody>
            {byUser.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: '#475569', fontSize: 13 }}>Total</td>
                  <td style={{ padding: '10px 16px', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{totalHours.toFixed(1)}h</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
