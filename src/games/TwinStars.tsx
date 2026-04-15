import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// ── Config ────────────────────────────────────────────────

const STAR_R = 7
const HIT_R = 38
const SEL_RING = 16
const SKY = '#06091a'
const GROUP_COLORS = ['#4adecd', '#a78bfa', '#fbbf24', '#f87171', '#34d399', '#60a5fa', '#fb923c']
const MARGIN = 0.08

// ── Structure library ─────────────────────────────────────

interface StructureDef {
  n: number
  edges: [number, number][]
}

const STRUCTS: StructureDef[] = [
  { n: 3, edges: [[0,1],[1,2]] },                               // 0  path-3
  { n: 3, edges: [[0,1],[1,2],[0,2]] },                         // 1  triangle
  { n: 4, edges: [[0,1],[1,2],[2,3]] },                         // 2  path-4
  { n: 4, edges: [[0,1],[0,2],[0,3]] },                         // 3  star-4
  { n: 4, edges: [[0,1],[1,2],[2,3],[3,0]] },                   // 4  square
  { n: 4, edges: [[0,1],[0,2],[1,3],[2,3]] },                   // 5  diamond
  { n: 5, edges: [[0,1],[1,2],[2,3],[3,4]] },                   // 6  path-5
  { n: 5, edges: [[0,1],[1,2],[2,3],[3,4],[4,0]] },             // 7  pentagon
  { n: 5, edges: [[0,1],[0,2],[0,3],[0,4]] },                   // 8  star-5
  { n: 5, edges: [[0,1],[0,2],[1,2],[2,3],[3,4]] },             // 9  house
  { n: 6, edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]] },       // 10 hexagon
  { n: 6, edges: [[0,1],[0,2],[1,2],[3,4],[3,5],[4,5],[0,3]] }, // 11 two-triangles
]

// ── Automorphisms (cached) ────────────────────────────────

const _autoCache = new Map<number, number[][]>()

function getAutos(sIdx: number): number[][] {
  if (_autoCache.has(sIdx)) return _autoCache.get(sIdx)!
  const { n, edges } = STRUCTS[sIdx]
  const adj = Array.from({ length: n }, () => new Set<number>())
  for (const [a, b] of edges) { adj[a].add(b); adj[b].add(a) }

  const result: number[][] = []
  const perm = Array.from({ length: n }, (_, i) => i)

  function bt(k: number) {
    if (k === n) {
      for (const [a, b] of edges) if (!adj[perm[a]].has(perm[b])) return
      result.push([...perm])
      return
    }
    for (let i = k; i < n; i++) {
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
      bt(k + 1)
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
    }
  }
  bt(0)
  _autoCache.set(sIdx, result)
  return result
}

// ── Seeded RNG ────────────────────────────────────────────

function mkRng(seed: number) {
  let s = ((seed % 2147483647) + 2147483647) % 2147483647 || 1
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

// ── Force-directed layout ─────────────────────────────────

function forceLayout(sIdx: number, seed: number): { x: number; y: number }[] {
  const { n, edges } = STRUCTS[sIdx]
  const rng = mkRng(seed)
  const pos = Array.from({ length: n }, (_, i) => ({
    x: Math.cos(2 * Math.PI * i / Math.max(n, 3)) * 0.4 + (rng() - 0.5) * 0.12,
    y: Math.sin(2 * Math.PI * i / Math.max(n, 3)) * 0.4 + (rng() - 0.5) * 0.12,
  }))

  const idealLen = n <= 3 ? 0.55 : n <= 4 ? 0.50 : n <= 5 ? 0.45 : 0.40

  for (let iter = 0; iter < 200; iter++) {
    const fx = new Float32Array(n)
    const fy = new Float32Array(n)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j].x - pos[i].x
        const dy = pos[j].y - pos[i].y
        const d2 = dx * dx + dy * dy + 0.0001
        const d = Math.sqrt(d2)
        const f = 0.06 / d2
        fx[i] -= f * dx / d;  fy[i] -= f * dy / d
        fx[j] += f * dx / d;  fy[j] += f * dy / d
      }
    }

    for (const [a, b] of edges) {
      const dx = pos[b].x - pos[a].x
      const dy = pos[b].y - pos[a].y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.0001
      const f = (d - idealLen) * 0.25
      fx[a] += f * dx / d;  fy[a] += f * dy / d
      fx[b] -= f * dx / d;  fy[b] -= f * dy / d
    }

    const step = Math.max(0.03, 0.15 * (1 - iter / 200))
    for (let i = 0; i < n; i++) {
      pos[i].x += fx[i] * step
      pos[i].y += fy[i] * step
    }
    const cx = pos.reduce((s, p) => s + p.x, 0) / n
    const cy = pos.reduce((s, p) => s + p.y, 0) / n
    for (const p of pos) { p.x -= cx; p.y -= cy }
  }

  // Normalize to [-0.5, 0.5]
  const maxR = Math.max(0.01, ...pos.map(p => Math.abs(p.x)), ...pos.map(p => Math.abs(p.y)))
  for (const p of pos) { p.x /= maxR * 2; p.y /= maxR * 2 }
  return pos
}

