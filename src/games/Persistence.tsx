import { useCallback, useEffect, useRef, useState } from 'react'

// ── Config ────────────────────────────────────────────────

const SKY        = '#0e1a27'
const INK        = [238, 218, 160] as const
const BORDER_CLR = 'rgba(180, 152, 95, 0.65)'
const GRID_CLR   = 'rgba(110, 140, 175, 0.10)'
const BORDER_PAD = 20
const TICK_STEP  = 38
const TICK_LEN   = 5
const STAR_COUNT = 20
const HIT_R      = 28

const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω']

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']

function levelPersistentCount(level: number) {
  return Math.min(3 + level, 12)
}

// ── Types ─────────────────────────────────────────────────

interface Star {
  x: number
  y: number
  size: number
  label: string
  persistent: boolean
  collected: boolean
  phase: number
  period: number
  collectTime: number | null
}

// ── Draw helpers ──────────────────────────────────────────

function ink(a: number) {
  return `rgba(${INK[0]},${INK[1]},${INK[2]},${a.toFixed(3)})`
}

function drawStarGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number) {
  const col = ink(opacity)
  ctx.strokeStyle = col
  ctx.lineCap = 'round'

  // cardinal spikes
  const mainLen = size * 4.5
  ctx.lineWidth = Math.max(0.4, size * 0.42)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * mainLen, y + Math.sin(a) * mainLen)
    ctx.stroke()
  }

  // diagonal spikes
  const diagLen = size * 2.8
  ctx.lineWidth = Math.max(0.3, size * 0.28)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * diagLen, y + Math.sin(a) * diagLen)
    ctx.stroke()
  }

  // core disc
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

  // outer rule
  ctx.lineWidth = 1
  ctx.strokeRect(b, b, w - b * 2, h - b * 2)

  // inner rule
  const b2 = b + 5
  ctx.lineWidth = 0.5
  ctx.strokeRect(b2, b2, w - b2 * 2, h - b2 * 2)

  // tick marks pointing inward from outer rule
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
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.8)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

// ── Helpers ───────────────────────────────────────────────

function makeStars(level: number, w: number, h: number): Star[] {
  const nP = levelPersistentCount(level)
  const margin = BORDER_PAD + 30
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    x: margin + Math.random() * (w - margin * 2),
    y: margin + Math.random() * (h - margin * 2),
    size: 1.4 + Math.random() * 1.6,
    label: GREEK[i % GREEK.length],
    persistent: i < nP,
    collected: false,
    phase: Math.random() * Math.PI * 2,
    period: 2.5 + Math.random() * 5,
    collectTime: null,
  }))
}

// ── Component ─────────────────────────────────────────────

