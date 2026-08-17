#!/usr/bin/env node
/**
 * Patch the installed DeepSeek Harness settings shell so the dsh-usage-ledger
 * 「数据与统计」nav entry renders its line-chart glyph.
 *
 * Why this exists
 * ---------------
 * The settings nav glyph is decided by the shell's `navIcon(id)` map; unknown
 * section ids fall back to the settings gear. On installed (prebuilt) harness
 * builds the slots registry is baked into the shell bundle, so a registrant's
 * `icon` option is silently dropped until the harness ships the upstream
 * `icon` feature (see docs/settings-section-icon-upstream.md). This script is
 * the stopgap for those builds: it adds a `usage` branch to the shell's
 * `navIcon()` that renders the line-chart glyph directly — a self-contained
 * patch that needs no slots change and no rebuild (the shell is served
 * dynamically, `cache-control: no-cache`).
 *
 * Usage
 * -----
 *   node scripts/patch-settings-icon.mjs            # patch this machine's shell
 *   node scripts/patch-settings-icon.mjs <path>     # patch an explicit shell file
 *
 * Idempotent: a marker comment makes re-runs a no-op. Once the harness ships
 * the `icon` option the patch is unnecessary and skips itself.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = '@deepseek-ai/dsh-client-ui-settings-general'
const REL = 'lib/client.js'
const HERE = dirname(fileURLToPath(import.meta.url))

/** Marker that identifies this patch once applied. */
const MARKER = '/* dsh-usage-ledger: settings nav glyph */'

/** Compiled-form branch injected into `navIcon(id)`, before the first
 * `if (id === "models")`. Self-contained inline SVG (thin-stroke line chart,
 * `currentColor`), so no new imports are needed in the bundle. */
function buildBranch() {
  const path = (d, extra = '') => `(0, react_jsx_runtime.jsx)("path", { d: "${d}", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round"${extra} })`
  const linejoin = path('M3.5 11L6 7.5L8.5 9L11 4.5L13.5 2.5', ', strokeLinejoin: "round"')
  const dot = (cx, cy) => `(0, react_jsx_runtime.jsx)("circle", { cx: "${cx}", cy: "${cy}", r: "1.1", fill: "currentColor" })`
  const svg = `(0, react_jsx_runtime.jsxs)("svg", { width: 16, height: 16, className: SettingsRoot_module_css_default.navIcon, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", children: [${[
    path('M2 13.5V2.5'),
    path('M2 13.5H14'),
    linejoin,
    dot('3.5', '11'),
    dot('6', '7.5'),
    dot('8.5', '9'),
    dot('11', '4.5'),
    dot('13.5', '2.5'),
  ].join(', ')}] })`
  return `\t\t\t${MARKER}\n\t\t\tif (id === "usage") return ${svg};`
}

/**
 * Resolve every installed settings shell bundle this script can find and patch
 * them all, so whichever copy the harness serves (the app-backend node_modules
 * on an installed Electron app, or the profile tree) gets the glyph.
 *
 * Discovery order: an explicit argv path, then $DSH_APP_BACKEND_NODE_MODULES,
 * then the profile tree under $DSH_HOME, then the app backend relative to this
 * checkout (works when the plugin lives under the harness repo), then the
 * user home's profile tree.
 */
function discoverShells(override) {
  const found = []
  const add = (candidate) => {
    if (candidate && existsSync(candidate) && !found.includes(candidate)) found.push(candidate)
  }
  if (override) {
    const absolute = isAbsolute(override) ? override : resolve(process.cwd(), override)
    if (!existsSync(absolute)) {
      process.stderr.write(`patch: no such file: ${absolute}\n`)
    } else {
      add(absolute)
    }
  }
  add(process.env.DSH_APP_BACKEND_NODE_MODULES && join(process.env.DSH_APP_BACKEND_NODE_MODULES, PACKAGE, REL))
  const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '~', '.dsh')
  add(join(home, 'profiles', 'node_modules', PACKAGE, REL))
  add(join(home, 'node_modules', PACKAGE, REL))
  // Relative to this script: <plugin>/scripts -> <harness repo>/resources/backend/node_modules
  add(join(HERE, '..', '..', '..', '..', 'resources', 'backend', 'node_modules', PACKAGE, REL))
  // Standard resolution from the installed location (climbs the profile chain).
  const req = createRequire(join(HERE, '..', 'package.json'))
  for (const base of [join(HERE, '..'), join(HERE, '..', '..'), process.cwd()]) {
    try {
      add(req.resolve(`${PACKAGE}/${REL}`, { paths: [base] }))
    } catch { /* keep trying */ }
  }
  return [...new Set(found)]
}

/** True when the shell already handles the usage glyph (marker, usage branch,
 * or the registrant-icon rendering the upstream feature adds). */
function alreadyHandled(source) {
  return source.includes(MARKER) || source.includes('id === "usage"') || source.includes('row.icon !== void 0')
}

function patch(file) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch (error) {
    process.stderr.write(`patch: cannot read ${file} — ${error.message}\n`)
    return 1
  }
  if (alreadyHandled(source)) {
    process.stdout.write(`patch: ${file} already renders the usage glyph — no-op.\n`)
    return 0
  }
  const nav = source.indexOf('function navIcon(id) {')
  if (nav === -1) {
    process.stderr.write(`patch: ${file} has no \`function navIcon(id)\` — this harness build differs from the patch's target (0.1.0-rc.6-era). `)
    process.stderr.write('The durable fix is the upstream `icon` option (docs/settings-section-icon-upstream.md); do not patch by hand.\n')
    return 2
  }
  const anchor = source.indexOf('if (id === "models")', nav)
  if (anchor === -1) {
    process.stderr.write(`patch: ${file} navIcon has no \`models\` branch — unexpected shape; aborting without changes.\n`)
    return 2
  }
  const branch = buildBranch()
  const updated = `${source.slice(0, anchor)}${branch}\n${source.slice(anchor)}`
  writeFileSync(file, updated)
  process.stdout.write(`patch: ${file}\n  inserted the 数据与统计 line-chart glyph into navIcon() — reload the settings panel (Ctrl+Shift+R) to see it.\n`)
  return 0
}

const targets = discoverShells(process.argv[2])
if (targets.length === 0) {
  process.stderr.write(`patch: could not locate any installed settings shell (${PACKAGE}/${REL}).\n`)
  process.stderr.write('Pass the file path explicitly: node scripts/patch-settings-icon.mjs <path-to-lib/client.js>\n')
  process.exit(1)
}
let worst = 0
for (const target of targets) {
  const code = patch(target)
  if (code > worst) worst = code
}
process.exit(worst)
