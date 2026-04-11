import { useState, useRef, useEffect, useCallback } from 'react'

// ── Config ────────────────────────────────────────────────

const STAR_R = 5          // visual radius (px)
const HIT_R = 16          // tap target radius (px)
const SEL_RING = 10       // selected ring radius
const SCALE_MIN = 0.08    // shape radius as fraction of min(w, h)
const SCALE_MAX = 0.17
const MARGIN = 0.12       // normalized keep-away from edges
const SHAPE_COLORS = ['#4adecd', '#a78bfa', '#fbbf24', '#f87171', '#34d399']
const SKY = '#06091a'

const LEVELS: LevelDef[] = [
  { shapes: [{ sides: 3 }, { sides: 3 }],                                 noise: 45 },
  { shapes: [{ sides: 3 }, { sides: 4 }],                                 noise: 55 },
  { shapes: [{ sides: 3 }, { sides: 4 }, { sides: 5 }],                   noise: 70 },
  { shapes: [{ sides: 3 }, { sides: 4 }, { sides: 5 }, { sides: 6 }],     noise: 85 },
]

const SHAPE_NAMES: Record<number, string> = {
  3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
}

// ── Types ─────────────────────────────────────────────────

interface LevelDef {
  shapes: { sides: number }[]
  noise: number
}

interface Star {
  id: number
  nx: number     // normalized 0-1
  ny: number
  rMult: number  // size variation factor
  twinkleDelay: number  // css animation-delay in seconds
}

interface Shape {
  id: number
  sides: number
  starIds: number[]
  color: string
  ncx: number
  ncy: number
  nRadius: number
  rotation: number
}

interface LevelState {
  stars: Star[]
  shapes: Shape[]
  selected: Set<number>
  solved: Set<number>  // shape ids
}

// ── Seeded RNG ────────────────────────────────────────────

function mkRng(seed: number) {
  let s = ((seed % 2147483647) + 2147483647) % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ── Level generation ──────────────────────────────────────

function polyVerts(cx: number, cy: number, r: number, sides: number, rot: number) {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides + rot
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })
}

function buildLevel(def: LevelDef, w: number, h: number, levelIdx: number): LevelState {
  const rng = mkRng(levelIdx * 31337 + Math.round(w) * 7 + Math.round(h) * 3)
  const minDim = Math.min(w, h)
  let nextId = 0

  const shapes: Shape[] = []
  const cStars: Star[] = []  // constellation stars

  for (let si = 0; si < def.shapes.length; si++) {
    const { sides } = def.shapes[si]

    for (let attempt = 0; attempt < 200; attempt++) {
      const nRadius = SCALE_MIN + rng() * (SCALE_MAX - SCALE_MIN)
      const rPx = nRadius * minDim
      const ncx = MARGIN + rng() * (1 - 2 * MARGIN)
      const ncy = MARGIN + rng() * (1 - 2 * MARGIN)
      const rotation = rng() * Math.PI * 2

      // Check vertices stay in canvas (5% inset)
      const verts = polyVerts(ncx * w, ncy * h, rPx, sides, rotation)
      const inBounds = verts.every(v =>
        v.x >= w * 0.05 && v.x <= w * 0.95 &&
        v.y >= h * 0.05 && v.y <= h * 0.95
      )
      if (!inBounds) continue

      // No overlap with existing shapes
      const overlaps = shapes.some(s => {
        const dx = (ncx - s.ncx) * w
        const dy = (ncy - s.ncy) * h
        return Math.hypot(dx, dy) < (nRadius + s.nRadius) * minDim * 1.3
      })
      if (overlaps) continue

      const starIds: number[] = []
      for (const v of verts) {
        const star: Star = {
          id: nextId++,
          nx: v.x / w,
          ny: v.y / h,
          rMult: 0.9 + rng() * 0.5,
          twinkleDelay: rng() * -4,
        }
        cStars.push(star)
        starIds.push(star.id)
      }

      shapes.push({
        id: si,
        sides,
        starIds,
        color: SHAPE_COLORS[si % SHAPE_COLORS.length],
        ncx,
        ncy,
        nRadius,
        rotation,
      })
      break
    }
  }

  // Noise stars – avoid being too close to constellation stars
  const noiseStars: Star[] = []
  for (let i = 0; i < def.noise; i++) {
    let nx = 0, ny = 0
    for (let att = 0; att < 30; att++) {
      nx = 0.03 + rng() * 0.94
      ny = 0.03 + rng() * 0.94
      const tooClose = cStars.some(s => Math.hypot((nx - s.nx) * w, (ny - s.ny) * h) < STAR_R * 3)
      if (!tooClose) break
    }
    noiseStars.push({
      id: nextId++,
      nx,
      ny,
      rMult: 0.3 + rng() * 0.65,
      twinkleDelay: rng() * -4,
    })
  }

  // Shuffle combined star array so constellation stars aren't identifiable by z-order
  const allStars = [...cStars, ...noiseStars]
  for (let i = allStars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[allStars[i], allStars[j]] = [allStars[j], allStars[i]]
  }

  return { stars: allStars, shapes, selected: new Set(), solved: new Set() }
}

