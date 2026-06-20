import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Modal from '../components/Modal.jsx'

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

function today() { return new Date().toISOString().split('T')[0] }

export default function Timesheets({ initialProjectId }) {
  const [entries,   setEntries]   = useState([])
  const [projects,  setProjects]  = useState([])  // only assigned projects
  const [filters,   setFilters]   = useState({ project_id: '', from: '', to: '' })
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState({ client_id: '', project_id: '', date: today(), hours: '', description: '' })
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.get('/projects?assigned=true').then(ps => {
      setProjects(ps)
      if (initialProjectId) {
        const proj = ps.find(p => p.id === initialProjectId)
        setEditing(null)
        setForm({ client_id: proj?.client_id ? String(proj.client_id) : '', project_id: String(initialProjectId), date: today(), hours: '', description: '' })
        setError('')
        setShowModal(true)
      }
    })
  }, [initialProjectId])

  useEffect(() => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    )
    api.get('/timesheets?' + q).then(setEntries)
  }, [filters, refreshKey])

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
    if (selectedProject?.request_date && form.date < selectedProject.request_date) {
      const formatted = new Date(selectedProject.request_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      setError(`Date cannot be before the project Request Date (${formatted})`)
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
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Timesheets</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} &nbsp;·&nbsp; {totalHours.toFixed(1)}h total
          </p>
        </div>
        <button onClick={openNew} style={{
          background: '#2563eb', color: '#fff', border: 'none',
          padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
          boxShadow: '0 1px 4px rgba(37,99,235,0.3)', cursor: 'pointer',
        }}>+ Log Time</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filters.project_id} onChange={e => setFilters({ ...filters, project_id: e.target.value })}
          style={{ ...iStyle, maxWidth: 280 }}>
          <option value="">All My Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          style={{ ...iStyle, maxWidth: 160 }} title="From date" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          style={{ ...iStyle, maxWidth: 160 }} title="To date" />
        {hasFilters && (
          <button onClick={() => setFilters({ project_id: '', from: '', to: '' })}
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
              {['Date', 'Project', 'Hours', 'Description', ''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8' }}>
                  {hasFilters ? 'No entries match the current filters' : 'No time entries yet — log your first entry'}
                </td>
              </tr>
            ) : entries.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                  {new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.project_name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    <span style={{ fontFamily: 'monospace', background: '#eff6ff', color: '#2563eb', padding: '1px 5px', borderRadius: 3 }}>{e.project_code}</span>
                    {e.client_name && <span style={{ marginLeft: 6 }}>{e.client_name}</span>}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{e.hours}h</td>
                <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.description || <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(e)} style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#475569', marginRight: 6, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => del(e.id)}   style={{ border: '1px solid #fecaca', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={2} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Total</td>
                <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{totalHours.toFixed(1)}h</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Log Time Modal */}
      {showModal && (() => {
        const clients = [...new Map(
          projects.filter(p => p.client_id).map(p => [p.client_id, { id: p.client_id, name: p.client_name }])
        ).values()].sort((a, b) => a.name.localeCompare(b.name))
        const filteredProjects = form.client_id
          ? projects.filter(p => String(p.client_id) === form.client_id)
          : projects
        const selectedProject = projects.find(p => String(p.id) === form.project_id)
        const minDate = selectedProject?.request_date || undefined
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
                <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} style={iStyle} required>
                  <option value="">— select a project —</option>
                  {filteredProjects.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.project_code} — {p.name}</option>
                  ))}
                </select>
                {filteredProjects.length === 0 && (
                  <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>You have no projects assigned. Ask an admin to allocate you to a project.</p>
                )}
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Date" required>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={iStyle} required min={minDate} />
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
                <button type="submit" disabled={saving} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
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
