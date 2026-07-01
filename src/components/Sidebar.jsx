import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal from './Modal.jsx'

const NAV = [
  { id: 'projects',   label: 'Projects',   Icon: FolderIcon },
  { id: 'timesheets', label: 'Timesheets', Icon: ClockIcon },
  { id: 'reports',    label: 'Reports',    Icon: ChartIcon },
]

export default function Sidebar({ current, onNav }) {
  const { user, workspace, logout, selectWorkspace } = useAuth()
  const [showUserMenu, setShowUserMenu]   = useState(false)
  const [showWsMenu,   setShowWsMenu]     = useState(false)
  const [workspaces,   setWorkspaces]     = useState([])
  const [showNewWs,    setShowNewWs]      = useState(false)
  const [newWsForm,    setNewWsForm]      = useState({ name: '', code_prefix: '' })
  const [newWsError,   setNewWsError]     = useState('')
  const [creatingWs,   setCreatingWs]     = useState(false)

  async function openWsSwitcher() {
    if (!showWsMenu) {
      const r = await fetch('/api/auth/workspaces')
      const ws = await r.json()
      setWorkspaces(ws)
    }
    setShowWsMenu(v => !v)
    setShowUserMenu(false)
  }

  async function switchWs(id) {
    setShowWsMenu(false)
    await selectWorkspace(id)
  }

  function openNewWs() {
    setShowWsMenu(false)
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
      await selectWorkspace(d.id)
    } catch (err) { setNewWsError(err.message) }
    finally { setCreatingWs(false) }
  }

  return (
    <aside style={{
      width: 224, flexShrink: 0,
      background: '#0f172a',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Header — workspace switcher */}
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #1e293b', position: 'relative' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Workspace
        </div>
        <button onClick={openWsSwitcher} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%',
        }}>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, lineHeight: 1.3, flex: 1 }}>
            {workspace?.name || 'Woven'}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={2}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {showWsMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 8, right: 8, zIndex: 100,
            background: '#1e293b', borderRadius: 8, border: '1px solid #334155',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            {workspaces.map(ws => (
              <button key={ws.id} onClick={() => switchWs(ws.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', border: 'none', background: ws.id === workspace?.id ? 'rgba(37,99,235,0.2)' : 'transparent',
                color: ws.id === workspace?.id ? '#93c5fd' : '#cbd5e1',
                fontSize: 13, cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {ws.name.charAt(0)}
                </div>
                {ws.name}
                {ws.id === workspace?.id && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3b82f6' }}>✓</span>}
              </button>
            ))}
            <button onClick={openNewWs} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', border: 'none', borderTop: '1px solid #334155',
              background: 'transparent', color: '#93c5fd',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}>
              + Create workspace
            </button>
          </div>
        )}
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

      {/* Main nav */}
      <nav style={{ flex: 1, padding: '10px 0' }}>
        {NAV.map(({ id, label, Icon }) => {
          const active = current === id
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 18px', border: 'none',
                background: active ? 'rgba(37,99,235,0.18)' : 'transparent',
                color: active ? '#93c5fd' : '#cbd5e1',
                fontSize: 13.5, fontWeight: active ? 600 : 400,
                textAlign: 'left',
                borderLeft: `3px solid ${active ? '#3b82f6' : 'transparent'}`,
                transition: 'all 0.12s', cursor: 'pointer',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Bottom section — Settings + User */}
      <div style={{ borderTop: '1px solid #1e293b', padding: '10px 0 0' }}>

        {/* Settings */}
        <button
          onClick={() => onNav('settings')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', border: 'none',
            background: current === 'settings' ? 'rgba(37,99,235,0.12)' : 'transparent',
            color: current === 'settings' ? '#7dd3fc' : '#94a3b8',
            fontSize: 12.5, fontWeight: current === 'settings' ? 600 : 400,
            textAlign: 'left', cursor: 'pointer',
            borderLeft: `3px solid ${current === 'settings' ? '#3b82f6' : 'transparent'}`,
            transition: 'all 0.12s',
          }}
        >
          <GearIcon size={13} />
          Settings
        </button>

        {/* User info */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowUserMenu(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 18px', border: 'none', background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#2563eb', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 700,
              color: '#fff', flexShrink: 0,
            }}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'Unknown'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email || ''}
              </div>
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* User dropdown */}
          {showUserMenu && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 10, right: 10,
              background: '#1e293b', borderRadius: 8, border: '1px solid #334155',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 50,
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #334155' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{user?.email}</div>
              </div>
              <button
                onClick={async () => { setShowUserMenu(false); await logout() }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', border: 'none', background: 'transparent',
                  color: '#f87171', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <SignOutIcon size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FolderIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}
function ClockIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function ChartIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function GearIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}
function SignOutIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
