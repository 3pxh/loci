import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// ── Config ────────────────────────────────────────────────

const STAR_R = 5
const HIT_R = 20
const SEL_RING = 11
const MARGIN = 0.09
const SHAPE_COLORS = ['#4adecd', '#a78bfa', '#fbbf24', '#f87171', '#34d399', '#60a5fa', '#fb923c']
const SKY = '#06091a'

// ── Types ─────────────────────────────────────────────────

interface ShapeDef {
  sides?: number    // regular polygon
  type?: 'rect'    // axis-aligned rectangle
}

interface LevelDef {
  shapes: ShapeDef[]
  noise: number
  scaleMin: number         // polygon radius as fraction of min(w,h)
  scaleMax: number
  rectWRange: [number, number]  // rect width as fraction of canvas width
  rectHRange: [number, number]  // rect height as fraction of canvas height
  starBaseMin: number
  starBaseMax: number
  noiseRMult: [number, number]
  fadeRange: [number, number]
  fadeDuration: number
}

function lev(
  sides: number[], noise: number,
  scaleMin: number, scaleMax: number,
  starBaseMin: number, starBaseMax: number,
  noiseRMult: [number, number],
  fadeRange: [number, number], fadeDuration: number,
): LevelDef {
  return {
    shapes: sides.map(s => ({ sides: s })),
    noise, scaleMin, scaleMax,
    rectWRange: [0.12, 0.38], rectHRange: [0.08, 0.26],
    starBaseMin, starBaseMax, noiseRMult, fadeRange, fadeDuration,
  }
}

function rectLev(
  rects: number, noise: number,
  rectWRange: [number, number], rectHRange: [number, number],
  fadeRange: [number, number], fadeDuration: number,
): LevelDef {
  return {
    shapes: Array.from({ length: rects }, () => ({ type: 'rect' as const })),
    noise, scaleMin: 0, scaleMax: 0,
    rectWRange, rectHRange,
    starBaseMin: 0.9, starBaseMax: 1.1,
    noiseRMult: [0.25, 1.0],
    fadeRange, fadeDuration,
  }
}

//           sides             noise  scale             starBase      noiseRMult     fadeRange    dur
const LEVELS: LevelDef[] = [
  // ── Triangles ──────────────────────────────────────────────────────────────────────────────
  lev([3,3],         40,  0.10,0.28,  1.0,1.0,  [0.4,0.7],   [20, 70],  10),
  lev([3,3,3],       55,  0.09,0.34,  0.9,1.1,  [0.3,0.85],  [25, 90],  12),
  lev([3,3,3,3],     65,  0.07,0.40,  0.7,1.3,  [0.2,1.0],   [30,110],  14),
  // ── Squares ────────────────────────────────────────────────────────────────────────────────
  lev([4,4],         45,  0.10,0.28,  1.0,1.0,  [0.4,0.7],   [25, 80],  10),
  lev([4,4,4],       60,  0.09,0.34,  0.9,1.1,  [0.3,0.85],  [30,110],  12),
  lev([4,4,4,4],     75,  0.07,0.40,  0.7,1.3,  [0.2,1.0],   [35,130],  14),
  // ── Pentagons ──────────────────────────────────────────────────────────────────────────────
  lev([5,5,5],       65,  0.09,0.32,  0.9,1.1,  [0.3,0.85],  [30,120],  12),
  lev([5,5,5,5],     80,  0.07,0.40,  0.7,1.4,  [0.2,1.1],   [40,150],  15),
  // ── Rectangles ─────────────────────────────────────────────────────────────────────────────
  rectLev(2, 40, [0.12,0.38], [0.08,0.26], [20, 70], 10),
  rectLev(3, 55, [0.12,0.42], [0.08,0.28], [25, 90], 12),
  rectLev(4, 70, [0.10,0.44], [0.07,0.30], [30,110], 14),
  // ── Mixed ──────────────────────────────────────────────────────────────────────────────────
  lev([3,3,4,4,5],   85,  0.07,0.40,  0.7,1.3,  [0.2,1.1],   [40,160],  15),
  lev([3,3,4,4,5,6], 95,  0.06,0.42,  0.6,1.5,  [0.15,1.2],  [50,180],  18),
]

const LEVEL_GROUPS: { label: string; indices: number[] }[] = [
  { label: 'Triangles',  indices: [0, 1, 2] },
  { label: 'Squares',    indices: [3, 4, 5] },
  { label: 'Pentagons',  indices: [6, 7] },
  { label: 'Rectangles', indices: [8, 9, 10] },
  { label: 'Mixed',      indices: [11, 12] },
]