// Canonical layout for group thumbnails (fixed seed per structure)
const _layoutCache = new Map<number, { x: number; y: number }[]>()
function canonicalLayout(sIdx: number) {
  if (!_layoutCache.has(sIdx)) _layoutCache.set(sIdx, forceLayout(sIdx, 99991))
  return _layoutCache.get(sIdx)!
}

// ── Level definitions ─────────────────────────────────────

interface IsoLevelDef {
  groups: number[]           // indices into STRUCTS
  scale: [number, number]    // cluster radius as fraction of min(w,h)
  noise: number
  fadeRange: [number, number]
  fadeDuration: number
}

const LEVELS: IsoLevelDef[] = [
  // ── Tutorial: 1 group, no noise ────────────────────────────────────────────
  { groups: [0],           scale: [0.13, 0.16], noise: 0,  fadeRange: [999,9999], fadeDuration: 1  },
  { groups: [1],           scale: [0.13, 0.16], noise: 0,  fadeRange: [999,9999], fadeDuration: 1  },
  { groups: [3],           scale: [0.14, 0.18], noise: 0,  fadeRange: [999,9999], fadeDuration: 1  },
  // ── 2 groups ────────────────────────────────────────────────────────────────
  { groups: [0, 1],        scale: [0.13, 0.18], noise: 10, fadeRange: [50, 100],  fadeDuration: 12 },
  { groups: [2, 3],        scale: [0.14, 0.20], noise: 15, fadeRange: [45,  95],  fadeDuration: 12 },
  { groups: [4, 5],        scale: [0.14, 0.21], noise: 20, fadeRange: [40,  90],  fadeDuration: 14 },
  // ── 3 groups ────────────────────────────────────────────────────────────────
  { groups: [0, 1, 3],     scale: [0.14, 0.22], noise: 25, fadeRange: [40,  90],  fadeDuration: 14 },
  { groups: [2, 5, 7],     scale: [0.15, 0.25], noise: 30, fadeRange: [35,  85],  fadeDuration: 14 },
  { groups: [6, 7, 8],     scale: [0.15, 0.27], noise: 35, fadeRange: [35,  80],  fadeDuration: 15 },
  // ── 4–6 groups ──────────────────────────────────────────────────────────────
  { groups: [0, 3, 5, 9],          scale: [0.15, 0.27], noise: 40, fadeRange: [30, 80], fadeDuration: 15 },
  { groups: [1, 3, 6, 7, 10],      scale: [0.16, 0.30], noise: 50, fadeRange: [30, 80], fadeDuration: 16 },
  { groups: [2, 4, 6, 8, 10, 11],  scale: [0.16, 0.32], noise: 60, fadeRange: [30, 80], fadeDuration: 18 },
]

const LEVEL_GROUPS_META = [
  { label: 'Tutorial',  indices: [0, 1, 2] },
  { label: 'Pairs',     indices: [3, 4, 5] },
  { label: 'Triples',   indices: [6, 7, 8] },
  { label: 'Advanced',  indices: [9, 10, 11] },
]

// ── Game types ────────────────────────────────────────────

