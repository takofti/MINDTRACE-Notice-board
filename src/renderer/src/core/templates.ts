import type { Project, Space } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createDemoProject } from './demo'
import { makeGroup, newCard, newProject, newThread } from './defaults'
import { uid } from './id'
import { tNow } from '@/i18n'

export interface BuiltinTemplate {
  id: string
  nameKey: string
  descriptionKey: string
  custom: false
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'empty', nameKey: 'Empty board', descriptionKey: 'Blank space with a clean start.', custom: false },
  {
    id: 'investigation',
    nameKey: 'Investigation',
    descriptionKey: 'A ready board for collecting evidence and suspects.',
    custom: false
  },
  {
    id: 'research',
    nameKey: 'Research',
    descriptionKey: 'A place for sources, notes and findings.',
    custom: false
  },
  {
    id: 'study',
    nameKey: 'Study',
    descriptionKey: 'Structured space for notes, formulas and topics.',
    custom: false
  },
  {
    id: 'planning',
    nameKey: 'Planning',
    descriptionKey: 'Plan tasks, milestones and dependencies visually.',
    custom: false
  }
]

function planningSpace(): Space {
  const settings = DEFAULT_SETTINGS
  const space: Space = {
    id: uid('sp'),
    name: tNow('Planning board'),
    description: tNow('Goals, milestones and risks'),
    camera: { x: 0, y: 0, zoom: 0.86 },
    cards: {},
    threads: {},
    strokes: {},
    groups: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  const goals = newCard('text', {
    at: { x: 0, y: 0 },
    settings,
    title: tNow('Project goals'),
    body:
      tNow('<p>What does success look like? Write the outcome before the tasks.</p><p><strong>Primary goal:</strong> …</p>'),
    categories: []
  })
  const milestones = newCard('note', {
    at: { x: 430, y: -40 },
    settings,
    color: '#a9cbb6',
    body:
      tNow('<p><strong>Milestones</strong></p><p>01 — discovery<br>02 — prototype<br>03 — review<br>04 — release</p>')
  })
  const risks = newCard('note', {
    at: { x: 430, y: 240 },
    settings,
    color: '#e7a4b2',
    body: tNow('<p><strong>Risks</strong></p><p>Scope creep. Unclear owner. Missing feedback loop.</p>')
  })
  const next = newCard('note', {
    at: { x: -20, y: 300 },
    settings,
    color: '#e8c56a',
    body: tNow('<p><strong>Next action</strong></p><p>Pick one measurable next step and finish it.</p>')
  })
  const cards = [goals, milestones, risks, next]
  cards.forEach((card, index) => (card.z = index + 1))
  space.cards = Object.fromEntries(cards.map((card) => [card.id, card]))
  space.threads = {
    [uid('thr')]: newThread({ cardId: goals.id, pinId: 'e' }, { cardId: milestones.id, pinId: 'w' }, settings),
    [uid('thr')]: newThread({ cardId: goals.id, pinId: 'se' }, { cardId: risks.id, pinId: 'w' }, settings),
    [uid('thr')]: newThread({ cardId: goals.id, pinId: 's' }, { cardId: next.id, pinId: 'n' }, settings)
  }
  const group = makeGroup(tNow('Overview'), '#c99a3d')
  for (const card of cards) card.groupId = group.id
  space.groups = { [group.id]: group }
  return space
}

export function buildBuiltinProject(templateId: string, name: string): Project {
  if (templateId === 'investigation' || templateId === 'research' || templateId === 'study') {
    const demo = createDemoProject()
    const index = templateId === 'investigation' ? 0 : templateId === 'research' ? 1 : 2
    const space = demo.spaces[index]
    const project: Project = {
      ...demo,
      id: uid('local'),
      name,
      description: demo.spaces[index].description,
      spaces: [space],
      activeSpaceId: space.id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    space.camera = { ...space.camera, zoom: templateId === 'investigation' ? 0.68 : 0.85 }
    return project
  }
  if (templateId === 'planning') {
    const project = newProject(name)
    const space = planningSpace()
    project.spaces = [space]
    project.activeSpaceId = space.id
    return project
  }
  const project = newProject(name)
  return project
}
