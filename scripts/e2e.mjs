import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'

const root = process.cwd()
const userData = resolve(root, 'test-artifacts', 'e2e-userdata')
const artifacts = resolve(root, 'test-artifacts')
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

rmSync(userData, { recursive: true, force: true })
mkdirSync(artifacts, { recursive: true })
mkdirSync(userData, { recursive: true })

if (!existsSync(electronExe)) {
  throw new Error(`Electron executable not found at ${electronExe}`)
}

const logs = []
let failures = 0

function check(name, condition, extra = '') {
  if (condition) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name} ${extra}`)
  }
}

async function dismissHome(page) {
  const home = page.locator('.home-screen')
  if (!(await home.count())) return
  const resume = home.getByRole('button', { name: /Продолжить/ }).first()
  if (await resume.count()) {
    await resume.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForFunction(() => !document.querySelector('.home-screen'), null, { timeout: 15000 })
}

async function launch() {
  const app = await electron.launch({
    executablePath: electronExe,
    args: ['.'],
    cwd: root,
    env: { ...process.env, MINDTRACE_USER_DATA: userData }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.stack ?? error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') logs.push(`console: ${message.text()}`)
  })
  await page.waitForSelector('.board', { timeout: 20000 })
  const hadHome = (await page.locator('.home-screen').count()) > 0
  await dismissHome(page)
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 20000 })
  return { app, page, hadHome }
}

function projectFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...projectFiles(join(dir, entry.name)))
    else if (entry.name === 'project.json') out.push(join(dir, entry.name))
  }
  return out
}

function countAssetFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...countAssetFiles(join(dir, entry.name)))
    else if (entry.name !== 'project.json' && !entry.name.endsWith('.json')) out.push(join(dir, entry.name))
  }
  return out
}

function readBoard() {
  const files = projectFiles(join(userData, 'data', 'projects'))
  if (!files.length) return null
  const project = JSON.parse(readFileSync(files[0], 'utf8'))
  return { project, file: files[0] }
}

function projectFileById(id) {
  return join(userData, 'data', 'projects', id, 'project.json')
}

console.log('Mindtrace desktop smoke test')

function makePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    null
  ]
  const stream = 'BT /F1 18 Tf 30 150 Td (Mindtrace PDF test) Tj ET'
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

const docxZip = new JSZip()
docxZip.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
)
docxZip.file(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
)
docxZip.file(
  'word/document.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Mindtrace DOCX preview</w:t></w:r></w:p></w:body>
</w:document>`
)
const pdfB64 = makePdf()
const docxB64 = (await docxZip.generateAsync({ type: 'nodebuffer' })).toString('base64')

let { app, page, hadHome } = await launch()
const initialCards = await page.locator('.card').count()
check('home screen appears on launch', hadHome)
check('demo board loads', initialCards >= 9, `cards=${initialCards}`)
check('titlebar rendered', (await page.locator('.titlebar').count()) === 1)
await page.screenshot({ path: join(artifacts, 'e2e-01-board.png') })

// Find an empty region of the board and create a note by double-clicking.
const emptyPoint = await page.evaluate(() => {
  const board = document.querySelector('.board')
  if (!board) return null
  const rect = board.getBoundingClientRect()
  for (let y = rect.top + 90; y < rect.bottom - 120; y += 40) {
    for (let x = rect.left + 80; x < rect.right - 80; x += 40) {
      const el = document.elementFromPoint(x, y)
      if (!el) continue
      if (el.closest('.card, .zoom-bar, .minimap, .board-hints, .empty-board, .inspector, .overlay')) continue
      if (el.closest('.board')) return { x, y }
    }
  }
  return null
})
check('found empty board area', Boolean(emptyPoint), JSON.stringify(emptyPoint))
if (emptyPoint) {
  await page.mouse.dblclick(emptyPoint.x, emptyPoint.y)
  await page.waitForFunction((count) => document.querySelectorAll('.card').length === count + 1, initialCards, { timeout: 5000 })
  check('double-click creates a note', true)
  await page.keyboard.type('E2E note')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  if (await page.locator('.inspector').count()) {
    await page.locator('.inspector .head-actions button').click()
  }
}

