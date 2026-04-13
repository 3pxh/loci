# Isomorphism

A game about graph structure recognition. The sky contains clusters of nodes
connected by edges. Each cluster appears exactly twice — same connectivity
pattern, different visual layout. The player's goal is to identify corresponding
nodes between the two copies of each structure.

## Core mechanic

- Tap a node to select it (anchor)
- Tap a node in the **other copy** of the same structure to attempt a match
- A match is valid if there exists a graph automorphism (relabelling that
  preserves edge relationships) consistent with all previously confirmed pairs
- Wrong match: pink flash, selection cleared
- As pairs are confirmed, remaining valid isomorphisms narrow — any pair forced
  by the constraints auto-completes
- All pairs matched → structure solved

Structures are small graphs (3–7 nodes). Edges between nodes are the key visual
information. The visual position of nodes within a copy is independent between
copies: the player must use topology, not geometry, to find correspondences.

## Difficulty axes

1. **Noise** — extra stars with no edges; starts at 0, increases to ~60
2. **Scale** — cluster radius grows from small (tightly packed, easy to read)
   to large (widely spread, harder to compare visually)
3. **Structure count** — starts at 1 paired structure, caps at 6

## Level progression

- **Tutorial** (levels 1–3): 1 pair of structures, no noise, small scale
- **Pairs** (4–6): 2 structures, light noise
- **Triples** (7–9): 3 structures, moderate noise; larger structures (5–6 nodes)
- **Advanced** (10–12): 4–6 structures, heavy noise, large scale

## Ideas and variants

- Structures that are *not* isomorphic shown alongside the correct pair —
  player must identify which of three clusters are the matching pair
- Partial structures: one copy has a node/edge hidden; player infers it
- Directed graphs (arrows instead of undirected edges)
- Edge weights shown as line thickness — structural cue adds another dimension
- Time pressure mode: noise stars fade in (rather than out), obscuring the field
- "Morphing" mode: the canonical layout of copy 2 slowly rotates/scales in real
  time, testing whether the player can track the correspondence dynamically
