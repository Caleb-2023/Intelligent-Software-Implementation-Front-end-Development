import { describe, it, expect } from 'vitest'
import {
  API_BASE_URL,
  API_ENDPOINTS,
  DEFAULT_WEATHER_CONTEXT,
  FALLBACK_CLOTHS,
  GEOCODE_API_BASE_URL,
  MAX_STYLING_SELECTIONS,
  STORAGE_KEYS,
  WEATHER_API_BASE_URL,
  GITHUB_PROJECT_URL,
} from './config.js'

describe('config', () => {
  describe('API_BASE_URL', () => {
    it('should be a valid relative path', () => {
      expect(API_BASE_URL).toBe('/api')
    })
  })

  describe('API_ENDPOINTS', () => {
    it('should define all required endpoints', () => {
      expect(API_ENDPOINTS.cloths).toBe('/api/cloths')
      expect(API_ENDPOINTS.tryons).toBe('/api/tryons')
      expect(API_ENDPOINTS.recommendations).toBe('/api/recommendations')
      expect(API_ENDPOINTS.authLogin).toBe('/api/auth/login')
      expect(API_ENDPOINTS.authRegister).toBe('/api/auth/register')
    })
  })

  describe('MAX_STYLING_SELECTIONS', () => {
    it('should be 4', () => {
      expect(MAX_STYLING_SELECTIONS).toBe(4)
    })
  })

  describe('WEATHER_API_BASE_URL', () => {
    it('should point to Open-Meteo', () => {
      expect(WEATHER_API_BASE_URL).toBe('https://api.open-meteo.com/v1/forecast')
    })
  })

  describe('GEOCODE_API_BASE_URL', () => {
    it('should point to Open-Meteo reverse geocode', () => {
      expect(GEOCODE_API_BASE_URL).toBe(
        'https://geocoding-api.open-meteo.com/v1/reverse'
      )
    })
  })

  describe('STORAGE_KEYS', () => {
    it('should use namespaced keys', () => {
      Object.values(STORAGE_KEYS).forEach((key) => {
        expect(key).toMatch(/^auramirror\./)
      })
    })

    it('should define all required keys', () => {
      expect(STORAGE_KEYS.history).toBeDefined()
      expect(STORAGE_KEYS.apiToken).toBeDefined()
      expect(STORAGE_KEYS.authUser).toBeDefined()
      expect(STORAGE_KEYS.authUsers).toBeDefined()
    })
  })

  describe('DEFAULT_WEATHER_CONTEXT', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('city')
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('temperatureC')
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('humidity')
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('weatherLabel')
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('source')
      expect(DEFAULT_WEATHER_CONTEXT).toHaveProperty('status')
    })

    it('should have city set to Fallback Studio', () => {
      expect(DEFAULT_WEATHER_CONTEXT.city).toBe('Fallback Studio')
    })

    it('should have controlled weather label', () => {
      expect(DEFAULT_WEATHER_CONTEXT.weatherLabel).toBe('controlled')
    })

    it('should have fallback source', () => {
      expect(DEFAULT_WEATHER_CONTEXT.source).toBe('fallback')
    })

    it('should have numeric temperature and humidity', () => {
      expect(typeof DEFAULT_WEATHER_CONTEXT.temperatureC).toBe('number')
      expect(typeof DEFAULT_WEATHER_CONTEXT.humidity).toBe('number')
    })
  })

  describe('FALLBACK_CLOTHS', () => {
    it('should be an array', () => {
      expect(Array.isArray(FALLBACK_CLOTHS)).toBe(true)
    })

    it('should contain at least one cloth per category', () => {
      const categories = FALLBACK_CLOTHS.map((c) => c.category)
      expect(categories).toContain('top')
      expect(categories).toContain('bottom')
      expect(categories).toContain('shoes')
    })

    it('each cloth should have required fields', () => {
      FALLBACK_CLOTHS.forEach((cloth) => {
        expect(cloth).toHaveProperty('_id')
        expect(cloth).toHaveProperty('category')
        expect(cloth).toHaveProperty('name')
        expect(cloth).toHaveProperty('attributes')
        expect(cloth.attributes).toHaveProperty('color')
        expect(cloth.attributes).toHaveProperty('material')
        expect(Array.isArray(cloth.attributes.season)).toBe(true)
        expect(Array.isArray(cloth.attributes.occasion)).toBe(true)
      })
    })

    it('each cloth _id should start with demo-', () => {
      FALLBACK_CLOTHS.forEach((cloth) => {
        expect(cloth._id).toMatch(/^demo-/)
      })
    })
  })

  describe('GITHUB_PROJECT_URL', () => {
    it('should be a GitHub URL', () => {
      expect(GITHUB_PROJECT_URL).toContain('github.com')
    })
  })
})
