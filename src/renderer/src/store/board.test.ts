import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard } from './board'
import { useSettings } from './settings'
import { newProject } from '@/core/defaults'
import { DEFAULT_SETTINGS } from '@shared/settings'

function projectWithCards() {
  const project = newProject('Test project')
  useBoard.getState().openProject(project)
  const board = useBoard.getState()
  const a = board.createCard('text', { x: 100, y: 100 }, { title: 'A' })
  const b = board.createCard('note', { x: 500, y: 200 }, { title: 'B' })
  return { a: a as NonNullable<typeof a>, b: b as NonNullable<typeof b> }
}

beforeEach(() => {
  useSettings.getState().replace(structuredClone(DEFAULT_SETTINGS))
  useBoard.getState().openProject(newProject('Fresh'))
})

describe('board store', () => {
  it('creates cards and supports undo/redo', () => {
    const { a } = projectWithCards()
    const space = useBoard.getState().project!.spaces[0]
    expect(space.cards[a.id]).toBeTruthy()
    expect(useBoard.getState().history.past.at(-1)?.label).toBe('Add card')

    useBoard.getState().undo()
    expect(Object.keys(useBoard.getState().project!.spaces[0].cards)).toHaveLength(1)
    useBoard.getState().undo()
    expect(Object.keys(useBoard.getState().project!.spaces[0].cards)).toHaveLength(0)
    useBoard.getState().redo()
    useBoard.getState().redo()
    expect(Object.keys(useBoard.getState().project!.spaces[0].cards)).toHaveLength(2)
  })

  it('moves multiple cards as one undoable transaction', () => {
    const project = newProject('Move test')
    useBoard.getState().openProject(project)
    const board = useBoard.getState()
    const a = board.createCard('text', { x: 0, y: 0 }, { title: 'A' })!
    const b = board.createCard('note', { x: 300, y: 200 }, { title: 'B' })!
    const ax = a.x
    const ay = a.y
    const bx = b.x
    board.setSelection({ cards: [a.id, b.id] })
    board.beginHistory('Move cards')
    board.translateCards([a.id, b.id], 60, 25)
    board.commitHistory()
    const space = useBoard.getState().project!.spaces[0]
    expect(space.cards[a.id].x).toBe(ax + 60)
    expect(space.cards[b.id].x).toBe(bx + 60)

    useBoard.getState().undo()
    const restored = useBoard.getState().project!.spaces[0]
    expect(restored.cards[a.id].x).toBe(ax)
    expect(restored.cards[a.id].y).toBe(ay)
  })

  it('creates threads and removes them with a deleted endpoint', () => {
    const { a, b } = projectWithCards()
    const board = useBoard.getState()
    const threadId = board.createThread({ cardId: a.id, pinId: 'e' }, { cardId: b.id, pinId: 'w' })
    expect(threadId).toBeTruthy()
    expect(Object.keys(useBoard.getState().project!.spaces[0].threads)).toHaveLength(1)

    board.selectCard(a.id)
    board.deleteSelection()
    expect(Object.keys(useBoard.getState().project!.spaces[0].threads)).toHaveLength(0)
    expect(useBoard.getState().project!.spaces[0].cards[a.id]).toBeUndefined()

    useBoard.getState().undo()
    expect(useBoard.getState().project!.spaces[0].threads[threadId as string]).toBeTruthy()
  })

  it('copies and pastes cards with remapped pins and threads', () => {
    const { a, b } = projectWithCards()
    const board = useBoard.getState()
    board.setSelection({ cards: [a.id, b.id] })
    board.copySelection()
    expect(board.pasteClipboard({ x: 0, y: 800 })).toBe(2)
    const space = useBoard.getState().project!.spaces[0]
    expect(Object.keys(space.cards)).toHaveLength(4)
    const ids = Object.keys(space.cards)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('groups, collapses and ungroups without deleting cards', () => {
    const { a, b } = projectWithCards()
    const board = useBoard.getState()
    board.setSelection({ cards: [a.id, b.id] })
    const groupId = board.groupSelection('Evidence')!
    expect(useBoard.getState().project!.spaces[0].groups[groupId]).toBeTruthy()
    expect(useBoard.getState().project!.spaces[0].cards[a.id].groupId).toBe(groupId)

    board.toggleGroupCollapsed(groupId)
    expect(useBoard.getState().project!.spaces[0].groups[groupId].collapsed).toBe(true)
    board.ungroup([groupId])
    const space = useBoard.getState().project!.spaces[0]
    expect(space.groups[groupId]).toBeUndefined()
    expect(space.cards[a.id]).toBeTruthy()
  })

  it('filters by text and category', () => {
    const project = newProject('Filter')
    project.categories = [{ id: 'cat_test', name: 'Important', color: '#f00' }]
    useBoard.getState().openProject(project)
    const card = useBoard.getState().createCard('text', { x: 0, y: 0 }, {
      title: 'Emerald lead',
      body: '<p>Ask about the vault key</p>',
      categories: ['cat_test']
    })!
    useBoard.getState().setFilter({ active: true, query: 'vault', categories: [], kinds: [] })
    const space = useBoard.getState().project!.spaces[0]
    expect(space.cards[card.id].title).toContain('Emerald')
    const state = useBoard.getState()
    expect(state.filter.query).toBe('vault')
    state.clearFilter()
    expect(useBoard.getState().filter.active).toBe(false)
  })

  it('keeps a space when deleting the last remaining one', () => {
    const project = newProject('Spaces')
    useBoard.getState().openProject(project)
    const spaceId = project.spaces[0].id
    useBoard.getState().deleteSpace(spaceId)
    expect(useBoard.getState().project!.spaces).toHaveLength(1)
  })

  it('records drawing additions in history', () => {
    const project = newProject('Draw')
    useBoard.getState().openProject(project)
    const board = useBoard.getState()
    board.addStroke({
      id: 'stroke_test',
      tool: 'chalk',
      color: '#fff',
      width: 2,
      opacity: 0.8,
      points: [0, 0, 10, 10],
      seed: 1,
      createdAt: 1
    })
    expect(Object.keys(useBoard.getState().project!.spaces[0].strokes)).toHaveLength(1)
    useBoard.getState().undo()
    expect(Object.keys(useBoard.getState().project!.spaces[0].strokes)).toHaveLength(0)
  })

  it('follows connection chains to the configured depth', () => {
    const project = newProject('Chain')
    useBoard.getState().openProject(project)
    const board = useBoard.getState()
    const a = board.createCard('text', { x: 0, y: 0 }, { title: 'A' })!
    const b = board.createCard('text', { x: 300, y: 0 }, { title: 'B' })!
    const c = board.createCard('text', { x: 600, y: 0 }, { title: 'C' })!
    board.createThread({ cardId: a.id, pinId: 'e' }, { cardId: b.id, pinId: 'w' })
    board.createThread({ cardId: b.id, pinId: 'e' }, { cardId: c.id, pinId: 'w' })
    board.selectCard(a.id)
    useBoard.getState().selectConnected(1)
    expect(useBoard.getState().selection.cards.sort()).toEqual([a.id, b.id].sort())
    useBoard.getState().selectCard(a.id)
    useBoard.getState().selectConnected(2)
    expect(useBoard.getState().selection.cards.sort()).toEqual([a.id, b.id, c.id].sort())
  })

  it('changes card layer order and undoes it', () => {
    const project = newProject('Layers')
    useBoard.getState().openProject(project)
    const board = useBoard.getState()
    const a = board.createCard('text', { x: 0, y: 0 }, { title: 'A' })!
    const b = board.createCard('text', { x: 100, y: 0 }, { title: 'B' })!
    const c = board.createCard('text', { x: 200, y: 0 }, { title: 'C' })!
    board.selectCard(a.id)
    board.bringForward('front')
    const ordered = Object.values(useBoard.getState().project!.spaces[0].cards)
      .sort((x, y) => x.z - y.z)
      .map((card) => card.id)
    expect(ordered[ordered.length - 1]).toBe(a.id)
    useBoard.getState().undo()
    const restored = useBoard.getState().project!.spaces[0].cards
    expect(restored[a.id].z).toBe(a.z)
    expect(restored[b.id].z).toBe(b.z)
    expect(restored[c.id].z).toBe(c.z)
  })

  it('duplicates a space with remapped cards, pins and threads', () => {
    const project = newProject('Spaces copy')
    useBoard.getState().openProject(project)
    const board = useBoard.getState()
    const a = board.createCard('text', { x: 0, y: 0 }, { title: 'A' })!
    const b = board.createCard('note', { x: 400, y: 0 }, { title: 'B' })!
    board.createThread({ cardId: a.id, pinId: 'e' }, { cardId: b.id, pinId: 'w' })
    const sourceSpaceId = useBoard.getState().activeSpaceId!
    useBoard.getState().duplicateSpace(sourceSpaceId)
    const state = useBoard.getState()
    const duplicated = state.project!.spaces.find((space) => space.id === state.activeSpaceId)!
    expect(duplicated.id).not.toBe(sourceSpaceId)
    expect(Object.keys(duplicated.cards)).toHaveLength(2)
    expect(Object.keys(duplicated.threads)).toHaveLength(1)
    const thread = Object.values(duplicated.threads)[0]
    expect(duplicated.cards[thread.from.cardId]).toBeTruthy()
    expect(duplicated.cards[thread.to.cardId]).toBeTruthy()
    expect(thread.from.cardId).not.toBe(a.id)
    expect(thread.to.cardId).not.toBe(b.id)
  })
})
