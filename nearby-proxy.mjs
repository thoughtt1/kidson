import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const NAVER_CLIENT_ID = (process.env.NAVER_SEARCH_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
const DEFAULT_QUERIES = ["실내놀이터", "어린이도서관", "유아 체험", "놀이터", "공원"];
const MAX_DETAIL_ITEMS = 12;
const MAX_RESULTS = 30;
const MAX_WEBKR_DISPLAY = 5;
const SEARCH_VARIANTS_LIMIT = 3;
const RADIUS_PADDING_KM = 0.8;
const RELAXED_RADIUS_EXTRA_KM = 3;
const PLACE_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 30;
const PLACE_LOOKUP_CACHE_LIMIT = 500;
const PLACE_HTML_USER_AGENT = "Mozilla/5.0 (compatible; KidsonBot/1.0; +https://github.com/thoughtt1/kidson)";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};
const placeLookupCache = new Map();

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
    .filter(Boolean)
    .filter((query) => !isExcludedActivityText(query.toLowerCase()));
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
  places.forEach((place) => {
    const normalizedLinks = normalizeNaverPlaceLinks(place.placeLink || "") || buildFallbackPlaceLinks(place);
    place.placeLink = normalizedLinks.placeLink;
    place.reviewLink = normalizedLinks.reviewLink;
    place.blogReviewLink = normalizedLinks.blogReviewLink;
  });

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
    place.placeLink = detail.placeLink || buildMapSearchUrlForPlace(place);
    place.reviewLink = detail.reviewLink || place.placeLink;
    place.blogReviewLink = detail.blogReviewLink || place.placeLink;
    place.photoThumbnail = detail.photoThumbnail || "";
    place.photoLink = detail.photoLink || place.placeLink || "";
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
  if (shouldExcludeItem(title, category, roadAddress, address)) {
    return null;
  }
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
    placeLink: toHttpsUrl(item.link || ""),
    reviewLink: "",
    blogReviewLink: "",
    distanceKm: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) / 1000 : null
  };
}

function shouldExcludeItem(title, category, roadAddress, address) {
  const text = [title, category, roadAddress, address]
    .map((value) => String(value || "").toLowerCase().trim())
    .filter(Boolean)
    .join(" ");
  return isExcludedActivityText(text);
}

function isExcludedActivityText(text) {
  const keywords = [
    "카페", "커피", "디저트", "브런치",
    "식당", "레스토랑", "음식점", "한식", "양식", "일식", "중식", "분식", "치킨", "피자", "버거", "패스트푸드",
    "행사", "축제", "공연", "페스티벌", "콘서트", "뮤지컬", "전시회"
  ];
  return keywords.some((keyword) => text.includes(keyword));
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
  const placeLinks = await resolveNaverPlaceLinks(place, areaHint);
  const [representativeImage, imagePayload, blogPayload] = await Promise.all([
    fetchPlaceRepresentativeImage(placeLinks.mobileHomeLink || ""),
    fetchImageSnippet(imageQuery),
    fetchBlogReviews(blogQuery)
  ]);

  const blogReviewTotal = Number(blogPayload.total || 0);
  const ratingEstimated = estimateRatingFromReviewCount(blogReviewTotal);
  const photoThumbnail = representativeImage || imagePayload.thumbnail;
  const placeLink = placeLinks.placeLink || buildMapSearchUrlForPlace(place);
  const reviewLink = placeLinks.reviewLink || placeLink;
  const blogReviewLink = placeLinks.blogReviewLink || placeLink;
  const photoLink = placeLink || imagePayload.link;

  return {
    placeLink,
    reviewLink,
    blogReviewLink,
    photoThumbnail,
    photoLink,
    blogReviewTotal,
    blogReviews: blogPayload.reviews,
    ratingEstimated
  };
}

