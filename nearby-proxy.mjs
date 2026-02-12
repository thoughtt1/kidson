import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const NAVER_CLIENT_ID = (process.env.NAVER_SEARCH_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
const DEFAULT_QUERIES = ["키즈카페", "실내놀이터", "어린이도서관", "유아 체험", "놀이터"];
const MAX_DETAIL_ITEMS = 12;
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

  try {
    const items = await searchNearbyFromNaver({
      queries,
      areaHint,
      display,
      withDetails
    });
    sendJson(res, 200, {
      source: "naver-local-search",
      count: items.length,
      items
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

async function searchNearbyFromNaver({ queries, areaHint, display, withDetails = true }) {
  const aggregated = [];

  for (const query of queries) {
    const searchQuery = [areaHint, query].filter(Boolean).join(" ");
    const url = new URL("https://openapi.naver.com/v1/search/local.json");
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("display", String(display));
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "comment");

    const response = await requestNaverApi(url);

    if (!response.ok) {
      throw new Error(`Naver local API failed (${response.status})`);
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    aggregated.push(...items);
  }

  const unique = new Map();
  aggregated.forEach((item) => {
    const title = stripHtml(item.title || "").trim();
    const roadAddress = stripHtml(item.roadAddress || "").trim();
    const mapx = Number(item.mapx);
    const mapy = Number(item.mapy);
    const lat = Number.isFinite(mapx) && Number.isFinite(mapy) ? mapy / 10000000 : null;
    const lng = Number.isFinite(mapx) && Number.isFinite(mapy) ? mapx / 10000000 : null;
    const key = `${title}|${roadAddress}|${mapx}|${mapy}`;

    if (!title || unique.has(key)) return;
    unique.set(key, {
      ...item,
      title,
      roadAddress,
      address: stripHtml(item.address || "").trim(),
      category: stripHtml(item.category || "").trim(),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    });
  });

  const places = [...unique.values()];
  if (!withDetails || !places.length) {
    return places;
  }

  const detailTargets = places.slice(0, MAX_DETAIL_ITEMS);
  await Promise.all(detailTargets.map(async (place) => {
    const detail = await fetchPlaceDetail(place, areaHint);
    if (!detail) return;
    place.photoThumbnail = detail.photoThumbnail || "";
    place.photoLink = detail.photoLink || "";
    place.blogReviewTotal = detail.blogReviewTotal || 0;
    place.blogReviews = detail.blogReviews || [];
    place.ratingEstimated = detail.ratingEstimated;
    place.ratingSource = "estimated_from_blog_reviews";
  }));

  return places;
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
