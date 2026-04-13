import { useState } from 'react'
import GameShell from './GameShell'
import Constellations from './games/Constellations'
import ShapeBuilder from './games/ShapeBuilder'
import Ripples from './games/Ripples'
import TwinStars from './games/TwinStars'
import './App.css'

const GAMES = [
  {
    id: 'constellations',
    title: 'Constellations',
    description: 'Navigate the night sky',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <line x1="8" y1="32" x2="20" y2="10" stroke="currentColor" strokeWidth="1" />
        <line x1="20" y1="10" x2="32" y2="24" stroke="currentColor" strokeWidth="1" />
        <line x1="32" y1="24" x2="14" y2="20" stroke="currentColor" strokeWidth="1" />
        <circle cx="8" cy="32" r="2" fill="currentColor" />
        <circle cx="20" cy="10" r="2.5" fill="currentColor" />
        <circle cx="32" cy="24" r="2" fill="currentColor" />
        <circle cx="14" cy="20" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'twin-stars',
    title: 'Twin Stars',
    description: 'Match graph structure across the sky',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="10" cy="20" r="2" fill="currentColor" />
        <circle cx="20" cy="10" r="2" fill="currentColor" />
        <circle cx="30" cy="20" r="2" fill="currentColor" />
        <line x1="10" y1="20" x2="20" y2="10" stroke="currentColor" strokeWidth="1" />
        <line x1="20" y1="10" x2="30" y2="20" stroke="currentColor" strokeWidth="1" />
        <circle cx="14" cy="32" r="2" fill="currentColor" />
        <circle cx="26" cy="32" r="2" fill="currentColor" />
        <circle cx="20" cy="24" r="2" fill="currentColor" />
        <line x1="14" y1="32" x2="20" y2="24" stroke="currentColor" strokeWidth="1" />
        <line x1="26" y1="32" x2="20" y2="24" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: 'shape-builder',
    title: 'Shape Builder',
    description: 'Construct geometric forms',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <polygon points="20,4 34,12 34,28 20,36 6,28 6,12" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,11 27,15.5 27,24.5 20,29 13,24.5 13,15.5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: 'ripples',
    title: 'Ripples',
    description: 'Waves through space',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1" />
        <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="0.75" />
      </svg>
    ),
  },
] as const

type GameId = (typeof GAMES)[number]['id']

function GameContent({ id }: { id: GameId }) {
  switch (id) {
    case 'constellations': return <Constellations />
    case 'shape-builder': return <ShapeBuilder />
    case 'ripples': return <Ripples />
    case 'twin-stars': return <TwinStars />
  }
}

export default function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null)

  if (activeGame !== null) {
    const game = GAMES.find(g => g.id === activeGame)!
    return (
      <GameShell title={game.title} onBack={() => setActiveGame(null)}>
        <GameContent id={activeGame} />
      </GameShell>
    )
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">Loci</h1>
        <p className="landing-subtitle">Geometry Games</p>
      </header>
      <ul className="game-list">
        {GAMES.map(game => (
          <li key={game.id}>
            <button className="game-card" onClick={() => setActiveGame(game.id)}>
              <span className="game-card-icon">{game.icon}</span>
              <span className="game-card-body">
                <span className="game-card-title">{game.title}</span>
                <span className="game-card-desc">{game.description}</span>
              </span>
              <span className="game-card-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