interface GNode {
  id: number
  nx: number; ny: number
  rMult: number
  twinkleDelay: number
  groupId?: number
  copyIdx?: 0 | 1
  localId?: number
  fadeDelay?: number
  fadeDuration?: number
}

interface GEdge {
  fromId: number; toId: number
  groupId: number; copyIdx: 0 | 1
}

interface GGroup {
  id: number
  structIdx: number
  color: string
  ids: [number[], number[]]   // ids[copyIdx][localId] = global node id
  isos: number[][]            // remaining valid isomorphisms: iso[local0] = local1
  matched: Map<number, number> // local0 → local1
}

interface GameState {
  nodes: GNode[]
  edges: GEdge[]
  groups: GGroup[]
  pending: number | null
  flashError: boolean
}

// ── Level builder ─────────────────────────────────────────

function buildLevel(def: IsoLevelDef, w: number, h: number, levelIdx: number): GameState {
  const rng = mkRng(levelIdx * 31337 + Math.round(w) * 7 + Math.round(h) * 3)
  const minDim = Math.min(w, h)
  let nextId = 0
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const groups: GGroup[] = []
  // Track cluster centers for placement overlap detection
  const placed: { nx: number; ny: number; r: number }[] = []

  for (let gi = 0; gi < def.groups.length; gi++) {
    const structIdx = def.groups[gi]
    const sdef = STRUCTS[structIdx]
    const color = GROUP_COLORS[gi % GROUP_COLORS.length]
    const isos = getAutos(structIdx)
    const gIds: [number[], number[]] = [[], []]

    for (const ci of [0, 1] as const) {
      const scale = def.scale[0] + rng() * (def.scale[1] - def.scale[0])
      const rPx = scale * minDim
      // Padding ensures no node goes outside MARGIN (layout is normalised to [-0.5, 0.5])
      const xPad = MARGIN + rPx / w
      const yPad = MARGIN + rPx / h

      // Find non-overlapping placement
      let ncx = 0.5, ncy = 0.5
      for (let att = 0; att < 300; att++) {
        ncx = xPad + rng() * (1 - 2 * xPad)
        ncy = yPad + rng() * (1 - 2 * yPad)
        const ok = !placed.some(p => {
          const dx = (ncx - p.nx) * w
          const dy = (ncy - p.ny) * h
          return Math.hypot(dx, dy) < (rPx + p.r * minDim) * 1.4
        })
        if (ok) break
      }
      // Safety clamp
      ncx = Math.max(xPad, Math.min(1 - xPad, ncx))
      ncy = Math.max(yPad, Math.min(1 - yPad, ncy))
      placed.push({ nx: ncx, ny: ncy, r: rPx / minDim })

      // Different seeds → different layouts for the two copies
      const layoutSeed = levelIdx * 2000 + gi * 20 + ci + 1
      const lpos = forceLayout(structIdx, layoutSeed)

      // Random rotation for this copy
      const angle = rng() * Math.PI * 2
      const cosA = Math.cos(angle), sinA = Math.sin(angle)

      for (let li = 0; li < sdef.n; li++) {
        const lp = lpos[li]
        const rx = lp.x * cosA - lp.y * sinA
        const ry = lp.x * sinA + lp.y * cosA
        const id = nextId++
        nodes.push({
          id,
          nx: Math.max(MARGIN, Math.min(1 - MARGIN, ncx + rx * rPx * 2 / w)),
          ny: Math.max(MARGIN, Math.min(1 - MARGIN, ncy + ry * rPx * 2 / h)),
          rMult: 0.88 + rng() * 0.28,
          twinkleDelay: rng() * -5,
          groupId: gi,
          copyIdx: ci,
          localId: li,
        })
        gIds[ci][li] = id
      }

      for (const [a, b] of sdef.edges) {
        edges.push({ fromId: gIds[ci][a], toId: gIds[ci][b], groupId: gi, copyIdx: ci })
      }
    }

    groups.push({ id: gi, structIdx, color, ids: gIds, isos: [...isos], matched: new Map() })
  }

  // Noise stars
  const structNodes = nodes.filter(n => n.groupId !== undefined)
  const noiseNodes: GNode[] = []
  for (let i = 0; i < def.noise; i++) {
    let nx = 0, ny = 0
    for (let att = 0; att < 30; att++) {
      nx = 0.03 + rng() * 0.94
      ny = 0.03 + rng() * 0.94
      if (!structNodes.some(s => Math.hypot((nx - s.nx) * w, (ny - s.ny) * h) < STAR_R * 3)) break
    }
    noiseNodes.push({
      id: nextId++, nx, ny,
      rMult: 0.3 + rng() * 0.65,
      twinkleDelay: rng() * -5,
      fadeDelay: def.fadeRange[0] + rng() * (def.fadeRange[1] - def.fadeRange[0]),
      fadeDuration: def.fadeDuration,
    })
  }

  const allNodes = [...nodes, ...noiseNodes]
  for (let i = allNodes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[allNodes[i], allNodes[j]] = [allNodes[j], allNodes[i]]
  }

  return { nodes: allNodes, edges, groups, pending: null, flashError: false }
}

