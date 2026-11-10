import type { Card, Category, Project, Thread } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { DEFAULT_CATEGORIES, demoStroke, makeGroup, newCard, newProject, newSpace } from './defaults'
import { uid } from './id'

function svg(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.trim())}`
}

const GEM_IMAGE = svg(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="720" viewBox="0 0 900 720">
  <defs>
    <radialGradient id="bg" cx="48%" cy="42%" r="75%">
      <stop offset="0" stop-color="#243239"/><stop offset=".62" stop-color="#11161a"/><stop offset="1" stop-color="#07090b"/>
    </radialGradient>
    <linearGradient id="em" x1="0" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#8bf3c6"/><stop offset=".38" stop-color="#25b482"/><stop offset="1" stop-color="#064a36"/>
    </linearGradient>
    <linearGradient id="em2" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#0b654a"/><stop offset="1" stop-color="#67dfb4"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="26"/></filter>
  </defs>
  <rect width="900" height="720" fill="url(#bg)"/>
  <g opacity=".33" stroke="#8da1a8" stroke-width="1">
    <path d="M60 120h780M60 240h780M60 360h780M60 480h780M60 600h780"/>
    <path d="M120 60v600M300 60v600M480 60v600M660 60v600M840 60v600"/>
  </g>
  <ellipse cx="470" cy="560" rx="245" ry="55" fill="#000" opacity=".7" filter="url(#blur)"/>
  <ellipse cx="456" cy="386" rx="240" ry="210" fill="#2ed49a" opacity=".14" filter="url(#blur)"/>
  <g transform="translate(456 356) rotate(-8)">
    <polygon points="0,-206 172,-58 118,158 -118,158 -172,-58" fill="url(#em)" stroke="#a9ffdc" stroke-opacity=".55" stroke-width="2"/>
    <polygon points="0,-206 54,-52 0,158 -54,-52" fill="#8cf5cb" opacity=".28"/>
    <polygon points="0,-206 -172,-58 -54,-52" fill="#c2ffe6" opacity=".2"/>
    <polygon points="0,-206 172,-58 54,-52" fill="#042e24" opacity=".45"/>
    <polygon points="-172,-58 -118,158 -54,-52" fill="#052f25" opacity=".38"/>
    <polygon points="172,-58 118,158 54,-52" fill="#b6ffe1" opacity=".16"/>
    <polygon points="-118,158 0,82 118,158 0,158" fill="#021a15" opacity=".33"/>
    <path d="M-90 -130 30 -166" stroke="#effff8" stroke-width="3" opacity=".55" stroke-linecap="round"/>
  </g>
  <g fill="#a9b6ba" font-family="ui-monospace,Consolas,monospace" font-size="17" opacity=".8">
    <text x="54" y="668">EVIDENCE 04</text>
    <text x="54" y="692" fill="#6f7d82">EAST WING VAULT — 23:38</text>
    <text x="756" y="668">ISO 640</text>
  </g>
  <rect x="34" y="34" width="832" height="652" fill="none" stroke="#d4cbb5" stroke-opacity=".2"/>
  <g stroke="#d4cbb5" stroke-opacity=".45" stroke-width="2">
    <path d="M34 92h62M66 60v64M804 628h62M835 596v64"/>
  </g>
</svg>`)

