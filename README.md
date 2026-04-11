# Loci

A suite of geometry games built with React + Vite.

## Dev

```bash
pnpm dev        # start dev server at http://localhost:5173
pnpm build      # type-check + production build
pnpm lint       # eslint
```

## Visual testing (for Claude)

A Playwright screenshot script is used to visually verify UI changes. The dev server must be running first.

```bash
# Landing page
node scripts/screenshot.mjs

# Navigate into a game
node scripts/screenshot.mjs "click:text=Constellations"

# Navigate in, then back
node scripts/screenshot.mjs "click:text=Ripples" back

# With an explicit wait
node scripts/screenshot.mjs "click:text=Shape Builder" "wait:500"
```

**Step syntax:**

| Step | Effect |
|------|--------|
| `click:text=Foo` | Click element by visible text |
| `click:.selector` | Click by CSS selector |
| `wait:500` | Wait 500 ms |
| `back` | Click the GameShell back button |

Screenshots are saved to `/tmp/loci-screenshots/` as `shot-00-initial.png`, `shot-01-…`, etc. Read them with the `Read` tool — it renders PNGs inline.

**Debugging computed styles:**

```js
// Run inline with node -e or in scripts/screenshot.mjs before browser.close()
const styles = await page.locator('h1').evaluate(el => {
  const cs = getComputedStyle(el);
  return { fontSize: cs.fontSize, lineHeight: cs.lineHeight };
});
console.log(styles);
```

**Known gotcha:** `font: <size>/<line-height>` set as a percentage on `:root` computes to a fixed pixel value that inherits to all descendants. Always set `line-height` explicitly (unitless) on headings so it stays proportional to the element's own font-size.
