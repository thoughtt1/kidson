const KID_AGE_MIN_MONTHS = 12;
const KID_AGE_MAX_MONTHS = 72;
const WALKING_KMH = 3.8;
const MAX_COURSE_SUGGESTIONS = 5;
const DEFAULT_AVAILABLE_MINUTES = 150;
const DEFAULT_CENTER = { lat: 37.5715, lng: 126.978 };
const NAVER_MAP_SCRIPT_URL = "https://oapi.map.naver.com/openapi/v3/maps.js";
const NAVER_MAP_SUBMODULES = "geocoder";
const SPOT_COLOR = "#43a563";
const ACTIVE_SPOT_COLOR = "#1f6a40";
const DEFAULT_RESULTS_CAPTION = "지금 우리 아이랑 놀기 좋은 곳의 동선을 확인해보세요";

const staticSpots = [
  { id: "s1", name: "강변 놀이터", lat: 37.574, lng: 126.976, minAge: 12, maxAge: 72, stayMin: 35, type: "playground" },
  { id: "s2", name: "어린이 도서관 코너", lat: 37.572, lng: 126.984, minAge: 18, maxAge: 72, stayMin: 30, type: "library" },
  { id: "s3", name: "키즈 실내 체육관", lat: 37.569, lng: 126.979, minAge: 12, maxAge: 60, stayMin: 45, type: "indoor" },
  { id: "s4", name: "미니 과학 체험관", lat: 37.566, lng: 126.973, minAge: 30, maxAge: 72, stayMin: 40, type: "museum" },
  { id: "s5", name: "유모차 산책 공원길", lat: 37.567, lng: 126.988, minAge: 12, maxAge: 72, stayMin: 30, type: "park" },
  { id: "s6", name: "동물 먹이 체험장", lat: 37.562, lng: 126.982, minAge: 24, maxAge: 72, stayMin: 50, type: "experience" },
  { id: "s7", name: "물놀이 광장", lat: 37.578, lng: 126.986, minAge: 20, maxAge: 72, stayMin: 40, type: "outdoor" },
  { id: "s8", name: "부모-아이 공예 스튜디오", lat: 37.571, lng: 126.969, minAge: 24, maxAge: 72, stayMin: 35, type: "creative" }
];

let spots = [...staticSpots];

const distanceKmInput = document.getElementById("distanceKm");
const distanceValue = document.getElementById("distanceValue");
const timeMinutesInput = document.getElementById("timeMinutes");
const timeValue = document.getElementById("timeValue");
const useLocationBtn = document.getElementById("useLocationBtn");
const suggestBtn = document.getElementById("suggestBtn");
const routeList = document.getElementById("routeList");
const mapElement = document.getElementById("map");
const resultsCaption = document.getElementById("resultsCaption");
const selectedPlaceList = document.getElementById("selectedPlaceList");
const clearSelectedBtn = document.getElementById("clearSelectedBtn");
const nearbyPlaceList = document.getElementById("nearbyPlaceList");
const nearbyCount = document.getElementById("nearbyCount");

let startPoint = { ...DEFAULT_CENTER };
let map = null;
let startMarker = null;
let routePolyline = null;
let isFetchingNearby = false;
const selectedPlaces = [];
const spotMarkers = new Map();
const spotInfoWindows = new Map();

bindUiEvents();
redrawStartArea();
timeValue.textContent = timeMinutesInput.value;
setResultsCaption(DEFAULT_RESULTS_CAPTION);
renderSelectedPlaces();
renderNearbyPlaces();
renderSuggestions();
bootstrapNaverMap();

function bindUiEvents() {
  if (clearSelectedBtn) {
    clearSelectedBtn.addEventListener("click", clearSelectedPlaces);
  }

  distanceKmInput.addEventListener("input", () => {
    distanceValue.textContent = distanceKmInput.value;
    redrawStartArea();
    renderSuggestions();
  });

  timeMinutesInput.addEventListener("input", () => {
    timeValue.textContent = timeMinutesInput.value;
    renderSuggestions();
  });

  useLocationBtn.addEventListener("click", async () => {
    await requestCurrentLocation({
      showFailureAlert: true,
      refreshNearby: true
    });
  });

  suggestBtn.addEventListener("click", async () => {
    await syncNearbyAndRender();
  });
}

async function bootstrapNaverMap() {
  const mapKeyId = getNaverMapKeyId();
  if (!mapKeyId || mapKeyId === "YOUR_NCP_KEY_ID") {
    showMapSetupMessage("네이버 지도 Key ID를 입력하면 지도가 표시됩니다.");
    return;
  }

  try {
    await loadNaverMapScript(mapKeyId);
    initializeMap();
    await requestCurrentLocation({
      showFailureAlert: false,
      refreshNearby: false
    });
    redrawStartArea();
    await syncNearbyAndRender();
  } catch (error) {
    console.error(error);
    showMapSetupMessage("네이버 지도 로딩에 실패했습니다. Key ID와 서비스 URL을 확인해 주세요.");
  }
}

