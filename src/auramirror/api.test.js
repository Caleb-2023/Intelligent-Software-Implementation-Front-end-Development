import { describe, expect, it } from 'vitest'
import {
  buildEndpoint,
  normalizeClothRecord,
  normalizeHistoryRecord,
  normalizeServerUser,
  pickFirstArray,
  pickFirstObject,
  unwrapData,
} from './api.js'

describe('auramirror api helpers', () => {
  it('unwrapData should support wrapped and raw payloads', () => {
    expect(unwrapData({ data: { ok: true } })).toEqual({ ok: true })
    expect(unwrapData({ ok: true })).toEqual({ ok: true })
  })

  it('pickFirstArray should read arrays from common response shapes', () => {
    expect(pickFirstArray({ data: { cloths: [1, 2] } }, ['cloths'])).toEqual([
      1,
      2,
    ])
    expect(pickFirstArray({ histories: [3] }, ['histories'])).toEqual([3])
  })

  it('pickFirstObject should read objects from common response shapes', () => {
    expect(
      pickFirstObject({ data: { cloth: { cloth_id: 'c1' } } }, ['cloth'])
    ).toEqual({ cloth_id: 'c1' })
    expect(pickFirstObject({ user: { id: 'u1' } }, ['user'])).toEqual({
      id: 'u1',
    })
  })

  it('buildEndpoint should encode dynamic path params', () => {
    expect(buildEndpoint('/api/cloths/{clothId}', { clothId: 'a/b' })).toBe(
      '/api/cloths/a%2Fb'
    )
  })

  it('normalizeServerUser should support document and current API shapes', () => {
    expect(
      normalizeServerUser({
        user_id: 'u1',
        username: 'caleb',
        email: 'c@example.com',
      })
    ).toMatchObject({
      id: 'u1',
      name: 'caleb',
      email: 'c@example.com',
    })
  })

  it('normalizeClothRecord should support document cloth fields', () => {
    expect(
      normalizeClothRecord({
        cloth_id: 'c1',
        name: 'white shirt',
        category: 'top',
        tags: ['casual'],
        indexed: true,
      })
    ).toMatchObject({
      _id: 'c1',
      name: 'white shirt',
      category: 'top',
      indexed: true,
    })
  })

  it('normalizeHistoryRecord should support server history fields', () => {
    expect(
      normalizeHistoryRecord({
        history_id: 'h1',
        type: 'tryon',
        summary: 'try-on result',
        result_image_url: '/x.png',
        context: { occasion: 'office' },
      })
    ).toMatchObject({
      id: 'h1',
      mode: 'tryon',
      previewImage: '/x.png',
      context: { occasion: 'office' },
    })
  })
})