export default function Persistence() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    stars: [] as Star[],
    level: 0,
    levelComplete: false,
    levelCompleteTime: 0,
    buttonShown: false,
    w: 0,
    h: 0,
  })
  const [showButton, setShowButton] = useState(false)
  const [displayLevel, setDisplayLevel] = useState(0)

  const initLevel = useCallback((lv: number, w: number, h: number) => {
    const s = stateRef.current
    s.stars = makeStars(lv, w, h)
    s.level = lv
    s.levelComplete = false
    s.levelCompleteTime = 0
    s.buttonShown = false
    setShowButton(false)
    setDisplayLevel(lv)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const state = stateRef.current

    function draw(nowMs: number) {
      if (state.w === 0) return
      const nowSec = nowMs / 1000
      const { w, h, stars, levelComplete, levelCompleteTime } = state

      ctx.fillStyle = SKY
      ctx.fillRect(0, 0, w, h)

      drawGrid(ctx, w, h)

      ctx.font = `italic 10px Georgia, "Times New Roman", serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      for (const star of stars) {
        if (star.collected) {
          if (star.collectTime !== null) {
            const age = (nowMs - star.collectTime) / 1000
            const D = 1.0
            if (age < D) {
              const t = age / D
              const maxLen = 28
              const a = (1 - t) * 0.65
              ctx.strokeStyle = ink(a)
              ctx.lineWidth = 0.75
              ctx.lineCap = 'round'
              for (let i = 0; i < 4; i++) {
                const angle = i * Math.PI / 2
                const inner = star.size + t * maxLen * 0.2
                const outer = star.size + t * maxLen
                ctx.beginPath()
                ctx.moveTo(star.x + Math.cos(angle) * inner, star.y + Math.sin(angle) * inner)
                ctx.lineTo(star.x + Math.cos(angle) * outer, star.y + Math.sin(angle) * outer)
                ctx.stroke()
              }
            }
          }
          continue
        }

        const raw = 0.5 + 0.5 * Math.sin(nowSec / star.period * 2 * Math.PI + star.phase)
        let opacity: number
        if (star.persistent) {
          opacity = 1
        } else if (levelComplete) {
          const elapsed = nowSec - levelCompleteTime
          opacity = raw * Math.max(0, 1 - elapsed / 1.5)
        } else {
          opacity = raw
        }

        if (opacity < 0.01) continue

        drawStarGlyph(ctx, star.x, star.y, star.size, opacity)

        if (opacity * 0.55 > 0.05) {
          ctx.fillStyle = ink(opacity * 0.55)
          ctx.fillText(star.label, star.x + star.size * 5 + 3, star.y + star.size * 3)
        }
      }

      drawVignette(ctx, w, h)
      drawBorder(ctx, w, h)

      if (levelComplete && !state.buttonShown) {
        if (nowSec - levelCompleteTime > 1.8) {
          state.buttonShown = true
          setShowButton(true)
        }
      }
    }

    let rafId = 0
    function loop(ts: number) { draw(ts); rafId = requestAnimationFrame(loop) }
    rafId = requestAnimationFrame(loop)

    function onResize(entries: ResizeObserverEntry[]) {
      const { width, height } = entries[0].contentRect
      state.w = width
      state.h = height
      canvas.width = width * devicePixelRatio
      canvas.height = height * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      if (state.stars.length === 0) initLevel(0, width, height)
    }

    const ro = new ResizeObserver(onResize)
    ro.observe(canvas)

    function onPointer(e: PointerEvent) {
      e.preventDefault()
      if (state.levelComplete) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      for (const star of state.stars) {
        if (!star.persistent || star.collected) continue
        if (Math.hypot(star.x - px, star.y - py) <= HIT_R) {
          star.collected = true
          star.collectTime = performance.now()
          const allDone = state.stars.filter(s => s.persistent).every(s => s.collected)
          if (allDone) {
            state.levelComplete = true
            state.levelCompleteTime = performance.now() / 1000
          }
          break
        }
      }
    }

    canvas.addEventListener('pointerdown', onPointer)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [initLevel])

  function handleNextLevel() {
    const s = stateRef.current
    initLevel(s.level + 1, s.w, s.h)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
      />
      {showButton && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            padding: '24px 40px',
            background: 'rgba(14, 26, 39, 0.9)',
            border: '1px solid rgba(180, 152, 95, 0.65)',
            outline: '4px solid rgba(14, 26, 39, 0.9)',
            outlineOffset: '-8px',
            boxShadow: 'inset 0 0 0 1px rgba(180, 152, 95, 0.25)',
          }}>
            <span style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontSize: 11,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: 'rgba(180, 152, 95, 0.8)',
            }}>
              Observatum · Charta {ROMAN[displayLevel] ?? displayLevel + 1}
            </span>
            <button
              onClick={handleNextLevel}
              style={{
                pointerEvents: 'all',
                background: 'transparent',
                border: '1px solid rgba(180, 152, 95, 0.5)',
                color: 'rgba(238, 218, 160, 0.9)',
                padding: '9px 24px',
                fontSize: 13,
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontStyle: 'italic',
                letterSpacing: '0.1em',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              Charta Sequens →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