// ── Match logic ───────────────────────────────────────────

function applyMatch(state: GameState, gId: number, local0: number, local1: number): GameState {
  const group = state.groups.find(g => g.id === gId)!
  const validIsos = group.isos.filter(iso => iso[local0] === local1)
  if (validIsos.length === 0) return state
  // One valid pair immediately solves the whole group using the first consistent automorphism
  const iso = validIsos[0]
  const n = STRUCTS[group.structIdx].n
  const newMatched = new Map<number, number>()
  for (let i = 0; i < n; i++) newMatched.set(i, iso[i])
  const newGroup = { ...group, isos: validIsos, matched: newMatched }
  const newGroups = state.groups.map(g => g.id === gId ? newGroup : g)
  return { ...state, groups: newGroups, pending: null }
}

// ── Group thumbnail ───────────────────────────────────────

function GroupThumb({ group, matchedCount }: { group: GGroup; matchedCount: number }) {
  const sz = 40
  const pad = 6
  const sdef = STRUCTS[group.structIdx]
  const total = sdef.n
  const solved = matchedCount === total
  const layout = canonicalLayout(group.structIdx)
  const pts = layout.map(p => ({
    x: (p.x + 0.5) * (sz - pad * 2) + pad,
    y: (p.y + 0.5) * (sz - pad * 2) + pad,
  }))
  const stroke = solved ? group.color : 'rgba(255,255,255,0.2)'
  const fill = solved ? group.color : 'rgba(255,255,255,0.35)'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ overflow: 'visible' }}>
        {sdef.edges.map(([a, b], i) => (
          <line key={i}
            x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y}
            stroke={stroke} strokeWidth={1}
            style={{ transition: 'stroke 0.4s' }}
          />
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={fill}
            style={{ transition: 'fill 0.4s' }}
          />
        ))}
      </svg>
      {!solved && (
        <div style={{
          position: 'absolute', bottom: -2, right: 0,
          fontSize: 8, color: 'rgba(255,255,255,0.25)',
          lineHeight: 1, letterSpacing: '0.05em',
        }}>
          {matchedCount}/{total}
        </div>
      )}
    </div>
  )
}

// ── Level select ──────────────────────────────────────────