// ── Shape bank ────────────────────────────────────────────

function BankShape({ shape, solved }: { shape: Shape; solved: boolean }) {
  const size = 44
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  // Canonical upright: offset rotation so a vertex points up
  const rot = -Math.PI / 2 + (shape.sides % 2 === 0 ? Math.PI / shape.sides : 0)
  const pts = polyVerts(cx, cy, r, shape.sides, rot)
  const pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`${solved ? 'Solved' : 'Find a'} ${SHAPE_NAMES[shape.sides] ?? `${shape.sides}-gon`}`}
        style={{ overflow: 'visible' }}
      >
        <polygon
          points={pointsStr}
          fill={solved ? shape.color + '33' : 'none'}
          stroke={solved ? shape.color : 'rgba(255,255,255,0.25)'}
          strokeWidth={solved ? 1.5 : 1}
          style={{ transition: 'all 0.4s ease' }}
        />
        {solved && pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={shape.color} />
        ))}
      </svg>
      <span style={{
        fontSize: 10,
        color: solved ? shape.color : 'rgba(255,255,255,0.3)',
        fontVariantNumeric: 'tabular-nums',
        transition: 'color 0.4s ease',
        letterSpacing: '0.05em',
      }}>
        {shape.sides}pts
      </span>
    </div>
  )
}

// ── Solved shape overlay ──────────────────────────────────

function SolvedFill({ shape, stars, w, h }: {
  shape: Shape; stars: Star[]; w: number; h: number
}) {
  const shapeStarMap = new Map(stars.map(s => [s.id, s]))
  const pts = shape.starIds
    .map(id => shapeStarMap.get(id))
    .filter(Boolean)
    .map(s => `${(s!.nx * w).toFixed(1)},${(s!.ny * h).toFixed(1)}`)
    .join(' ')

  return (
    <polygon
      points={pts}
      fill={shape.color + '18'}
      stroke={shape.color + '60'}
      strokeWidth={1}
      style={{ pointerEvents: 'none' }}
    />
  )
}

// ── Main game ─────────────────────────────────────────────

