import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const userData = resolve(root, 'test-artifacts', 'ui-userdata')
const artifacts = resolve(root, 'test-artifacts')
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })

const logs = []
let failures = 0
function check(name, ok, extra = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name} ${extra}`)
  }
}

const app = await electron.launch({
  executablePath: electronExe,
  args: ['.'],
  cwd: root,
  env: { ...process.env, MINDTRACE_USER_DATA: userData }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => logs.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(m.text())
})
await page.waitForSelector('.board', { timeout: 20000 })
const homeScreen = page.locator('.home-screen')
if (await homeScreen.count()) {
  const resume = homeScreen.getByRole('button', { name: /Продолжить/ }).first()
  if (await resume.count()) await resume.click()
  await page.waitForFunction(() => !document.querySelector('.home-screen'), null, { timeout: 15000 })
}
await page.waitForFunction(() => document.querySelectorAll('.card').length > 5)
await page.screenshot({ path: join(artifacts, 'ui-01-board.png') })

// Thread hit-testing: clicking the curve should select the connection.
const threadPoint = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.thread-hit')]
  for (const path of paths) {
    const length = path.getTotalLength()
    const matrix = path.getScreenCTM()
    if (!matrix) continue
    for (let i = 1; i < 20; i++) {
      const point = path.getPointAtLength((length * i) / 20)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      if (screen.x < 2 || screen.y < 2 || screen.x > innerWidth - 2 || screen.y > innerHeight - 2) continue
      const hit = document.elementFromPoint(screen.x, screen.y)
      if (hit?.closest('[data-thread-id]')) return { x: screen.x, y: screen.y }
    }
  }
  return null
})
if (threadPoint) {
  await page.mouse.click(threadPoint.x, threadPoint.y)
  await page.waitForTimeout(200)
  const threadSelected = await page.evaluate(() => {
    const title = document.querySelector('.inspector .inspector-kicker')?.textContent ?? ''
    return title === 'СОЕДИНЕНИЕ'
  })
  check('clicking a thread selects it', threadSelected, JSON.stringify(threadPoint))
  await page.keyboard.press('Escape')
} else {
  check('thread hit target exists', false)
}

// Settings
await page.locator('.icon-btn[title^="Настройки"]').click()
await page.waitForSelector('.settings-dialog')
check('settings opens', true)
const navLabels = await page.locator('.settings-nav button').allInnerTexts()
check('settings categories are present', navLabels.some((text) => text.includes('Поверхность доски')) && navLabels.some((text) => text.includes('Данные и резервные копии')))
await page.screenshot({ path: join(artifacts, 'ui-02-settings.png') })

await page.locator('.settings-nav button', { hasText: 'Интерфейс' }).click()
await page.waitForTimeout(100)
const hasThemeSelect = await page.evaluate(() => {
  const selects = [...document.querySelectorAll('.settings-content select')]
  return selects.some((select) => [...select.options].some((option) => option.value === 'light'))
})
check('interface theme control exists', hasThemeSelect)
if (hasThemeSelect) {
  await page.evaluate(() => {
    const select = [...document.querySelectorAll('.settings-content select')].find((el) =>
      [...el.options].some((option) => option.value === 'light')
    )
    if (!select) return
    select.value = 'light'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  check('light theme applies live', true)
  await page.screenshot({ path: join(artifacts, 'ui-03-light-theme.png') })
  await page.evaluate(() => {
    const select = [...document.querySelectorAll('.settings-content select')].find((el) =>
      [...el.options].some((option) => option.value === 'dark')
    )
    if (!select) return
    select.value = 'dark'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
}
await page.keyboard.press('Escape')
await page.waitForFunction(() => !document.querySelector('.settings-dialog'))

// Focus / overview modes
const cardCount = await page.locator('.card').count()
await page.locator('.card.kind-note').first().click()
await page.waitForTimeout(250)
const modeButtons = await page.locator('.mode-switch button').allInnerTexts()
check('mode switch exposes three modes', modeButtons.join(' ').includes('Доска') && modeButtons.join(' ').includes('Фокус') && modeButtons.join(' ').includes('Обзор'), modeButtons.join(','))
await page.getByRole('button', { name: 'Фокус', exact: true }).click()
await page.waitForTimeout(350)
const dimmed = await page.locator('.card.is-dimmed').count()
check('focus mode dims unrelated cards', dimmed > 0, `dimmed=${dimmed}`)
await page.screenshot({ path: join(artifacts, 'ui-04-focus.png') })
await page.getByRole('button', { name: 'Обзор', exact: true }).click()
await page.waitForTimeout(350)
check('overview mode simplifies rendering', (await page.locator('.board').getAttribute('data-lod')) === 'on')
const labels = await page.locator('.lod-label').count()
check('overview shows readable labels', labels > 0, `labels=${labels}`)
await page.screenshot({ path: join(artifacts, 'ui-05-overview.png') })
await page.getByRole('button', { name: 'Доска', exact: true }).click()
await page.waitForTimeout(200)

// Context menu
await page.mouse.click(700, 600, { button: 'right' })
await page.waitForSelector('.context-menu')
check('right-click opens the context menu', true)
await page.keyboard.press('Escape')
await page.waitForFunction(() => !document.querySelector('.context-menu'))

// Filter
const beforeFilter = await page.locator('.card').count()
await page.locator('.icon-btn[title*="Фильтр"]').click()
await page.waitForSelector('.filter-dialog')
const filterInput = page.locator('.filter-dialog input[placeholder*="Поиск по доске"]')
await filterInput.fill('изумруд')
await page.waitForTimeout(300)
const afterFilter = await page.locator('.card').count()
check('filter hides non-matching cards', afterFilter < beforeFilter, `${beforeFilter} -> ${afterFilter}`)
await page.screenshot({ path: join(artifacts, 'ui-06-filter.png') })
await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
await page.waitForTimeout(200)
await page.locator('.filter-dialog .btn-primary').click()
await page.waitForTimeout(200)
check('clearing the filter returns all cards', (await page.locator('.card').count()) === beforeFilter)

// Resize + custom pin on the left-most card that is not under the inspector.
await page.locator('.inspector .head-actions button').click().catch(() => null)
const target = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  for (const card of cards) {
    const r = card.getBoundingClientRect()
    if (r.width > 80 && r.right < 1000 && r.top > 80) {
      return { x: r.left + 30, y: r.top + 20, id: card.dataset.cardId, width: r.width, height: r.height }
    }
  }
  return null
})
if (target) {
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(250)
  const selectedId = await page.evaluate(() => document.querySelector('.card.selected')?.dataset.cardId)
  check('card selection opens inspector', Boolean(selectedId))
  const handle = await page.locator('.card.selected .resize-handle[data-handle="se"]').boundingBox()
  if (handle) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 50, handle.y + 35, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    const widthAfter = await page.locator(`[data-card-id="${selectedId}"]`).evaluate((el) => parseFloat(el.style.width))
    check('resize handle changes card size', widthAfter > target.width + 10, `${target.width} -> ${widthAfter}`)
    await page.keyboard.press('Control+Z')
    await page.waitForTimeout(200)
  } else {
    check('resize handle is available', false)
  }
  await page.keyboard.down('Alt')
  await page.mouse.click(target.x + 35, target.y + 25)
  await page.keyboard.up('Alt')
  await page.waitForTimeout(250)
  const customPins = await page.locator('.card.selected .pin-anchor.is-custom').count()
  check('Alt+click adds a custom pin', customPins > 0, `custom=${customPins}`)
  await page.screenshot({ path: join(artifacts, 'ui-07-resize-pin.png') })
}

check('no renderer errors', logs.length === 0, logs.slice(0, 4).join('\n'))
await app.close()
console.log(`\n${failures === 0 ? 'ALL UI TESTS PASSED' : `${failures} UI TEST(S) FAILED`}`)
process.exit(failures ? 1 : 0)
