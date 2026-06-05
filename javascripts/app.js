const form = document.querySelector("#postcode-form");
const postcodeInput = document.querySelector("#postcode");
const submitButton = document.querySelector("#submit-button");
const message = document.querySelector("#message");
const searchPanel = document.querySelector("#search-panel");
const forecastShell = document.querySelector("#forecast-shell");
const result = document.querySelector("#result");
const changeLocationButton = document.querySelector("#change-location");
const shareForecastButton = document.querySelector("#share-forecast");
const shareMessage = document.querySelector("#share-message");

const resultFields = {
  planet: document.querySelector("#score-planet"),
  stars: document.querySelector("#stars"),
  score: document.querySelector("#score"),
  summary: document.querySelector("#summary"),
  location: document.querySelector("#location"),
  moonIcon: document.querySelector("#moon-icon"),
  moonPhase: document.querySelector("#moon-phase"),
  commentary: document.querySelector("#forecast-commentary")
};

const STORAGE_KEY = "stargazingScore.lastPostcode";
const POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
let hasSuccessfulForecast = false;
let currentForecastPath = "/";

postcodeInput.value = localStorage.getItem(STORAGE_KEY) || "";

changeLocationButton.addEventListener("click", () => {
  showSearchScreen();
  updateForecastUrl("/", true);
  postcodeInput.focus();
});

shareForecastButton.addEventListener("click", async () => {
  const url = new URL(currentForecastPath, window.location.origin).toString();

  try {
    await copyText(url);
    showShareMessage("Forecast link copied");
  } catch (error) {
    showShareMessage("Unable to copy link");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawPostcode = postcodeInput.value.trim();
  const normalisedPostcode = normalisePostcode(rawPostcode);

  if (!rawPostcode || !POSTCODE_PATTERN.test(normalisedPostcode)) {
    showError("Enter a valid UK postcode, such as GL52 3LZ.");
    return;
  }

  await loadForecast(normalisedPostcode, { updateUrl: true });
});

window.addEventListener("popstate", () => {
  handleRoute();
});

handleRoute();

async function handleRoute() {
  const routePostcode = getPostcodeFromPath(window.location.pathname);

  if (!routePostcode) {
    showSearchScreen();
    return;
  }

  postcodeInput.value = formatPostcode(routePostcode);
  await loadForecast(routePostcode, { updateUrl: false });
}

async function loadForecast(postcode, options = {}) {
  const normalisedPostcode = normalisePostcode(postcode);

  setLoading(true);
  showMessage("Checking tonight's forecast...");
  forecastShell.hidden = true;
  result.hidden = true;
  showShareMessage("");

  try {
    const location = await fetchPostcodeLocation(normalisedPostcode);
    const weatherData = await fetchTonightWeather(location.latitude, location.longitude);
    const stargazing = calculateStargazingScore(weatherData);

    localStorage.setItem(STORAGE_KEY, location.postcode);
    renderResult(location.postcode, weatherData, stargazing);
    showForecastScreen(location.postcode);

    if (options.updateUrl) {
      updateForecastUrl(`/${normalisePostcode(location.postcode).toLowerCase()}`, true);
    } else {
      currentForecastPath = `/${normalisePostcode(location.postcode).toLowerCase()}`;
    }

    showMessage("Forecast loaded.");
  } catch (error) {
    showError(error.message || "Something went wrong. Please try again.");
    if (!hasSuccessfulForecast) {
      document.body.classList.remove("forecast-ready");
      forecastShell.hidden = true;
      result.hidden = true;
      searchPanel.hidden = false;
      currentForecastPath = "/";
      showShareMessage("");
    }
  } finally {
    setLoading(false);
  }
}

function normalisePostcode(postcode) {
  return postcode.replace(/\s+/g, "").toUpperCase();
}

function formatPostcode(postcode) {
  const normalisedPostcode = normalisePostcode(postcode);
  return `${normalisedPostcode.slice(0, -3)} ${normalisedPostcode.slice(-3)}`;
}

function getPostcodeFromPath(pathname) {
  const segment = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");

  if (!segment || segment.includes("/")) {
    return "";
  }

  const normalisedPostcode = normalisePostcode(segment);
  return POSTCODE_PATTERN.test(normalisedPostcode) ? normalisedPostcode : "";
}

async function fetchPostcodeLocation(postcode) {
  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);

  if (response.status === 404) {
    throw new Error("Postcode not found. Check it and try again.");
  }

  if (!response.ok) {
    throw new Error("Postcode lookup failed. Please try again shortly.");
  }

  const data = await response.json();

  if (!data.result || typeof data.result.latitude !== "number" || typeof data.result.longitude !== "number") {
    throw new Error("Postcode not found. Check it and try again.");
  }

  return {
    postcode: data.result.postcode,
    latitude: data.result.latitude,
    longitude: data.result.longitude
  };
}

