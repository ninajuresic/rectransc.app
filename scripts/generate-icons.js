/**
 * generate-icons.js
 * Renders assets/icon.svg into PNG files used by both the
 * Electron desktop app and the Expo/iOS app.
 *
 * Uses @resvg/resvg-js — pure Rust/WASM, no native build tools needed.
 * Run once before packaging:  node scripts/generate-icons.js
 */

'use strict'

const { Resvg }  = require('@resvg/resvg-js')
const fs         = require('fs')
const path       = require('path')

const root    = path.join(__dirname, '..')
const svgPath = path.join(root, 'assets', 'icon.svg')

const outputs = [
  { dest: path.join(root, 'assets',              'icon.png'), size: 1024, label: 'Electron / shared' },
  { dest: path.join(root, 'ios-app', 'assets',   'icon.png'), size: 1024, label: 'Expo iOS'          },
]

async function main() {
  const svg = fs.readFileSync(svgPath)

  for (const { dest, size, label } of outputs) {
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(dest), { recursive: true })

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      font:  { loadSystemFonts: false },
    })

    const png = resvg.render().asPng()
    fs.writeFileSync(dest, png)
    console.log(`✓  ${label.padEnd(20)} →  ${path.relative(root, dest)}  (${size}×${size})`)
  }

  console.log('\n🎉  Icons generated! You can now run:')
  console.log('    npm run package          ← builds the macOS .dmg')
  console.log('    cd ios-app && eas build  ← builds the iOS app\n')
}

main().catch(err => {
  console.error('Icon generation failed:', err.message)
  process.exit(1)
})
