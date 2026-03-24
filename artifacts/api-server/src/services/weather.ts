/**
 * Weather service using wttr.in — completely free, no API key required.
 * For production scale, swap to OpenWeatherMap (OPENWEATHERMAP_API_KEY).
 */

interface WttrCurrent {
  temp_C: string;
  temp_F: string;
  FeelsLikeC: string;
  humidity: string;
  windspeedKmph: string;
  weatherDesc: { value: string }[];
  weatherCode: string;
}

interface WttrResponse {
  current_condition: WttrCurrent[];
  nearest_area: {
    areaName: { value: string }[];
    country: { value: string }[];
  }[];
}

const WEATHER_CODE_EMOJI: Record<string, string> = {
  "113": "☀️", "116": "⛅", "119": "☁️", "122": "☁️",
  "143": "🌫️", "176": "🌦️", "179": "🌨️", "182": "🌧️",
  "185": "🌧️", "200": "⛈️", "227": "🌨️", "230": "❄️",
  "248": "🌫️", "260": "🌫️", "263": "🌦️", "266": "🌧️",
  "281": "🌧️", "284": "🌧️", "293": "🌦️", "296": "🌧️",
  "299": "🌧️", "302": "🌧️", "305": "🌧️", "308": "🌧️",
  "311": "🌧️", "314": "🌧️", "317": "🌨️", "320": "🌨️",
  "323": "🌨️", "326": "🌨️", "329": "❄️", "332": "❄️",
  "335": "❄️", "338": "❄️", "350": "🌧️", "353": "🌦️",
  "356": "🌧️", "359": "🌧️", "362": "🌨️", "365": "🌨️",
  "368": "🌨️", "371": "❄️", "374": "🌨️", "377": "🌨️",
  "386": "⛈️", "389": "⛈️", "392": "⛈️", "395": "❄️",
};

export async function getWeather(location: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(location.trim());
    const url = `https://wttr.in/${encoded}?format=j1`;

    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Mo-AI-Assistant/1.0" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return `I couldn't retrieve weather data for ${location} right now.`;
    }

    const data = await res.json() as WttrResponse;
    const current = data.current_condition?.[0];
    const area = data.nearest_area?.[0];

    if (!current) {
      return `No weather data available for ${location}.`;
    }

    const desc = current.weatherDesc?.[0]?.value ?? "Unknown";
    const tempC = parseInt(current.temp_C, 10);
    const tempF = parseInt(current.temp_F, 10);
    const feelsC = parseInt(current.FeelsLikeC, 10);
    const humidity = current.humidity;
    const wind = current.windspeedKmph;
    const emoji = WEATHER_CODE_EMOJI[current.weatherCode] ?? "🌡️";
    const place = area?.areaName?.[0]?.value ?? location;
    const country = area?.country?.[0]?.value ?? "";

    return [
      `${emoji} ${desc} in ${place}${country ? `, ${country}` : ""}.`,
      `Temperature: ${tempC}°C / ${tempF}°F (feels like ${feelsC}°C).`,
      `Humidity: ${humidity}%, wind: ${wind} km/h.`,
    ].join(" ");
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return `Weather request timed out for ${location}. Please try again.`;
    }
    return `Unable to fetch weather for ${location}.`;
  }
}
