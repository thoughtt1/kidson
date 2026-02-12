const KID_AGE_MIN_MONTHS = 12;
const KID_AGE_MAX_MONTHS = 72;
const WALKING_KMH = 3.8;
const MAX_COURSE_SUGGESTIONS = 5;
const DEFAULT_AVAILABLE_MINUTES = 150;

const spots = [
  { id: "s1", name: "강변 놀이터", lat: 37.574, lng: 126.976, minAge: 12, maxAge: 72, stayMin: 35, type: "playground" },
  { id: "s2", name: "어린이 도서관 코너", lat: 37.572, lng: 126.984, minAge: 18, maxAge: 72, stayMin: 30, type: "library" },
  { id: "s3", name: "키즈 실내 체육관", lat: 37.569, lng: 126.979, minAge: 12, maxAge: 60, stayMin: 45, type: "indoor" },
  { id: "s4", name: "미니 과학 체험관", lat: 37.566, lng: 126.973, minAge: 30, maxAge: 72, stayMin: 40, type: "museum" },
  { id: "s5", name: "유모차 산책 공원길", lat: 37.567, lng: 126.988, minAge: 12, maxAge: 72, stayMin: 30, type: "park" },
  { id: "s6", name: "동물 먹이 체험장", lat: 37.562, lng: 126.982, minAge: 24, maxAge: 72, stayMin: 50, type: "experience" },
  { id: "s7", name: "물놀이 광장", lat: 37.578, lng: 126.986, minAge: 20, maxAge: 72, stayMin: 40, type: "outdoor" },
  { id: "s8", name: "부모-아이 공예 스튜디오", lat: 37.571, lng: 126.969, minAge: 24, maxAge: 72, stayMin: 35, type: "creative" }
];

if (typeof L === "undefined") {
  alert("무료 지도 라이브러리(Leaflet) 로딩에 실패했습니다.");
}

const map = L.map("map", {
  zoomControl: false
}).setView([37.5715, 126.978], 14);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let startPoint = { lat: 37.5715, lng: 126.978 };
let startMarker = L.marker([startPoint.lat, startPoint.lng], { title: "출발 지점" }).addTo(map);
let radiusCircle = L.circle([startPoint.lat, startPoint.lng], {
  radius: 3000,
  color: "#0071e3",
  weight: 2,
  fillColor: "#0071e3",
  fillOpacity: 0.1
}).addTo(map);

let routePolyline = null;
const spotMarkers = new Map();

spots.forEach((spot) => {
  const marker = L.circleMarker([spot.lat, spot.lng], {
    radius: 7,
    color: "#ffffff",
    weight: 2,
    fillColor: "#43a563",
    fillOpacity: 1
  }).addTo(map);
  marker.bindPopup(`<strong>${spot.name}</strong><br>권장 체류: ${spot.stayMin}분`);
  spotMarkers.set(spot.id, marker);
});

const distanceKmInput = document.getElementById("distanceKm");
const distanceValue = document.getElementById("distanceValue");
const timeMinutesInput = document.getElementById("timeMinutes");
const timeValue = document.getElementById("timeValue");
const useLocationBtn = document.getElementById("useLocationBtn");
const suggestBtn = document.getElementById("suggestBtn");
const routeList = document.getElementById("routeList");

distanceKmInput.addEventListener("input", () => {
  distanceValue.textContent = distanceKmInput.value;
  redrawStartArea();
  renderSuggestions();
});

timeMinutesInput.addEventListener("input", () => {
  timeValue.textContent = timeMinutesInput.value;
  renderSuggestions();
});

map.on("click", (event) => {
  startPoint = { lat: event.latlng.lat, lng: event.latlng.lng };
  redrawStartArea();
  renderSuggestions();
});

useLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("현재 브라우저에서 위치 정보를 지원하지 않습니다.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      startPoint = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.setView([startPoint.lat, startPoint.lng], 14);
      redrawStartArea();
      renderSuggestions();
    },
    () => alert("현재 위치를 가져오지 못했습니다. 지도 중심 기준으로 추천합니다.")
  );
});

suggestBtn.addEventListener("click", renderSuggestions);

function redrawStartArea() {
  const radiusMeters = Number(distanceKmInput.value) * 1000;
  startMarker.setLatLng([startPoint.lat, startPoint.lng]);
  radiusCircle.setLatLng([startPoint.lat, startPoint.lng]);
  radiusCircle.setRadius(radiusMeters);
}