interface Star {
  id: number
  nx: number
  ny: number
  rMult: number
  twinkleDelay: number
  fadeDelay?: number
  fadeDuration?: number
}

interface Shape {
  id: number
  sides: number
  shapeType: 'poly' | 'rect'
  aspectRatio?: number    // width/height for bank display of rects
  starIds: number[]
  color: string
  starBase: number
  ncx: number
  ncy: number
  nRadius: number
  rotation: number
}

interface LevelState {
  stars: Star[]
  shapes: Shape[]
  selected: number[]
  solved: Set<number>
  flashError: boolean
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
  const cStars: Star[] = []

  for (let si = 0; si < def.shapes.length; si++) {
    const shapeDef = def.shapes[si]
    const color = SHAPE_COLORS[si % SHAPE_COLORS.length]
    const starBase = def.starBaseMin + rng() * (def.starBaseMax - def.starBaseMin)

    if (shapeDef.type === 'rect') {
      // ── Axis-aligned rectangle ──────────────────────────
      for (let attempt = 0; attempt < 300; attempt++) {
        const [wMin, wMax] = def.rectWRange
        const [hMin, hMax] = def.rectHRange
        let nw = wMin + rng() * (wMax - wMin)
        let nh = hMin + rng() * (hMax - hMin)

        // Enforce non-square: aspect ratio must be >= 1.3 or <= 0.77
        const ar = nw / nh
        if (ar > 0.77 && ar < 1.3) {
          if (rng() > 0.5) nw = Math.min(wMax, nh * 1.5)
          else              nh = Math.min(hMax, nw / 1.5)
        }

        const aspectRatio = nw / nh
        const halfW = (nw * w) / 2
        const halfH = (nh * h) / 2
        const ncx = MARGIN + rng() * (1 - 2 * MARGIN)
        const ncy = MARGIN + rng() * (1 - 2 * MARGIN)
        const cx = ncx * w, cy = ncy * h

        // Bounds check
        if (cx - halfW < w * 0.04 || cx + halfW > w * 0.96) continue
        if (cy - halfH < h * 0.04 || cy + halfH > h * 0.96) continue

        // Approximate overlap (half-diagonal)
        const nRadius = Math.hypot(halfW, halfH) / minDim
        const overlaps = shapes.some(s => {
          const dx = (ncx - s.ncx) * w
          const dy = (ncy - s.ncy) * h
          return Math.hypot(dx, dy) < (nRadius + s.nRadius) * minDim * 1.1
        })
        if (overlaps) continue

        // Corners: TL, TR, BR, BL
        const verts = [
          { x: cx - halfW, y: cy - halfH },
          { x: cx + halfW, y: cy - halfH },
          { x: cx + halfW, y: cy + halfH },
          { x: cx - halfW, y: cy + halfH },
        ]

        const starIds: number[] = []
        for (const v of verts) {
          const star: Star = {
            id: nextId++,
            nx: v.x / w, ny: v.y / h,
            rMult: 0.82 + rng() * 0.36,
            twinkleDelay: rng() * -5,
          }
          cStars.push(star)
          starIds.push(star.id)
        }

        shapes.push({
          id: si, sides: 4, shapeType: 'rect', aspectRatio,
          starIds, color, starBase, ncx, ncy, nRadius, rotation: 0,
        })
        break
      }
    } else {
      // ── Regular polygon ─────────────────────────────────
      const sides = shapeDef.sides ?? 3

      for (let attempt = 0; attempt < 300; attempt++) {
        const nRadius = def.scaleMin + rng() * (def.scaleMax - def.scaleMin)
        const rPx = nRadius * minDim
        const ncx = MARGIN + rng() * (1 - 2 * MARGIN)
        const ncy = MARGIN + rng() * (1 - 2 * MARGIN)
        const rotation = rng() * Math.PI * 2

        const verts = polyVerts(ncx * w, ncy * h, rPx, sides, rotation)
        if (!verts.every(v => v.x >= w*0.04 && v.x <= w*0.96 && v.y >= h*0.04 && v.y <= h*0.96)) continue

        const overlaps = shapes.some(s => {
          const dx = (ncx - s.ncx) * w
          const dy = (ncy - s.ncy) * h
          return Math.hypot(dx, dy) < (nRadius + s.nRadius) * minDim * 1.2
        })
        if (overlaps) continue

        const starIds: number[] = []
        for (const v of verts) {
          const star: Star = {
            id: nextId++,
            nx: v.x / w, ny: v.y / h,
            rMult: 0.82 + rng() * 0.36,
            twinkleDelay: rng() * -5,
          }
          cStars.push(star)
          starIds.push(star.id)
        }

        shapes.push({
          id: si, sides, shapeType: 'poly',
          starIds, color, starBase, ncx, ncy, nRadius, rotation,
        })
        break
      }
    }
  }