async function requestCurrentLocation({ showFailureAlert = true, refreshNearby = true } = {}) {
  if (!navigator.geolocation) {
    if (showFailureAlert) {
      alert("현재 브라우저에서 위치 정보를 지원하지 않습니다.");
    }
    return false;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        startPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        if (map && window.naver && window.naver.maps) {
          map.setCenter(toLatLng(startPoint));
          map.setZoom(14, true);
        }

        redrawStartArea();

        if (refreshNearby) {
          await syncNearbyAndRender();
        }

        resolve(true);
      },
      () => {
        if (showFailureAlert) {
          alert("현재 위치를 가져오지 못했습니다. 지도 중심 기준으로 추천합니다.");
        }
        resolve(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

function getNaverMapKeyId() {
  const keyId = typeof window.NAVER_MAP_KEY_ID === "string" ? window.NAVER_MAP_KEY_ID.trim() : "";
  if (keyId) return keyId;

  const legacyClientId = typeof window.NAVER_MAP_CLIENT_ID === "string" ? window.NAVER_MAP_CLIENT_ID.trim() : "";
  return legacyClientId;
}

function loadNaverMapScript(mapKeyId) {
  if (window.naver && window.naver.maps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.naverMapsSdk = "true";
    script.src = `${NAVER_MAP_SCRIPT_URL}?ncpKeyId=${encodeURIComponent(mapKeyId)}&submodules=${encodeURIComponent(NAVER_MAP_SUBMODULES)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Naver map script load failed"));
    document.head.appendChild(script);
  });
}

function initializeMap() {
  if (!window.naver || !window.naver.maps) {
    throw new Error("Naver map SDK is unavailable.");
  }

  map = new naver.maps.Map("map", {
    center: toLatLng(startPoint),
    zoom: 14,
    zoomControl: true,
    zoomControlOptions: {
      position: naver.maps.Position.BOTTOM_RIGHT
    },
    mapDataControl: false,
    scaleControl: false
  });

  startMarker = new naver.maps.Marker({
    map,
    position: toLatLng(startPoint),
    title: "출발 지점"
  });

  renderSpotMarkers();

  naver.maps.Event.addListener(map, "click", async (event) => {
    startPoint = {
      lat: event.coord.lat(),
      lng: event.coord.lng()
    };
    redrawStartArea();
    await syncNearbyAndRender();
  });
}

async function syncNearbyAndRender() {
  await refreshNearbySpots();
  renderSuggestions();
}

function getNearbyProxyUrl() {
  const raw = typeof window.NAVER_LOCAL_PROXY_URL === "string" ? window.NAVER_LOCAL_PROXY_URL.trim() : "";
  if (!raw) return "";
  try {
    return new URL(raw, window.location.href).toString();
  } catch {
    return "";
  }
}

function getNearbyQueries() {
  const configured = window.NAVER_LOCAL_SEARCH_QUERIES;
  if (Array.isArray(configured)) {
    const cleaned = configured
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (cleaned.length) return cleaned;
  }
  return ["키즈카페", "실내놀이터", "어린이도서관", "유아 체험", "놀이터"];
}

async function refreshNearbySpots() {
  const proxyUrl = getNearbyProxyUrl();
  if (!proxyUrl) {
    spots = [...staticSpots];
    rerenderSpotMarkers();
    setResultsCaption(DEFAULT_RESULTS_CAPTION);
    return;
  }

  if (isFetchingNearby) return;
  isFetchingNearby = true;
  setSearchButtonLoading(true);

  try {
    const areaHint = await resolveAreaHint(startPoint);
    const queries = getNearbyQueries();
    const params = new URLSearchParams({
      lat: String(startPoint.lat),
      lng: String(startPoint.lng),
      radiusKm: String(distanceKmInput.value),
      queries: queries.join(","),
      withDetails: "1"
    });
    if (areaHint) {
      params.set("areaHint", areaHint);
    }

    const joiner = proxyUrl.includes("?") ? "&" : "?";
    const response = await fetch(`${proxyUrl}${joiner}${params.toString()}`);
    if (!response.ok) {
      throw new Error(`nearby proxy request failed: ${response.status}`);
    }

    const payload = await response.json();
    const liveSpots = normalizeNearbyItems(payload.items || [], Number(distanceKmInput.value));

    if (liveSpots.length) {
      spots = liveSpots;
      setResultsCaption(`지금 우리 아이랑 놀기 좋은 곳의 동선을 확인해보세요 (${liveSpots.length}곳 반영)`);
    } else {
      spots = [...staticSpots];
      setResultsCaption("근처 검색 결과가 없어 기본 추천 코스를 보여드려요");
    }
    rerenderSpotMarkers();
  } catch (error) {
    console.error(error);
    spots = [...staticSpots];
    rerenderSpotMarkers();
    setResultsCaption("근처 장소 정보를 불러오지 못해 기본 추천 코스를 보여드려요");
  } finally {
    isFetchingNearby = false;
    setSearchButtonLoading(false);
  }
}

function normalizeNearbyItems(items, maxDistanceKm) {
  const deduped = new Map();

  items.forEach((item, idx) => {
    const spot = toLiveSpot(item, idx, maxDistanceKm);
    if (!spot) return;
    const key = `${spot.name}|${spot.address || ""}|${spot.lat.toFixed(6)}|${spot.lng.toFixed(6)}`;
    if (!deduped.has(key)) {
      deduped.set(key, spot);
    }
  });

  return [...deduped.values()].slice(0, 30);
}

function toLiveSpot(item, idx, maxDistanceKm) {
  const name = stripHtml(item.title || "").trim();
  if (!name) return null;

  const coords = toLatLngFromNearbyItem(item);
  if (!coords) return null;

  const rawDistanceKm = Number(item.distanceKm);
  const distanceKm = Number.isFinite(rawDistanceKm)
    ? rawDistanceKm
    : haversineKm(startPoint.lat, startPoint.lng, coords.lat, coords.lng);
  if (distanceKm > maxDistanceKm + 0.8) return null;

  const categoryLabel = stripHtml(item.category || "");
  const stayMin = estimateStayMinutes(name, categoryLabel);
  const blogReviewTotal = Number(item.blogReviewTotal || 0);
  const ratingEstimated = Number(item.ratingEstimated);
  const blogReviews = normalizeBlogReviews(item.blogReviews);

  return {
    id: `live-${idx}-${Math.round(coords.lat * 1000000)}-${Math.round(coords.lng * 1000000)}`,
    name,
    lat: coords.lat,
    lng: coords.lng,
    minAge: 12,
    maxAge: 72,
    stayMin,
    type: "nearby",
    categoryLabel,
    categoryMain: extractPrimaryCategory(categoryLabel),
    address: stripHtml(item.roadAddress || item.address || ""),
    telephone: stripHtml(item.telephone || ""),
    placeLink: toSafeExternalUrl(item.placeLink || item.link || ""),
    reviewLink: toSafeExternalUrl(item.reviewLink || item.placeLink || item.link || ""),
    blogReviewLink: toSafeExternalUrl(item.blogReviewLink || item.placeLink || item.link || ""),
    distanceKm: Number.isFinite(distanceKm) ? Math.round(distanceKm * 10) / 10 : null,
    photoThumbnail: toSafeImageUrl(item.photoThumbnail || ""),
    photoLink: toSafeExternalUrl(item.photoLink || ""),
    blogReviewTotal: Number.isFinite(blogReviewTotal) ? blogReviewTotal : 0,
    ratingEstimated: Number.isFinite(ratingEstimated) ? ratingEstimated : null,
    blogReviews
  };
}

function normalizeBlogReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .slice(0, 3)
    .map((review) => ({
      title: stripHtml(review?.title || "").trim(),
      description: stripHtml(review?.description || "").trim(),
      link: toSafeExternalUrl(review?.link || ""),
      bloggerName: stripHtml(review?.bloggerName || "").trim(),
      postDate: formatPostDate(String(review?.postDate || ""))
    }))
    .filter((review) => review.title || review.description);
}

function formatPostDate(raw) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

function toLatLngFromNearbyItem(item) {
  const latNum = Number(item.lat);
  const lngNum = Number(item.lng);
  if (isValidLatLng(latNum, lngNum)) {
    return { lat: latNum, lng: lngNum };
  }

  const mapx = Number(item.mapx);
  const mapy = Number(item.mapy);
  if (!Number.isFinite(mapx) || !Number.isFinite(mapy)) {
    return null;
  }

  const scaledLat = mapy / 10000000;
  const scaledLng = mapx / 10000000;
  if (isValidLatLng(scaledLat, scaledLng)) {
    return { lat: scaledLat, lng: scaledLng };
  }

  if (window.naver && window.naver.maps && window.naver.maps.TransCoord && window.naver.maps.Point) {
    try {
      const tmPoint = new naver.maps.Point(mapx, mapy);
      const latLng = naver.maps.TransCoord.fromTM128ToLatLng(tmPoint);
      const converted = { lat: latLng.lat(), lng: latLng.lng() };
      if (isValidLatLng(converted.lat, converted.lng)) {
        return converted;
      }
    } catch (error) {
      console.error(error);
    }
  }

  if (isValidLatLng(mapy, mapx)) {
    return { lat: mapy, lng: mapx };
  }

  return null;
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

function estimateStayMinutes(name, category) {
  const text = `${name} ${category}`.toLowerCase();
  if (text.includes("도서관")) return 35;
  if (text.includes("체험") || text.includes("박물관")) return 45;
  if (text.includes("놀이터") || text.includes("공원")) return 35;
  if (text.includes("카페")) return 40;
  return 30;
}

function extractPrimaryCategory(categoryLabel) {
  const text = String(categoryLabel || "").trim();
  if (!text) return "장소";
  const parts = text
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "장소";
  return parts[parts.length - 1];
}

async function resolveAreaHint(point) {
  if (!window.naver || !window.naver.maps || !window.naver.maps.Service) {
    return "";
  }

  return new Promise((resolve) => {
    const orderType = naver.maps.Service?.OrderType?.ADDR || "addr";
    naver.maps.Service.reverseGeocode({
      coords: new naver.maps.LatLng(point.lat, point.lng),
      orders: String(orderType)
    }, (status, response) => {
      if (status !== naver.maps.Service.Status.OK) {
        resolve("");
        return;
      }

      const region = response?.v2?.results?.[0]?.region;
      const areaParts = [
        region?.area1?.name,
        region?.area2?.name,
        region?.area3?.name
      ]
        .map((part) => (part || "").trim())
        .filter(Boolean);

      resolve(areaParts.join(" "));
    });
  });
}

function renderSpotMarkers() {
  if (!map || !window.naver || !window.naver.maps) return;

  spots.forEach((spot) => {
    const marker = new naver.maps.Marker({
      map,
      position: toLatLng(spot),
      title: spot.name,
      icon: buildCircleMarkerIcon(SPOT_COLOR)
    });

    const secondaryText = spot.categoryLabel || "권장 체류";
    const secondaryValue = spot.categoryLabel ? secondaryText : `${spot.stayMin}분`;
    const infoWindow = new naver.maps.InfoWindow({
      content: `<div class="map-infowindow"><strong>${escapeHtml(spot.name)}</strong><br>${escapeHtml(secondaryValue)}</div>`
    });

    naver.maps.Event.addListener(marker, "click", () => {
      recordSelectedSpot(spot);
      spotInfoWindows.forEach((popup) => popup.close());
      infoWindow.open(map, marker);
    });

    spotMarkers.set(spot.id, marker);
    spotInfoWindows.set(spot.id, infoWindow);
  });

  syncSelectedPlacesWithCurrentSpots();
  renderSelectedPlaces();
  renderNearbyPlaces();
}

function rerenderSpotMarkers() {
  clearSpotMarkers();
  renderSpotMarkers();
}

function clearSpotMarkers() {
  spotInfoWindows.forEach((infoWindow) => infoWindow.close());
  spotMarkers.forEach((marker) => marker.setMap(null));
  spotInfoWindows.clear();
  spotMarkers.clear();
}

function redrawStartArea() {
  if (!map || !startMarker || !window.naver || !window.naver.maps) return;
  const center = toLatLng(startPoint);

  startMarker.setPosition(center);
}

function renderSuggestions() {
  const distanceKm = Number(distanceKmInput.value);
  const maxMinutes = Number(timeMinutesInput.value) || DEFAULT_AVAILABLE_MINUTES;
  const candidates = filterCandidateSpots(startPoint, distanceKm);
  const priorityRanks = getPriorityRanks(candidates);
  const mandatoryKeys = new Set(priorityRanks.keys());
  const routes = buildRouteSuggestions(
    startPoint,
    candidates,
    maxMinutes,
    MAX_COURSE_SUGGESTIONS,
    priorityRanks
  );

  routeList.innerHTML = "";
  routeList.scrollTop = 0;
  clearRouteLine();
  resetSpotStyles();

  if (!routes.length) {
    if (priorityRanks.size > 0) {
      routeList.innerHTML = "<div class=\"route-card\">여기는 꼭 장소를 모두 포함할 수 없습니다. 사용 가능 시간 또는 반경을 늘려보세요.</div>";
    } else {
      routeList.innerHTML = "<div class=\"route-card\">설정한 거리/시간에 맞는 코스가 없습니다. 반경 또는 시간을 늘려보세요.</div>";
    }
    return;
  }

  routes.forEach((route, idx) => {
    const card = document.createElement("article");
    card.className = "route-card";
    if (route.selectedHits > 0) {
      card.classList.add("must-highlight");
    }
    const selectedHitText = route.selectedHits > 0 ? ` · 꼭 ${route.selectedHits}곳 반영` : "";
    const stopsMarkup = route.spots
      .map((spot, spotIdx) => {
        const spotKey = getSpotSelectionKey(spot);
        const isMustSpot = mandatoryKeys.has(spotKey);
        const legClass = isMustSpot ? "route-leg must-stop" : "route-leg";
        return `<span class="${legClass}">${spot.name}</span>`;
      })
      .join("<span class=\"route-leg-arrow\">→</span>");

    card.innerHTML = `
      <div class="route-head">
        <div class="route-title">${escapeHtml(route.label || `추천 코스 ${idx + 1}`)}</div>
        <div class="route-metrics">${Math.round(route.totalMinutes)}분 · ${route.totalDistanceKm.toFixed(1)}km${selectedHitText}</div>
      </div>
      <div class="route-stops">${stopsMarkup}</div>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".route-card").forEach((el) => el.classList.remove("active"));
      card.classList.add("active");
      drawRoute(route);
    });

    routeList.appendChild(card);
  });
}