const cardsAfterCreate = await page.locator('.card').count()
const dragTarget = await page.evaluate(() => {
  const board = document.querySelector('.board').getBoundingClientRect()
  const cards = [...document.querySelectorAll('.card')]
  for (const el of cards) {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 30) continue
    if (r.left < board.left + 10 || r.top < board.top + 10 || r.right > board.right - 10 || r.bottom > board.bottom - 10) continue
    const x = r.left + Math.min(40, r.width / 2)
    const y = r.top + Math.min(20, r.height / 2)
    const hit = document.elementFromPoint(x, y)
    const card = hit?.closest('[data-card-id]')
    if (card !== el) continue
    if (hit?.closest('button, video, audio, iframe, [data-interactive]')) continue
    return { id: el.dataset.cardId, x, y, width: r.width, height: r.height, transform: el.style.transform }
  }
  return null
})
check('found a draggable card', Boolean(dragTarget), JSON.stringify(dragTarget))
if (dragTarget) {
  await page.mouse.move(dragTarget.x, dragTarget.y)
  await page.mouse.down()
  await page.mouse.move(dragTarget.x + 70, dragTarget.y + 35, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const afterTransform = await page.locator(`[data-card-id="${dragTarget.id}"]`).evaluate((el) => el.style.transform)
  check('card drag moves the card', afterTransform !== dragTarget.transform, `${dragTarget.transform} -> ${afterTransform}`)
  await page.keyboard.press('Control+Z')
  await page.waitForTimeout(250)
  const undoneTransform = await page.locator(`[data-card-id="${dragTarget.id}"]`).evaluate((el) => el.style.transform)
  check('undo restores the card position', undoneTransform === dragTarget.transform, `${undoneTransform} vs ${dragTarget.transform}`)
  if (await page.locator('.inspector').count()) {
    await page.locator('.inspector .head-actions button').click()
  }
}

// Create a connection from a visible pin to another card.
const threadCountBefore = await page.locator('.thread-hit').count()
const pinInfo = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')].filter((card) => {
    const r = card.getBoundingClientRect()
    return r.width > 40 && r.right < innerWidth - 30
  })
  for (const card of cards) {
    const pin = card.querySelector('.pin-anchor.is-connected')
    if (!pin) continue
    const target = cards.find((other) => other !== card && other.getBoundingClientRect().width > 40)
    if (!target) continue
    const p = pin.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    return {
      from: { x: p.x + p.width / 2, y: p.y + p.height / 2 },
      to: { x: t.x + t.width / 2, y: t.y + t.height / 2 }
    }
  }
  return null
})
if (pinInfo) {
  await page.mouse.move(pinInfo.from.x, pinInfo.from.y)
  await page.mouse.down()
  await page.mouse.move(pinInfo.to.x, pinInfo.to.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const threadCountAfter = await page.locator('.thread-hit').count()
  check('thread is tied from pin to card', threadCountAfter === threadCountBefore + 1, `${threadCountBefore} -> ${threadCountAfter}`)
}

// Draw charcoal on an empty spot.
await page.locator('.tool-btn[title^="Мел"]').click()
const strokeCountBefore = await page.locator('.stroke-hit').count()
const drawPoint = await page.evaluate(() => {
  const board = document.querySelector('.board')
  if (!board) return null
  const rect = board.getBoundingClientRect()
  for (let y = rect.top + 100; y < rect.bottom - 120; y += 30) {
    for (let x = rect.left + 40; x < rect.right - 40; x += 30) {
      const el = document.elementFromPoint(x, y)
      if (!el) continue
      if (el.closest('.card, .zoom-bar, .minimap, .board-hints, .inspector, .overlay')) continue
      if (el.closest('.board')) {
        const el2 = document.elementFromPoint(x + 60, y + 40)
        if (el2 && el2.closest('.board') && !el2.closest('.card, .zoom-bar, .minimap, .inspector, .overlay')) {
          return { x, y }
        }
      }
    }
  }
  return null
})
check('found empty space for drawing', Boolean(drawPoint), JSON.stringify(drawPoint))
if (drawPoint) {
  await page.mouse.move(drawPoint.x, drawPoint.y)
  await page.mouse.down()
  await page.mouse.move(drawPoint.x + 70, drawPoint.y + 45, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const strokeCountAfter = await page.locator('.stroke-hit').count()
  check('chalk drawing is added', strokeCountAfter === strokeCountBefore + 1, `${strokeCountBefore} -> ${strokeCountAfter}`)
}
await page.locator('.tool-btn[title^="Выбор и перемещение"]').click()

// Drop a small generated image through the real asset pipeline.
const imageImport = await page.evaluate(async () => {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII='
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'e2e-pixel.png', { type: 'image/png' })
  const data = new DataTransfer()
  data.items.add(file)
  const board = document.querySelector('.board')
  const rect = board.getBoundingClientRect()
  board.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
      clientX: rect.left + 140,
      clientY: rect.top + 170
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 900))
  const card = [...document.querySelectorAll('.card.kind-image')].find((el) => el.innerText.includes('e2e-pixel'))
  const img = card?.querySelector('img')
  let fetched = false
  if (img) {
    try {
      const response = await fetch(img.src)
      fetched = response.ok
    } catch {
      fetched = false
    }
  }
  return { found: Boolean(card), src: img?.src?.slice(0, 60), fetched }
})
check('image asset imports through IPC', imageImport.found, JSON.stringify(imageImport))
check('imported image loads through asset protocol', imageImport.fetched, JSON.stringify(imageImport))