  // Noise stars
  const [nMin, nMax] = def.noiseRMult
  const noiseStars: Star[] = []
  for (let i = 0; i < def.noise; i++) {
    let nx = 0, ny = 0
    for (let att = 0; att < 30; att++) {
      nx = 0.03 + rng() * 0.94
      ny = 0.03 + rng() * 0.94
      if (!cStars.some(s => Math.hypot((nx - s.nx) * w, (ny - s.ny) * h) < STAR_R * 2.5)) break
    }
    noiseStars.push({
      id: nextId++, nx, ny,
      rMult: nMin + rng() * (nMax - nMin),
      twinkleDelay: rng() * -5,
      fadeDelay: def.fadeRange[0] + rng() * (def.fadeRange[1] - def.fadeRange[0]),
      fadeDuration: def.fadeDuration,
    })
  }

  const allStars = [...cStars, ...noiseStars]
  for (let i = allStars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[allStars[i], allStars[j]] = [allStars[j], allStars[i]]
  }

  return { stars: allStars, shapes, selected: [], solved: new Set(), flashError: false }
}

// ── Shape bank item ───────────────────────────────────────

function BankShape({ shape, solved }: { shape: Shape; solved: boolean }) {
  const size = 44
  const cx = size / 2, cy = size / 2

  let pointsStr: string
  if (shape.shapeType === 'rect') {
    const ar = shape.aspectRatio ?? 1.6
    const bw = ar >= 1 ? size * 0.82 : size * 0.82 * ar
    const bh = ar >= 1 ? size * 0.82 / ar : size * 0.82
    const x0 = cx - bw / 2, y0 = cy - bh / 2
    pointsStr = [
      `${x0.toFixed(1)},${y0.toFixed(1)}`,
      `${(x0 + bw).toFixed(1)},${y0.toFixed(1)}`,
      `${(x0 + bw).toFixed(1)},${(y0 + bh).toFixed(1)}`,
      `${x0.toFixed(1)},${(y0 + bh).toFixed(1)}`,
    ].join(' ')
  } else {
    const r = size * 0.36
    const rot = -Math.PI / 2 + (shape.sides % 2 === 0 ? Math.PI / shape.sides : 0)
    const pts = polyVerts(cx, cy, r, shape.sides, rot)
    pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  }

  const shapeLabel = shape.shapeType === 'rect' ? 'rectangle'
    : ({ 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon' }[shape.sides] ?? `${shape.sides}-gon`)

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${solved ? 'Solved' : 'Find a'} ${shapeLabel}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      <polygon
        points={pointsStr}
        fill={solved ? shape.color + '33' : 'none'}
        stroke={solved ? shape.color : 'rgba(255,255,255,0.25)'}
        strokeWidth={solved ? 1.5 : 1}
        style={{ transition: 'all 0.4s ease' }}
      />
    </svg>
  )
}

// ── Solved shape fill ─────────────────────────────────────

function SolvedFill({ shape, stars, w, h }: { shape: Shape; stars: Star[]; w: number; h: number }) {
  const starMap = new Map(stars.map(s => [s.id, s]))
  const pts = shape.starIds
    .map(id => starMap.get(id))
    .filter(Boolean)
    .map(s => `${(s!.nx * w).toFixed(1)},${(s!.ny * h).toFixed(1)}`)
    .join(' ')

  return (
    <polygon points={pts}
      fill={shape.color + '18'} stroke={shape.color + '60'} strokeWidth={1}
      style={{ pointerEvents: 'none' }}
    />
  )
}

// ── Level select overlay ──────────────────────────────────

function LevelSelect({ current, onSelect, onClose }: {
  current: number
  onSelect: (i: number) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(6,9,26,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, backdropFilter: 'blur(6px)',
        padding: '32px 24px',
        overflowY: 'auto',
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        fontSize: 11, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
      }}>
        Select Level
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 360 }}>
        {LEVEL_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{
              fontSize: 10, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
              marginBottom: 8,
            }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.indices.map(i => (
                <button
                  key={i}
                  onPointerDown={() => { onSelect(i); onClose() }}
                  style={{
                    width: 44, height: 44,
                    border: i === current
                      ? '1px solid rgba(255,255,255,0.6)'
                      : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    background: i === current ? 'rgba(255,255,255,0.08)' : 'none',
                    color: i === current ? '#fff' : 'rgba(255,255,255,0.45)',
                    fontSize: 14, fontFamily: 'inherit',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main game ─────────────────────────────────────────────

export default function Constellations() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const [game, setGame] = useState<LevelState | null>(null)
  const [complete, setComplete] = useState(false)
  const [showLevelSelect, setShowLevelSelect] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setSvgSize({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (svgSize.w === 0 || svgSize.h === 0) return
    setComplete(false)
    setGame(buildLevel(LEVELS[Math.min(levelIdx, LEVELS.length - 1)], svgSize.w, svgSize.h, levelIdx))
  }, [svgSize, levelIdx])

  // 'd' key toggles level select
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd') setShowLevelSelect(v => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { w, h } = svgSize

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setGame(prev => {
      if (!prev || w === 0 || h === 0 || prev.flashError) return prev

      const solvedStarIds = new Set(
        prev.shapes.filter(s => prev.solved.has(s.id)).flatMap(s => s.starIds)
      )

      let bestId = -1, bestDist = HIT_R
      for (const star of prev.stars) {
        if (solvedStarIds.has(star.id)) continue
        const d = Math.hypot(star.nx * w - px, star.ny * h - py)
        if (d < bestDist) { bestDist = d; bestId = star.id }
      }
      if (bestId === -1) return prev

      const sel = prev.selected
      const isAnchor = sel.length > 0 && sel[0] === bestId
      const isAlreadySelected = sel.includes(bestId)

      // Tapping the anchor: attempt close or cancel
      if (isAnchor) {
        if (sel.length === 1) return { ...prev, selected: [] }

        const selSet = new Set(sel)
        const unsolved = prev.shapes.filter(s => !prev.solved.has(s.id))
        for (const shape of unsolved) {
          if (selSet.size !== shape.starIds.length) continue
          const shapeSet = new Set(shape.starIds)
          if ([...selSet].every(sid => shapeSet.has(sid))) {
            const newSolved = new Set(prev.solved)
            newSolved.add(shape.id)
            return { ...prev, selected: [], solved: newSolved }
          }
        }
        return { ...prev, flashError: true }
      }

      if (isAlreadySelected) return prev

      // Add star; auto-solve if selection now matches a shape
      const newSel = [...sel, bestId]
      const newSelSet = new Set(newSel)
      const unsolved = prev.shapes.filter(s => !prev.solved.has(s.id))
      for (const shape of unsolved) {
        if (newSelSet.size !== shape.starIds.length) continue
        const shapeSet = new Set(shape.starIds)
        if ([...newSelSet].every(sid => shapeSet.has(sid))) {
          const newSolved = new Set(prev.solved)
          newSolved.add(shape.id)
          return { ...prev, selected: [], solved: newSolved }
        }
      }

      return { ...prev, selected: newSel }
    })
  }, [w, h])

  // Clear error flash
  useEffect(() => {
    if (!game?.flashError) return
    flashTimerRef.current = setTimeout(() => {
      setGame(prev => prev ? { ...prev, selected: [], flashError: false } : prev)
    }, 450)
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }
  }, [game?.flashError])

  // Level complete
  useEffect(() => {
    if (!game) return
    if (game.shapes.length > 0 && game.solved.size === game.shapes.length) {
      const t = setTimeout(() => setComplete(true), 600)
      return () => clearTimeout(t)
    }
  }, [game])

  const starToShape = useMemo(() => {
    const m = new Map<number, Shape>()
    if (!game) return m
    for (const shape of game.shapes) {
      for (const id of shape.starIds) m.set(id, shape)
    }
    return m
  }, [game])

  const selectedSet = useMemo(() => new Set(game?.selected ?? []), [game?.selected])

  const solvedStarIds = useMemo(() =>
    game
      ? new Set(game.shapes.filter(s => game.solved.has(s.id)).flatMap(s => s.starIds))
      : new Set<number>(),
    [game]
  )

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: SKY, overflow: 'hidden', userSelect: 'none',
    }}>
      <svg
        ref={svgRef}
        style={{ flex: 1, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handleSvgPointerDown}
        aria-label="Constellation field"
      >
        <style>{`
          @keyframes twinkle {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.3; }
          }
          @keyframes fadeOut {
            from { opacity: 1; }
            to   { opacity: 0; }
          }
          .star-vis { animation: twinkle 3s ease-in-out infinite; }
        `}</style>

        {game?.shapes.filter(s => game.solved.has(s.id)).map(shape => (
          <SolvedFill key={shape.id} shape={shape} stars={game.stars} w={w} h={h} />
        ))}

        {/* Selection lines */}
        {game && game.selected.length >= 2 && (() => {
          const starById = new Map(game.stars.map(s => [s.id, s]))
          const selArr = game.selected.map(id => starById.get(id)!).filter(Boolean)
          const stroke = game.flashError ? 'rgba(255,100,160,0.35)' : 'rgba(255,220,80,0.25)'
          return selArr.map((s, i) => {
            if (i === 0) return null
            const p = selArr[i - 1]
            return (
              <line key={i}
                x1={p.nx * w} y1={p.ny * h} x2={s.nx * w} y2={s.ny * h}
                stroke={stroke} strokeWidth={1} style={{ pointerEvents: 'none' }}
              />
            )
          })
        })()}

        {game?.stars.map(star => {
          const px = star.nx * w
          const py = star.ny * h
          const isSel = selectedSet.has(star.id)
          const isAnchor = game.selected[0] === star.id
          const isSolved = solvedStarIds.has(star.id)
          const isFlash = isSel && game.flashError

          const shape = starToShape.get(star.id)
          const visualR = STAR_R * (shape ? shape.starBase : 1.0) * star.rMult
          const color = (isSolved && shape) ? shape.color : '#fff'
          const fillColor = isFlash
            ? 'rgba(255,110,170,0.95)'
            : isSel ? 'rgba(255,220,80,0.95)'
            : isSolved ? color : 'rgba(255,255,255,0.88)'

          const fadeStyle = star.fadeDelay !== undefined
            ? { animation: `fadeOut ${star.fadeDuration}s linear ${star.fadeDelay}s forwards` }
            : undefined

          return (
            <g key={star.id} style={{ pointerEvents: 'none', ...fadeStyle }}>
              {isSel && !isSolved && (
                <>
                  {isAnchor && game.selected.length >= 2 && (
                    <circle cx={px} cy={py} r={SEL_RING + 5} fill="none"
                      stroke={isFlash ? 'rgba(255,110,170,0.35)' : 'rgba(255,220,80,0.25)'}
                      strokeWidth={1} strokeDasharray="3 3"
                    />
                  )}
                  <circle cx={px} cy={py} r={SEL_RING} fill="none"
                    stroke={isFlash ? 'rgba(255,110,170,0.7)' : (isAnchor ? 'rgba(255,220,80,0.9)' : 'rgba(255,220,80,0.55)')}
                    strokeWidth={isAnchor ? 2 : 1.5}
                  />
                </>
              )}
              <circle className="star-vis"
                cx={px} cy={py}
                r={isSolved ? visualR * 1.15 : visualR}
                fill={fillColor}
                style={{
                  animationDelay: `${star.twinkleDelay}s`,
                  filter: isFlash ? 'drop-shadow(0 0 5px rgba(255,110,170,0.9))'
                    : isSel ? 'drop-shadow(0 0 4px rgba(255,220,80,0.85))'
                    : isSolved ? `drop-shadow(0 0 3px ${color}99)`
                    : undefined,
                }}
              />
            </g>
          )
        })}
      </svg>

      {/* Shape bank */}
      <div style={{
        flexShrink: 0, height: 68,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(6,9,26,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '0 16px', overflowX: 'auto',
      }}>
        {game?.shapes.map(shape => (
          <BankShape key={shape.id} shape={shape} solved={game.solved.has(shape.id)} />
        ))}
      </div>

      {/* Level complete overlay */}
      {complete && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(6,9,26,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 24, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
          }}>
            {levelIdx >= LEVELS.length - 1
              ? 'All constellations charted'
              : `Level ${levelIdx + 1} of ${LEVELS.length}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {game?.shapes.map((s, i) => (
              <span key={i} style={{ fontSize: 28, color: s.color }}>✦</span>
            ))}
          </div>
          {levelIdx < LEVELS.length - 1 ? (
            <button
              onPointerDown={() => setLevelIdx(i => i + 1)}
              style={{
                marginTop: 8, padding: '12px 32px',
                background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: '#fff', fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em',
                touchAction: 'manipulation',
              }}
            >
              Next level →
            </button>
          ) : (
            <button
              onPointerDown={() => setLevelIdx(0)}
              style={{
                marginTop: 8, padding: '12px 32px',
                background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: 'rgba(255,255,255,0.7)', fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em',
                touchAction: 'manipulation',
              }}
            >
              Play again
            </button>
          )}
        </div>
      )}

      {/* Level select (d key) */}
      {showLevelSelect && (
        <LevelSelect
          current={levelIdx}
          onSelect={i => { setLevelIdx(i); setComplete(false) }}
          onClose={() => setShowLevelSelect(false)}
        />
      )}
    </div>
  )
}