function resetRecommendationView() {
  clearRouteLine();
  resetSpotStyles();
  routeList.innerHTML = "<div class=\"route-card\">추천 코스를 다시 계산하고 있어요...</div>";
  routeList.scrollTop = 0;
}

function filterCandidateSpots(origin, maxKm) {
  return spots.filter((spot) => {
    const ageMatch = spot.minAge <= KID_AGE_MAX_MONTHS && spot.maxAge >= KID_AGE_MIN_MONTHS;
    const distanceFromStart = haversineKm(origin.lat, origin.lng, spot.lat, spot.lng);
    return ageMatch && distanceFromStart <= maxKm;
  });
}

function getPriorityRanks(candidateSpots) {
  if (!selectedPlaces.length || !candidateSpots.length) {
    return new Map();
  }

  const candidateKeys = new Set(candidateSpots.map((spot) => getSpotSelectionKey(spot)));
  const priorityRanks = new Map();

  selectedPlaces.forEach((place, rank) => {
    if (!candidateKeys.has(place.key)) return;
    priorityRanks.set(place.key, rank);
  });

  return priorityRanks;
}

function buildRouteSuggestions(origin, candidateSpots, maxMinutes, limit, priorityRanks = new Map()) {
  if (!candidateSpots.length) return [];
  const results = [];
  const seedEntries = [];
  const mandatoryKeys = new Set(priorityRanks.keys());

  if (priorityRanks.size > 0) {
    const mustRoute = buildMustSelectedRoute(origin, candidateSpots, maxMinutes, priorityRanks);
    if (mustRoute) {
      results.push(mustRoute);
    }
  }

  const prioritySeeds = candidateSpots
    .filter((spot) => priorityRanks.has(getSpotSelectionKey(spot)))
    .sort((a, b) => {
      const aRank = priorityRanks.get(getSpotSelectionKey(a));
      const bRank = priorityRanks.get(getSpotSelectionKey(b));
      return aRank - bRank;
    });

  prioritySeeds.forEach((spot) => {
    seedEntries.push({
      spot,
      startDist: haversineKm(origin.lat, origin.lng, spot.lat, spot.lng)
    });
  });

  const nonPrioritySeeds = candidateSpots
    .filter((spot) => !priorityRanks.has(getSpotSelectionKey(spot)))
    .map((spot) => ({
      spot,
      startDist: haversineKm(origin.lat, origin.lng, spot.lat, spot.lng)
    }))
    .sort((a, b) => a.startDist - b.startDist);

  const usedSeedIds = new Set(seedEntries.map((entry) => entry.spot.id));
  nonPrioritySeeds.forEach((entry) => {
    if (usedSeedIds.has(entry.spot.id)) return;
    seedEntries.push(entry);
    usedSeedIds.add(entry.spot.id);
  });

  const seeds = seedEntries.slice(0, Math.min(8, candidateSpots.length));

  seeds.forEach(({ spot: seed }) => {
    const visitedIds = new Set([seed.id]);
    const routeSpots = [seed];
    let distanceKm = haversineKm(origin.lat, origin.lng, seed.lat, seed.lng);
    let minutes = seed.stayMin + travelMinutes(distanceKm);
    let cursor = seed;

    while (true) {
      const next = findBestNextSpot(
        cursor,
        visitedIds,
        candidateSpots,
        minutes,
        maxMinutes,
        priorityRanks
      );
      if (!next) break;
      visitedIds.add(next.id);
      routeSpots.push(next);
      const segmentKm = haversineKm(cursor.lat, cursor.lng, next.lat, next.lng);
      distanceKm += segmentKm;
      minutes += next.stayMin + travelMinutes(segmentKm);
      cursor = next;
    }

    if (routeSpots.length > 0 && minutes <= maxMinutes) {
      const selectedHits = routeSpots.reduce((count, spot) => {
        return count + (priorityRanks.has(getSpotSelectionKey(spot)) ? 1 : 0);
      }, 0);

      results.push({
        spots: routeSpots,
        totalMinutes: minutes,
        totalDistanceKm: distanceKm,
        selectedHits
      });
    }
  });

  let normalizedRoutes = deduplicateRoutes(results);

  if (mandatoryKeys.size > 0) {
    normalizedRoutes = normalizedRoutes.filter((route) => {
      return routeContainsAllMandatory(route, mandatoryKeys);
    });
  }

  return normalizedRoutes
    .sort((a, b) => {
      if (Boolean(b.isMust) !== Boolean(a.isMust)) {
        return Number(Boolean(b.isMust)) - Number(Boolean(a.isMust));
      }
      if (b.selectedHits !== a.selectedHits) return b.selectedHits - a.selectedHits;
      if (b.spots.length !== a.spots.length) return b.spots.length - a.spots.length;
      return a.totalMinutes - b.totalMinutes;
    })
    .slice(0, limit);
}

