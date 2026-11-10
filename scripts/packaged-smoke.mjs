import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const userData = resolve(root, 'test-artifacts', 'packaged-userdata')
const exe = process.env.MINDTRACE_EXE
  ? resolve(process.env.MINDTRACE_EXE)
  : resolve(root, 'release', 'win-unpacked', 'Mindtrace.exe')
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })
if (!existsSync(exe)) throw new Error('Packaged executable missing')

function makePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    null
  ]
  const stream = 'BT /F1 18 Tf 30 150 Td (Mindtrace packaged PDF) Tj ET'
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf).toString('base64')
}

const errors = []
const app = await electron.launch({
  executablePath: exe,
  env: { ...process.env, MINDTRACE_USER_DATA: userData }
})
const page = await app.firstWindow()
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
await page.waitForSelector('.board', { timeout: 20000 })
await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 20000 })
const info = await page.evaluate(() => ({
  title: document.title,
  cards: document.querySelectorAll('.card').length,
  threads: document.querySelectorAll('.thread-hit').length,
  chips: getComputedStyle(document.querySelector('.titlebar')).backgroundColor,
  hasDebugHandle: '__mindtrace' in window
}))

const pdfB64 = makePdf()
const pdfResult = await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'packaged-test.pdf', { type: 'application/pdf' })
  const data = new DataTransfer()
  data.items.add(file)
  const board = document.querySelector('.board')
  const rect = board.getBoundingClientRect()
  board.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
      clientX: rect.left + 300,
      clientY: rect.top + 500
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 2600))
  const card = [...document.querySelectorAll('.card.kind-pdf')][0]
  const canvas = card?.querySelector('.pdf-canvas')
  return {
    card: Boolean(card),
    canvas: Boolean(canvas),
    ready: canvas?.classList.contains('is-ready') ?? false,
    width: canvas?.width ?? 0,
    text: card?.innerText?.slice(0, 120)
  }
}, pdfB64)
if (!pdfResult.card || !pdfResult.ready || pdfResult.width <= 100) {
  errors.push(`PDF preview failed in packaged build: ${JSON.stringify(pdfResult)}`)
}

const shot = resolve(root, 'test-artifacts', 'packaged-board.png')
await page.screenshot({ path: shot })
await page.keyboard.press('Control+K')
await page.waitForSelector('.search-dialog')
await page.keyboard.press('Escape')
await page.waitForFunction(() => !document.querySelector('.search-dialog'))
await page.waitForTimeout(800)
const files = readdirSync(join(userData, 'data', 'projects'), { withFileTypes: true }).filter((entry) => entry.isDirectory())
const project = JSON.parse(readFileSync(join(userData, 'data', 'projects', files[0].name, 'project.json'), 'utf8'))
await app.close()
console.log(JSON.stringify({ info, pdfResult, errors, project: project.name, screenshot: shot, hasProjectFile: Boolean(project) }, null, 2))
process.exit(errors.length ? 1 : 0)
