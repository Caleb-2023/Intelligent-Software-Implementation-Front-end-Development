export const GITHUB_PROJECT_URL =
  'https://github.com/Felixzijunliang/wardrobe'
export const QR_ASSET_VERSION = 'v4'
export const QR_DEFAULT_SRC = `/images/qr-wardrobe-github-light.png?${QR_ASSET_VERSION}`
export const QR_LIGHT_SRC = `/images/qr-wardrobe-github-light.png?${QR_ASSET_VERSION}`
export const API_BASE_URL = '/api'
export const MAX_STYLING_SELECTIONS = 4
export const WEATHER_API_BASE_URL = 'https://api.open-meteo.com/v1/forecast'
export const GEOCODE_API_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/reverse'
export const STORAGE_KEYS = {
  history: 'auramirror.recommendation.history.v1',
  apiToken: 'auramirror.api.token',
  authUser: 'auramirror.auth.user',
}
export const API_ENDPOINTS = {
  cloths: `${API_BASE_URL}/cloths`,
  tryons: `${API_BASE_URL}/tryons`,
  recommendations: `${API_BASE_URL}/recommendations`,
  authLogin: `${API_BASE_URL}/auth/login`,
  authRegister: `${API_BASE_URL}/auth/register`,
}
export const DEFAULT_WEATHER_CONTEXT = {
  city: 'Fallback Studio',
  temperatureC: 22,
  humidity: 48,
  latitude: null,
  longitude: null,
  weatherCode: null,
  weatherLabel: 'controlled',
  source: 'fallback',
  status: 'idle',
  error: '',
  lastUpdatedAt: 0,
}

export const FALLBACK_CLOTHS = [
  {
    _id: 'demo-top-graphite',
    category: 'top',
    name: 'Graphite Jacket',
    attributes: {
      color: 'graphite',
      material: 'wool blend',
      season: ['autumn', 'winter'],
      occasion: ['work', 'formal'],
    },
  },
  {
    _id: 'demo-top-berry',
    category: 'top',
    name: 'Berry Hoodie',
    attributes: {
      color: 'berry',
      material: 'cotton fleece',
      season: ['autumn', 'winter'],
      occasion: ['casual', 'sport'],
    },
  },
  {
    _id: 'demo-bottom-stone',
    category: 'bottom',
    name: 'Stone Trousers',
    attributes: {
      color: 'stone',
      material: 'twill',
      season: ['spring', 'autumn'],
      occasion: ['work', 'casual'],
    },
  },
  {
    _id: 'demo-bottom-charcoal',
    category: 'bottom',
    name: 'Charcoal Chinos',
    attributes: {
      color: 'charcoal',
      material: 'cotton',
      season: ['spring', 'autumn'],
      occasion: ['work', 'travel'],
    },
  },
  {
    _id: 'demo-shoes-onyx',
    category: 'shoes',
    name: 'Onyx Sneakers',
    attributes: {
      color: 'onyx',
      material: 'mesh',
      season: ['spring', 'summer'],
      occasion: ['casual', 'travel'],
    },
  },
  {
    _id: 'demo-shoes-cream',
    category: 'shoes',
    name: 'Cream Trainers',
    attributes: {
      color: 'cream',
      material: 'leather',
      season: ['spring', 'summer'],
      occasion: ['casual', 'work'],
    },
  },
]
