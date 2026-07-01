import { useState, useEffect, useMemo } from 'react'
import { api } from '../api.js'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(d) { return d.toISOString().split('T')[0] }

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  // Monday-first grid: how many days back to the preceding Monday
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

export default function Calendar() {
  const [projects, setProjects] = useState([])
  const [cursor,   setCursor]   = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1) })

  useEffect(() => { api.get('/projects').then(setProjects) }, [])

  const todayKey = toDateKey(new Date())

  const byDate = useMemo(() => {
    const map = {}
    for (const p of projects) {
      if (!p.report_delivered) continue
      const key = p.report_delivered
      const entry = { id: p.id, name: p.name, client: p.client_name, future: key > todayKey }
      ;(map[key] ||= []).push(entry)
    }
    return map
  }, [projects, todayKey])

  const days = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function shiftMonth(delta) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#00259C' }}>Report Calendar</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Delivered and upcoming report deliveries</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => shiftMonth(-1)} style={navBtnStyle}>‹</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', minWidth: 150, textAlign: 'center' }}>{monthLabel}</div>
          <button onClick={() => shiftMonth(1)} style={navBtnStyle}>›</button>
          <button onClick={() => setCursor(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1) })}
            style={{ ...navBtnStyle, width: 'auto', padding: '0 12px', fontSize: 13, fontWeight: 600 }}>Today</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12.5, color: '#64748b' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#16a34a" /> Delivered</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#2563eb" /> Upcoming</span>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{w}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map(d => {
            const key = toDateKey(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = key === todayKey
            const items = byDate[key] || []
            return (
              <div key={key} style={{
                minHeight: 104, padding: '8px 8px 10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
                background: inMonth ? '#fff' : '#fafbfc',
              }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? '#fff' : inMonth ? '#334155' : '#cbd5e1',
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', background: isToday ? '#2563eb' : 'transparent', marginBottom: 4,
                }}>{d.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.map(it => (
                    <div key={it.id} title={`${it.name} — ${it.client || 'No client'}`} style={{
                      fontSize: 11, padding: '3px 6px', borderRadius: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      background: it.future ? '#eff6ff' : '#f0fdf4', color: it.future ? '#2563eb' : '#16a34a', fontWeight: 600,
                    }}>
                      {it.name}{it.client ? ` · ${it.client}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Dot({ color }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

const navBtnStyle = {
  width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
  color: '#334155', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
