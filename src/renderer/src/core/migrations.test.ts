import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { normalizeProject } from './migrations'
import { PROJECT_FORMAT_VERSION } from '@shared/types'

describe('project migration', () => {
  it('normalises a looser legacy project without losing cards or threads', () => {
    const legacy = {
      id: 'prj_legacy',
      name: 'Legacy',
      spaces: [
        {
          id: 'space_legacy',
          name: 'Old board',
          cards: [
            {
              id: 'old_a',
              kind: 'text',
              x: 10,
              y: 20,
              w: 300,
              h: 200,
              z: 1,
              title: 'A',
              body: '<p>A</p>'
            },
            {
              id: 'old_b',
              kind: 'note',
              x: 400,
              y: 50,
              w: 200,
              h: 150,
              title: 'B',
              body: '<p>B</p>'
            }
          ],
          threads: {
            old_thread: {
              id: 'old_thread',
              from: { cardId: 'old_a', pinId: 'e' },
              to: { cardId: 'old_b', pinId: 'w' }
            }
          },
          strokes: {
            old_stroke: { id: 'old_stroke', tool: 'chalk', points: [0, 0, 10, 10] }
          }
        }
      ]
    } as unknown as Project

    const project = normalizeProject(legacy)
    expect(project.format).toBe(PROJECT_FORMAT_VERSION)
    expect(project.categories).toEqual([])
    expect(project.spaces).toHaveLength(1)
    const space = project.spaces[0]
    expect(Array.isArray(space.cards)).toBe(false)
    expect(Object.keys(space.cards)).toHaveLength(2)
    expect(space.cards.old_a.pins).toEqual([])
    expect(space.cards.old_a.categories).toEqual([])
    expect(space.threads.old_thread.color).toBeTruthy()
    expect(space.strokes.old_stroke.width).toBeGreaterThan(0)
    expect(space.camera).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(project.activeSpaceId).toBe('space_legacy')
  })

  it('drops threads whose endpoints no longer exist', () => {
    const legacy = {
      id: 'prj_legacy',
      name: 'Legacy',
      spaces: [
        {
          id: 'space_legacy',
          cards: {},
          threads: {
            ghost: { id: 'ghost', from: { cardId: 'x', pinId: 'e' }, to: { cardId: 'y', pinId: 'w' } }
          },
          strokes: {}
        }
      ]
    } as unknown as Project
    const project = normalizeProject(legacy)
    expect(Object.keys(project.spaces[0].threads)).toHaveLength(0)
  })

  it('falls back to a valid active space', () => {
    const project = normalizeProject({
      id: 'prj_x',
      name: 'X',
      activeSpaceId: 'missing',
      spaces: [
        {
          id: 'space_1',
          name: 'Board',
          cards: {},
          threads: {},
          strokes: {}
        }
      ]
    } as unknown as Project)
    expect(project.activeSpaceId).toBe('space_1')
  })
})