const MAP_IMAGE = svg(`
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="660" viewBox="0 0 1000 660">
  <defs>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M46 0H0V46" fill="none" stroke="#7d9ca5" stroke-opacity=".12"/>
    </pattern>
  </defs>
  <rect width="1000" height="660" fill="#111a1e"/>
  <rect width="1000" height="660" fill="url(#grid)"/>
  <g fill="none" stroke="#7fa6ae" stroke-opacity=".6">
    <path d="M120 82h580v120h-170v128h380v240H410V442H120z" stroke-width="3"/>
    <path d="M120 82v378h290v-158h170" stroke-width="2" stroke-dasharray="10 8"/>
    <rect x="648" y="330" width="182" height="150" stroke="#c8553d" stroke-opacity=".9" stroke-width="4"/>
    <path d="M700 415h76M738 377v76" stroke="#c8553d" stroke-opacity=".9" stroke-width="2"/>
  </g>
  <g fill="#8fb1b8" font-family="ui-monospace,Consolas,monospace" font-size="18" opacity=".9">
    <text x="145" y="125">EAST WING</text>
    <text x="145" y="152" font-size="14" opacity=".65">SERVICE CORRIDOR</text>
    <text x="558" y="312">VAULT</text>
    <text x="672" y="510" fill="#c8553d">CAMERA 03 — OFFLINE</text>
    <text x="150" y="535">STAIR B</text>
    <text x="792" y="125">23:40</text>
  </g>
  <g fill="#c8553d">
    <circle cx="728" cy="405" r="7"/>
    <circle cx="560" cy="470" r="5" opacity=".7"/>
    <circle cx="190" cy="460" r="5" opacity=".7"/>
  </g>
  <path d="M728 405 560 470 430 442 320 340 190 460" fill="none" stroke="#c8553d" stroke-width="4" stroke-dasharray="12 10" opacity=".8"/>
  <g transform="translate(840 590)" opacity=".6" stroke="#a9bdb9" fill="none">
    <circle r="22"/><path d="M0-34V-22M0 34V22M-34 0H-22M34 0H22"/>
  </g>
  <rect x="24" y="24" width="952" height="612" fill="none" stroke="#cfc7b6" stroke-opacity=".22"/>
</svg>`)

const SONAR_IMAGE = svg(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
  <defs>
    <radialGradient id="sea" cx="50%" cy="52%" r="68%">
      <stop offset="0" stop-color="#12303a"/><stop offset=".6" stop-color="#07151c"/><stop offset="1" stop-color="#040a0d"/>
    </radialGradient>
    <radialGradient id="sonar"><stop offset="0" stop-color="#59e6c2" stop-opacity=".5"/><stop offset="1" stop-color="#59e6c2" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="900" height="700" fill="url(#sea)"/>
  <g transform="translate(450 350)" fill="none" stroke="#5fd3b8" stroke-opacity=".38">
    <circle r="270" stroke-width="1.5"/><circle r="205"/><circle r="140"/><circle r="75"/>
    <path d="M-310 0h620M0-310v620"/>
    <path d="M0 0 212-108" stroke="#7af0cf" stroke-width="2" stroke-opacity=".8"/>
    <path d="M0 0-164 142" stroke="#7af0cf" stroke-opacity=".4"/>
  </g>
  <g fill="#63e9c6">
    <circle cx="590" cy="420" r="6"/><circle cx="340" cy="255" r="4" opacity=".7"/>
    <circle cx="300" cy="455" r="5" opacity=".8"/><circle cx="520" cy="220" r="3" opacity=".5"/>
  </g>
  <g transform="translate(450 350)">
    <circle r="150" fill="url(#sonar)"/>
    <path d="M-40 20c30-44 66 36 96-8s-40-62-8-90 74 34 96-10" fill="none" stroke="#8dffe4" stroke-width="3" opacity=".9"/>
  </g>
  <g fill="#a7c4c2" font-family="ui-monospace,Consolas,monospace" font-size="18" opacity=".85">
    <text x="46" y="56">HYDROPHONE ARRAY / PASSIVE</text>
    <text x="46" y="82" fill="#5d7d7e">47.2184° N   12.4301° W</text>
    <text x="46" y="650">GAIN +18 dB</text>
    <text x="700" y="650">74 s LOOP</text>
  </g>
  <rect x="30" y="30" width="840" height="640" fill="none" stroke="#b9d4ce" stroke-opacity=".15"/>
</svg>`)

const MOLECULE_IMAGE = svg(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
  <rect width="900" height="700" fill="#15211d"/>
  <g opacity=".08" stroke="#dff5e8"><path d="M0 100h900M0 240h900M0 380h900M0 520h900M0 660h900M120 0v700M300 0v700M480 0v700M660 0v700M840 0v700"/></g>
  <g fill="none" stroke="#e9f2e9" stroke-width="4" stroke-linecap="round" opacity=".85">
    <path d="M220 470 330 340 470 370 540 240 680 270 720 430 600 520 470 500 330 540z"/>
    <path d="M330 340 300 210M540 240 510 120M720 430 820 490M470 500 430 600M600 520 700 600"/>
    <path d="M470 370 470 500M540 240 470 370" stroke-width="2" opacity=".5"/>
  </g>
  <g font-family="ui-monospace,Consolas,monospace" font-size="26" fill="#effaf2">
    <text x="300" y="325">N</text><text x="455" y="355">C</text><text x="525" y="222">O</text>
    <text x="688" y="252">C</text><text x="730" y="430">C</text><text x="605" y="538">C</text>
    <text x="455" y="518">C</text><text x="315" y="558">C</text>
  </g>
  <g font-family="ui-monospace,Consolas,monospace" fill="#9dbcb0" opacity=".8" font-size="18">
    <text x="50" y="66">ORGANIC CHEMISTRY / CH. 07</text>
    <text x="50" y="644">NUCLEOPHILIC SUBSTITUTION</text>
  </g>
  <rect x="28" y="28" width="844" height="644" fill="none" stroke="#c9ded2" stroke-opacity=".2"/>
</svg>`)