async function resolveNaverPlaceLinks(place, areaHint) {
  const cacheKey = buildPlaceCacheKey(place);
  const cached = getCachedPlaceLinks(cacheKey);
  if (cached) return cached;

  const directLinks = normalizeNaverPlaceLinks(place.link || place.placeLink || "");
  if (directLinks) {
    setCachedPlaceLinks(cacheKey, directLinks);
    return directLinks;
  }

  const webQuery = buildWebLookupQuery(place, areaHint);
  const webCandidates = await fetchWebSearchCandidates(webQuery);
  const bestCandidate = pickBestPlaceCandidate(webCandidates, place);
  const resolvedLinks = normalizeNaverPlaceLinks(bestCandidate?.link || "")
    || buildFallbackPlaceLinks(place);

  setCachedPlaceLinks(cacheKey, resolvedLinks);
  return resolvedLinks;
}

function buildPlaceCacheKey(place) {
  return [
    normalizeCompareText(place?.title || ""),
    normalizeCompareText(place?.roadAddress || place?.address || "")
  ]
    .filter(Boolean)
    .join("|");
}

function getCachedPlaceLinks(cacheKey) {
  if (!cacheKey) return null;
  const cached = placeLookupCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    placeLookupCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedPlaceLinks(cacheKey, value) {
  if (!cacheKey || !value) return;
  if (placeLookupCache.size >= PLACE_LOOKUP_CACHE_LIMIT) {
    const oldestKey = placeLookupCache.keys().next().value;
    if (oldestKey) {
      placeLookupCache.delete(oldestKey);
    }
  }
  placeLookupCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PLACE_LOOKUP_CACHE_TTL_MS
  });
}