// Drop a PDF and a DOCX to exercise preview and CSP frame handling.
const docs = await page.evaluate(
  async ({ pdfB64, docxB64 }) => {
    const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const pdf = new File([bytes(pdfB64)], 'e2e-document.pdf', { type: 'application/pdf' })
    const docx = new File([bytes(docxB64)], 'e2e-document.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    const data = new DataTransfer()
    data.items.add(pdf)
    data.items.add(docx)
    const board = document.querySelector('.board')
    const rect = board.getBoundingClientRect()
    board.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: rect.left + 340,
        clientY: rect.top + 620
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 2200))
    const pdfCard = [...document.querySelectorAll('.card.kind-pdf')][0]
    const docCard = [...document.querySelectorAll('.card.kind-doc')][0]
    const pdfCanvas = pdfCard?.querySelector('.pdf-canvas')
    return {
      pdf: Boolean(pdfCard),
      canvas: Boolean(pdfCanvas),
      canvasReady: pdfCanvas?.classList.contains('is-ready') ?? false,
      canvasWidth: pdfCanvas?.width ?? 0,
      doc: Boolean(docCard),
      docText: docCard?.innerText.includes('Mindtrace DOCX preview') ?? false,
      docError: docCard?.innerText?.includes('Preview unavailable') ?? false
    }
  },
  { pdfB64, docxB64 }
)
check('PDF card imports', docs.pdf && docs.canvasReady, JSON.stringify(docs))
check('PDF preview is rendered by pdf.js', docs.canvasWidth > 100, JSON.stringify(docs))
check('DOCX card imports and previews', docs.doc && docs.docText, JSON.stringify(docs))

const cardsAfterImport = await page.locator('.card').count()
check('board still has the new cards', cardsAfterImport >= cardsAfterCreate, `${cardsAfterCreate} -> ${cardsAfterImport}`)
await page.screenshot({ path: join(artifacts, 'e2e-02-actions.png') })

// Wait for autosave and inspect the on-disk project.
await page.waitForTimeout(1800)
const saved = readBoard()
check('project.json is written', Boolean(saved), saved?.file)
if (saved) {
  const spaces = saved.project.spaces
  const cardTotal = spaces.reduce((sum, space) => sum + Object.keys(space.cards).length, 0)
  check('on-disk project contains the new material', cardTotal >= initialCards + 1, `cards=${cardTotal}`)
  const assetFiles = countAssetFiles(join(userData, 'data', 'projects'))
  check('asset directory contains files', assetFiles.length >= 1, assetFiles.slice(0, 3).join(', '))
  const importedCard = spaces
    .flatMap((space) => Object.values(space.cards))
    .find((card) => card.assetName === 'e2e-pixel.png')
  check('imported image uses mtasset reference', Boolean(importedCard?.assetUrl?.startsWith('mtasset://')), importedCard?.assetUrl)
}

// Snapshot through the real IPC bridge.
if (saved) {
  const snapshot = await page.evaluate(async (id) => {
    return window.mindtrace.projects.snapshot(id, 'e2e-snapshot')
  }, saved.project.id)
  check('manual snapshot is created', snapshot.ok === true, JSON.stringify(snapshot))
  const backups = join(userData, 'data', 'projects', saved.project.id, 'backups')
  check('snapshot file exists on disk', existsSync(backups) && readdirSync(backups).length > 0)
}

// Custom templates: save the current project, instantiate and remove it.
if (saved) {
  const template = await page.evaluate(async (id) => {
    return window.mindtrace.templates.save(id, 'E2E template', 'Saved by the smoke test')
  }, saved.project.id)
  check('custom template is saved', Boolean(template?.id), JSON.stringify(template ?? null))
  const templateDir = join(userData, 'data', 'templates', template.id)
  check('custom template is written to disk', existsSync(join(templateDir, 'template.json')))
  const instantiated = await page.evaluate(async (id) => {
    return window.mindtrace.templates.instantiate(id, 'E2E instantiated')
  }, template.id)
  check(
    'custom template instantiates a project',
    instantiated?.name === 'E2E instantiated' && instantiated.spaces.length >= 1,
    JSON.stringify({ name: instantiated?.name, spaces: instantiated?.spaces?.length })
  )
  const templateList = await page.evaluate(async () => window.mindtrace.templates.list())
  check('custom template is listed', templateList.some((item) => item.id === template.id))
  await page.evaluate(async (id) => window.mindtrace.templates.remove(id), template.id)
  const remaining = await page.evaluate(async () => window.mindtrace.templates.list())
  check('custom template is removed', !remaining.some((item) => item.id === template.id))
}

