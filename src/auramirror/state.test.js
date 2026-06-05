import { describe, it, expect, beforeEach } from 'vitest'

// We need to reset the module each time since state is a singleton
describe('state', () => {
  let state

  beforeEach(async () => {
    // Force fresh import by using a query parameter
    const module = await import('./state.js?v=' + Math.random())
    state = module.state
  })

  it('should have default uploadedPhoto as empty string', () => {
    expect(state.uploadedPhoto).toBe('')
  })

  it('should have default uploadedPhotoFile as null', () => {
    expect(state.uploadedPhotoFile).toBeNull()
  })

  it('should have empty avatarDataUrl', () => {
    expect(state.avatarDataUrl).toBe('')
  })

  it('should have default figureStatus as idle', () => {
    expect(state.figureStatus).toBe('idle')
  })

  it('should have empty clothCatalog array', () => {
    expect(Array.isArray(state.clothCatalog)).toBe(true)
    expect(state.clothCatalog).toHaveLength(0)
  })

  it('should have empty clothLookup object', () => {
    expect(state.clothLookup).toEqual({})
  })

  it('should have empty selectedClothIds array', () => {
    expect(Array.isArray(state.selectedClothIds)).toBe(true)
    expect(state.selectedClothIds).toHaveLength(0)
  })

  it('should have default wardrobeMode as fallback', () => {
    expect(state.wardrobeMode).toBe('fallback')
  })

  it('should have empty wardrobeStatus', () => {
    expect(state.wardrobeStatus).toBe('')
  })

  it('should have null lastRecommendation', () => {
    expect(state.lastRecommendation).toBeNull()
  })

  it('should have empty historyEntries array', () => {
    expect(Array.isArray(state.historyEntries)).toBe(true)
    expect(state.historyEntries).toHaveLength(0)
  })

  it('should have default authMode as login', () => {
    expect(state.authMode).toBe('login')
  })

  it('should have empty authToken', () => {
    expect(state.authToken).toBe('')
  })

  it('should have null authUser', () => {
    expect(state.authUser).toBeNull()
  })

  it('should have dashboardOpen as false', () => {
    expect(state.dashboardOpen).toBe(false)
  })

  it('should have default selections', () => {
    expect(state.selections).toBeDefined()
    expect(state.selections.top).toBe('graphite')
    expect(state.selections.bottom).toBe('stone')
    expect(state.selections.shoes).toBe('onyx')
    expect(state.selections.weather).toBe('cloudy')
    expect(state.selections.occasion).toBe('office')
  })

  it('should have weatherContext with fallback defaults', () => {
    expect(state.weatherContext).toBeDefined()
    expect(state.weatherContext.city).toBe('Fallback Studio')
    expect(state.weatherContext.temperatureC).toBe(22)
    expect(state.weatherContext.humidity).toBe(48)
    expect(state.weatherContext.weatherLabel).toBe('controlled')
    expect(state.weatherContext.source).toBe('fallback')
  })

  it('should have mutable state properties', () => {
    state.authToken = 'test-token-123'
    expect(state.authToken).toBe('test-token-123')

    state.selectedClothIds.push('item-1', 'item-2')
    expect(state.selectedClothIds).toHaveLength(2)

    state.wardrobeMode = 'remote'
    expect(state.wardrobeMode).toBe('remote')
  })

  it('should have historyScrollTween as null', () => {
    expect(state.historyScrollTween).toBeNull()
  })

  it('should have historyScrollTrigger as null', () => {
    expect(state.historyScrollTrigger).toBeNull()
  })

  it('should have empty historyDistortions array', () => {
    expect(Array.isArray(state.historyDistortions)).toBe(true)
    expect(state.historyDistortions).toHaveLength(0)
  })
})
