import { useState, useRef, useEffect } from 'react'

// ── Config ────────────────────────────────────────────────

const STAR_R   = 5
const HIT_R    = 24
const SEL_RING = 13
const MARGIN   = 0.09

const SKY        = '#0e1a27'
const INK        = [238, 218, 160] as const
const SEL_RGB    = [255, 228, 100] as const
const ERR_RGB    = [210,  80, 110] as const
const BORDER_CLR = 'rgba(180, 152, 95, 0.65)'
const GRID_CLR   = 'rgba(110, 140, 175, 0.10)'
const BORDER_PAD = 20
const TICK_STEP  = 38
const TICK_LEN   = 5

const SHAPE_COLORS = ['#4adecd', '#a78bfa', '#fbbf24', '#f87171', '#34d399', '#60a5fa', '#fb923c']

// ── Types ─────────────────────────────────────────────────

interface ShapeDef {
  sides?: number
  type?: 'rect'
}

interface LevelDef {
  shapes: ShapeDef[]
  noise: number
  scaleMin: number
  scaleMax: number
  rectWRange: [number, number]
  rectHRange: [number, number]
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
  lev([3,3],         40,  0.10,0.28,  1.0,1.0,  [0.4,0.7],   [20, 70],  10),
  lev([3,3,3],       55,  0.09,0.34,  0.9,1.1,  [0.3,0.85],  [25, 90],  12),
  lev([3,3,3,3],     65,  0.07,0.40,  0.7,1.3,  [0.2,1.0],   [30,110],  14),
  lev([4,4],         45,  0.10,0.28,  1.0,1.0,  [0.4,0.7],   [25, 80],  10),
  lev([4,4,4],       60,  0.09,0.34,  0.9,1.1,  [0.3,0.85],  [30,110],  12),
  lev([4,4,4,4],     75,  0.07,0.40,  0.7,1.3,  [0.2,1.0],   [35,130],  14),
  lev([5,5,5],       65,  0.09,0.32,  0.9,1.1,  [0.3,0.85],  [30,120],  12),
  lev([5,5,5,5],     80,  0.07,0.40,  0.7,1.4,  [0.2,1.1],   [40,150],  15),
  rectLev(2, 40, [0.12,0.38], [0.08,0.26], [20, 70], 10),
  rectLev(3, 55, [0.12,0.42], [0.08,0.28], [25, 90], 12),
  rectLev(4, 70, [0.10,0.44], [0.07,0.30], [30,110], 14),
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
  aspectRatio?: number
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
      for (let attempt = 0; attempt < 300; attempt++) {
        const [wMin, wMax] = def.rectWRange
        const [hMin, hMax] = def.rectHRange
        let nw = wMin + rng() * (wMax - wMin)
        let nh = hMin + rng() * (hMax - hMin)

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

        if (cx - halfW < w * 0.04 || cx + halfW > w * 0.96) continue
        if (cy - halfH < h * 0.04 || cy + halfH > h * 0.96) continue

        const nRadius = Math.hypot(halfW, halfH) / minDim
        const overlaps = shapes.some(s => {
          const dx = (ncx - s.ncx) * w
          const dy = (ncy - s.ncy) * h
          return Math.hypot(dx, dy) < (nRadius + s.nRadius) * minDim * 1.1
        })
        if (overlaps) continue

        const verts = [
          { x: cx - halfW, y: cy - halfH },
          { x: cx + halfW, y: cy - halfH },
          { x: cx + halfW, y: cy + halfH },
          { x: cx - halfW, y: cy + halfH },
        ]

        const starIds: number[] = []
        for (const v of verts) {
          const star: Star = {
            id: nextId++, nx: v.x / w, ny: v.y / h,
            rMult: 0.82 + rng() * 0.36, twinkleDelay: rng() * -5,
          }
          cStars.push(star)
          starIds.push(star.id)
        }

        shapes.push({ id: si, sides: 4, shapeType: 'rect', aspectRatio, starIds, color, starBase, ncx, ncy, nRadius, rotation: 0 })
        break
      }
    } else {
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
            id: nextId++, nx: v.x / w, ny: v.y / h,
            rMult: 0.82 + rng() * 0.36, twinkleDelay: rng() * -5,
          }
          cStars.push(star)
          starIds.push(star.id)
        }

        shapes.push({ id: si, sides, shapeType: 'poly', starIds, color, starBase, ncx, ncy, nRadius, rotation })
        break
      }
    }
  }

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