function buildWebLookupQuery(place, areaHint) {
  return [
    areaHint,
    place?.roadAddress || place?.address || "",
    place?.title || "",
    "네이버지도"
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

async function fetchWebSearchCandidates(query) {
  const cleanedQuery = String(query || "").trim();
  if (!cleanedQuery) return [];

  const url = new URL("https://openapi.naver.com/v1/search/webkr.json");
  url.searchParams.set("query", cleanedQuery);
  url.searchParams.set("display", String(MAX_WEBKR_DISPLAY));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const response = await requestNaverApi(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => ({
      title: stripHtml(item.title || "").trim(),
      description: stripHtml(item.description || "").trim(),
      link: toHttpsUrl(item.link || "")
    }))
    .filter((item) => item.link);
}

function pickBestPlaceCandidate(candidates, place) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const nameText = normalizeCompareText(place?.title || "");
  const addressText = normalizeCompareText(place?.roadAddress || place?.address || "");
  let best = null;
  let bestScore = -Infinity;

  candidates.forEach((candidate) => {
    const link = toHttpsUrl(candidate?.link || "");
    if (!isLikelyNaverPlaceUrl(link)) return;

    const titleText = normalizeCompareText(candidate?.title || "");
    const descText = normalizeCompareText(candidate?.description || "");

    let score = 0;
    if (link.includes("m.place.naver.com")) score += 7;
    if (link.includes("place.naver.com")) score += 6;
    if (link.includes("/entry/place/")) score += 5;
    if (extractPlaceIdFromUrl(link)) score += 4;
    if (nameText && titleText.includes(nameText)) score += 4;
    if (nameText && descText.includes(nameText)) score += 2;
    if (addressText && (titleText.includes(addressText) || descText.includes(addressText))) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
}

function isLikelyNaverPlaceUrl(rawUrl) {
  const safeUrl = toHttpsUrl(rawUrl);
  if (!safeUrl) return false;

  try {
    const { hostname, pathname } = new URL(safeUrl);
    const host = hostname.replace(/^www\./, "");
    if (host === "m.place.naver.com" || host === "place.naver.com") {
      return true;
    }
    return host === "map.naver.com"
      && (pathname.includes("/entry/place/") || pathname.startsWith("/p/search/") || pathname.startsWith("/v5/search/"));
  } catch {
    return false;
  }
}

function normalizeNaverPlaceLinks(rawUrl) {
  const safeUrl = toHttpsUrl(rawUrl);
  if (!safeUrl) return null;

  try {
    const parsed = new URL(safeUrl);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "m.place.naver.com" || host === "place.naver.com") {
      const placeToken = parsePlaceTokenFromPath(parsed.pathname);
      if (placeToken) {
        return buildPlaceLinksFromToken(placeToken.type, placeToken.id);
      }
      return null;
    }

    if (host === "map.naver.com") {
      const placeId = extractPlaceIdFromUrl(safeUrl);
      if (placeId) {
        return buildPlaceLinksFromToken("place", placeId);
      }

      if (parsed.pathname.startsWith("/p/search/") || parsed.pathname.startsWith("/v5/search/")) {
        return {
          placeLink: `https://map.naver.com${parsed.pathname}`,
          reviewLink: `https://map.naver.com${parsed.pathname}`,
          blogReviewLink: `https://map.naver.com${parsed.pathname}`,
          mobileHomeLink: ""
        };
      }
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

function parsePlaceTokenFromPath(pathname) {
  const segments = String(pathname || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;
  const type = segments[0];
  const id = segments[1];
  if (!/^\d+$/.test(id)) return null;

  return {
    type: type || "place",
    id
  };
}

function extractPlaceIdFromUrl(rawUrl) {
  const text = String(rawUrl || "");
  const match = text.match(/\/(?:p\/)?entry\/place\/(\d+)/) || text.match(/\/v5\/entry\/place\/(\d+)/);
  return match ? match[1] : "";
}

function buildPlaceLinksFromToken(type, id) {
  const safeType = String(type || "place").trim() || "place";
  const safeId = String(id || "").trim();
  if (!/^\d+$/.test(safeId)) {
    return null;
  }

  return {
    placeLink: `https://map.naver.com/p/entry/place/${safeId}`,
    reviewLink: `https://m.place.naver.com/${safeType}/${safeId}/review/visitor`,
    blogReviewLink: `https://m.place.naver.com/${safeType}/${safeId}/review/ugc`,
    mobileHomeLink: `https://m.place.naver.com/${safeType}/${safeId}/home`
  };
}

function buildFallbackPlaceLinks(place) {
  const searchUrl = buildMapSearchUrlForPlace(place);
  return {
    placeLink: searchUrl,
    reviewLink: searchUrl,
    blogReviewLink: searchUrl,
    mobileHomeLink: ""
  };
}

function buildMapSearchUrlForPlace(place) {
  const query = [
    stripHtml(place?.title || "").trim(),
    stripHtml(place?.roadAddress || place?.address || "").trim()
  ]
    .filter(Boolean)
    .join(" ");

  return `https://map.naver.com/p/search/${encodeURIComponent(query || "키즈 장소")}`;
}

async function fetchPlaceRepresentativeImage(rawPlaceHomeUrl) {
  const placeHomeUrl = toHttpsUrl(rawPlaceHomeUrl);
  if (!placeHomeUrl) return "";

  try {
    const response = await fetch(placeHomeUrl, {
      headers: {
        "User-Agent": PLACE_HTML_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8"
      }
    });
    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const ogImage = extractMetaContent(html, "property", "og:image")
      || extractMetaContent(html, "name", "twitter:image");

    return toHttpsUrl(decodeHtmlEntities(ogImage || ""));
  } catch {
    return "";
  }
}

function extractMetaContent(html, attrName, attrValue) {
  const source = String(html || "");
  if (!source) return "";

  const escapedAttr = escapeRegExp(attrName);
  const escapedValue = escapeRegExp(attrValue);
  const pattern = new RegExp(
    `<meta[^>]*${escapedAttr}\\s*=\\s*["']${escapedValue}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
    "i"
  );
  const fallbackPattern = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${escapedAttr}\\s*=\\s*["']${escapedValue}["'][^>]*>`,
    "i"
  );

  const firstMatch = source.match(pattern);
  if (firstMatch?.[1]) return firstMatch[1];

  const secondMatch = source.match(fallbackPattern);
  if (secondMatch?.[1]) return secondMatch[1];

  return "";
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeCompareText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
