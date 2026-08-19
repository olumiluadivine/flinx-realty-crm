/**
 * Turns the single-file Vite build into a publishable Artifact page.
 *
 * The Artifact host wraps whatever it is given in its own <!doctype>/<head>/<body>,
 * so a complete HTML document cannot be handed over as-is. This unwraps the built
 * document into a fragment.
 *
 * vite-plugin-singlefile hoists the inlined <script> and <style> into <head> and
 * leaves <body> holding only the mount point, so the fragment is reassembled in a
 * deliberate order: title and fonts, then styles, then the mount point, then the
 * scripts — so the module has a #root to attach to however the host parses it.
 *
 *   SINGLE_FILE=1 vite build && node scripts/build-artifact.mjs
 */
import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'dist/index.html')
const target = resolve(root, 'dist/artifact.html')

const html = await readFile(source, 'utf8')

const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)

if (!headMatch || !bodyMatch) {
  console.error('Could not find <head> and <body> in dist/index.html — was SINGLE_FILE=1 set?')
  process.exit(1)
}

const head = headMatch[1]
const body = bodyMatch[1].trim()

const title = /<title>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? 'Flinx Realty CRM'

const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/gi)].map((m) => m[0])
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0])

// Google Fonts is the one external host an Artifact may reach. The favicon is a
// data URI, so it travels too — a host that supplies its own icon simply wins.
const carriedLinks = [...head.matchAll(/<link[^>]*>/gi)]
  .map((m) => m[0])
  .filter((tag) => /fonts\.(googleapis|gstatic)\.com/i.test(tag) || /href="data:/i.test(tag))

if (styles.length === 0 || scripts.length === 0) {
  console.error(
    `Expected inlined assets but found ${styles.length} style and ${scripts.length} script blocks. ` +
      'The build is not self-contained.',
  )
  process.exit(1)
}

/*
 * Check for references the Artifact CSP would block. Only the document shell is
 * scanned — the bundle's own source contains plenty of href="…" inside JSX strings,
 * and those are not network requests.
 */
const shell =
  head.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') + body
const external = [...shell.matchAll(/(?:src|href)="(?!data:|#|https:\/\/fonts\.)([^"]+)"/gi)]
if (external.length > 0) {
  console.error('Build is not self-contained — these references would be blocked:')
  for (const m of external) console.error(`  ${m[1]}`)
  process.exit(1)
}

const fragment = [
  `<title>${title}</title>`,
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
  ...carriedLinks,
  ...styles,
  body,
  ...scripts,
].join('\n')

await writeFile(target, fragment, 'utf8')

const { size } = await stat(target)
console.log(
  `Wrote dist/artifact.html — ${(size / 1024 / 1024).toFixed(2)} MB ` +
    `(${styles.length} style, ${scripts.length} script blocks inlined)`,
)
if (size > 16 * 1024 * 1024) {
  console.error('Over the 16MB Artifact limit.')
  process.exit(1)
}
