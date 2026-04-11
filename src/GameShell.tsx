import type { ReactNode } from 'react'

interface Props {
  title: string
  onBack: () => void
  children: ReactNode
}

export default function GameShell({ title, onBack, children }: Props) {
  return (
    <div className="game-shell">
      <header className="game-header">
        <button className="game-header-btn" onClick={onBack} aria-label="Back to games">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="game-header-title">{title}</span>
        <button className="game-header-btn" aria-label="Game info">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16v-4m0-4h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <main className="game-area">{children}</main>
    </div>
  )
}