function buildMustSelectedRoute(origin, candidateSpots, maxMinutes, priorityRanks) {
  const mustSpots = candidateSpots
    .filter((spot) => priorityRanks.has(getSpotSelectionKey(spot)))
    .sort((a, b) => {
      const aRank = priorityRanks.get(getSpotSelectionKey(a));
      const bRank = priorityRanks.get(getSpotSelectionKey(b));
      return aRank - bRank;
    });

  if (!mustSpots.length) return null;

  const visitedIds = new Set();
  const routeSpots = [];
  let distanceKm = 0;
  let minutes = 0;
  let cursor = { lat: origin.lat, lng: origin.lng };

  for (const spot of mustSpots) {
    if (visitedIds.has(spot.id)) continue;

    const legKm = haversineKm(cursor.lat, cursor.lng, spot.lat, spot.lng);
    const addedMinutes = travelMinutes(legKm) + spot.stayMin;
    if (minutes + addedMinutes > maxMinutes) {
      return null;
    }

    routeSpots.push(spot);
    visitedIds.add(spot.id);
    distanceKm += legKm;
    minutes += addedMinutes;
    cursor = spot;
  }

  if (routeSpots.length !== mustSpots.length) {
    return null;
  }

  while (true) {
    const next = findBestNextSpot(
      cursor,
      visitedIds,
      candidateSpots,
      minutes,
      maxMinutes,
      priorityRanks
    );
    if (!next) break;

    visitedIds.add(next.id);
    routeSpots.push(next);
    const segmentKm = haversineKm(cursor.lat, cursor.lng, next.lat, next.lng);
    distanceKm += segmentKm;
    minutes += next.stayMin + travelMinutes(segmentKm);
    cursor = next;
  }

  const selectedHits = routeSpots.reduce((count, spot) => {
    return count + (priorityRanks.has(getSpotSelectionKey(spot)) ? 1 : 0);
  }, 0);

  return {
    spots: routeSpots,
    totalMinutes: minutes,
    totalDistanceKm: distanceKm,
    selectedHits,
    label: "여기는 꼭 코스",
    isMust: true
  };
}

