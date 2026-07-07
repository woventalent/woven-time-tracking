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
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: active ? '#dcfce7' : '#f1f5f9',
      color:      active ? '#15803d' : '#64748b',
    }}>{active ? 'Active' : 'Inactive'}</span>
  )
}

// ── Project Types ─────────────────────────────────────────────────────────────
function ProjectTypesTab() {
  const [data,      setData]      = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState({ name: '', description: '', color: '#64748b' })
  const [error,     setError]     = useState('')

  useEffect(() => { load() }, [])
  function load() { api.get('/project-types').then(setData) }

  function openAdd()   { setEditing(null); setForm({ name: '', description: '', color: '#64748b' }); setError(''); setShowModal(true) }
  function openEdit(t) { setEditing(t); setForm({ name: t.name, description: t.description || '', color: t.color || '#64748b' }); setError(''); setShowModal(true) }

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.put('/project-types/' + editing.id, { ...form, active: editing.active })
      } else {
        await api.post('/project-types', form)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle(t) {
    await api.put('/project-types/' + t.id, { name: t.name, description: t.description, color: t.color, active: t.active ? 0 : 1 })
    load()
  }

  async function del(id) {
    if (!confirm('Delete this project type? Existing projects will lose their type tag.')) return
    await api.delete('/project-types/' + id)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Configurable tags to categorise projects.</p>
        <button onClick={openAdd} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Type</button>
      </div>
      <TableShell cols={['Type', 'Description', 'Status', 'Actions']}>
        {data.length === 0 ? (
          <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No project types yet</td></tr>
        ) : data.map((t, i) => (
          <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            <td style={{ padding: '13px 16px' }}>
              <span style={{ background: (t.color || '#64748b') + '1a', color: t.color || '#64748b', fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, border: '1px solid ' + (t.color || '#64748b') + '55' }}>
                {t.name}
              </span>
            </td>
            <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13, maxWidth: 400 }}>
              {t.description || <span style={{ color: '#cbd5e1' }}>—</span>}
            </td>
            <td style={{ padding: '13px 16px' }}><StatusBadge active={t.active} /></td>
            <td style={{ padding: '13px 16px' }}>
              <BtnRow>
                <Btn onClick={() => openEdit(t)}>Edit</Btn>
                <Btn onClick={() => toggle(t)}>{t.active ? 'Deactivate' : 'Activate'}</Btn>
                <Btn red onClick={() => del(t.id)}>Delete</Btn>
              </BtnRow>
            </td>
          </tr>
        ))}
      </TableShell>
      {showModal && (
        <Modal title={editing ? 'Edit Project Type' : 'Add Project Type'} onClose={() => setShowModal(false)} width={480}>
          <form onSubmit={submit}>
            <Field label="Type Name" required>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={iStyle} required autoFocus placeholder="e.g. GCC Report, Industry Report" />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={4} style={{ ...iStyle, resize: 'vertical' }}
                placeholder="Describe what this report type covers…" />
            </Field>
            <Field label="Color Tag">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                style={{ width: 60, height: 34, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
            </Field>
            <ErrMsg msg={error} />
            <ModalBtns onClose={() => setShowModal(false)} label={editing ? 'Save' : 'Add Type'} />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Users (was Employees) ─────────────────────────────────────────────────────
function UsersTab({ isAdmin }) {
  const [data,      setData]      = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState({ name: '', email: '', role: 'member' })
  const [error,     setError]     = useState('')

  useEffect(() => { load() }, [])
  function load() { api.get('/workspace-users').then(setData) }

  function openAdd() { setForm({ name: '', email: '', role: 'member' }); setError(''); setShowModal(true) }

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/workspace-users', form)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function changeRole(u, role) {
    await api.put('/workspace-users/' + u.id + '/role', { role })
    load()
  }

  async function remove(u) {
    if (!confirm(`Remove ${u.name} from this workspace?`)) return
    await api.delete('/workspace-users/' + u.id)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Team members who log time in this workspace. Users are also created automatically on first login.</p>
        {isAdmin && (
          <button onClick={openAdd} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add User</button>
        )}
      </div>
      <TableShell cols={isAdmin ? ['Name', 'Email', 'Role', 'Projects', 'Actions'] : ['Name', 'Email', 'Role', 'Projects']}>
        {data.length === 0 ? (
          <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No users yet</td></tr>
        ) : data.map((u, i) => (
          <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            <td style={{ padding: '13px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</span>
              </div>
            </td>
            <td style={{ padding: '13px 16px', color: '#475569' }}>{u.email}</td>
            <td style={{ padding: '13px 16px' }}>
              {isAdmin ? (
                <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                  style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, color: '#475569', cursor: 'pointer', background: '#fff' }}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span style={{ textTransform: 'capitalize', fontSize: 12, color: '#475569' }}>{u.role}</span>
              )}
            </td>
            <td style={{ padding: '13px 16px', color: '#64748b' }}>{u.project_count}</td>
            {isAdmin && (
              <td style={{ padding: '13px 16px' }}>
                <Btn red onClick={() => remove(u)}>Remove</Btn>
              </td>
            )}
          </tr>
        ))}
      </TableShell>
      {showModal && (
        <Modal title="Add User" onClose={() => setShowModal(false)} width={400}>
          <form onSubmit={submit}>
            <Field label="Full Name" required><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={iStyle} required autoFocus /></Field>
            <Field label="Email Address" required><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={iStyle} required /></Field>
            <Field label="Role">
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={iStyle}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14, marginTop: -6 }}>
              If the user already exists they will just be added to this workspace.
            </p>
            <ErrMsg msg={error} />
            <ModalBtns onClose={() => setShowModal(false)} label="Add User" />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Clients & Contacts ────────────────────────────────────────────────────────
function ClientsTab() {
  const [clients,          setClients]          = useState([])
  const [contacts,         setContacts]         = useState({})
  const [expanded,         setExpanded]         = useState(null)
  const [showClientModal,  setShowClientModal]  = useState(false)
  const [showContactModal, setShowContactModal] = useState(null)
  const [editingContact,   setEditingContact]   = useState(null)
  const [clientForm,       setClientForm]       = useState({ name: '' })
  const [contactForm,      setContactForm]      = useState({ name: '', email: '', phone: '', role: '' })
  const [contactErrors,    setContactErrors]    = useState({})
  const [error,            setError]            = useState('')

  useEffect(() => { loadClients() }, [])
  function loadClients() { api.get('/clients').then(setClients) }

  async function loadContacts(cid) {
    const c = await api.get('/clients/' + cid + '/contacts')
    setContacts(prev => ({ ...prev, [cid]: c }))
  }

  function toggleClient(id) {
    if (expanded === id) { setExpanded(null) } else { setExpanded(id); loadContacts(id) }
  }

  async function addClient(e) {
    e.preventDefault()
    setError('')
    try {
      const newClient = await api.post('/clients', clientForm)
      setShowClientModal(false)
      setClientForm({ name: '' })
      loadClients()
      setExpanded(newClient.id)
      loadContacts(newClient.id)
    } catch (err) {
      setError(err.message)
    }
  }

  function validateContactForm(form) {
    const errs = {}
    if (/\d/.test(form.name)) errs.name = 'Name should not contain numbers'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address'
    if (form.phone && !/^[0-9+()\-\s.]+$/.test(form.phone)) errs.phone = 'Phone number should contain only digits, +, -, spaces, or ( )'
    if (form.role && /\d/.test(form.role)) errs.role = 'Role / Title should not contain numbers'
    return errs
  }

  async function saveContact(e) {
    e.preventDefault()
    setError('')
    const errs = validateContactForm(contactForm)
    if (Object.keys(errs).length) { setContactErrors(errs); return }
    const cid = showContactModal
    try {
      if (editingContact) {
        await api.put('/contacts/' + editingContact.id, contactForm)
      } else {
        await api.post('/clients/' + cid + '/contacts', contactForm)
      }
      setShowContactModal(null)
      setEditingContact(null)
      setContactForm({ name: '', email: '', phone: '', role: '' })
      setContactErrors({})
      loadContacts(cid)
    } catch (err) {
      setError(err.message)
    }
  }

  async function delContact(contactId, cid) {
    if (!confirm('Remove this contact?')) return
    await api.delete('/contacts/' + contactId)
    loadContacts(cid)
  }

  async function delClient(clientId, clientName) {
    if (!confirm(`Delete client "${clientName}" and all their contacts? This cannot be undone.`)) return
    await api.delete('/clients/' + clientId)
    loadClients()
    if (expanded === clientId) setExpanded(null)
  }

  function openAddContact(cid) {
    setEditingContact(null)
    setContactForm({ name: '', email: '', phone: '', role: '' })
    setContactErrors({})
    setError('')
    setShowContactModal(cid)
  }

  function openEditContact(ct, cid) {
    setEditingContact(ct)
    setContactForm({ name: ct.name, email: ct.email || '', phone: ct.phone || '', role: ct.role || '' })
    setContactErrors({})
    setError('')
    setShowContactModal(cid)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Clients and their associated contacts.</p>
        <button onClick={() => { setClientForm({ name: '' }); setError(''); setShowClientModal(true) }}
          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add Client
        </button>
      </div>

      {clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>No clients yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clients.map(client => (
            <div key={client.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleClient(client.id)}>
                <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 10, transition: 'transform 0.15s', display: 'inline-block', transform: expanded === client.id ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span style={{ fontWeight: 700, color: '#0f172a', flex: 1, fontSize: 15 }}>{client.name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 14 }}>
                  {client.project_count} project{client.project_count !== 1 ? 's' : ''}
                </span>
                <button onClick={e => { e.stopPropagation(); openAddContact(client.id) }}
                  style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '5px 12px', borderRadius: 5, fontSize: 12, color: '#475569', cursor: 'pointer', marginRight: 6 }}>
                  + Contact
                </button>
                <button onClick={e => { e.stopPropagation(); delClient(client.id, client.name) }}
                  style={{ border: '1px solid #fecaca', background: '#fff', padding: '5px 12px', borderRadius: 5, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
              {expanded === client.id && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 18px 16px 42px' }}>
                  {!contacts[client.id] ? (
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
                  ) : contacts[client.id].length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>No contacts yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['Name', 'Email', 'Phone', 'Role / Title', ''].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {contacts[client.id].map(ct => (
                          <tr key={ct.id}>
                            <td style={{ padding: '9px 10px', color: '#1e293b', fontWeight: 500 }}>{ct.name}</td>
                            <td style={{ padding: '9px 10px', color: '#64748b' }}>{ct.email || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ padding: '9px 10px', color: '#64748b' }}>{ct.phone || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ padding: '9px 10px', color: '#64748b' }}>{ct.role  || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <BtnRow>
                                <Btn onClick={() => openEditContact(ct, client.id)}>Edit</Btn>
                                <Btn red onClick={() => delContact(ct.id, client.id)}>Remove</Btn>
                              </BtnRow>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showClientModal && (
        <Modal title="Add Client" onClose={() => setShowClientModal(false)} width={380}>
          <form onSubmit={addClient}>
            <Field label="Client / Organisation Name" required>
              <input value={clientForm.name} onChange={e => setClientForm({ name: e.target.value })} style={iStyle} required autoFocus placeholder="e.g. Acme Corporation" />
            </Field>
            <ErrMsg msg={error} />
            <ModalBtns onClose={() => setShowClientModal(false)} label="Add Client" />
          </form>
        </Modal>
      )}

      {showContactModal && (
        <Modal title={editingContact ? 'Edit Contact' : 'Add Contact'} onClose={() => { setShowContactModal(null); setEditingContact(null) }} width={420}>
          <form onSubmit={saveContact}>
            <Field label="Full Name" required>
              <input value={contactForm.name}
                onChange={e => { setContactForm({ ...contactForm, name: e.target.value }); setContactErrors(err => ({ ...err, name: '' })) }}
                style={{ ...iStyle, borderColor: contactErrors.name ? '#ef4444' : undefined }}
                required autoFocus placeholder="e.g. Priya Sharma" />
              {contactErrors.name && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{contactErrors.name}</p>}
            </Field>
            <Field label="Email Address" required>
              <input type="email" value={contactForm.email}
                onChange={e => { setContactForm({ ...contactForm, email: e.target.value }); setContactErrors(err => ({ ...err, email: '' })) }}
                style={{ ...iStyle, borderColor: contactErrors.email ? '#ef4444' : undefined }}
                required placeholder="e.g. priya@company.com" />
              {contactErrors.email && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{contactErrors.email}</p>}
            </Field>
            <Field label="Phone" required>
              <input type="tel" value={contactForm.phone}
                onChange={e => {
                  const v = e.target.value.replace(/[a-zA-Z]/g, '')
                  setContactForm({ ...contactForm, phone: v })
                  setContactErrors(err => ({ ...err, phone: '' }))
                }}
                style={{ ...iStyle, borderColor: contactErrors.phone ? '#ef4444' : undefined }}
                required placeholder="e.g. +91 98765 43210" />
              {contactErrors.phone && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{contactErrors.phone}</p>}
            </Field>
            <Field label="Role / Title">
              <input value={contactForm.role}
                onChange={e => { setContactForm({ ...contactForm, role: e.target.value }); setContactErrors(err => ({ ...err, role: '' })) }}
                style={{ ...iStyle, borderColor: contactErrors.role ? '#ef4444' : undefined }}
                placeholder="e.g. Marketing Director" />
              {contactErrors.role && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{contactErrors.role}</p>}
            </Field>
            <ErrMsg msg={error} />
            <ModalBtns onClose={() => { setShowContactModal(null); setEditingContact(null) }} label={editingContact ? 'Save' : 'Add Contact'} />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Shared micro-components ───────────────────────────────────────────────────
function TableShell({ cols, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            {cols.map(h => (
              <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function BtnRow({ children }) {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>
}

function Btn({ onClick, red, children }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${red ? '#fecaca' : '#e2e8f0'}`,
      background: '#fff', padding: '4px 10px', borderRadius: 5,
      fontSize: 12, color: red ? '#ef4444' : '#475569', cursor: 'pointer',
    }}>{children}</button>
  )
}

function ErrMsg({ msg }) {
  if (!msg) return null
  return <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{msg}</div>
}

function ModalBtns({ onClose, label }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button type="button" onClick={onClose} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
      <button type="submit" style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
    </div>
  )
}

// ── Main Settings Page ────────────────────────────────────────────────────────
// ── Workspaces Tab (super admin only) ────────────────────────────────────────
function WorkspacesTab() {
  const [workspaces, setWorkspaces] = useState([])
  const [showModal,  setShowModal]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState({ name: '', code_prefix: '' })
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { load() }, [])
  function load() {
    fetch('/api/admin/workspaces').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setWorkspaces(d)
    })
  }

  function openAdd()   { setEditing(null); setForm({ name: '', code_prefix: '' }); setError(''); setShowModal(true) }
  function openEdit(w) { setEditing(w); setForm({ name: w.name, code_prefix: w.code_prefix || '' }); setError(''); setShowModal(true) }

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      if (editing) {
        const r = await fetch('/api/admin/workspaces/' + editing.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!r.ok) throw new Error((await r.json()).error)
      } else {
        const r = await fetch('/api/admin/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!r.ok) throw new Error((await r.json()).error)
      }
      setShowModal(false); load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function del(w) {
    if (!confirm(`Delete workspace "${w.name}"? This cannot be undone.`)) return
    const r = await fetch('/api/admin/workspaces/' + w.id, { method: 'DELETE' })
    const d = await r.json()
    if (!r.ok) return alert(d.error)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Create and manage team workspaces. Each workspace is fully isolated.</p>
        <button onClick={openAdd} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Workspace</button>
      </div>

      <TableShell cols={['Workspace', 'Code Prefix', 'Members', 'Projects', 'Actions']}>
        {workspaces.length === 0 ? (
          <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No workspaces yet.</td></tr>
        ) : workspaces.map(w => (
          <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '12px 16px' }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{w.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{w.slug}</div>
            </td>
            <td style={{ padding: '12px 16px' }}>
              <span style={{ fontFamily: 'monospace', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{w.code_prefix || 'WRI'}</span>
            </td>
            <td style={{ padding: '12px 16px', color: '#475569' }}>{w.member_count}</td>
            <td style={{ padding: '12px 16px', color: '#475569' }}>{w.project_count}</td>
            <td style={{ padding: '12px 16px' }}>
              <button onClick={() => openEdit(w)} style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#475569', cursor: 'pointer', marginRight: 6 }}>Edit</button>
              {w.project_count === 0 && (
                <button onClick={() => del(w)} style={{ border: '1px solid #fecaca', background: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>Delete</button>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      {showModal && (
        <Modal title={editing ? `Edit · ${editing.name}` : 'New Workspace'} onClose={() => setShowModal(false)}>
          <form onSubmit={submit}>
            <Field label="Workspace Name" required>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Research & Insights" style={iStyle} required autoFocus />
            </Field>
            <Field label="Project Code Prefix" required>
              <input value={form.code_prefix} onChange={e => setForm({ ...form, code_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="e.g. WRI, MKT, FIN" maxLength={6} style={iStyle} required />
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>2–6 uppercase letters. Projects will be numbered WRI-001, MKT-001, etc.</p>
            </Field>
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default function Admin() {
  const { user } = useAuth()
  const isSuperAdmin = user?.globalRole === 'super_admin'
  const isWsAdmin    = user?.role === 'admin' || isSuperAdmin

  const TABS = [
    ...(isSuperAdmin ? [{ id: 'workspaces', label: 'Workspaces', Component: WorkspacesTab }] : []),
    ...(isWsAdmin ? [{ id: 'project-types', label: 'Project Types', Component: ProjectTypesTab }] : []),
    { id: 'users', label: 'Users', Component: props => <UsersTab {...props} isAdmin={isWsAdmin} /> },
    ...(isWsAdmin ? [{ id: 'clients', label: 'Clients & Contacts', Component: ClientsTab }] : []),
  ]

  const [tab, setTab] = useState(null)
  const found = TABS.find(t => t.id === tab) || TABS[0]
  const { Component } = found

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#00259C' }}>Settings</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Manage master data for this workspace</p>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 22px', border: 'none', background: 'none',
            fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? '#2563eb' : '#64748b',
            borderBottom: `2px solid ${tab === t.id ? '#2563eb' : 'transparent'}`,
            marginBottom: -2, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <Component />
    </div>
  )
}