// ── Chart draw helpers ────────────────────────────────────

function inkC(rgb: readonly [number, number, number], a: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

function drawStarGlyph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, opacity: number,
  rgb: readonly [number, number, number] = INK,
) {
  const col = inkC(rgb, opacity)
  ctx.strokeStyle = col
  ctx.lineCap = 'round'

  const mainLen = size * 4.5
  ctx.lineWidth = Math.max(0.4, size * 0.42)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * mainLen, y + Math.sin(a) * mainLen)
    ctx.stroke()
  }

  const diagLen = size * 2.8
  ctx.lineWidth = Math.max(0.3, size * 0.28)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * diagLen, y + Math.sin(a) * diagLen)
    ctx.stroke()
  }

  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, size * 0.85, 0, Math.PI * 2)
  ctx.fill()
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pad = BORDER_PAD + 7
  ctx.strokeStyle = GRID_CLR
  ctx.lineWidth = 0.5
  const cols = 8, rows = 6
  for (let i = 0; i <= cols; i++) {
    const x = pad + (w - pad * 2) * i / cols
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke()
  }
  for (let i = 0; i <= rows; i++) {
    const y = pad + (h - pad * 2) * i / rows
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke()
  }
}

function drawBorder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const b = BORDER_PAD
  ctx.strokeStyle = BORDER_CLR
  ctx.lineWidth = 1
  ctx.strokeRect(b, b, w - b * 2, h - b * 2)
  const b2 = b + 5
  ctx.lineWidth = 0.5
  ctx.strokeRect(b2, b2, w - b2 * 2, h - b2 * 2)
  ctx.lineWidth = 0.75
  for (let x = b + TICK_STEP; x < w - b; x += TICK_STEP) {
    ctx.beginPath(); ctx.moveTo(x, b); ctx.lineTo(x, b + TICK_LEN); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, h - b); ctx.lineTo(x, h - b - TICK_LEN); ctx.stroke()
  }
  for (let y = b + TICK_STEP; y < h - b; y += TICK_STEP) {
    ctx.beginPath(); ctx.moveTo(b, y); ctx.lineTo(b + TICK_LEN, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w - b, y); ctx.lineTo(w - b - TICK_LEN, y); ctx.stroke()
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.25, w/2, h/2, Math.max(w,h)*0.8)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

// ── Shape bank ────────────────────────────────────────────

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
      `${(x0+bw).toFixed(1)},${y0.toFixed(1)}`,
      `${(x0+bw).toFixed(1)},${(y0+bh).toFixed(1)}`,
      `${x0.toFixed(1)},${(y0+bh).toFixed(1)}`,
    ].join(' ')
  } else {
    const r = size * 0.36
    const rot = -Math.PI / 2 + (shape.sides % 2 === 0 ? Math.PI / shape.sides : 0)
    const pts = polyVerts(cx, cy, r, shape.sides, rot)
    pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  }

  const label = shape.shapeType === 'rect' ? 'rectangle'
    : ({ 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon' }[shape.sides] ?? `${shape.sides}-gon`)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      aria-label={`${solved ? 'Solved' : 'Find a'} ${label}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      <polygon
        points={pointsStr}
        fill={solved ? shape.color + '22' : 'none'}
        stroke={solved ? shape.color : 'rgba(180,152,95,0.5)'}
        strokeWidth={solved ? 1.5 : 1}
        style={{ transition: 'stroke 0.4s ease, fill 0.4s ease' }}
      />
    </svg>
  )
}

