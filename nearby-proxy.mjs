import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const NAVER_CLIENT_ID = (process.env.NAVER_SEARCH_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
const DEFAULT_QUERIES = ["키즈카페", "실내놀이터", "어린이도서관", "유아 체험", "놀이터"];
const MAX_DETAIL_ITEMS = 12;
const MAX_RESULTS = 30;
const SEARCH_VARIANTS_LIMIT = 3;
const RADIUS_PADDING_KM = 0.8;
const RELAXED_RADIUS_EXTRA_KM = 3;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error("NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 환경 변수가 필요합니다.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Invalid request URL." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method !== "GET" || requestUrl.pathname !== "/api/nearby-places") {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const queries = parseQueries(requestUrl.searchParams.get("queries"));
  const areaHint = (requestUrl.searchParams.get("areaHint") || "").trim();
  const display = normalizeDisplay(requestUrl.searchParams.get("display"));
  const withDetails = requestUrl.searchParams.get("withDetails") !== "0";
  const originLat = parseOptionalNumber(requestUrl.searchParams.get("lat"));
  const originLng = parseOptionalNumber(requestUrl.searchParams.get("lng"));
  const radiusKm = normalizeRadiusKm(requestUrl.searchParams.get("radiusKm"));

  try {
    const { items, debug } = await searchNearbyFromNaver({
      queries,
      areaHint,
      display,
      withDetails,
      originLat,
      originLng,
      radiusKm
    });
    sendJson(res, 200, {
      source: "naver-local-search",
      count: items.length,
      items,
      debug
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 502, {
      error: "Failed to fetch Naver local search results.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`Nearby proxy is running at http://localhost:${PORT}/api/nearby-places`);
});

function parseQueries(raw) {
  if (!raw) return DEFAULT_QUERIES;
  const queries = raw
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);
  return queries.length ? queries : DEFAULT_QUERIES;
}

function normalizeDisplay(raw) {
  const display = Number(raw || 5);
  if (!Number.isFinite(display)) return 5;
  return Math.min(5, Math.max(1, Math.floor(display)));
}

function parseOptionalNumber(raw) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeRadiusKm(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(20, Math.max(0.5, value));
}

async function searchNearbyFromNaver({
  queries,
  areaHint,
  display,
  withDetails = true,
  originLat = null,
  originLng = null,
  radiusKm = null
}) {
  const aggregated = [];
  const hasOrigin = isValidLatLng(originLat, originLng);
  const strictRadiusKm = hasOrigin && Number.isFinite(radiusKm)
    ? radiusKm + RADIUS_PADDING_KM
    : null;
  const relaxedRadiusKm = hasOrigin && Number.isFinite(radiusKm)
    ? Math.min(25, radiusKm + RELAXED_RADIUS_EXTRA_KM)
    : null;
  const areaHintCandidates = buildAreaHintCandidates(areaHint, originLat, originLng);
  let apiCallCount = 0;

  for (const query of queries) {
    const searchQueries = buildSearchQueries(query, areaHintCandidates);
    for (const searchQuery of searchQueries) {
      const url = new URL("https://openapi.naver.com/v1/search/local.json");
      url.searchParams.set("query", searchQuery);
      url.searchParams.set("display", String(display));
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "comment");

      const response = await requestNaverApi(url);
      apiCallCount += 1;

      if (!response.ok) {
        throw new Error(`Naver local API failed (${response.status})`);
      }

      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      aggregated.push(...items);
    }
  }

  const unique = new Map();
  aggregated.forEach((item) => {
    const normalized = normalizeLocalItem(item, originLat, originLng);
    if (!normalized) return;
    const key = `${normalized.title}|${normalized.roadAddress}|${normalized.mapx}|${normalized.mapy}`;

    if (unique.has(key)) return;
    unique.set(key, normalized);
  });

  let places = [...unique.values()];

  if (hasOrigin && strictRadiusKm !== null) {
    const strictMatches = places.filter((place) => {
      return Number.isFinite(place.distanceKm) && place.distanceKm <= strictRadiusKm;
    });
    if (strictMatches.length) {
      places = strictMatches;
    } else if (relaxedRadiusKm !== null) {
      const relaxedMatches = places.filter((place) => {
        return Number.isFinite(place.distanceKm) && place.distanceKm <= relaxedRadiusKm;
      });
      if (relaxedMatches.length) {
        places = relaxedMatches;
      }
    }
  }

  places.sort((a, b) => {
    const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const titleA = String(a.title || "");
    const titleB = String(b.title || "");
    return titleA.localeCompare(titleB, "ko");
  });

  places = places.slice(0, MAX_RESULTS);

  if (!withDetails || !places.length) {
    return {
      items: places,
      debug: {
        apiCallCount,
        queryCount: queries.length,
        areaHintCandidates
      }
    };
  }

  const detailTargets = places.slice(0, MAX_DETAIL_ITEMS);
  await Promise.all(detailTargets.map(async (place) => {
    const detail = await fetchPlaceDetail(place, areaHintCandidates[0] || "");
    if (!detail) return;
    place.photoThumbnail = detail.photoThumbnail || "";
    place.photoLink = detail.photoLink || "";
    place.blogReviewTotal = detail.blogReviewTotal || 0;
    place.blogReviews = detail.blogReviews || [];
    place.ratingEstimated = detail.ratingEstimated;
    place.ratingSource = "estimated_from_blog_reviews";
  }));

  return {
    items: places,
    debug: {
      apiCallCount,
      queryCount: queries.length,
      areaHintCandidates
    }
  };
}

function normalizeLocalItem(item, originLat, originLng) {
  const title = stripHtml(item.title || "").trim();
  if (!title) return null;

  const roadAddress = stripHtml(item.roadAddress || "").trim();
  const address = stripHtml(item.address || "").trim();
  const category = stripHtml(item.category || "").trim();
  const coords = toLatLngFromItem(item);
  const lat = coords ? coords.lat : null;
  const lng = coords ? coords.lng : null;
  const distanceKm = coords && isValidLatLng(originLat, originLng)
    ? haversineKm(originLat, originLng, coords.lat, coords.lng)
    : null;

  return {
    ...item,
    title,
    roadAddress,
    address,
    category,
    lat,
    lng,
    distanceKm: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) / 1000 : null
  };
}

function toLatLngFromItem(item) {
  const latRaw = Number(item.lat);
  const lngRaw = Number(item.lng);
  if (isValidLatLng(latRaw, lngRaw)) {
    return { lat: latRaw, lng: lngRaw };
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

  if (isValidLatLng(mapy, mapx)) {
    return { lat: mapy, lng: mapx };
  }

  return null;
}

function buildAreaHintCandidates(areaHint, originLat, originLng) {
  const candidates = [];
  const normalizedHint = normalizeSpace(areaHint);

  if (normalizedHint) {
    const tokens = normalizedHint.split(" ");
    if (tokens.length >= 3) {
      candidates.push(tokens.slice(0, 3).join(" "));
    }
    if (tokens.length >= 2) {
      candidates.push(tokens.slice(0, 2).join(" "));
    }
    candidates.push(tokens[0]);
  }

  const guessedRegion = guessRegionByCoords(originLat, originLng);
  if (guessedRegion) {
    candidates.push(guessedRegion);
  }

  return [...new Set(candidates.map(normalizeSpace).filter(Boolean))].slice(0, SEARCH_VARIANTS_LIMIT - 1);
}

function buildSearchQueries(baseQuery, areaHints) {
  const query = normalizeSpace(baseQuery);
  if (!query) return [];

  const searchQueries = [];
  areaHints.forEach((hint) => {
    searchQueries.push(normalizeSpace(`${hint} ${query}`));
  });
  searchQueries.push(query);

  return [...new Set(searchQueries.filter(Boolean))].slice(0, SEARCH_VARIANTS_LIMIT);
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function guessRegionByCoords(lat, lng) {
  if (!isValidLatLng(lat, lng)) return "";

  const metroRegions = [
    { name: "서울", latMin: 37.41, latMax: 37.72, lngMin: 126.76, lngMax: 127.19 },
    { name: "인천", latMin: 37.33, latMax: 37.79, lngMin: 126.35, lngMax: 126.93 },
    { name: "부산", latMin: 35.02, latMax: 35.35, lngMin: 128.78, lngMax: 129.32 },
    { name: "대구", latMin: 35.73, latMax: 36.02, lngMin: 128.41, lngMax: 128.75 },
    { name: "대전", latMin: 36.18, latMax: 36.5, lngMin: 127.24, lngMax: 127.55 },
    { name: "광주", latMin: 35.03, latMax: 35.25, lngMin: 126.76, lngMax: 127.0 },
    { name: "울산", latMin: 35.43, latMax: 35.73, lngMin: 129.13, lngMax: 129.46 },
    { name: "세종", latMin: 36.45, latMax: 36.7, lngMin: 127.18, lngMax: 127.38 },
    { name: "제주", latMin: 33.1, latMax: 33.65, lngMin: 126.1, lngMax: 126.98 }
  ];

  const metro = metroRegions.find((region) => {
    return lat >= region.latMin && lat <= region.latMax && lng >= region.lngMin && lng <= region.lngMax;
  });
  if (metro) return metro.name;

  if (lat >= 36.8 && lat <= 38.5 && lng >= 126.2 && lng <= 127.9) return "경기";
  if (lat >= 37.0 && lat <= 38.6 && lng >= 127.1 && lng <= 129.4) return "강원";
  if (lat >= 36.1 && lat <= 37.4 && lng >= 126.7 && lng <= 127.9) return "충남";
  if (lat >= 36.2 && lat <= 37.6 && lng >= 127.3 && lng <= 128.8) return "충북";
  if (lat >= 35.4 && lat <= 36.4 && lng >= 126.3 && lng <= 127.6) return "전북";
  if (lat >= 34.4 && lat <= 35.6 && lng >= 126.0 && lng <= 127.4) return "전남";
  if (lat >= 35.2 && lat <= 37.2 && lng >= 127.8 && lng <= 129.6) return "경북";
  if (lat >= 34.6 && lat <= 35.6 && lng >= 127.5 && lng <= 129.2) return "경남";

  return "";
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function fetchPlaceDetail(place, areaHint) {
  const locationHint = [areaHint, place.roadAddress || place.address || ""]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const name = stripHtml(place.title || "").trim();
  if (!name) return null;

  const imageQuery = [locationHint, name]
    .filter(Boolean)
    .join(" ");
  const blogQuery = [locationHint, name, "리뷰"]
    .filter(Boolean)
    .join(" ");

  const [imagePayload, blogPayload] = await Promise.all([
    fetchImageSnippet(imageQuery),
    fetchBlogReviews(blogQuery)
  ]);

  const blogReviewTotal = Number(blogPayload.total || 0);
  const ratingEstimated = estimateRatingFromReviewCount(blogReviewTotal);

  return {
    photoThumbnail: imagePayload.thumbnail,
    photoLink: imagePayload.link,
    blogReviewTotal,
    blogReviews: blogPayload.reviews,
    ratingEstimated
  };
}

async function fetchImageSnippet(query) {
  if (!query) return { thumbnail: "", link: "" };

  const url = new URL("https://openapi.naver.com/v1/search/image.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const response = await requestNaverApi(url);
  if (!response.ok) {
    return { thumbnail: "", link: "" };
  }

  const data = await response.json();
  const first = Array.isArray(data.items) ? data.items[0] : null;
  if (!first) {
    return { thumbnail: "", link: "" };
  }

  return {
    thumbnail: toHttpsUrl(first.thumbnail || ""),
    link: toHttpsUrl(first.link || "")
  };
}

async function fetchBlogReviews(query) {
  if (!query) return { total: 0, reviews: [] };

  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "3");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const response = await requestNaverApi(url);
  if (!response.ok) {
    return { total: 0, reviews: [] };
  }

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];
  const reviews = items.map((item) => ({
    title: stripHtml(item.title || "").trim(),
    description: stripHtml(item.description || "").trim(),
    link: toHttpsUrl(item.link || ""),
    bloggerName: stripHtml(item.bloggername || "").trim(),
    postDate: String(item.postdate || "")
  }));

  return {
    total: Number(data.total || 0),
    reviews
  };
}

function estimateRatingFromReviewCount(reviewCount) {
  if (!Number.isFinite(reviewCount) || reviewCount <= 0) return null;
  const normalized = Math.log10(reviewCount + 1);
  const score = Math.min(5, 2.8 + normalized * 0.8);
  return Math.round(score * 10) / 10;
}

async function requestNaverApi(url) {
  return fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
  });
}

function toHttpsUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://")) {
    return `https://${raw.slice("http://".length)}`;
  }
  return raw;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end(JSON.stringify(payload));
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}