async function fetchTonightWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    hourly: "cloud_cover,relative_humidity_2m,visibility",
    forecast_days: "2",
    timezone: "Europe/London"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Weather forecast failed. Please try again shortly.");
  }

  const data = await response.json();
  const tonight = getTonightHourlyData(data.hourly);

  if (!tonight) {
    throw new Error("Tonight's weather data is unavailable for this postcode.");
  }

  return tonight;
}

function getTonightHourlyData(hourly) {
  if (!hourly || !Array.isArray(hourly.time)) {
    return null;
  }

  const now = new Date();
  const today = formatDate(now);
  const tomorrow = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  const hours = hourly.time
    .map((time, index) => ({
      time,
      cloudCover: hourly.cloud_cover?.[index],
      humidity: hourly.relative_humidity_2m?.[index],
      visibilityMetres: hourly.visibility?.[index]
    }))
    .filter((entry) => {
      const hour = Number(entry.time.slice(11, 13));
      const isTonight = entry.time.startsWith(today) && hour >= 20;
      const isEarlyMorning = entry.time.startsWith(tomorrow) && hour <= 2;
      return isTonight || isEarlyMorning;
    })
    .filter((entry) => (
      typeof entry.cloudCover === "number" &&
      typeof entry.humidity === "number" &&
      typeof entry.visibilityMetres === "number"
    ));

  if (hours.length === 0) {
    return null;
  }

  return {
    cloudCover: average(hours.map((entry) => entry.cloudCover)),
    humidity: average(hours.map((entry) => entry.humidity)),
    visibilityMetres: average(hours.map((entry) => entry.visibilityMetres))
  };
}

function calculateStargazingScore(weatherData) {
  const cloudScore = 100 - clamp(weatherData.cloudCover, 0, 100);
  const visibilityScore = clamp(weatherData.visibilityMetres / 100, 0, 100);
  const humidityScore = 100 - clamp(weatherData.humidity, 0, 100);

  const score = Math.round(
    (cloudScore * 0.6) +
    (visibilityScore * 0.25) +
    (humidityScore * 0.15)
  );

  return {
    score,
    rating: scoreToRating(score),
    summary: scoreToSummary(score)
  };
}

function scoreToRating(score) {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  return 1;
}

function scoreToSummary(score) {
  if (score >= 90) return "Excellent viewing conditions";
  if (score >= 70) return "Good viewing conditions";
  if (score >= 50) return "Fair viewing conditions";
  if (score >= 30) return "Poor viewing conditions";
  return "Very poor viewing conditions";
}

function renderResult(postcode, weatherData, stargazing) {
  const moon = calculateMoonPhase(new Date());

  resultFields.planet.className = `score-planet rating-${stargazing.rating}`;
  resultFields.stars.innerHTML = renderStars(stargazing.rating);
  resultFields.stars.setAttribute("aria-label", `${stargazing.rating} out of 5 stars`);
  resultFields.score.textContent = stargazing.score;
  resultFields.summary.textContent = scoreToShortSummary(stargazing.score);
  resultFields.location.textContent = postcode;
  resultFields.moonIcon.className = `moon-icon moon-phase-${moon.phaseIndex}`;
  resultFields.moonIcon.setAttribute("aria-label", moon.name);
  resultFields.moonPhase.textContent = moon.name;
  resultFields.commentary.textContent = createForecastCommentary(weatherData, stargazing.score);
  result.hidden = false;
}

