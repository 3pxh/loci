/**
 * screenshot.mjs
 *
 * Takes screenshots of the running dev server for visual inspection.
 *
 * Usage:
 *   node scripts/screenshot.mjs [steps...]
 *
 * Steps (optional, run in sequence):
 *   click:<selector>   – click a CSS selector or text
 *   wait:<ms>          – wait N milliseconds
 *   back               – click the back button (.game-header-btn:first-child)
 *
 * Examples:
 *   node scripts/screenshot.mjs
 *   node scripts/screenshot.mjs "click:text=Constellations"
 *   node scripts/screenshot.mjs "click:text=Ripples" "wait:500" back
 *
 * Output: /tmp/loci-screenshots/shot-00.png, shot-01.png, …
 * The script takes a screenshot before each step and one final shot at the end.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const URL = 'http://localhost:5173'
const OUT = '/tmp/loci-screenshots'
const VIEWPORT = { width: 1280, height: 800 }

mkdirSync(OUT, { recursive: true })

const steps = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize(VIEWPORT)
await page.goto(URL, { waitUntil: 'networkidle' })

let idx = 0
const shot = async (label) => {
  const file = join(OUT, `shot-${String(idx).padStart(2, '0')}${label ? '-' + label : ''}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  saved ${file}`)
  idx++
}

await shot('initial')

for (const step of steps) {
  if (step.startsWith('click:')) {
    const target = step.slice(6)
    if (target.startsWith('text=')) {
      await page.getByText(target.slice(5), { exact: false }).first().click()
    } else {
      await page.locator(target).first().click()
    }
    await page.waitForLoadState('networkidle').catch(() => {})
    await shot(target.replace(/[^a-z0-9]/gi, '_').toLowerCase())
  } else if (step.startsWith('wait:')) {
    await page.waitForTimeout(Number(step.slice(5)))
  } else if (step === 'back') {
    await page.locator('.game-header-btn').first().click()
    await shot('back')
  }
}

await browser.close()
console.log(`\nDone. View with: open ${OUT}`)