// ── Level select ──────────────────────────────────────────

function LevelSelect({ current, onSelect, onClose }: {
  current: number
  onSelect: (i: number) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(10,18,32,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: '32px 24px', overflowY: 'auto',
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        fontSize: 11, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'rgba(180,152,95,0.7)',
      }}>
        Tabulae Selectae
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 360 }}>
        {LEVEL_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontSize: 10, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'rgba(180,152,95,0.45)',
              marginBottom: 8,
            }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.indices.map(i => (
                <button key={i}
                  onPointerDown={() => { onSelect(i); onClose() }}
                  style={{
                    width: 44, height: 44,
                    border: i === current
                      ? '1px solid rgba(180,152,95,0.8)'
                      : '1px solid rgba(180,152,95,0.25)',
                    borderRadius: 0,
                    background: i === current ? 'rgba(180,152,95,0.1)' : 'none',
                    color: i === current ? 'rgba(238,218,160,0.9)' : 'rgba(180,152,95,0.5)',
                    fontSize: 13,
                    fontFamily: 'Georgia, "Times New Roman", serif',
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

// ── Main component ────────────────────────────────────────

export default function Constellations() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [game, setGame] = useState<LevelState | null>(null)
  const [complete, setComplete] = useState(false)
  const [showLevelSelect, setShowLevelSelect] = useState(false)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const gameRef     = useRef<LevelState | null>(null)
  const sizeRef     = useRef({ w: 0, h: 0 })
  const levelStart  = useRef(0)
  const flashTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirror game state to ref for RAF loop
  useEffect(() => { gameRef.current = game }, [game])

  // Build level when canvas size or level changes
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (canvasSize.w === 0 || canvasSize.h === 0) return
    setComplete(false)
    levelStart.current = performance.now() / 1000
    setGame(buildLevel(LEVELS[Math.min(levelIdx, LEVELS.length - 1)], canvasSize.w, canvasSize.h, levelIdx))
  }, [canvasSize, levelIdx])

  // Level complete detection
  useEffect(() => {
    if (!game || game.shapes.length === 0) return
    if (game.solved.size === game.shapes.length) {
      completeTimer.current = setTimeout(() => setComplete(true), 600)
      return () => { if (completeTimer.current) clearTimeout(completeTimer.current) }
    }
  }, [game])

  // Flash error clear
  useEffect(() => {
    if (!game?.flashError) return
    flashTimer.current = setTimeout(() => {
      setGame(prev => prev ? { ...prev, selected: [], flashError: false } : prev)
    }, 450)
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current) }
  }, [game?.flashError])

  // 'd' key for level select
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'd') setShowLevelSelect(v => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Canvas RAF loop + resize + pointer
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    function draw(nowMs: number) {
      const { w, h } = sizeRef.current
      if (w === 0) return
      const game = gameRef.current
      const nowSec = nowMs / 1000

      ctx.fillStyle = SKY
      ctx.fillRect(0, 0, w, h)
      drawGrid(ctx, w, h)

      if (game) {
        const starById = new Map(game.stars.map(s => [s.id, s]))
        const starToShape = new Map<number, Shape>()
        for (const shape of game.shapes) {
          for (const id of shape.starIds) starToShape.set(id, shape)
        }
        const selectedSet = new Set(game.selected)
        const solvedStarIds = new Set(
          game.shapes.filter(s => game.solved.has(s.id)).flatMap(s => s.starIds)
        )

        // Solved shape fills
        for (const shape of game.shapes) {
          if (!game.solved.has(shape.id)) continue
          const pts = shape.starIds.map(id => starById.get(id)!).filter(Boolean)
          if (pts.length < 2) continue
          const [r, g, b] = hexRgb(shape.color)
          ctx.beginPath()
          ctx.moveTo(pts[0].nx * w, pts[0].ny * h)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].nx * w, pts[i].ny * h)
          ctx.closePath()
          ctx.fillStyle = `rgba(${r},${g},${b},0.08)`
          ctx.fill()
          ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`
          ctx.lineWidth = 0.75
          ctx.stroke()
        }

        // Selection lines
        if (game.selected.length >= 2) {
          const selStars = game.selected.map(id => starById.get(id)!).filter(Boolean)
          const lineRgb = game.flashError ? ERR_RGB : SEL_RGB
          ctx.strokeStyle = inkC(lineRgb, 0.3)
          ctx.lineWidth = 0.75
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(selStars[0].nx * w, selStars[0].ny * h)
          for (let i = 1; i < selStars.length; i++) ctx.lineTo(selStars[i].nx * w, selStars[i].ny * h)
          ctx.stroke()
        }

        // Stars
        for (const star of game.stars) {
          const px = star.nx * w
          const py = star.ny * h
          const isSel     = selectedSet.has(star.id)
          const isAnchor  = game.selected[0] === star.id
          const isSolved  = solvedStarIds.has(star.id)
          const isFlash   = isSel && game.flashError
          const shape     = starToShape.get(star.id)

          // Twinkle
          const twinkle = 0.5 + 0.5 * Math.sin(nowSec * (2 * Math.PI / 3) + star.twinkleDelay * 2)
          let opacity = 0.6 + 0.4 * twinkle

          // Noise fade
          if (star.fadeDelay !== undefined && star.fadeDuration !== undefined) {
            const elapsed = nowSec - levelStart.current
            if (elapsed >= star.fadeDelay + star.fadeDuration) opacity = 0
            else if (elapsed > star.fadeDelay) opacity *= 1 - (elapsed - star.fadeDelay) / star.fadeDuration
          }

          if (opacity < 0.01) continue

          const starSize = Math.max(0.5, STAR_R * (shape ? shape.starBase : 1.0) * star.rMult / 2.5)

          // Selection ring
          if (isSel && !isSolved) {
            const ringRgb = isFlash ? ERR_RGB : SEL_RGB
            ctx.strokeStyle = inkC(ringRgb, isAnchor ? 0.85 : 0.55)
            ctx.lineWidth = isAnchor ? 1.5 : 1
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.arc(px, py, SEL_RING, 0, Math.PI * 2)
            ctx.stroke()

            if (isAnchor && game.selected.length >= 2) {
              ctx.strokeStyle = inkC(ringRgb, 0.25)
              ctx.lineWidth = 0.75
              ctx.setLineDash([3, 3])
              ctx.beginPath()
              ctx.arc(px, py, SEL_RING + 6, 0, Math.PI * 2)
              ctx.stroke()
              ctx.setLineDash([])
            }
          }

          // Star color
          let rgb: readonly [number, number, number]
          if (isFlash)         rgb = ERR_RGB
          else if (isSel)      rgb = SEL_RGB
          else if (isSolved && shape) rgb = hexRgb(shape.color)
          else                 rgb = INK

          drawStarGlyph(ctx, px, py, starSize, opacity, rgb)
        }
      }

      drawVignette(ctx, w, h)
      drawBorder(ctx, w, h)
    }

    let rafId = 0
    function loop(ts: number) { draw(ts); rafId = requestAnimationFrame(loop) }
    rafId = requestAnimationFrame(loop)

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      sizeRef.current = { w: width, h: height }
      canvas.width  = width  * devicePixelRatio
      canvas.height = height * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      setCanvasSize({ w: width, h: height })
    })
    ro.observe(canvas)

    function onPointer(e: PointerEvent) {
      e.preventDefault()
      const { w, h } = sizeRef.current
      const game = gameRef.current
      if (!game || w === 0 || h === 0 || game.flashError) return

      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      const solvedStarIds = new Set(
        game.shapes.filter(s => game.solved.has(s.id)).flatMap(s => s.starIds)
      )

      let bestId = -1, bestDist = HIT_R
      for (const star of game.stars) {
        if (solvedStarIds.has(star.id)) continue
        const d = Math.hypot(star.nx * w - px, star.ny * h - py)
        if (d < bestDist) { bestDist = d; bestId = star.id }
      }
      if (bestId === -1) return

      setGame(prev => {
        if (!prev) return prev
        const sel = prev.selected
        const isAnchor = sel.length > 0 && sel[0] === bestId

        if (isAnchor) {
          if (sel.length === 1) return { ...prev, selected: [] }
          const selSet = new Set(sel)
          const unsolved = prev.shapes.filter(s => !prev.solved.has(s.id))
          for (const shape of unsolved) {
            if (selSet.size !== shape.starIds.length) continue
            if ([...selSet].every(sid => new Set(shape.starIds).has(sid))) {
              const newSolved = new Set(prev.solved)
              newSolved.add(shape.id)
              return { ...prev, selected: [], solved: newSolved }
            }
          }
          return { ...prev, flashError: true }
        }

        if (sel.includes(bestId)) return prev

        const newSel = [...sel, bestId]
        const newSelSet = new Set(newSel)
        const unsolved = prev.shapes.filter(s => !prev.solved.has(s.id))
        for (const shape of unsolved) {
          if (newSelSet.size !== shape.starIds.length) continue
          if ([...newSelSet].every(sid => new Set(shape.starIds).has(sid))) {
            const newSolved = new Set(prev.solved)
            newSolved.add(shape.id)
            return { ...prev, selected: [], solved: newSolved }
          }
        }

        return { ...prev, selected: newSel }
      })
    }

    canvas.addEventListener('pointerdown', onPointer)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: SKY, overflow: 'hidden', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
      />

      {/* Shape bank */}
      <div style={{
        flexShrink: 0, height: 68,
        borderTop: '1px solid rgba(180,152,95,0.3)',
        background: 'rgba(10,18,32,0.96)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '0 16px', overflowX: 'auto',
      }}>
        {game?.shapes.map(shape => (
          <BankShape key={shape.id} shape={shape} solved={game.solved.has(shape.id)} />
        ))}
      </div>

      {/* Level complete */}
      {complete && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10,18,32,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            padding: '28px 44px',
            border: '1px solid rgba(180,152,95,0.65)',
            boxShadow: 'inset 0 0 0 1px rgba(180,152,95,0.2)',
            background: 'rgba(10,18,32,0.7)',
          }}>
            <span style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontSize: 11, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(180,152,95,0.75)',
            }}>
              {levelIdx >= LEVELS.length - 1 ? 'Caelum Perfectum' : `Tabula ${levelIdx + 1} · Observata`}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {game?.shapes.map((s, i) => (
                <svg key={i} width={18} height={18} viewBox="0 0 18 18">
                  <circle cx={9} cy={9} r={3} fill={s.color} opacity={0.9} />
                  {[0,1,2,3].map(j => {
                    const a = j * Math.PI / 2
                    return <line key={j} x1={9} y1={9} x2={9 + Math.cos(a)*7} y2={9 + Math.sin(a)*7} stroke={s.color} strokeWidth={0.75} opacity={0.7} />
                  })}
                </svg>
              ))}
            </div>
            {levelIdx < LEVELS.length - 1 ? (
              <button
                onPointerDown={() => { setLevelIdx(i => i + 1); setComplete(false) }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(180,152,95,0.5)',
                  color: 'rgba(238,218,160,0.9)',
                  padding: '9px 24px',
                  fontSize: 13,
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontStyle: 'italic',
                  letterSpacing: '0.1em',
                  borderRadius: 0, cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                Tabula Sequens →
              </button>
            ) : (
              <button
                onPointerDown={() => { setLevelIdx(0); setComplete(false) }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(180,152,95,0.5)',
                  color: 'rgba(238,218,160,0.75)',
                  padding: '9px 24px',
                  fontSize: 13,
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontStyle: 'italic',
                  letterSpacing: '0.1em',
                  borderRadius: 0, cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                Ab Initio →
              </button>
            )}
          </div>
        </div>
      )}

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
