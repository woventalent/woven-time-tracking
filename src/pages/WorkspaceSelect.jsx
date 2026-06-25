import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function WorkspaceSelect() {
  const { user, selectWorkspace } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/workspaces').then(r => r.json()).then(setWorkspaces)
  }, [])

  async function choose(id) {
    setLoading(true)
    await selectWorkspace(id)
    setLoading(false)
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
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 14 }}>
              You haven't been added to any workspace yet.<br />
              Contact your administrator.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
