import { state } from "../state.mjs";
import { $ } from "../utils/dom.mjs";

export function inferWeatherBucket(tempC, humidity) {
  if (typeof tempC !== "number") {
    return "cloudy";
  }

  if (tempC <= 1) {
    return "snowy";
  }

  if (typeof humidity === "number" && humidity >= 82) {
    return "rainy";
  }

  if (tempC >= 27 && (typeof humidity !== "number" || humidity < 72)) {
    return "sunny";
  }

  return "cloudy";
}

export function mapWeatherForStyling(weather) {
  if (weather === "rainy") {
    return "rain";
  }

  if (weather === "sunny") {
    return "hot";
  }

  if (weather === "snowy") {
    return "cold";
  }

  if (weather === "cloudy") {
    return "mild";
  }

  return weather || "mild";
}

export function updateWeatherContextUi() {
  const { city, temperatureC, humidity } = state.weatherContext;
  const cityEl = $("#am-context-city");
  const tempEl = $("#am-context-temp");
  const humidityEl = $("#am-context-humidity");
  const aiCityEl = $("#am-ai-city");
  const aiTempEl = $("#am-ai-temp");
  const aiHumidityEl = $("#am-ai-humidity");
  const cityWordEl = $("#am-ai-word-city");
  const weatherWordEl = $("#am-ai-word-weather");
  const occasionWordEl = $("#am-ai-word-occasion");

  const tempText = typeof temperatureC === "number" ? `${Math.round(temperatureC)}C` : "--";
  const humidityText = typeof humidity === "number" ? `${Math.round(humidity)}%` : "--";

  if (cityEl) {
    cityEl.textContent = `City: ${city || "Unknown"}`;
  }

  if (tempEl) {
    tempEl.textContent = `Temp: ${tempText}`;
  }

  if (humidityEl) {
    humidityEl.textContent = `Humidity: ${humidityText}`;
  }

  if (aiCityEl) {
    aiCityEl.textContent = `City: ${city || "Unknown"}`;
  }

  if (aiTempEl) {
    aiTempEl.textContent = `Temp: ${tempText}`;
  }

  if (aiHumidityEl) {
    aiHumidityEl.textContent = `Humidity: ${humidityText}`;
  }

  if (cityWordEl) {
    cityWordEl.textContent = String(city || "Unknown").toUpperCase().slice(0, 16);
  }

  if (weatherWordEl) {
    weatherWordEl.textContent = String(state.selections.weather || "mild").toUpperCase();
  }

  if (occasionWordEl) {
    occasionWordEl.textContent = String(state.selections.occasion || "office").toUpperCase();
  }

  if (state.aiFxController && typeof state.aiFxController.setWeather === "function") {
    state.aiFxController.setWeather(state.selections.weather || "cloudy");
  }

  const weatherSelect = $("#am-weather");
  if (weatherSelect) {
    weatherSelect.value = state.selections.weather;
  }
}

export async function fetchWeatherContext() {
  const supportsGeo = typeof navigator !== "undefined" && navigator.geolocation;

  const setFallback = () => {
    state.weatherContext = {
      city: "Unknown",
      temperatureC: null,
      humidity: null,
      latitude: null,
      longitude: null
    };
    state.selections.weather = "cloudy";
    updateWeatherContextUi();
  };

  if (!supportsGeo) {
    setFallback();
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 5 * 60 * 1000
      });
    });

    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,relative_humidity_2m`;
    const cityUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`;

    const [weatherRes, cityRes] = await Promise.all([
      fetch(weatherUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch(cityUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null)
    ]);

    const temperatureC = Number(weatherRes?.current?.temperature_2m);
    const humidity = Number(weatherRes?.current?.relative_humidity_2m);
    const city = String(cityRes?.city || cityRes?.locality || cityRes?.principalSubdivision || cityRes?.countryName || "Unknown");

    state.weatherContext = {
      city,
      temperatureC: Number.isFinite(temperatureC) ? temperatureC : null,
      humidity: Number.isFinite(humidity) ? humidity : null,
      latitude,
      longitude
    };

    state.selections.weather = inferWeatherBucket(state.weatherContext.temperatureC, state.weatherContext.humidity);
    updateWeatherContextUi();
  } catch {
    setFallback();
  }
}
