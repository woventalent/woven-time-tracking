import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const iStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 14, color: '#0f172a', outline: 'none', background: '#fff',
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function today() {
  // Mirrors server.js's istToday() so the date picker's bounds match what the server will accept.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function notYetStarted(project) {
  return !!(project?.report_initiated && project.report_initiated > today())
}

function defaultDateFor(project) {
  if (!project) return today()
  if (notYetStarted(project)) return project.report_initiated
  let d = project.report_initiated || today()
  if (project.report_delivered && d > project.report_delivered) d = project.report_delivered
  return d
}

export default function Timesheets() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [entries,    setEntries]   = useState([])
  const [projects,   setProjects]  = useState([])  // assigned projects (all projects for admins)
  const [wsUsers,    setWsUsers]   = useState([])   // all workspace users
  const [showAll,    setShowAll]   = useState(isAdmin) // admins see all entries by default; members only ever see their own
  const [filters,    setFilters]   = useState({ project_id: '', from: '', to: '', user_id: '' })
  const [showModal,  setShowModal] = useState(false)
  const [editing,    setEditing]   = useState(null)
  const [form,       setForm]      = useState({ client_id: '', project_id: '', date: today(), hours: '', description: '' })
  const [error,      setError]     = useState('')
  const [saving,     setSaving]    = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.get(isAdmin ? '/projects' : '/projects?assigned=true').then(setProjects)
    api.get('/workspace-users').then(setWsUsers)
  }, [])

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    if (showAll) params.all = 'true'
    const q = new URLSearchParams(params)
    api.get('/timesheets?' + q).then(setEntries)
  }, [filters, showAll, refreshKey])

  function openNew() {
    setEditing(null)
    setForm({ client_id: '', project_id: '', date: today(), hours: '', description: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(entry) {
    setEditing(entry)
    const proj = projects.find(p => p.id === entry.project_id)
    setForm({ client_id: proj?.client_id ? String(proj.client_id) : '', project_id: String(entry.project_id), date: entry.date, hours: entry.hours, description: entry.description || '' })
    setError('')
    setShowModal(true)
  }

  async function submit(ev) {
    ev.preventDefault()
    setError('')
    const selectedProject = projects.find(p => String(p.id) === form.project_id)
    const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (selectedProject?.report_initiated && form.date < selectedProject.report_initiated) {
      setError(`Date cannot be before the project Report Initiated date (${fmt(selectedProject.report_initiated)})`)
      return
    }
    if (selectedProject?.report_delivered && form.date > selectedProject.report_delivered) {
      setError(`Date cannot be after the project Report Delivered date (${fmt(selectedProject.report_delivered)})`)
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put('/timesheets/' + editing.id, form)
      } else {
        await api.post('/timesheets', form)
      }
      setShowModal(false)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function del(id) {
    if (!confirm('Delete this time entry?')) return
    await api.delete('/timesheets/' + id)
    setRefreshKey(k => k + 1)
  }

  const totalHours = entries.reduce((s, e) => s + e.hours, 0)
  const hasFilters = Object.values(filters).some(Boolean) || (isAdmin && !showAll)

  function exportCsv() {
    const escape = v => {
      let s = (v == null ? '' : String(v))
      if (/^[=+\-@]/.test(s)) s = `'${s}`
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Date', 'Project Code', 'Project Name', 'Client', 'Hours', 'Description']
    const rows = entries.map(e => [e.date, e.project_code, e.project_name, e.client_name || '', e.hours, e.description || ''])
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `timesheets-${filters.from || 'all'}-${filters.to || 'all'}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#00259C' }}>Timesheets</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {entries.length > 0 && (
            <button onClick={exportCsv} style={{
              background: '#fff', color: '#16a34a', border: '1px solid #16a34a',
              padding: '10px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>↓ Export CSV</button>
          )}
          <button onClick={openNew} style={{
            background: '#2563eb', color: '#fff', border: 'none',
            padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            boxShadow: '0 1px 4px rgba(37,99,235,0.3)', cursor: 'pointer',
          }}>+ Log Time</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {isAdmin && (
          <button onClick={() => { setShowAll(v => !v); setFilters({ project_id: '', from: '', to: '', user_id: '' }) }}
            style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: showAll ? '#0f172a' : '#fff', color: showAll ? '#fff' : '#475569' }}>
            {showAll ? 'All Entries' : 'My Entries'}
          </button>
        )}
        <select value={filters.project_id} onChange={e => setFilters({ ...filters, project_id: e.target.value })}
          style={{ ...iStyle, maxWidth: 280 }}>
          <option value="">{showAll ? 'All Projects' : 'All My Projects'}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
        </select>
        {showAll && (
          <select value={filters.user_id} onChange={e => setFilters({ ...filters, user_id: e.target.value })}
            style={{ ...iStyle, maxWidth: 220 }}>
            <option value="">All Users</option>
            {wsUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          style={{ ...iStyle, maxWidth: 160 }} title="From date" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          style={{ ...iStyle, maxWidth: 160 }} title="To date" />
        {hasFilters && (
          <button onClick={() => { setFilters({ project_id: '', from: '', to: '', user_id: '' }); setShowAll(isAdmin) }}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['Date', ...(showAll ? ['User'] : []), 'Project', 'Client', 'Hours', 'Description', ''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={showAll ? 7 : 6} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8' }}>
                  {hasFilters ? 'No entries match the current filters' : 'No time entries yet — log your first entry'}
                </td>
              </tr>
            ) : entries.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                  {new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                {showAll && (
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(e.user_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{e.user_name || '—'}</span>
                    </div>
                  </td>
                )}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.project_name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    <span style={{ fontFamily: 'monospace', background: '#eff6ff', color: '#2563eb', padding: '1px 5px', borderRadius: 3 }}>{e.project_code}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#475569' }}>
                  {e.client_name || <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{e.hours}h</td>
                <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.description || <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  {e.user_id === user?.id || isAdmin ? (
                    <>
                      <button onClick={() => openEdit(e)} style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#475569', marginRight: 6, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => del(e.id)}   style={{ border: '1px solid #fecaca', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                    </>
                  ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={showAll ? 4 : 3} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Total</td>
                <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{totalHours.toFixed(1)}h</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Log Time Modal */}
      {showModal && (() => {
        const selectableProjects = projects.filter(p => p.status === 'active' || String(p.id) === form.project_id)
        const clients = [...new Map(
          selectableProjects.filter(p => p.client_id).map(p => [p.client_id, { id: p.client_id, name: p.client_name }])
        ).values()].sort((a, b) => a.name.localeCompare(b.name))
        const filteredProjects = selectableProjects.filter(p =>
          !form.client_id || String(p.client_id) === form.client_id
        )
        const selectedProject = projects.find(p => String(p.id) === form.project_id)
        const minDate = selectedProject?.report_initiated || undefined
        const maxDate = selectedProject?.report_delivered && selectedProject.report_delivered < today() ? selectedProject.report_delivered : today()
        const blockedByStartDate = !editing && notYetStarted(selectedProject)
        return (
          <Modal title={editing ? 'Edit Time Entry' : 'Log Time'} onClose={() => setShowModal(false)} width={520}>
            <form onSubmit={submit}>
              <Field label="Client">
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value, project_id: '' })} style={iStyle}>
                  <option value="">All clients</option>
                  {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Project" required>
                <select value={form.project_id} onChange={e => {
                  const proj = projects.find(p => String(p.id) === e.target.value)
                  setForm({ ...form, project_id: e.target.value, date: editing ? form.date : defaultDateFor(proj) })
                }} style={iStyle} required>
                  <option value="">— select a project —</option>
                  {filteredProjects.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.project_code} — {p.name}</option>
                  ))}
                </select>
                {filteredProjects.length === 0 && (
                  <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                    {projects.length === 0
                      ? 'You have no projects assigned. Ask an admin to allocate you to a project.'
                      : selectableProjects.length === 0
                        ? 'None of your assigned projects are currently active.'
                        : 'None of your active projects belong to this client.'}
                  </p>
                )}
                {blockedByStartDate && (
                  <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                    This project's Report Initiated date ({new Date(selectedProject.report_initiated + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}) hasn't arrived yet — time can't be logged until then.
                  </p>
                )}
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Date" required>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={iStyle} required min={minDate} max={maxDate} disabled={blockedByStartDate} />
                </Field>
                <Field label="Hours" required>
                  <input
                    type="number" min="0.25" max="24" step="0.25"
                    value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })}
                    placeholder="e.g. 2.5" style={iStyle} required
                  />
                </Field>
              </div>
              <Field label="Description" required>
                <textarea
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="What did you work on?"
                  rows={3} style={{ ...iStyle, resize: 'vertical' }} required
                />
              </Field>
              {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving || blockedByStartDate} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Log Time'}
                </button>
              </div>
            </form>
          </Modal>
        )
      })()}
    </div>
  )
}