function baseCard(partial: Partial<Card> & { id?: string; kind: Card['kind']; x: number; y: number; w: number; h: number }): Card {
  const now = Date.now()
  return {
    id: partial.id ?? uid('card'),
    kind: partial.kind,
    x: partial.x,
    y: partial.y,
    w: partial.w,
    h: partial.h,
    z: partial.z ?? 1,
    title: partial.title ?? '',
    body: partial.body ?? '',
    assetUrl: partial.assetUrl,
    assetName: partial.assetName,
    mime: partial.mime,
    caption: partial.caption,
    color: partial.color,
    style: {
      radius: 10,
      shadow: true,
      opacity: 1,
      fontSize: partial.kind === 'note' ? 16 : 14,
      fontFamily: 'Inter, Segoe UI, sans-serif',
      imageFit: 'cover',
      ...partial.style
    },
    categories: partial.categories ?? [],
    pins: partial.pins ?? [],
    groupId: partial.groupId,
    locked: partial.locked,
    hidden: partial.hidden,
    createdAt: now,
    updatedAt: now
  }
}

function link(cards: Card[], fromCard: number, fromPin: string, toCard: number, toPin: string, color: string, label?: string): Thread {
  const a = cards[fromCard]
  const b = cards[toCard]
  return {
    id: uid('thr'),
    from: { cardId: a.id, pinId: fromPin },
    to: { cardId: b.id, pinId: toPin },
    color,
    width: 2,
    style: 'thread',
    label,
    curve: 0.3,
    opacity: 0.95,
    createdAt: Date.now()
  }
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, steps = 46): number[] {
  const pts: number[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const wobble = 1 + Math.sin(angle * 3.1) * 0.012 + Math.cos(angle * 5.3) * 0.008
    pts.push(cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble)
  }
  return pts
}

function circlePoints(cx: number, cy: number, r: number, steps = 30): number[] {
  return ellipsePoints(cx, cy, r, r, steps)
}

function welcomeNote(categories: Category[]): Card {
  return baseCard({
    kind: 'note',
    x: -60,
    y: 500,
    w: 520,
    h: 150,
    color: '#d8cfc0',
    title: '',
    body:
      '<p><strong>This is a physical space.</strong> Drag cards anywhere. Hover one and pull from a faint pin to tie a thread. Every thread is attached to the exact points you choose.</p>',
    categories: [categories[1].id],
    style: { fontSize: 15, fontFamily: 'Georgia, serif' }
  })
}

