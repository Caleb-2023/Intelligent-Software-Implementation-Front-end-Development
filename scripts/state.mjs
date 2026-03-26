export const state = {
  uploadedPhoto: "",
  uploadedPhotoFile: null,
  uploadedPhotoFingerprint: "",
  syncedPhotoFingerprint: "",
  avatarDataUrl: "",
  figureId: "",
  figureStatus: "idle",
  clothCatalog: [],
  clothLookup: {},
  selectedClothIds: [],
  wardrobeMode: "fallback",
  wardrobeStatus: "",
  lastRecommendation: null,
  historyScrollTween: null,
  historyScrollTrigger: null,
  historyDistortions: [],
  aiFxRaf: 0,
  aiFxCleanup: null,
  aiFxController: null,
  aiParallaxCleanup: null,
  weatherContext: {
    city: "Unknown",
    temperatureC: null,
    humidity: null,
    latitude: null,
    longitude: null
  },
  selections: {
    top: "graphite",
    bottom: "stone",
    shoes: "onyx",
    weather: "cloudy",
    occasion: "office"
  }
};