// Export the whole project archive through the native save dialog.
const exportPath = join(artifacts, 'e2e-project.mndtr')
await app.evaluate(({ dialog }, filePath) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath })
}, exportPath)
await page.locator('.project-button').click()
await page.waitForSelector('.projects-dialog')
await page.getByRole('button', { name: 'Экспорт .mndtr' }).click()
for (let i = 0; i < 40 && !existsSync(exportPath); i++) await page.waitForTimeout(100)
check('project archive is exported', existsSync(exportPath), exportPath)
if (existsSync(exportPath)) {
  const zip = await JSZip.loadAsync(readFileSync(exportPath))
  check('archive contains project.json', Boolean(zip.file('project.json')))
  check('archive contains asset files', Object.keys(zip.files).some((name) => name.startsWith('assets/')))
}

const projectsBeforeImport = await page.evaluate(() => window.mindtrace.projects.list())
await app.evaluate(({ dialog }, filePath) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
}, exportPath)
await page.getByRole('button', { name: 'Импорт .mndtr' }).click()
await page.waitForFunction(() => !document.querySelector('.projects-dialog'), null, { timeout: 15000 })
await page.waitForSelector('.board')
await page.waitForTimeout(800)
const projectsAfterImport = await page.evaluate(() => window.mindtrace.projects.list())
check('project archive imports as a new project', projectsAfterImport.length === projectsBeforeImport.length + 1, `${projectsBeforeImport.length} -> ${projectsAfterImport.length}`)
const imported = projectsAfterImport.find((project) => !projectsBeforeImport.some((old) => old.id === project.id))
check('imported project has cards', Boolean(imported && imported.cardCount >= 1), JSON.stringify(imported))
if (imported) {
  const importedFile = projectFileById(imported.id)
  check('imported project file exists', existsSync(importedFile), importedFile)
  const importedProject = JSON.parse(readFileSync(importedFile, 'utf8'))
  const importedAssets = importedProject.spaces
    .flatMap((space) => Object.values(space.cards))
    .filter((card) => card.assetUrl?.startsWith('mtasset://'))
  check('imported assets are rewired to the new project', importedAssets.every((card) => card.assetUrl.includes(imported.id)))
}

// Native PNG export through the packaged save flow.
const pngPath = join(artifacts, 'e2e-export.png')
if (existsSync(pngPath)) rmSync(pngPath, { force: true })
await app.evaluate(({ dialog }, filePath) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath })
}, pngPath)
await page.locator('.icon-btn[title^="Экспорт доски"]').click()
await page.waitForSelector('.export-dialog')
await page.getByRole('button', { name: 'Экспорт PNG' }).click()
for (let i = 0; i < 80 && !existsSync(pngPath); i++) await page.waitForTimeout(150)
check('native PNG export produces a file', existsSync(pngPath), pngPath)
if (existsSync(pngPath)) {
  const bytes = readFileSync(pngPath)
  check('PNG file has a valid signature and content', bytes.length > 2000 && bytes[0] === 0x89 && bytes[1] === 0x50, `bytes=${bytes.length}`)
}
await page.locator('.export-dialog .close-btn').click()
await page.waitForFunction(() => !document.querySelector('.export-dialog'))

const cardsBeforeClose = await page.locator('.card').count()
await app.close()
await new Promise((resolve) => setTimeout(resolve, 800))

const relaunched = await launch()
page = relaunched.page
app = relaunched.app
const cardsAfterRelaunch = await page.locator('.card').count()
check('project survives restart', cardsAfterRelaunch >= cardsBeforeClose, `${cardsBeforeClose} -> ${cardsAfterRelaunch}`)
await page.screenshot({ path: join(artifacts, 'e2e-03-relaunch.png') })

check('no uncaught renderer errors', logs.length === 0, logs.slice(0, 5).join('\n'))
await app.close()

console.log(`\n${failures === 0 ? 'ALL DESKTOP TESTS PASSED' : `${failures} DESKTOP TEST(S) FAILED`}`)
if (logs.length) {
  console.log('\nRenderer logs:')
  for (const line of logs.slice(0, 20)) console.log(`  ${line}`)
}
process.exit(failures === 0 ? 0 : 1)