function routeContainsAllMandatory(route, mandatoryKeys) {
  if (!mandatoryKeys.size) return true;
  const routeKeys = new Set(route.spots.map((spot) => getSpotSelectionKey(spot)));
  for (const key of mandatoryKeys) {
    if (!routeKeys.has(key)) return false;
  }
  return true;
}

function findBestNextSpot(current, visitedIds, candidateSpots, currentMinutes, maxMinutes, priorityRanks) {
  let best = null;
  let bestScore = -Infinity;

  candidateSpots.forEach((spot) => {
    if (visitedIds.has(spot.id)) return;
    const legKm = haversineKm(current.lat, current.lng, spot.lat, spot.lng);
    const addedMinutes = travelMinutes(legKm) + spot.stayMin;
    const projected = currentMinutes + addedMinutes;
    if (projected > maxMinutes) return;

    const priorityRank = priorityRanks.get(getSpotSelectionKey(spot));
    const priorityBonus = priorityRank === undefined ? 0 : Math.max(30, 120 - (priorityRank * 15));
    const score = (spot.stayMin * 1.4) - (legKm * 8) + priorityBonus;
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  });

  return best;
}

function deduplicateRoutes(routes) {
  const seen = new Set();
  return routes.filter((route) => {
    const key = route.spots.map((spot) => spot.id).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function drawRoute(route) {
  if (!map || !window.naver || !window.naver.maps) return;

  clearRouteLine();
  resetSpotStyles();

  const path = [toLatLng(startPoint), ...route.spots.map((spot) => toLatLng(spot))];
  routePolyline = new naver.maps.Polyline({
    map,
    path,
    strokeColor: ACTIVE_SPOT_COLOR,
    strokeWeight: 5,
    strokeOpacity: 0.9
  });

  const bounds = new naver.maps.LatLngBounds();
  path.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds);

  route.spots.forEach((spot) => {
    const marker = spotMarkers.get(spot.id);
    if (!marker) return;
    marker.setIcon(buildCircleMarkerIcon(ACTIVE_SPOT_COLOR));
  });
}

function resetSpotStyles() {
  spotMarkers.forEach((marker) => {
    marker.setIcon(buildCircleMarkerIcon(SPOT_COLOR));
  });
}

function clearRouteLine() {
  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }
}

function travelMinutes(distanceKm) {
  return (distanceKm / WALKING_KMH) * 60;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toLatLng(point) {
  return new naver.maps.LatLng(point.lat, point.lng);
}

function buildCircleMarkerIcon(fillColor) {
  const size = 18;
  const radius = 6;
  const center = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="${fillColor}" stroke="#ffffff" stroke-width="3"/></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  return {
    url,
    size: new naver.maps.Size(size, size),
    scaledSize: new naver.maps.Size(size, size),
    origin: new naver.maps.Point(0, 0),
    anchor: new naver.maps.Point(center, center)
  };
}

function recordSelectedSpot(spot) {
  const key = getSpotSelectionKey(spot);
  const existingIndex = selectedPlaces.findIndex((item) => item.key === key);

  const place = {
    key,
    spotId: spot.id,
    name: spot.name,
    lat: spot.lat,
    lng: spot.lng,
    categoryLabel: spot.categoryLabel || "",
    address: spot.address || "",
    stayMin: spot.stayMin
  };

  if (existingIndex >= 0) {
    selectedPlaces.splice(existingIndex, 1);
  }
  selectedPlaces.unshift(place);

  if (selectedPlaces.length > 15) {
    selectedPlaces.length = 15;
  }

  renderSelectedPlaces();
  renderNearbyPlaces();
  renderSuggestions();
}

function clearSelectedPlaces() {
  selectedPlaces.length = 0;
  renderSelectedPlaces();
  renderNearbyPlaces();
  renderSuggestions();
}

function getSpotSelectionKey(spot) {
  return `${spot.name}|${Number(spot.lat).toFixed(6)}|${Number(spot.lng).toFixed(6)}`;
}

function syncSelectedPlacesWithCurrentSpots() {
  if (!selectedPlaces.length) return;

  const currentSpotIdsByKey = new Map(
    spots.map((spot) => [getSpotSelectionKey(spot), spot.id])
  );

  selectedPlaces.forEach((place) => {
    const nextSpotId = currentSpotIdsByKey.get(place.key);
    if (nextSpotId) {
      place.spotId = nextSpotId;
    }
  });
}

function renderSelectedPlaces() {
  if (!selectedPlaceList) return;

  selectedPlaceList.innerHTML = "";

  if (!selectedPlaces.length) {
    selectedPlaceList.innerHTML = "<div class=\"selected-empty\">근처 장소에서 '꼭 가기'로 추가해보세요</div>";
    return;
  }

  const list = document.createElement("div");
  list.className = "selected-simple-list";

  selectedPlaces.forEach((place, idx) => {
    const row = document.createElement("div");
    row.className = "selected-simple-item";
    row.innerHTML = `
      <button type="button" class="selected-simple-main" data-action="focus">
        <span class="selected-simple-index">${idx + 1}</span>
        <span class="selected-simple-name">${escapeHtml(place.name)}</span>
      </button>
      <button type="button" class="selected-simple-remove" data-action="remove" aria-label="${escapeHtml(place.name)} 삭제">×</button>
    `;

    const focusButton = row.querySelector("[data-action=\"focus\"]");
    const removeButton = row.querySelector("[data-action=\"remove\"]");

    if (focusButton) {
      focusButton.addEventListener("click", () => {
        focusSelectedPlace(place);
      });
    }

    if (removeButton) {
      removeButton.addEventListener("click", () => {
        removeSelectedPlace(place.key);
      });
    }

    list.appendChild(row);
  });

  selectedPlaceList.appendChild(list);
}

function removeSelectedPlace(placeKey) {
  const index = selectedPlaces.findIndex((place) => place.key === placeKey);
  if (index < 0) return;
  selectedPlaces.splice(index, 1);
  renderSelectedPlaces();
  renderNearbyPlaces();
  renderSuggestions();
}

function focusSelectedPlace(place) {
  focusSpotById(place.spotId, place.key);
}

function focusSpotById(spotId, placeKey = "") {
  if (!map || !window.naver || !window.naver.maps) return;

  let targetSpot = spots.find((spot) => spot.id === spotId);
  if (!targetSpot && placeKey) {
    targetSpot = spots.find((spot) => getSpotSelectionKey(spot) === placeKey);
  }
  if (!targetSpot) return;

  map.panTo(toLatLng(targetSpot));

  const marker = spotMarkers.get(targetSpot.id);
  if (!marker) return;

  const infoWindow = spotInfoWindows.get(targetSpot.id);
  if (!infoWindow) return;

  spotInfoWindows.forEach((popup) => popup.close());
  infoWindow.open(map, marker);
}

function getSelectedPlaceKeySet() {
  return new Set(selectedPlaces.map((place) => place.key));
}

function renderNearbyPlaces() {
  if (!nearbyPlaceList) return;

  nearbyPlaceList.innerHTML = "";

  const count = spots.length;
  if (nearbyCount) {
    nearbyCount.textContent = `${count}곳 · 거리순`;
  }

  if (!count) {
    nearbyPlaceList.innerHTML = "<div class=\"nearby-empty\">근처 장소 정보가 없습니다</div>";
    return;
  }

  const selectedKeys = getSelectedPlaceKeySet();

  spots.forEach((spot) => {
    const card = document.createElement("article");
    const key = getSpotSelectionKey(spot);
    card.className = `nearby-place-item${selectedKeys.has(key) ? " active" : ""}`;

    const categoryText = spot.categoryMain || spot.categoryLabel || "장소";
    const distanceText = formatDistanceText(spot.distanceKm);
    const locationMeta = [spot.address || "", distanceText]
      .filter(Boolean)
      .join(" · ");
    const ratingLabel = getSpotRatingLabel(spot);
    const blogCountLabel = getSpotBlogCountLabel(spot);
    const placeFeature = buildPlaceFeatureSummary(spot);
    const quickLinkItems = [];
    const phoneMarkup = buildPhoneMarkup(spot.telephone);
    if (phoneMarkup) {
      quickLinkItems.push(phoneMarkup);
    }
    const quickLinksMarkup = quickLinkItems.length
      ? `<div class="nearby-quick-row">${quickLinkItems.join("")}</div>`
      : "";
    const ratingLinkMarkup = buildMetricLinkMarkup(
      spot.reviewLink || spot.placeLink,
      ratingLabel,
      "nearby-place-rating"
    );
    const blogCountLinkMarkup = buildMetricLinkMarkup(
      spot.blogReviewLink || spot.placeLink,
      blogCountLabel,
      "nearby-blog-count"
    );
    const imageTargetUrl = spot.placeLink || spot.photoLink || spot.photoThumbnail || "";
    const photoMarkup = spot.photoThumbnail
      ? `<a class="nearby-photo-link" href="${escapeHtml(imageTargetUrl)}" target="_blank" rel="noopener noreferrer"><img class="nearby-photo" src="${escapeHtml(spot.photoThumbnail)}" alt="${escapeHtml(spot.name)} 사진"></a>`
      : "<div class=\"nearby-photo-placeholder\">사진 없음</div>";
    const selectLabel = selectedKeys.has(key) ? "선택됨" : "꼭 가기";

    card.innerHTML = `
      <div class="nearby-item-main">
        <div class="nearby-photo-wrap">
          ${photoMarkup}
        </div>
        <div class="nearby-item-content">
          <div class="nearby-title-row">
            <p class="nearby-place-name">${escapeHtml(spot.name)}</p>
            <span class="nearby-category-chip">${escapeHtml(categoryText)}</span>
          </div>
          <div class="nearby-metric-row">
            ${ratingLinkMarkup}
            ${blogCountLinkMarkup}
          </div>
          <p class="nearby-place-meta">${escapeHtml(locationMeta || "주소 정보 없음")}</p>
          <p class="nearby-place-feature"><span class="nearby-feature-label">여기는</span>${escapeHtml(placeFeature)}</p>
        </div>
      </div>
      ${quickLinksMarkup}
      <div class="nearby-actions">
        <button type="button" class="selected-action-btn" data-action="focus">지도 보기</button>
        <button type="button" class="selected-action-btn" data-action="select">${selectLabel}</button>
      </div>
    `;

    const focusButton = card.querySelector("[data-action=\"focus\"]");
    const selectButton = card.querySelector("[data-action=\"select\"]");

    if (focusButton) {
      focusButton.addEventListener("click", () => {
        focusSpotById(spot.id, key);
      });
    }

    if (selectButton) {
      selectButton.addEventListener("click", () => {
        resetRecommendationView();
        recordSelectedSpot(spot);
      });
    }

    nearbyPlaceList.appendChild(card);
  });
}

function getSpotRatingLabel(spot) {
  if (!Number.isFinite(spot.ratingEstimated)) {
    return "방문자 리뷰";
  }
  const stars = toStars(spot.ratingEstimated);
  return `${stars} ${spot.ratingEstimated.toFixed(1)} (추정)`;
}

function getSpotBlogCountLabel(spot) {
  const reviewCount = Number.isFinite(spot.blogReviewTotal) ? spot.blogReviewTotal : 0;
  if (reviewCount <= 0) {
    return "블로그 리뷰";
  }
  return `블로그 리뷰 ${reviewCount}건`;
}

function buildMetricLinkMarkup(href, label, className) {
  const safeHref = toSafeExternalUrl(href || "");
  const safeLabel = escapeHtml(label || "");
  if (!safeHref) {
    return `<span class="${className} nearby-metric-link disabled">${safeLabel}</span>`;
  }
  return `<a class="${className} nearby-metric-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
}

function buildPlaceFeatureSummary(spot) {
  const sourceText = [
    spot.name || "",
    spot.categoryLabel || "",
    spot.address || "",
    ...(Array.isArray(spot.blogReviews)
      ? spot.blogReviews.flatMap((review) => [review?.title || "", review?.description || ""])
      : [])
  ]
    .join(" ")
    .toLowerCase();

  const hasKeyword = (...keywords) => keywords.some((keyword) => sourceText.includes(keyword));
  const play = [];
  const benefit = [];

  if (hasKeyword("키즈카페", "실내놀이터", "놀이방", "볼풀", "트램폴린", "정글짐", "미끄럼틀")) {
    pushUniqueSummary(play, "실내 놀이시설 중심으로 시간을 보내기 좋아요");
  }
  if (hasKeyword("체험", "클래스", "공방", "만들기", "미술", "쿠킹", "과학", "오감")) {
    pushUniqueSummary(play, "체험형 놀이와 만들기 활동을 함께 즐길 수 있어요");
  }
  if (hasKeyword("공원", "놀이터", "야외", "산책", "숲")) {
    pushUniqueSummary(play, "야외 놀이와 산책 동선을 만들기 좋아요");
  }
  if (hasKeyword("도서관", "그림책", "독서", "책놀이")) {
    pushUniqueSummary(play, "조용한 독서/책놀이 활동과 병행하기 좋아요");
  }
  if (!play.length) {
    pushUniqueSummary(play, "아이 눈높이에 맞는 가벼운 놀이 코스로 방문하기 좋아요");
  }

  if (hasKeyword("할인", "이벤트", "쿠폰", "패키지", "무료", "혜택")) {
    pushUniqueSummary(benefit, "이벤트/할인 혜택이 있는지 확인해 보세요");
  }
  if (hasKeyword("생일", "파티", "단체")) {
    pushUniqueSummary(benefit, "생일/소규모 모임 코스로 활용하기 좋아요");
  }
  if (Array.isArray(spot.blogReviews) && spot.blogReviews.length > 0) {
    pushUniqueSummary(benefit, "블로그 후기에서 실제 이용 동선과 분위기를 미리 파악할 수 있어요");
  }
  if (Number.isFinite(spot.blogReviewTotal) && spot.blogReviewTotal >= 20) {
    pushUniqueSummary(benefit, "후기 수가 비교적 많아 방문 전 참고 정보가 충분한 편이에요");
  }
  if (!benefit.length) {
    pushUniqueSummary(benefit, "근처 장소와 묶어 반나절 코스로 구성하기 좋아요");
  }

  return [...play, ...benefit].slice(0, 2).join(" · ");
}

function pushUniqueSummary(collection, item) {
  if (!item) return;
  if (!collection.includes(item)) {
    collection.push(item);
  }
}

function toStars(rating) {
  const normalized = Math.max(0, Math.min(5, Number(rating) || 0));
  const rounded = Math.round(normalized);
  const empty = 5 - rounded;
  return `${"★".repeat(rounded)}${"☆".repeat(empty)}`;
}

function buildPhoneMarkup(rawPhone) {
  const phone = String(rawPhone || "").trim();
  if (!phone) return "";
  const tel = phone.replace(/[^0-9+]/g, "");
  if (!tel) return "";
  return `<a class="nearby-quick-link" href="tel:${escapeHtml(tel)}">${escapeHtml(phone)}</a>`;
}

function formatDistanceText(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "";
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
}

function toSafeExternalUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return "";
  }
  return "";
}

function toSafeImageUrl(url) {
  const safe = toSafeExternalUrl(url);
  if (!safe) return "";
  if (safe.startsWith("http://")) {
    return `https://${safe.slice("http://".length)}`;
  }
  return safe;
}

function showMapSetupMessage(message) {
  mapElement.innerHTML = `<div class="map-message">${message}</div>`;
}

function setSearchButtonLoading(isLoading) {
  suggestBtn.disabled = isLoading;
  suggestBtn.textContent = isLoading ? "검색 중..." : "코스 검색";
}

function setResultsCaption(message) {
  if (!resultsCaption) return;
  resultsCaption.textContent = message;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
