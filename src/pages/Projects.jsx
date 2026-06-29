import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const iStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 14, color: '#0f172a', outline: 'none', background: '#fff',
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const STATUS_COLORS = {
  active:    { bg: '#dcfce7', fg: '#15803d' },
  completed: { bg: '#dbeafe', fg: '#1d4ed8' },
  on_hold:   { bg: '#fef9c3', fg: '#a16207' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c' },
}

function CreditsDisplay({ hours }) {
  const credits = (+(hours || 0) / 9)
  if (!hours || +hours === 0) return <span style={{ fontSize: 13, color: '#94a3b8' }}>—</span>
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
      {credits.toFixed(2)} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>credits</span>
    </span>
  )
}

export default function Projects({ onLogTime }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [projects,     setProjects] = useState([])
  const [clients,      setClients]  = useState([])
  const [projectTypes, setTypes]    = useState([])
  const [wsUsers,      setWsUsers]  = useState([])
  const [search,        setSearch]    = useState('')
  const [showModal,     setShowModal] = useState(false)
  const [editing,       setEditing]   = useState(null)
  const [detailProject, setDetail]    = useState(null)

  const loadAll = () => Promise.all([
    api.get('/projects').then(setProjects),
    api.get('/clients').then(setClients),
    api.get('/project-types').then(r => setTypes(r.filter(x => x.active))),
    api.get('/workspace-users').then(setWsUsers),
  ])

  useEffect(() => { loadAll() }, [])

  function openNew()   { setEditing(null); setShowModal(true) }
  function openEdit(p) { setEditing(p);    setShowModal(true) }

  async function handleDelete(p, e) {
    e.stopPropagation()
    if (!confirm(`Delete "${p.name}"? This will also remove all timesheet entries and documents for this project.`)) return
    await api.delete('/projects/' + p.id)
    setProjects(ps => ps.filter(x => x.id !== p.id))
    if (detailProject?.id === p.id) setDetail(null)
  }

  async function handleSave(form) {
    if (editing) {
      await api.put('/projects/' + editing.id, form)
    } else {
      await api.post('/projects', form)
    }
    setShowModal(false)
    api.get('/projects').then(ps => {
      setProjects(ps)
      if (detailProject) {
        const updated = ps.find(p => p.id === detailProject.id)
        if (updated) setDetail(updated)
      }
    })
  }

  const filtered = projects.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.project_code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.client_name  || '').toLowerCase().includes(q) ||
      (p.requestor_name || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#00259C' }}>Projects</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            {projects.reduce((s, p) => s + (p.total_hours || 0), 0).toFixed(1)}h total logged
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} style={{
            background: '#2563eb', color: '#fff', border: 'none',
            padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            boxShadow: '0 1px 4px rgba(37,99,235,0.3)', cursor: 'pointer',
          }}>+ New Project</button>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by code, name, client, or requestor…"
          style={{ ...iStyle, maxWidth: 380 }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['Code', 'Project Name', 'Type', 'Request Date', 'Client', 'Requestor', 'Credits', 'Status', 'Report Initiated', 'Report Delivered', ''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8' }}>
                  {search ? 'No projects match your search' : 'No projects yet — create one to get started'}
                </td>
              </tr>
            ) : filtered.map((p, i) => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.active
              return (
                <tr
                  key={p.id}
                  onClick={() => setDetail(p)}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                >
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
                      {p.project_code}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td style={{ padding: '13px 16px' }}>
                    {p.type_name
                      ? <span style={{ background: (p.type_color || '#64748b') + '22', color: p.type_color || '#64748b', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: `1px solid ${(p.type_color || '#64748b')}44`, whiteSpace: 'nowrap' }}>{p.type_name}</span>
                      : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {p.request_date ? new Date(p.request_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569' }}>{p.client_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={{ padding: '13px 16px' }}>
                    {p.requestor_name ? (
                      <>
                        <div style={{ color: '#1e293b', fontWeight: 500 }}>{p.requestor_name}</div>
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>{p.requestor_email}</div>
                      </>
                    ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <CreditsDisplay hours={p.total_hours} />
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {p.report_initiated ? new Date(p.report_initiated + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {p.report_delivered ? new Date(p.report_delivered + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <button onClick={e => { e.stopPropagation(); onLogTime && onLogTime(p.id) }} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#2563eb', cursor: 'pointer', marginRight: 6, fontWeight: 600 }}>
                      Log Time
                    </button>
                    {isAdmin && (<>
                      <button onClick={e => { e.stopPropagation(); openEdit(p) }} style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#475569', cursor: 'pointer', marginRight: 6 }}>
                        Edit
                      </button>
                      <button onClick={e => handleDelete(p, e)} style={{ border: '1px solid #fecaca', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProjectModal
          project={editing}
          clients={clients}
          projectTypes={projectTypes}
          wsUsers={wsUsers}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {detailProject && (
        <ProjectDetail
          project={detailProject}
          onClose={() => setDetail(null)}
          onProjectUpdate={updated => setDetail(updated)}
        />
      )}
    </div>
  )
}

// ── Project form modal ────────────────────────────────────────────────────────
function ProjectModal({ project, clients, projectTypes, wsUsers, onSave, onClose }) {
  const [form, setForm] = useState({
    name:                 project?.name                 ?? '',
    project_type_id:      project?.project_type_id      ?? '',
    request_date:         project?.request_date         ?? '',
    requestor_contact_id: project?.requestor_contact_id ?? '',
    client_id:            project?.client_id            ?? '',
    budgeted_hours:       project?.budgeted_hours        ?? '',
    status:               project?.status               ?? 'active',
    report_initiated:     project?.report_initiated     ?? '',
    report_delivered:     project?.report_delivered     ?? '',
    description:          project?.description          ?? '',
    assigned_user_id:     '',
  })
  const [contacts, setContacts] = useState([])
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  // Load contacts whenever client changes
  useEffect(() => {
    if (!form.client_id) { setContacts([]); return }
    api.get('/clients/' + form.client_id + '/contacts').then(setContacts)
  }, [form.client_id])

  function handleClientChange(clientId) {
    setForm(f => ({ ...f, client_id: clientId, requestor_contact_id: '' }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.report_initiated && form.request_date && form.report_initiated < form.request_date)
      return setError('Report Initiated cannot be before Request Date')
    if (form.report_delivered && form.request_date && form.report_delivered < form.request_date)
      return setError('Report Delivered cannot be before Request Date')
    if (form.report_delivered && form.report_initiated && form.report_delivered < form.report_initiated)
      return setError('Report Delivered cannot be before Report Initiated')
    setSaving(true)
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={project ? `Edit · ${project.project_code}` : 'New Project'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Project Name" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Consumer Insights Q3 2025" style={iStyle} required autoFocus />
        </Field>
        <Field label="Description">
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of the project scope or objective…"
            rows={3} style={{ ...iStyle, resize: 'vertical' }} />
        </Field>
        {!project && wsUsers.length > 0 && (
          <Field label="Assign Team Member">
            <select value={form.assigned_user_id} onChange={e => setForm({ ...form, assigned_user_id: e.target.value })} style={iStyle}>
              <option value="">— select a user (optional) —</option>
              {wsUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
            </select>
            {form.assigned_user_id && (
              <p style={{ fontSize: 12, color: '#2563eb', marginTop: 5 }}>An email notification will be sent to this user.</p>
            )}
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Project Type">
            <select value={form.project_type_id} onChange={e => setForm({ ...form, project_type_id: e.target.value })} style={iStyle}>
              <option value="">None</option>
              {projectTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={iStyle}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Report Initiated">
            <input type="date" value={form.report_initiated} onChange={e => setForm({ ...form, report_initiated: e.target.value })} style={iStyle}
              min={form.request_date || undefined} />
          </Field>
          <Field label="Report Delivered">
            <input type="date" value={form.report_delivered} onChange={e => setForm({ ...form, report_delivered: e.target.value })} style={iStyle}
              min={form.report_initiated || form.request_date || undefined} />
          </Field>
        </div>
        <Field label="Client">
          <select value={form.client_id} onChange={e => handleClientChange(e.target.value)} style={iStyle}>
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Project Requestor">
          <select
            value={form.requestor_contact_id}
            onChange={e => setForm({ ...form, requestor_contact_id: e.target.value })}
            style={iStyle}
            disabled={!form.client_id}
          >
            <option value="">{form.client_id ? 'Select requestor…' : 'Select a client first'}</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? `  ·  ${c.email}` : ''}</option>
            ))}
          </select>
          {form.client_id && contacts.length === 0 && (
            <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 6 }}>
              No contacts for this client. Add contacts in Settings → Clients &amp; Contacts first.
            </p>
          )}
        </Field>
        <Field label="Request Date">
          <input type="date" value={form.request_date} onChange={e => setForm({ ...form, request_date: e.target.value })} style={iStyle} />
        </Field>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Project detail panel ──────────────────────────────────────────────────────
function ProjectDetail({ project, onClose, onProjectUpdate }) {
  const [tab,       setTab]       = useState('members')
  const [members,   setMembers]   = useState([])
  const [wsUsers,   setWsUsers]   = useState([])
  const [documents, setDocs]      = useState([])
  const [addUserId, setAddUser]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [docDesc,   setDocDesc]   = useState('')
  const fileRef                   = useRef()

  const loadMembers = () => api.get('/projects/' + project.id + '/members').then(setMembers)
  const loadDocs    = () => api.get('/projects/' + project.id + '/documents').then(setDocs)

  useEffect(() => {
    loadMembers()
    loadDocs()
    api.get('/workspace-users').then(setWsUsers)
  }, [project.id])

  async function addMember() {
    if (!addUserId) return
    await api.post('/projects/' + project.id + '/members', { userId: Number(addUserId) })
    setAddUser('')
    loadMembers()
    refreshProject()
  }

  async function removeMember(uid) {
    await fetch('/api/projects/' + project.id + '/members/' + uid, { method: 'DELETE' })
    loadMembers()
    refreshProject()
  }

  async function uploadFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('description', docDesc)
    const res = await fetch('/api/projects/' + project.id + '/documents', { method: 'POST', body: fd })
    if (!res.ok) alert('Upload failed')
    setUploading(false)
    setDocDesc('')
    if (fileRef.current) fileRef.current.value = ''
    loadDocs()
  }

  async function removeDoc(docId) {
    if (!confirm('Remove this document?')) return
    await fetch('/api/projects/' + project.id + '/documents/' + docId, { method: 'DELETE' })
    loadDocs()
  }

  function refreshProject() {
    api.get('/projects').then(ps => {
      const updated = ps.find(p => p.id === project.id)
      if (updated) onProjectUpdate(updated)
    })
  }

  const memberIds  = new Set(members.map(m => m.id))
  const available  = wsUsers.filter(u => !memberIds.has(u.id))

  const tabBtn = active => ({
    padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13.5, fontWeight: active ? 600 : 400,
    color: active ? '#2563eb' : '#64748b',
    borderBottom: `2px solid ${active ? '#2563eb' : 'transparent'}`,
  })

  const sc = STATUS_COLORS[project.status] || STATUS_COLORS.active

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 520, height: '100vh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>{project.project_code}</span>
                {project.type_name && (
                  <span style={{ background: (project.type_color || '#64748b') + '22', color: project.type_color || '#64748b', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: `1px solid ${(project.type_color || '#64748b')}44` }}>
                    {project.type_name}
                  </span>
                )}
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#00259C' }}>{project.name}</h2>
              {project.client_name && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{project.client_name}</div>}
              {project.description && <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>{project.description}</div>}
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
            <StatPill label="Logged"  value={`${(+project.total_hours || 0).toFixed(1)}h`} />
            <StatPill label="Credits" value={`${((+project.total_hours || 0) / 9).toFixed(2)}`} />
            <StatPill label="Entries" value={project.entry_count ?? 0} />
            <StatPill label="Members" value={project.member_count ?? 0} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', paddingLeft: 8 }}>
          <button style={tabBtn(tab === 'members')}   onClick={() => setTab('members')}>Members</button>
          <button style={tabBtn(tab === 'documents')} onClick={() => setTab('documents')}>Documents ({documents.length})</button>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {tab === 'members' && (
            <div>
              {available.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <select value={addUserId} onChange={e => setAddUser(e.target.value)}
                    style={{ ...iStyle, flex: 1 }}>
                    <option value="">Add a user to this project…</option>
                    {available.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                  </select>
                  <button onClick={addMember} disabled={!addUserId}
                    style={{ padding: '8px 16px', background: addUserId ? '#2563eb' : '#e2e8f0', color: addUserId ? '#fff' : '#94a3b8', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: addUserId ? 'pointer' : 'default' }}>
                    Add
                  </button>
                </div>
              )}
              {members.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>No members assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{m.email}</div>
                        </div>
                      </div>
                      <button onClick={() => removeMember(m.id)}
                        style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'documents' && (
            <div>
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 20, background: '#f8fafc' }}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Description (optional)</label>
                  <input value={docDesc} onChange={e => setDocDesc(e.target.value)}
                    placeholder="e.g. Final report, Research summary…"
                    style={{ ...iStyle }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="file" ref={fileRef} style={{ flex: 1, fontSize: 12 }} />
                  <button onClick={uploadFile} disabled={uploading}
                    style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Max file size 50 MB</div>
              </div>

              {documents.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>No documents yet. Upload project outputs above.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {documents.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.original_name}</div>
                        {d.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.description}</div>}
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {d.uploader_name} · {new Date(d.created_at).toLocaleDateString('en-GB')} · {fmtBytes(d.size)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 10, flexShrink: 0 }}>
                        <a href={`/api/projects/${project.id}/documents/${d.id}/download`}
                          style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', padding: '4px 10px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#eff6ff' }}>
                          Download
                        </a>
                        <button onClick={() => removeDoc(d.id)}
                          style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatPill({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  )
}

function fmtBytes(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}
