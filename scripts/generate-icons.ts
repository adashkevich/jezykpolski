#!/usr/bin/env node
/**
 * Generates the PWA icon set (`spec/tasks/06-app-shell-pwa.md` §5) from `public/favicon.svg`:
 * `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, and
 * `public/apple-touch-icon.png`. Run via `npm run icons:generate` whenever the source mark
 * changes; the outputs are committed (like the rest of `public/`, they're deployed assets,
 * not build artifacts regenerated on every `npm run build`).
 *
 * Deliberately does NOT call sharp's `.resize()` on the SVG-rasterized image: on this
 * toolchain that corrupts the top and bottom pixel row of the output with a solid black
 * line — reproduced even with a trivial one-shape SVG, so it's a libvips/librsvg
 * resize-kernel edge bug, not anything specific to favicon.svg's blur filters (confirmed
 * against Chromium, which rasterizes the same source cleanly). The fix: pick sharp's
 * `density` option so librsvg rasterizes the logo directly at its final pixel size, then
 * only `.composite()` (never `.resize()`) it onto the background canvas.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG = join(ROOT, 'public/favicon.svg')
const ICONS_DIR = join(ROOT, 'public/icons')

// background_color / theme_color (dark navy) — see vite.config.ts's VitePWA manifest and
// index.html's <meta name="theme-color">, which this script's output must stay in sync with.
const BG = '#0f172a'
// favicon.svg's intrinsic viewBox size (see its <svg width height> attributes).
const SVG_W = 48
const SVG_H = 46

/** Rasterizes `favicon.svg` so its longer side is exactly `boxSize` px, via `density` only
 *  (never `.resize()` — see file header). Returns the PNG buffer and its true metadata. */
async function rasterizeLogo(
  boxSize: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const density = (72 * boxSize) / Math.max(SVG_W, SVG_H)
  const buffer = await sharp(SVG, { density }).png().toBuffer()
  const metadata = await sharp(buffer).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('generate-icons: rasterized logo is missing width/height metadata')
  }
  return { buffer, width: metadata.width, height: metadata.height }
}

async function composeIcon(options: {
  size: number
  innerSize: number
  background: string | { r: number; g: number; b: number; alpha: number }
  outFile: string
}): Promise<void> {
  const { size, innerSize, background, outFile } = options
  const logo = await rasterizeLogo(innerSize)
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([
      {
        input: logo.buffer,
        left: Math.round((size - logo.width) / 2),
        top: Math.round((size - logo.height) / 2),
      },
    ])
    .png()
    .toFile(outFile)
  console.log('wrote', outFile)
}

async function main() {
  mkdirSync(ICONS_DIR, { recursive: true })

  // Plain icons, purpose "any" (transparent background): 192, 512.
  for (const size of [192, 512]) {
    await composeIcon({
      size,
      innerSize: Math.round(size * 0.72),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      outFile: join(ICONS_DIR, `icon-${size}.png`),
    })
  }

  // Maskable 512: solid background, logo confined to the ~80%-diameter safe-zone circle.
  await composeIcon({
    size: 512,
    innerSize: Math.round(512 * 0.44),
    background: BG,
    outFile: join(ICONS_DIR, 'icon-512-maskable.png'),
  })

  // apple-touch-icon: 180x180, solid background (iOS ignores alpha / applies its own mask).
  await composeIcon({
    size: 180,
    innerSize: Math.round(180 * 0.6),
    background: BG,
    outFile: join(ROOT, 'public/apple-touch-icon.png'),
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
