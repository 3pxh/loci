import { useCallback, useEffect, useRef, useState } from 'react'

// ── Config ────────────────────────────────────────────────

const SKY = '#06091a'
const STAR_COUNT = 20
const HIT_R = 28

function levelPersistentCount(level: number) {
  return Math.min(3 + level, 12)
}

// ── Types ─────────────────────────────────────────────────

interface Star {
  x: number
  y: number
  size: number
  persistent: boolean
  collected: boolean
  phase: number   // radians
  period: number  // seconds
  collectTime: number | null  // ms
}

// ── Helpers ───────────────────────────────────────────────

function makeStars(level: number, w: number, h: number): Star[] {
  const nP = levelPersistentCount(level)
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    const persistent = i < nP
    return {
      x: 24 + Math.random() * (w - 48),
      y: 24 + Math.random() * (h - 48),
      size: 1.4 + Math.random() * 1.6,
      persistent,
      collected: false,
      phase: Math.random() * Math.PI * 2,
      period: 2.5 + Math.random() * 5,
      collectTime: null,
    }
  })
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

      for (const star of stars) {
        // Collect burst
        if (star.collected) {
          if (star.collectTime !== null) {
            const age = (nowMs - star.collectTime) / 1000
            const D = 0.8
            if (age < D) {
              for (let ring = 0; ring < 3; ring++) {
                const rt = Math.max(0, (age / D) - ring * 0.12)
                if (rt <= 0) continue
                const r = star.size + rt * 22
                const a = (1 - rt) * 0.75
                ctx.beginPath()
                ctx.arc(star.x, star.y, r, 0, Math.PI * 2)
                ctx.strokeStyle = `rgba(255, 215, 90, ${a.toFixed(2)})`
                ctx.lineWidth = 1.5 * (1 - rt)
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

        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(190, 210, 255, ${opacity.toFixed(3)})`
        ctx.fill()
      }

      if (levelComplete && !state.buttonShown) {
        const elapsed = nowSec - levelCompleteTime
        if (elapsed > 1.8) {
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255, 235, 150, 0.7)',
          }}>
            Level {displayLevel + 1} complete
          </span>
          <button
            onClick={handleNextLevel}
            style={{
              pointerEvents: 'all',
              background: 'transparent',
              border: '1px solid rgba(255, 235, 150, 0.45)',
              color: 'rgba(255, 235, 150, 0.9)',
              padding: '11px 28px',
              fontSize: 15,
              fontFamily: 'system-ui, sans-serif',
              letterSpacing: '0.06em',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Next level →
          </button>
        </div>
      )}
    </div>
  )
}
