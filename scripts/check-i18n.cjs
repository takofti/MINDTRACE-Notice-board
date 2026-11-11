const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const i18nPath = 'src/renderer/src/i18n/index.ts'
const i18nText = fs.readFileSync(i18nPath, 'utf8')
const sf = ts.createSourceFile(i18nPath, i18nText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const keys = new Set()
function visitI18n(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'fromEntries' &&
    node.arguments.length &&
    ts.isArrayLiteralExpression(node.arguments[0])
  ) {
    for (const element of node.arguments[0].elements) {
      if (ts.isArrayLiteralExpression(element) && element.elements.length >= 1) {
        const first = element.elements[0]
        if (ts.isStringLiteral(first)) keys.add(first.text)
      }
    }
  }
  ts.forEachChild(node, visitI18n)
}
visitI18n(sf)

const used = new Map()
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      if (p.endsWith('i18n/index.ts')) continue
      const text = fs.readFileSync(p, 'utf8')
      const regex = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1/g
      let match
      while ((match = regex.exec(text))) {
        const key = match[2]
        if (key.length > 1) used.set(key, (used.get(key) || 0) + 1)
      }
    }
  }
}
walk('src/renderer/src')
const missing = [...used.entries()].filter(([key]) => !keys.has(key)).sort((a, b) => a[0].localeCompare(b[0]))
console.log('RU keys', keys.size, 'used', used.size, 'missing', missing.length)
for (const [key, count] of missing) console.log(count, JSON.stringify(key))