export default function Constellations() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const [game, setGame] = useState<LevelState | null>(null)
  const [complete, setComplete] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Track SVG pixel dimensions
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        setSvgSize({ w: width, h: height })
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Build / rebuild level
  useEffect(() => {
    if (svgSize.w === 0 || svgSize.h === 0) return
    setComplete(false)
    setGame(buildLevel(
      LEVELS[Math.min(levelIdx, LEVELS.length - 1)],
      svgSize.w,
      svgSize.h,
      levelIdx,
    ))
  }, [svgSize, levelIdx])

  const handleStarDown = useCallback((id: number, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setGame(prev => {
      if (!prev) return prev

      // Ignore stars that belong to solved shapes
      const solvedStarIds = new Set(
        prev.shapes
          .filter(s => prev.solved.has(s.id))
          .flatMap(s => s.starIds)
      )
      if (solvedStarIds.has(id)) return prev

      const sel = new Set(prev.selected)
      if (sel.has(id)) {
        sel.delete(id)
        return { ...prev, selected: sel }
      }
      sel.add(id)

      // Check for match against every unsolved shape
      const unsolved = prev.shapes.filter(s => !prev.solved.has(s.id))
      for (const shape of unsolved) {
        if (sel.size !== shape.starIds.length) continue
        const shapeSet = new Set(shape.starIds)
        if ([...sel].every(sid => shapeSet.has(sid))) {
          const newSolved = new Set(prev.solved)
          newSolved.add(shape.id)
          return { ...prev, selected: new Set(), solved: newSolved }
        }
      }

      // If selection is larger than any unsolved shape, clear it
      const maxSize = Math.max(...unsolved.map(s => s.starIds.length), 0)
      if (sel.size > maxSize) return { ...prev, selected: new Set() }

      return { ...prev, selected: sel }
    })
  }, [])

  // Watch for level completion
  useEffect(() => {
    if (!game) return
    if (game.shapes.length > 0 && game.solved.size === game.shapes.length) {
      const t = setTimeout(() => setComplete(true), 600)
      return () => clearTimeout(t)
    }
  }, [game])

  const { w, h } = svgSize
  const solvedStarIds = game
    ? new Set(game.shapes.filter(s => game.solved.has(s.id)).flatMap(s => s.starIds))
    : new Set<number>()

  const getStarColor = (star: Star) => {
    if (!game) return '#fff'
    for (const shape of game.shapes) {
      if (game.solved.has(shape.id) && shape.starIds.includes(star.id)) {
        return shape.color
      }
    }
    return '#fff'
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: SKY,
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Sky canvas */}
      <svg
        ref={svgRef}
        style={{ flex: 1, display: 'block', touchAction: 'none' }}
        aria-label="Constellation field"
      >
        <style>{`
          @keyframes twinkle {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.35; }
          }
          .star-vis {
            animation: twinkle 3s ease-in-out infinite;
          }
        `}</style>

        {/* Solved shape fills */}
        {game?.shapes.filter(s => game.solved.has(s.id)).map(shape => (
          <SolvedFill key={shape.id} shape={shape} stars={game.stars} w={w} h={h} />
        ))}

        {/* Stars */}
        {game?.stars.map(star => {
          const px = star.nx * w
          const py = star.ny * h
          const isSel = game.selected.has(star.id)
          const isSolved = solvedStarIds.has(star.id)
          const color = getStarColor(star)
          const vr = STAR_R * star.rMult

          return (
            <g key={star.id}>
              {/* Selection ring */}
              {isSel && (
                <circle
                  cx={px} cy={py} r={SEL_RING}
                  fill="none"
                  stroke="rgba(255,220,80,0.7)"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Visual star */}
              <circle
                className="star-vis"
                cx={px}
                cy={py}
                r={isSolved ? vr * 1.2 : vr}
                fill={isSel ? 'rgba(255,220,80,0.95)' : (isSolved ? color : 'rgba(255,255,255,0.88)')}
                style={{
                  animationDelay: `${star.twinkleDelay}s`,
                  filter: isSel
                    ? 'drop-shadow(0 0 4px rgba(255,220,80,0.9))'
                    : isSolved
                      ? `drop-shadow(0 0 3px ${color}aa)`
                      : undefined,
                  pointerEvents: 'none',
                }}
              />
              {/* Hit target */}
              {!isSolved && (
                <circle
                  cx={px}
                  cy={py}
                  r={HIT_R}
                  fill="rgba(0,0,0,0)"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={e => handleStarDown(star.id, e)}
                />
              )}
            </g>
          )
        })}

        {/* Connection lines for selected stars when count approaches a shape size */}
        {game && game.selected.size >= 2 && (() => {
          const selArr = [...game.selected]
            .map(id => game.stars.find(s => s.id === id))
            .filter(Boolean) as Star[]
          return selArr.map((s, i) => {
            if (i === 0) return null
            const prev = selArr[i - 1]
            return (
              <line
                key={i}
                x1={prev.nx * w} y1={prev.ny * h}
                x2={s.nx * w} y2={s.ny * h}
                stroke="rgba(255,220,80,0.3)"
                strokeWidth={1}
                style={{ pointerEvents: 'none' }}
              />
            )
          })
        })()}
      </svg>

      {/* Shape bank */}
      <div style={{
        flexShrink: 0,
        height: 80,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(6,9,26,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: '0 20px',
      }}>
        {game?.shapes.map(shape => (
          <BankShape key={shape.id} shape={shape} solved={game.solved.has(shape.id)} />
        ))}
      </div>

      {/* Level complete overlay */}
      {complete && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6,9,26,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            {levelIdx >= LEVELS.length - 1 ? 'All constellations found' : `Level ${levelIdx + 1} complete`}
          </div>
          <div style={{ fontSize: 32, color: '#fff', fontWeight: 500 }}>
            {levelIdx >= LEVELS.length - 1 ? '✦' : ''}
            {game?.shapes.map((s, i) => (
              <span key={i} style={{ color: s.color, marginRight: 4 }}>✦</span>
            ))}
          </div>
          {levelIdx < LEVELS.length - 1 ? (
            <button
              onClick={() => setLevelIdx(i => i + 1)}
              style={{
                marginTop: 8,
                padding: '12px 32px',
                background: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 15,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.05em',
              }}
              onPointerEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)')}
              onPointerLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
            >
              Next level →
            </button>
          ) : (
            <button
              onClick={() => { setLevelIdx(0) }}
              style={{
                marginTop: 8,
                padding: '12px 32px',
                background: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 15,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.05em',
              }}
              onPointerEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)')}
              onPointerLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
            >
              Play again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