function scoreToShortSummary(score) {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Poor";
  return "Very Poor";
}

function createForecastCommentary(weatherData, score) {
  const cloudCover = Math.round(weatherData.cloudCover);
  const humidity = Math.round(weatherData.humidity);
  const visibility = describeSkyVisibility(weatherData).toLowerCase();

  if (score >= 70) {
    return `Conditions are favourable for stargazing tonight. Cloud cover is expected to stay near ${cloudCover}% and sky visibility should be ${visibility}.`;
  }

  if (score >= 50) {
    return `Stargazing may be possible in clearer spells tonight. Cloud cover is around ${cloudCover}%, with ${visibility} sky visibility and humidity near ${humidity}%.`;
  }

  if (cloudCover >= 75) {
    return `Heavy cloud cover is expected through the evening, making stargazing difficult. Sky visibility is likely to remain ${visibility} and humidity is near ${humidity}%.`;
  }

  return `Conditions look limited for stargazing tonight. Sky visibility is ${visibility}, with cloud cover near ${cloudCover}% and humidity around ${humidity}%.`;
}

function renderStars(rating) {
  return Array.from({ length: 5 }, (_, index) => {
    const className = index < rating ? "star-mark active" : "star-mark";
    return `<span class="${className}" aria-hidden="true"></span>`;
  }).join("");
}

function describeSkyVisibility(weatherData) {
  if (weatherData.cloudCover >= 90) return "Obscured";
  if (weatherData.cloudCover >= 75) return "Very poor";
  if (weatherData.cloudCover >= 50) return "Poor";

  return describeAtmosphericVisibility(weatherData.visibilityMetres);
}

function describeAtmosphericVisibility(visibilityMetres) {
  if (visibilityMetres >= 10000) return "Excellent";
  if (visibilityMetres >= 6000) return "Good";
  if (visibilityMetres >= 3000) return "Fair";
  if (visibilityMetres >= 1000) return "Poor";
  return "Very poor";
}

function calculateMoonPhase(date) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const daysSinceNewMoon = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((daysSinceNewMoon % synodicMonth) + synodicMonth) % synodicMonth;
  const phase = age / synodicMonth;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;

  let phaseIndex = Math.round(phase * 8) % 8;
  const names = [
    "New Moon",
    "Waxing Crescent",
    "First Quarter",
    "Waxing Gibbous",
    "Full Moon",
    "Waning Gibbous",
    "Last Quarter",
    "Waning Crescent"
  ];

  if (illumination < 0.03) {
    phaseIndex = 0;
  } else if (illumination > 0.97) {
    phaseIndex = 4;
  }

  return {
    name: names[phaseIndex],
    illumination,
    phaseIndex
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showMessage(text) {
  message.textContent = text;
  message.classList.remove("error");
}

function showError(text) {
  message.textContent = text;
  message.classList.add("error");
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Checking..." : "Check Tonight";
}

function showSearchScreen() {
  hasSuccessfulForecast = false;
  document.body.classList.remove("forecast-ready");
  forecastShell.hidden = true;
  result.hidden = true;
  searchPanel.hidden = false;
  currentForecastPath = "/";
  showMessage("");
  showShareMessage("");
}

function showForecastScreen(postcode) {
  hasSuccessfulForecast = true;
  document.body.classList.add("forecast-ready");
  searchPanel.hidden = true;
  forecastShell.hidden = false;
  currentForecastPath = `/${normalisePostcode(postcode).toLowerCase()}`;
}

function updateForecastUrl(path, push = false) {
  currentForecastPath = path;

  if (window.location.pathname === path) {
    return;
  }

  const method = push ? "pushState" : "replaceState";
  window.history[method]({}, "", path);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy failed");
  }
}

function showShareMessage(text) {
  shareMessage.textContent = text;
}