export function createDemoProject(): Project {
  const project = newProject('The Emerald Case')
  project.description = 'A demonstration workspace — replace it with your own investigation.'
  project.categories = structuredClone(DEFAULT_CATEGORIES)
  const cat = project.categories

  const firstSpace = project.spaces[0]
  firstSpace.name = 'Case 01 · Emerald'
  firstSpace.description = 'Who moved the emerald?'

  const gem = baseCard({
    kind: 'image',
    x: -610,
    y: -300,
    w: 360,
    h: 290,
    title: 'The emerald',
    assetUrl: GEM_IMAGE,
    assetName: 'emerald-evidence.svg',
    mime: 'image/svg+xml',
    caption: 'Vault camera still — 23:38',
    categories: [cat[0].id]
  })
  const find = baseCard({
    kind: 'text',
    x: -150,
    y: -320,
    w: 340,
    h: 200,
    title: 'Find the emerald',
    body:
      '<p>The emerald disappeared between <strong>23:10</strong> and <strong>23:40</strong>. No forced entry. The vault log shows a valid badge at 23:14.</p><p>Start with the people who had access.</p>',
    categories: [cat[0].id, cat[2].id]
  })
  const log = baseCard({
    kind: 'note',
    x: 280,
    y: -320,
    w: 260,
    h: 210,
    color: '#e8c56a',
    body:
      '<p><strong>Security log</strong></p><p>23:14 — badge #041 entered<br>23:26 — camera 03 lost feed<br>23:31 — loading bay door opened</p>',
    categories: [cat[0].id]
  })
  const key = baseCard({
    kind: 'note',
    x: -90,
    y: 60,
    w: 260,
    h: 180,
    color: '#e7a4b2',
    body: '<p><strong>Ask M. about the vault key</strong></p><p>She signed it out on Tuesday and did not sign it back in.</p>',
    categories: [cat[2].id, cat[3].id]
  })
  const map = baseCard({
    kind: 'image',
    x: -600,
    y: 150,
    w: 420,
    h: 285,
    title: 'East wing · camera blind spot',
    assetUrl: MAP_IMAGE,
    assetName: 'east-wing-map.svg',
    mime: 'image/svg+xml',
    caption: 'Camera 03 covers the vault door only. The service corridor is blind.',
    categories: [cat[0].id]
  })
  const sticker = baseCard({
    kind: 'note',
    x: 320,
    y: 80,
    w: 170,
    h: 110,
    color: '#9fbfdc',
    body: '<p style="text-align:center"><strong>UNSOLVED</strong></p><p style="text-align:center;font-size:12px">no forced entry</p>',
    categories: [cat[2].id],
    style: { fontSize: 20 }
  })
  const peopleGroup = makeGroup('Persons of interest', '#c99a3d')
  const moreau = baseCard({
    kind: 'note',
    x: 690,
    y: -230,
    w: 250,
    h: 170,
    color: '#a9cbb6',
    body: '<p><strong>V. Moreau</strong></p><p>Auctioneer. Badge #041. Claims she left at 23:20 — the loading bay says otherwise.</p>',
    groupId: peopleGroup.id,
    categories: [cat[3].id]
  })
  const collector = baseCard({
    kind: 'note',
    x: 690,
    y: -10,
    w: 250,
    h: 170,
    color: '#d8a77a',
    body: '<p><strong>The Collector</strong></p><p>Anonymous buyer. Paid in advance for “a green stone”. Never seen in person.</p>',
    groupId: peopleGroup.id,
    categories: [cat[2].id]
  })
  const welcome = welcomeNote(cat)

  const cards = [gem, find, log, key, map, sticker, moreau, collector, welcome]
  cards.forEach((card, index) => (card.z = index + 1))
  firstSpace.cards = Object.fromEntries(cards.map((card) => [card.id, card]))
  firstSpace.groups = { [peopleGroup.id]: peopleGroup }
  firstSpace.threads = {
    [uid('thr')]: link(cards, 0, 's', 1, 'w', '#b33a3a'),
    [uid('thr')]: link(cards, 1, 'e', 2, 'w', '#b33a3a'),
    [uid('thr')]: link(cards, 0, 's', 4, 'n', '#b33a3a'),
    [uid('thr')]: link(cards, 1, 's', 3, 'n', '#b33a3a'),
    [uid('thr')]: link(cards, 3, 'e', 5, 'w', '#d9d4c7', 'access'),
    [uid('thr')]: link(cards, 2, 'e', 6, 'nw', '#5b8db8', 'badge #041'),
    [uid('thr')]: link(cards, 6, 's', 7, 'n', '#5b8db8')
  }
  // Thread helpers above used index references; keys are already unique.
  const circle = demoStroke(
    'chalk',
    ellipsePoints(-160, -120, 560, 315),
    '#efeadd',
    2.5,
    0.32
  )
  const arrow = demoStroke(
    'arrow',
    [290, 190, 330, 190, 330, 120, 400, 120],
    '#c8553d',
    2.5,
    0.55
  )
  firstSpace.strokes = { [circle.id]: circle, [arrow.id]: arrow }
  firstSpace.camera = { x: 165, y: 205, zoom: 0.68 }
  firstSpace.updatedAt = Date.now()

  const research = newSpace('Research · Deep sea signals', { x: 0, y: 20, zoom: 0.9 })
  research.description = 'Hydrophone anomaly, North Atlantic'
  const sonar = baseCard({
    kind: 'image',
    x: -560,
    y: -230,
    w: 410,
    h: 310,
    title: 'Passive array · signal 47B',
    assetUrl: SONAR_IMAGE,
    assetName: 'sonar-array.svg',
    mime: 'image/svg+xml',
    caption: 'Repeating tonal pattern. 74 second interval. No known vessel.',
    categories: [cat[0].id]
  })
  const hydro = baseCard({
    kind: 'text',
    x: -70,
    y: -220,
    w: 340,
    h: 190,
    title: 'Hydrophone anomaly',
    body:
      '<p>The array picked up a low-frequency pattern for <strong>six hours</strong> on 3 March. It repeats with almost perfect regularity.</p><p>Natural sources rarely hold a 74 s rhythm.</p>',
    categories: [cat[2].id]
  })
  const compare = baseCard({
    kind: 'note',
    x: 340,
    y: -170,
    w: 240,
    h: 170,
    color: '#9fbfdc',
    body: '<p><strong>Compare</strong></p><p>2023 expedition recorded something similar at 220 Hz — dismissed as equipment noise.</p>',
    categories: [cat[3].id]
  })
  const next = baseCard({
    kind: 'text',
    x: 20,
    y: 90,
    w: 340,
    h: 190,
    title: 'Next steps',
    body: '<ol><li>Pull the raw WAV from buoy 4.</li><li>Overlay both recordings.</li><li>Ask Dr. S. about the 220 Hz claim.</li></ol>',
    categories: [cat[1].id]
  })
  const researchCards = [sonar, hydro, compare, next]
  researchCards.forEach((card, i) => (card.z = i + 1))
  research.cards = Object.fromEntries(researchCards.map((c) => [c.id, c]))
  research.threads = {
    [uid('thr')]: link(researchCards, 0, 'e', 1, 'w', '#5b8db8'),
    [uid('thr')]: link(researchCards, 1, 'e', 2, 'w', '#5b8db8'),
    [uid('thr')]: link(researchCards, 1, 's', 3, 'n', '#5b8db8'),
    [uid('thr')]: link(researchCards, 3, 'e', 2, 's', '#c99a3d')
  }
  research.strokes = {
    [uid('str')]: demoStroke(
      'chalk',
      [30, 380, 90, 340, 150, 390, 210, 350, 270, 400, 330, 360, 390, 405, 450, 355],
      '#9fd7d0',
      3,
      0.5
    )
  }
  research.updatedAt = Date.now()

  const study = newSpace('Study · Organic chemistry', { x: 0, y: 0, zoom: 0.92 })
  study.description = 'Reaction mechanisms'
  const molecule = baseCard({
    kind: 'image',
    x: -540,
    y: -210,
    w: 390,
    h: 300,
    title: 'Backbone sketch',
    assetUrl: MOLECULE_IMAGE,
    assetName: 'molecule.svg',
    mime: 'image/svg+xml',
    caption: 'Ch. 07 — nucleophilic substitution',
    categories: [cat[1].id]
  })
  const sn = baseCard({
    kind: 'text',
    x: -70,
    y: -230,
    w: 360,
    h: 210,
    title: 'Nucleophilic substitution',
    body:
      '<p><strong>S<sub>N</sub>1:</strong> two steps. Carbocation intermediate. Rate depends only on substrate.</p><p><strong>S<sub>N</sub>2:</strong> one step. Backside attack. Inversion of configuration.</p>',
    categories: [cat[0].id]
  })
  const nucleophile = baseCard({
    kind: 'note',
    x: 350,
    y: -170,
    w: 240,
    h: 170,
    color: '#a9cbb6',
    body: '<p><strong>Remember</strong></p><p>Nucleophile = electron-rich. It wants the nucleus, not the electrons.</p>',
    categories: [cat[1].id]
  })
  const compare2 = baseCard({
    kind: 'note',
    x: 30,
    y: 80,
    w: 300,
    h: 210,
    color: '#e8c56a',
    body:
      '<p><strong>S<sub>N</sub>1 vs S<sub>N</sub>2</p><p>S<sub>N</sub>1 — tertiary, polar protic solvent.<br>S<sub>N</sub>2 — methyl/primary, polar aprotic, strong nucleophile.</p>',
    categories: [cat[3].id]
  })
  const studyCards = [molecule, sn, nucleophile, compare2]
  studyCards.forEach((card, i) => (card.z = i + 1))
  study.cards = Object.fromEntries(studyCards.map((c) => [c.id, c]))
  study.threads = {
    [uid('thr')]: link(studyCards, 0, 'e', 1, 'w', '#c99a3d'),
    [uid('thr')]: link(studyCards, 1, 'e', 2, 'w', '#c99a3d'),
    [uid('thr')]: link(studyCards, 1, 's', 3, 'n', '#c99a3d')
  }
  const mole = circlePoints(-120, 120, 42)
  study.strokes = {
    [uid('str')]: demoStroke('chalk', mole, '#e9e6dd', 2.5, 0.4),
    [uid('str')]: demoStroke('chalk', [330, 330, 420, 330, 470, 390, 540, 390], '#e9e6dd', 2.5, 0.35)
  }
  study.updatedAt = Date.now()

  project.spaces = [firstSpace, research, study]
  project.activeSpaceId = firstSpace.id
  project.updatedAt = Date.now()

  // Mark the demo cards as connected pin hints: no persistent unused pins exist.
  return project
}

/** A clean, inviting board used when the user creates a new project. */
export function createStarterProject(name: string): Project {
  const project = newProject(name)
  project.categories = structuredClone(DEFAULT_CATEGORIES)
  const cat = project.categories
  const space = project.spaces[0]
  space.name = 'Board 01'
  const note = newCard('note', {
    at: { x: 0, y: 0 },
    settings: DEFAULT_SETTINGS,
    body:
      '<p><strong>Your board is ready.</strong></p><p>Double-click empty space to add a card. Hover any card to reveal its pins, then pull a thread to another card.</p>',
    categories: [cat[1].id],
    color: '#e8c56a'
  })
  const hint = newCard('text', {
    at: { x: 420, y: 0 },
    settings: DEFAULT_SETTINGS,
    title: 'Start here',
    body:
      '<p>Drop images, video, PDFs or documents onto the board. Draw with chalk. Everything stays exactly where you put it.</p><p>Press <strong>Ctrl+K</strong> to search, or open Settings to shape the board to your taste.</p>',
    categories: [cat[0].id]
  })
  note.z = 1
  hint.z = 2
  space.cards = { [note.id]: note, [hint.id]: hint }
  space.camera = { x: 180, y: 0, zoom: 1 }
  return project
}
