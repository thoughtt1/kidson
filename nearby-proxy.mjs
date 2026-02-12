import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const NAVER_CLIENT_ID = (process.env.NAVER_SEARCH_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
const DEFAULT_QUERIES = ["키즈카페", "실내놀이터", "어린이도서관", "유아 체험", "놀이터"];
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

  try {
    const items = await searchNearbyFromNaver({ queries, areaHint, display });
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

async function searchNearbyFromNaver({ queries, areaHint, display }) {
  const aggregated = [];

  for (const query of queries) {
    const searchQuery = [areaHint, query].filter(Boolean).join(" ");
    const url = new URL("https://openapi.naver.com/v1/search/local.json");
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("display", String(display));
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "random");

    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
      }
    });

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

  return [...unique.values()];
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end(JSON.stringify(payload));
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}
