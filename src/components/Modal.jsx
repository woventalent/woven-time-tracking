import { useEffect } from 'react'

export default function Modal({ title, onClose, children, width = 480 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        backdropFilter: 'blur(2px)',
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, width, maxWidth: '95vw',
          maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', color: '#94a3b8',
              fontSize: 22, lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}
