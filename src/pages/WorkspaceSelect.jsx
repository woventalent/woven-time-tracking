import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal from '../components/Modal.jsx'

export default function WorkspaceSelect() {
  const { user, selectWorkspace } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [showNewWs, setShowNewWs] = useState(false)
  const [newWsForm, setNewWsForm] = useState({ name: '', code_prefix: '' })
  const [newWsError, setNewWsError] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)

  useEffect(() => {
    fetch('/api/auth/workspaces').then(r => r.json()).then(setWorkspaces)
  }, [])

  async function choose(id) {
    setLoading(true)
    await selectWorkspace(id)
    setLoading(false)
  }

  function openNewWs() {
    setNewWsForm({ name: '', code_prefix: '' })
    setNewWsError('')
    setShowNewWs(true)
  }

  async function createWs(e) {
    e.preventDefault()
    setNewWsError(''); setCreatingWs(true)
    try {
      const r = await fetch('/api/admin/workspaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newWsForm),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setShowNewWs(false)
      setLoading(true)
      await selectWorkspace(d.id)
      setLoading(false)
    } catch (err) { setNewWsError(err.message) }
    finally { setCreatingWs(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F8F7EF',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '44px 48px',
        width: 440, boxShadow: '0 32px 80px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#00259C', marginBottom: 4 }}>Woven</div>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
          Hi {user?.name?.split(' ')[0]} — select a workspace to continue.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => choose(ws.id)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px', border: '2px solid #e2e8f0', borderRadius: 10,
                background: '#fff', cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#2563eb', flexShrink: 0,
              }}>
                {ws.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{ws.name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{ws.slug}</div>
              </div>
            </button>
          ))}

          {workspaces.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '12px 0 4px', fontSize: 14 }}>
              You haven't been added to any workspace yet.<br />
              Contact your administrator, or create your own below.
            </div>
          )}

          <button
            onClick={openNewWs}
            style={{
              padding: '12px 18px', border: '2px dashed #cbd5e1', borderRadius: 10,
              background: 'transparent', cursor: 'pointer', textAlign: 'center',
              color: '#2563eb', fontWeight: 600, fontSize: 14,
            }}
          >
            + Create a workspace
          </button>
        </div>
      </div>

      {showNewWs && (
        <Modal title="New Workspace" onClose={() => setShowNewWs(false)} width={380}>
          <form onSubmit={createWs}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Workspace Name</label>
            <input
              value={newWsForm.name} onChange={e => setNewWsForm({ ...newWsForm, name: e.target.value })}
              placeholder="e.g. Research & Insights" required autoFocus
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Project Code Prefix</label>
            <input
              value={newWsForm.code_prefix}
              onChange={e => setNewWsForm({ ...newWsForm, code_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              placeholder="e.g. WRI, MKT, FIN" maxLength={6} required
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 14 }}
            />
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>2–6 uppercase letters. Projects will be numbered e.g. {newWsForm.code_prefix || 'WRI'}-001.</p>
            {newWsError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{newWsError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => setShowNewWs(false)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={creatingWs} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                {creatingWs ? 'Creating…' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