function renderSuggestions() {
  const distanceKm = Number(distanceKmInput.value);
  const maxMinutes = Number(timeMinutesInput.value) || DEFAULT_AVAILABLE_MINUTES;
  const candidates = filterCandidateSpots(startPoint, distanceKm);
  const routes = buildRouteSuggestions(startPoint, candidates, maxMinutes, MAX_COURSE_SUGGESTIONS);

  routeList.innerHTML = "";
  clearRouteLine();
  resetSpotStyles();

  if (!routes.length) {
    routeList.innerHTML = "<div class=\"route-card\">설정한 거리/시간에 맞는 코스가 없습니다. 반경 또는 시간을 늘려보세요.</div>";
    return;
  }

  routes.forEach((route, idx) => {
    const card = document.createElement("article");
    card.className = "route-card";
    const stopsMarkup = route.spots
      .map((spot, spotIdx) => {
        const hasNext = spotIdx < route.spots.length - 1;
        return `<span class="route-leg">${spot.name}${hasNext ? " →" : ""}</span>`;
      })
      .join("");
    card.innerHTML = `
      <div class="route-head">
        <div class="route-title">추천 코스 ${idx + 1}</div>
        <div class="route-metrics">${Math.round(route.totalMinutes)}분 · ${route.totalDistanceKm.toFixed(1)}km</div>
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

function filterCandidateSpots(origin, maxKm) {
  return spots.filter((spot) => {
    const ageMatch = spot.minAge <= KID_AGE_MAX_MONTHS && spot.maxAge >= KID_AGE_MIN_MONTHS;
    const distanceFromStart = haversineKm(origin.lat, origin.lng, spot.lat, spot.lng);
    return ageMatch && distanceFromStart <= maxKm;
  });
}

function buildRouteSuggestions(origin, candidateSpots, maxMinutes, limit) {
  if (!candidateSpots.length) return [];
  const results = [];

  const seeds = [...candidateSpots]
    .map((spot) => ({
      spot,
      startDist: haversineKm(origin.lat, origin.lng, spot.lat, spot.lng)
    }))
    .sort((a, b) => a.startDist - b.startDist)
    .slice(0, Math.min(6, candidateSpots.length));

  seeds.forEach(({ spot: seed }) => {
    const visitedIds = new Set([seed.id]);
    const routeSpots = [seed];
    let distanceKm = haversineKm(origin.lat, origin.lng, seed.lat, seed.lng);
    let minutes = seed.stayMin + travelMinutes(distanceKm);
    let cursor = seed;

    while (true) {
      const next = findBestNextSpot(cursor, visitedIds, candidateSpots, minutes, maxMinutes);
      if (!next) break;
      visitedIds.add(next.id);
      routeSpots.push(next);
      const segmentKm = haversineKm(cursor.lat, cursor.lng, next.lat, next.lng);
      distanceKm += segmentKm;
      minutes += next.stayMin + travelMinutes(segmentKm);
      cursor = next;
    }

    if (routeSpots.length > 0 && minutes <= maxMinutes) {
      results.push({
        spots: routeSpots,
        totalMinutes: minutes,
        totalDistanceKm: distanceKm
      });
    }
  });

  return deduplicateRoutes(results)
    .sort((a, b) => {
      if (b.spots.length !== a.spots.length) return b.spots.length - a.spots.length;
      return a.totalMinutes - b.totalMinutes;
    })
    .slice(0, limit);
}

function findBestNextSpot(current, visitedIds, candidateSpots, currentMinutes, maxMinutes) {
  let best = null;
  let bestScore = -Infinity;

  candidateSpots.forEach((spot) => {
    if (visitedIds.has(spot.id)) return;
    const legKm = haversineKm(current.lat, current.lng, spot.lat, spot.lng);
    const addedMinutes = travelMinutes(legKm) + spot.stayMin;
    const projected = currentMinutes + addedMinutes;
    if (projected > maxMinutes) return;

    const score = (spot.stayMin * 1.4) - (legKm * 8);
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
  clearRouteLine();
  resetSpotStyles();

  const points = [[startPoint.lat, startPoint.lng], ...route.spots.map((spot) => [spot.lat, spot.lng])];
  routePolyline = L.polyline(points, {
    color: "#1f6a40",
    weight: 5,
    opacity: 0.9
  }).addTo(map);

  map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });

  route.spots.forEach((spot) => {
    const marker = spotMarkers.get(spot.id);
    marker.setStyle({
      fillColor: "#1f6a40",
      color: "#ffffff",
      weight: 2,
      radius: 8,
      fillOpacity: 1
    });
  });
}

function resetSpotStyles() {
  spotMarkers.forEach((marker) => {
    marker.setStyle({
      fillColor: "#43a563",
      color: "#ffffff",
      weight: 2,
      radius: 7,
      fillOpacity: 1
    });
  });
}

function clearRouteLine() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
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

redrawStartArea();
timeValue.textContent = timeMinutesInput.value;
renderSuggestions();