function LevelSelect({ current, onSelect, onClose }: {
  current: number; onSelect: (i: number) => void; onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(6,9,26,0.92)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: '32px 24px', overflowY: 'auto',
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
        Select Level
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 360 }}>
        {LEVEL_GROUPS_META.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.indices.map(i => (
                <button key={i}
                  onPointerDown={() => { onSelect(i); onClose() }}
                  style={{
                    width: 44, height: 44, borderRadius: 8, fontFamily: 'inherit',
                    border: i === current ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.15)',
                    background: i === current ? 'rgba(255,255,255,0.08)' : 'none',
                    color: i === current ? '#fff' : 'rgba(255,255,255,0.45)',
                    fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
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

export default function TwinStars() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const [game, setGame] = useState<GameState | null>(null)
  const [complete, setComplete] = useState(false)
  const [showSelect, setShowSelect] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'd') setShowSelect(v => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { w, h } = svgSize

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!e.isPrimary) return   // ignore extra touch points / palm contacts
    e.preventDefault()
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setGame(prev => {
      if (!prev || w === 0 || h === 0 || prev.flashError) return prev

      // Build set of matched node ids for quick lookup
      const matchedIds = new Set<number>()
      for (const g of prev.groups) {
        for (const [l0, l1] of g.matched) {
          matchedIds.add(g.ids[0][l0])
          matchedIds.add(g.ids[1][l1])
        }
      }

      // Find nearest structure node within HIT_R (noise nodes are not selectable)
      let bestId = -1, bestDist = HIT_R
      for (const node of prev.nodes) {
        if (node.groupId === undefined) continue  // noise
        if (matchedIds.has(node.id)) continue     // already matched
        const d = Math.hypot(node.nx * w - px, node.ny * h - py)
        if (d < bestDist) { bestDist = d; bestId = node.id }
      }
      if (bestId === -1) return prev

      const tapped = prev.nodes.find(n => n.id === bestId)!

      // Deselect if tapping pending again
      if (prev.pending === bestId) return { ...prev, pending: null }

      if (prev.pending === null) return { ...prev, pending: bestId }

      const pendingNode = prev.nodes.find(n => n.id === prev.pending)!

      // If different group or same copy → just change pending
      if (tapped.groupId !== pendingNode.groupId || tapped.copyIdx === pendingNode.copyIdx) {
        return { ...prev, pending: bestId }
      }

      // Same group, different copy → attempt match
      const group = prev.groups.find(g => g.id === tapped.groupId!)!
      const local0 = pendingNode.copyIdx === 0 ? pendingNode.localId! : tapped.localId!
      const local1 = pendingNode.copyIdx === 0 ? tapped.localId! : pendingNode.localId!

      const valid = group.isos.some(iso => iso[local0] === local1)
      if (!valid) return { ...prev, flashError: true }

      return applyMatch(prev, group.id, local0, local1)
    })
  }, [w, h])

  // Flash error clear
  useEffect(() => {
    if (!game?.flashError) return
    flashTimer.current = setTimeout(() => {
      setGame(prev => prev ? { ...prev, pending: null, flashError: false } : prev)
    }, 450)
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current) }
  }, [game?.flashError])

  // Level complete check
  useEffect(() => {
    if (!game) return
    const allSolved = game.groups.every(g => g.matched.size === STRUCTS[g.structIdx].n)
    if (game.groups.length > 0 && allSolved) {
      const t = setTimeout(() => setComplete(true), 600)
      return () => clearTimeout(t)
    }
  }, [game])

  // Precompute lookups
  const nodeById = useMemo(() => {
    const m = new Map<number, GNode>()
    if (!game) return m
    for (const n of game.nodes) m.set(n.id, n)
    return m
  }, [game])

  const matchedIds = useMemo(() => {
    const s = new Set<number>()
    if (!game) return s
    for (const g of game.groups) {
      for (const [l0, l1] of g.matched) {
        s.add(g.ids[0][l0])
        s.add(g.ids[1][l1])
      }
    }
    return s
  }, [game])

  const nodeToGroup = useMemo(() => {
    const m = new Map<number, GGroup>()
    if (!game) return m
    for (const g of game.groups) {
      for (const id of [...g.ids[0], ...g.ids[1]]) m.set(id, g)
    }
    return m
  }, [game])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: SKY, overflow: 'hidden', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        style={{ flex: 1, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        aria-label="Isomorphism field"
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

        {/* Structure edges — only visible once the group is solved */}
        {game?.edges.map((edge, i) => {
          const fn = nodeById.get(edge.fromId)
          const tn = nodeById.get(edge.toId)
          if (!fn || !tn) return null
          const group = nodeToGroup.get(edge.fromId)
          const solved = group && group.matched.size === STRUCTS[group.structIdx].n
          if (!solved) return null
          return (
            <line key={i}
              x1={fn.nx * w} y1={fn.ny * h}
              x2={tn.nx * w} y2={tn.ny * h}
              stroke={group!.color + 'aa'}
              strokeWidth={1.2}
              style={{ pointerEvents: 'none' }}
            />
          )
        })}

        {/* Nodes */}
        {game?.nodes.map(node => {
          const isStruct = node.groupId !== undefined
          const group = isStruct ? nodeToGroup.get(node.id) : undefined
          const isMatched = matchedIds.has(node.id)
          const isPending = node.id === game.pending
          const isFlash = isPending && game.flashError
          const solved = group && group.matched.size === STRUCTS[group.structIdx].n

          const baseR = STAR_R * (isStruct ? 1.3 : 1.0) * node.rMult
          const vr = isMatched || solved ? baseR * 1.15 : baseR

          const color = (isMatched && group) ? group.color : (solved && group) ? group.color : '#fff'
          const fillColor = isFlash ? 'rgba(255,110,170,0.95)'
            : isPending ? 'rgba(255,220,80,0.95)'
            : isMatched ? color
            : isStruct ? 'rgba(255,255,255,0.92)'
            : 'rgba(255,255,255,0.55)'

          const fadeStyle = node.fadeDelay !== undefined
            ? { animation: `fadeOut ${node.fadeDuration}s linear ${node.fadeDelay}s forwards` }
            : undefined

          return (
            <g key={node.id} style={{ pointerEvents: 'none', ...fadeStyle }}>
              {isPending && !isMatched && (
                <circle cx={node.nx * w} cy={node.ny * h} r={SEL_RING} fill="none"
                  stroke={isFlash ? 'rgba(255,110,170,0.7)' : 'rgba(255,220,80,0.75)'}
                  strokeWidth={1.5}
                />
              )}
              {isMatched && group && (
                <circle cx={node.nx * w} cy={node.ny * h} r={SEL_RING - 1} fill="none"
                  stroke={group.color + '55'} strokeWidth={1}
                />
              )}
              <circle className="star-vis"
                cx={node.nx * w} cy={node.ny * h}
                r={vr} fill={fillColor}
                style={{
                  animationDelay: `${node.twinkleDelay}s`,
                  filter: isFlash ? 'drop-shadow(0 0 5px rgba(255,110,170,0.9))'
                    : isPending ? 'drop-shadow(0 0 4px rgba(255,220,80,0.85))'
                    : isMatched ? `drop-shadow(0 0 3px ${color}99)`
                    : undefined,
                }}
              />
            </g>
          )
        })}
      </svg>

      {/* Group status panel */}
      <div style={{
        flexShrink: 0, height: 68,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(6,9,26,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '0 16px', overflowX: 'auto',
      }}>
        {game?.groups.map(group => (
          <GroupThumb key={group.id} group={group} matchedCount={group.matched.size} />
        ))}
      </div>

      {/* Ambient next-level button — fades in on complete */}
      <style>{`
        @keyframes nextGlow {
          0%, 100% { box-shadow: 0 0 10px 2px rgba(52,211,153,0.35); }
          50%       { box-shadow: 0 0 22px 6px rgba(52,211,153,0.65); }
        }
      `}</style>
      <button
        onPointerDown={() => {
          if (!complete) return
          if (levelIdx < LEVELS.length - 1) {
            setLevelIdx(i => i + 1)
          } else {
            setLevelIdx(0)
          }
          setComplete(false)
        }}
        style={{
          position: 'absolute', bottom: 84, right: 20,
          width: 52, height: 52, borderRadius: '50%',
          background: complete ? 'rgba(52,211,153,0.18)' : 'transparent',
          border: complete ? '1px solid rgba(52,211,153,0.5)' : '1px solid transparent',
          padding: 0,
          cursor: complete ? 'pointer' : 'default',
          touchAction: 'manipulation',
          opacity: complete ? 1 : 0,
          transition: 'opacity 1s ease, background 0.4s, border-color 0.4s',
          animation: complete ? 'nextGlow 2.4s ease-in-out infinite' : 'none',
          pointerEvents: complete ? 'auto' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Next level"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M8 4l7 7-7 7" stroke="rgba(52,211,153,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {showSelect && (
        <LevelSelect
          current={levelIdx}
          onSelect={i => { setLevelIdx(i); setComplete(false) }}
          onClose={() => setShowSelect(false)}
        />
      )}
    </div>
  )
}
