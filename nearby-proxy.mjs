import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const NAVER_CLIENT_ID = (process.env.NAVER_SEARCH_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim();
const DEFAULT_QUERIES = [
  "실내놀이터",
  "어린이도서관",
  "공원",
  "유적지",
  "박물관",
  "미술관",
  "공연장",
  "키즈카페",
  "유아 동반 식당",
  "어린이서점",
  "완구점"
];
const PLAY_KEYWORDS = [
  "놀이터", "놀이", "체험", "박물관", "도서관", "공원", "숲", "산책",
  "야외", "자연", "과학관", "미술관", "동물", "유적", "광장", "한강",
  "실내", "체육관", "공예", "공방", "만들기", "공연장", "연극", "뮤지컬",
  "콘서트", "극장", "카페", "식당", "레스토랑", "브런치", "서점", "완구"
];
const KID_KEYWORDS = [
  "어린이", "유아", "아이", "아기", "키즈", "가족", "유모차", "수유실",
  "아기의자", "유아의자", "키즈메뉴"
];
const KID_UNSUITABLE_KEYWORDS = [
  "노키즈존", "주점", "술집", "포차", "호프", "클럽", "유흥",
  "이자카야", "와인바", "와인 바", "펍", "칵테일", "칵테일바", "라운지바", "맥주집", "수제맥주",
  "pub", "cocktail", "wine bar",
  "오피스", "사무실", "병원", "약국", "성형", "치과", "정형외과"
];
const GARDEN_KEYWORDS = ["정원", "가든", "수목원", "식물원"];
const GARDEN_KID_EVIDENCE_KEYWORDS = [
  "어린이", "유아", "아이", "아기", "가족", "놀이터", "놀이", "체험",
  "산책", "야외", "숲", "피크닉", "유모차", "키즈"
];
const TARGET_CATEGORY_KEYWORDS = [
  "공원", "한강", "유적", "박물관", "미술관", "갤러리", "전시", "공연장",
  "극장", "연극", "뮤지컬", "콘서트", "놀이터", "체험", "도서관",
  "카페", "식당", "레스토랑", "브런치", "서점", "완구", "키즈", "가족"
];
const FAMILY_SUMMARY_RULES = [
  {
    label: "실내 놀이 중심",
    keywords: ["체험", "클래스", "만들기", "공방", "오감", "놀이", "실내놀이터", "키즈카페"]
  },
  {
    label: "야외 산책 중심",
    keywords: ["공원", "한강", "놀이터", "숲", "잔디", "산책", "야외", "유적"]
  },
  {
    label: "전시·배움 중심",
    keywords: ["박물관", "미술관", "전시", "도서관", "역사", "유적지", "기념관"]
  },
  {
    label: "공연 관람 중심",
    keywords: ["공연장", "연극", "뮤지컬", "콘서트", "극장"]
  },
  {
    label: "식사·휴식 중심",
    keywords: ["카페", "브런치", "식당", "레스토랑", "키즈메뉴"]
  },
  {
    label: "서점·완구 탐색 중심",
    keywords: ["서점", "완구", "장난감", "문구", "키즈샵"]
  }
];
const FAMILY_DETAIL_RULES = [
  {
    label: "신체 놀이 요소가 있어요",
    keywords: ["놀이터", "정글짐", "트램폴린", "볼풀", "미끄럼틀", "키즈존"]
  },
  {
    label: "체험 활동 비중이 높아요",
    keywords: ["체험", "클래스", "만들기", "공방", "오감", "전시체험", "교육체험"]
  },
  {
    label: "아이 눈높이 전시·학습 동선이에요",
    keywords: ["박물관", "미술관", "도서관", "전시", "유적지", "기념관", "역사"]
  },
  {
    label: "공연 관람 코스로 적합해요",
    keywords: ["공연장", "연극", "뮤지컬", "콘서트", "극장"]
  },
  {
    label: "식사/휴식과 함께 이용하기 좋아요",
    keywords: ["카페", "브런치", "식당", "레스토랑", "키즈메뉴", "아기의자"]
  },
  {
    label: "유아 동반 편의 정보가 보여요",
    keywords: ["유모차", "수유실", "기저귀", "아기의자", "유아의자", "키즈메뉴"]
  }
];
const FAMILY_HIGHLIGHT_RULES = [
  {
    label: "유모차 이동 동선 확인",
    keywords: ["유모차", "엘리베이터", "경사로", "넓은 통로"]
  },
  {
    label: "수유/기저귀 편의 확인",
    keywords: ["수유실", "기저귀", "기저귀교환대", "수유"]
  },
  {
    label: "유아 의자/키즈메뉴 확인",
    keywords: ["아기의자", "유아의자", "키즈메뉴", "아동메뉴"]
  },
  {
    label: "주차/대중교통 접근성 확인",
    keywords: ["주차", "주차장", "역세권", "버스", "지하철"]
  },
  {
    label: "혼잡 시간대 피하면 좋아요",
    keywords: ["대기", "웨이팅", "혼잡", "붐빔", "주말"]
  },
  {
    label: "사전 예약 여부 확인",
    keywords: ["예약", "사전예약", "예매"]
  },
  {
    label: "우천 시에도 이용 가능",
    keywords: ["실내", "우천", "비오는날"]
  }
];
const MAX_DETAIL_ITEMS = 12;
const MAX_RESULTS = 30;
const MAX_WEBKR_DISPLAY = 5;
const SEARCH_VARIANTS_LIMIT = 3;
const RADIUS_PADDING_KM = 0.8;
const RELAXED_RADIUS_EXTRA_KM = 3;
const PLACE_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 30;
const PLACE_LOOKUP_CACHE_LIMIT = 500;
const PLACE_HTML_USER_AGENT = "Mozilla/5.0 (compatible; KidsonBot/1.0; +https://github.com/thoughtt1/kidson)";
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
const AI_CLASSIFIER_ENABLED = (process.env.AI_CLASSIFIER_ENABLED || "").trim() === "1";
const AI_CLASSIFIER_TIMEOUT_MS = Number(process.env.AI_CLASSIFIER_TIMEOUT_MS || 12000);
const AI_CLASSIFIER_MIN_CONFIDENCE = Number(process.env.AI_CLASSIFIER_MIN_CONFIDENCE || 0.55);
const AI_CLASSIFIER_MAX_ITEMS = Number(process.env.AI_CLASSIFIER_MAX_ITEMS || 20);
const AI_CLASSIFIER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const AI_CLASSIFIER_CACHE_LIMIT = 1000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};
const placeLookupCache = new Map();
const aiSuitabilityCache = new Map();

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error("NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 환경 변수가 필요합니다.");
  process.exit(1);
}

if (AI_CLASSIFIER_ENABLED && !OPENAI_API_KEY) {
  console.warn("AI_CLASSIFIER_ENABLED=1 이지만 OPENAI_API_KEY가 없어 AI 분류를 건너뜁니다.");
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
    .filter((query) => !isExcludedSearchQuery(query));
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

  places = places.filter((place) => isKidPlaySuitablePlace(place, { allowUnverifiedGarden: true }));

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
    place.mobileHomeLink = normalizedLinks.mobileHomeLink || "";
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
    place.mobileHomeLink = detail.mobileHomeLink || place.mobileHomeLink || "";
    place.photoThumbnail = detail.photoThumbnail || "";
    place.photoLink = detail.photoLink || place.placeLink || "";
    place.blogReviewTotal = detail.blogReviewTotal || 0;
    place.blogReviews = detail.blogReviews || [];
    place.ratingEstimated = detail.ratingEstimated;
    place.ratingSource = "estimated_from_blog_reviews";
  }));

  places = places.filter((place) => isKidPlaySuitablePlace(place));
  places = await applyAiSuitabilityFilter(places);
  places.forEach((place) => {
    const insight = buildFamilyPlaceInsight(place);
    place.familySummary = insight.summary;
    place.familyHighlights = insight.highlights;
    place.familyConfidence = insight.confidence;
  });

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
    mobileHomeLink: "",
    distanceKm: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) / 1000 : null
  };
}

function shouldExcludeItem(title, category, roadAddress, address) {
  const text = buildFilterText(title, category, roadAddress, address);
  if (isClearlyIrrelevantPlaceText(text)) return true;
  if (isPhotoRelatedText(text)) return true;
  if (isEducationFacilityText(text) && !isKidCultureFacilityText(text)) return true;
  return false;
}

function isExcludedSearchQuery(query) {
  const text = buildFilterText(query);
  if (!text) return true;
  if (isClearlyIrrelevantPlaceText(text)) return true;
  if (isPhotoRelatedText(text)) return true;
  return false;
}

function buildFilterText(...values) {
  return values
    .map((value) => String(value || "").toLowerCase().trim())
    .filter(Boolean)
    .join(" ");
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function isClearlyIrrelevantPlaceText(text) {
  return hasAnyKeyword(text, [
    "노키즈존", "유흥", "클럽", "룸살롱", "주점", "술집", "호프", "포차",
    "이자카야", "와인바", "와인 바", "펍", "칵테일", "칵테일바", "라운지바", "맥주집", "수제맥주",
    "pub", "cocktail", "wine bar",
    "오피스", "사무실", "병원", "약국", "치과", "정형외과", "성형외과",
    "피부과", "중고차", "자동차정비", "세차", "부동산", "대출", "보험"
  ]);
}

function isPhotoRelatedText(text) {
  return hasAnyKeyword(text, [
    "사진관", "사진 스튜디오", "사진스튜디오", "포토스튜디오",
    "프로필 촬영", "셀프사진관", "사진촬영", "증명사진",
    "인생네컷", "포토이즘", "하루필름", "포토그레이", "포토시그니처", "포토매틱", "셀픽스",
    "포토부스", "스냅"
  ]);
}

function isEducationFacilityText(text) {
  return hasAnyKeyword(text, [
    "학원", "교습소", "공부방", "어학원", "교육원", "영어유치원",
    "어린이집", "유치원", "초등학교", "중학교", "고등학교"
  ]);
}

function isKidCultureFacilityText(text) {
  return hasAnyKeyword(text, [
    "어린이도서관", "어린이박물관", "유아체험", "키즈센터", "아동미술관"
  ]);
}

function needsKidEvidenceByCategory(text) {
  const requiresEvidence = hasAnyKeyword(text, [
    "카페", "식당", "레스토랑", "브런치", "서점", "완구", "매장", "쇼핑",
    "공연장", "극장", "연극", "뮤지컬", "콘서트"
  ]);
  if (!requiresEvidence) return false;

  return !hasAnyKeyword(text, [
    "어린이", "유아", "아이", "아기", "키즈", "가족",
    "유모차", "수유실", "아기의자", "유아의자", "키즈메뉴"
  ]);
}

function containsGardenKeyword(text) {
  return hasAnyKeyword(text, GARDEN_KEYWORDS);
}

function extractBlogReviewText(reviews) {
  if (!Array.isArray(reviews)) return "";
  return reviews
    .flatMap((review) => [review?.title || "", review?.description || ""])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isGardenWithoutKidEvidence(baseText, blogText, allowUnverifiedGarden = false) {
  if (!containsGardenKeyword(baseText)) return false;
  if (!blogText) {
    if (allowUnverifiedGarden) return false;
    return !hasAnyKeyword(baseText, [
      "어린이", "유아", "아이", "아기", "가족", "산책", "야외", "숲", "피크닉", "키즈"
    ]);
  }
  const evidenceText = buildFilterText(baseText, blogText);
  return !hasAnyKeyword(evidenceText, GARDEN_KID_EVIDENCE_KEYWORDS);
}

function isKidPlaySuitablePlace(place, options = {}) {
  const allowUnverifiedGarden = Boolean(options.allowUnverifiedGarden);
  const baseText = buildFilterText(
    place?.title || "",
    place?.category || "",
    place?.roadAddress || "",
    place?.address || "",
    place?.description || ""
  );
  const blogText = extractBlogReviewText(place?.blogReviews);
  const text = buildFilterText(baseText, blogText);

  if (!text) return false;
  if (isClearlyIrrelevantPlaceText(text)) return false;
  if (isPhotoRelatedText(text)) return false;
  if (isEducationFacilityText(text) && !isKidCultureFacilityText(text)) return false;
  if (isGardenWithoutKidEvidence(baseText, blogText, allowUnverifiedGarden)) return false;
  if (!hasAnyKeyword(text, TARGET_CATEGORY_KEYWORDS)) return false;
  if (needsKidEvidenceByCategory(text)) return false;

  const playCount = countKeywordMatches(text, PLAY_KEYWORDS);
  const kidCount = countKeywordMatches(text, KID_KEYWORDS);
  const cautionCount = countKeywordMatches(text, KID_UNSUITABLE_KEYWORDS);
  const score = (playCount * 2.2) + (kidCount * 1.3) - (cautionCount * 2.4);

  if (playCount === 0 && kidCount === 0) return false;
  return score >= 1.3;
}

function pickRuleLabels(text, rules, maxCount) {
  const labels = [];
  rules.forEach((rule) => {
    if (!rule || !Array.isArray(rule.keywords)) return;
    if (!hasAnyKeyword(text, rule.keywords)) return;
    if (labels.includes(rule.label)) return;
    labels.push(rule.label);
  });
  return labels.slice(0, Math.max(1, maxCount));
}

function pickFirstRuleLabel(text, rules) {
  const labels = pickRuleLabels(text, rules, 1);
  return labels.length ? labels[0] : "";
}

function extractCategoryLeaf(categoryText) {
  const parts = String(categoryText || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const leaf = parts[parts.length - 1];
  if (leaf.length <= 18) return leaf;
  return `${leaf.slice(0, 18)}...`;
}

function buildBlogHintSnippet(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return "";
  const first = reviews.find((review) => {
    return String(review?.title || "").trim() || String(review?.description || "").trim();
  });
  if (!first) return "";

  const raw = `${String(first.title || "").trim()} ${String(first.description || "").trim()}`.trim();
  if (!raw) return "";

  const cleaned = stripHtml(raw)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  if (cleaned.length <= 22) return cleaned;
  return `${cleaned.slice(0, 22)}...`;
}

function buildFamilyPlaceInsight(place) {
  const baseText = buildFilterText(
    place?.title || "",
    place?.category || "",
    place?.roadAddress || "",
    place?.address || "",
    place?.description || ""
  );
  const blogText = extractBlogReviewText(place?.blogReviews);
  const text = buildFilterText(baseText, blogText);
  if (!text) {
    return {
      summary: "아이와 함께 방문하기 좋은 장소인지 현장 정보를 확인해 보세요",
      highlights: [],
      confidence: 0.35
    };
  }

  const categoryLeaf = extractCategoryLeaf(place?.category || "");
  const typeLabel = pickFirstRuleLabel(text, FAMILY_SUMMARY_RULES);
  const detailLabel = pickFirstRuleLabel(text, FAMILY_DETAIL_RULES);
  const blogHint = buildBlogHintSnippet(place?.blogReviews);
  const blogReviewTotal = Number(place?.blogReviewTotal || 0);

  const summaryParts = [];
  if (categoryLeaf) {
    summaryParts.push(`${categoryLeaf} 코스`);
  } else if (typeLabel) {
    summaryParts.push(typeLabel);
  }

  if (detailLabel) {
    summaryParts.push(detailLabel);
  } else if (typeLabel && !summaryParts.includes(typeLabel)) {
    summaryParts.push(typeLabel);
  } else if (blogHint) {
    summaryParts.push(`후기: ${blogHint}`);
  } else if (blogReviewTotal > 0) {
    summaryParts.push(`블로그 ${blogReviewTotal}건 참고`);
  }

  const highlightCandidates = pickRuleLabels(text, FAMILY_HIGHLIGHT_RULES, 4);
  if (blogHint && !highlightCandidates.length) {
    highlightCandidates.push(`후기 키워드: ${blogHint}`);
  }
  const aiReason = String(place?.aiReason || "").trim();
  if (aiReason && aiReason.length <= 42 && !highlightCandidates.includes(aiReason)) {
    highlightCandidates.unshift(aiReason);
  }

  const summary = summaryParts
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ")
    .trim() || "아이와 함께 이동 동선을 확인하고 방문해 보세요";

  const evidenceScore = (typeLabel ? 2 : 0) + (detailLabel ? 2 : 0) + highlightCandidates.length + (blogText ? 1 : 0);
  const confidenceRaw = 0.38
    + (Math.min(6, evidenceScore) * 0.07)
    + Math.min(0.18, Math.log10(blogReviewTotal + 1) * 0.09);
  const confidence = Math.max(0.35, Math.min(0.95, confidenceRaw));

  return {
    summary,
    highlights: highlightCandidates.slice(0, 3),
    confidence: Math.round(confidence * 100) / 100
  };
}

function shouldUseAiClassifier() {
  return AI_CLASSIFIER_ENABLED && Boolean(OPENAI_API_KEY) && Boolean(OPENAI_MODEL);
}

function getAiTimeoutMs() {
  return Number.isFinite(AI_CLASSIFIER_TIMEOUT_MS) && AI_CLASSIFIER_TIMEOUT_MS > 0
    ? Math.floor(AI_CLASSIFIER_TIMEOUT_MS)
    : 12000;
}

function getAiMinConfidence() {
  if (!Number.isFinite(AI_CLASSIFIER_MIN_CONFIDENCE)) return 0.55;
  return Math.max(0, Math.min(1, AI_CLASSIFIER_MIN_CONFIDENCE));
}

function getAiMaxItems(total) {
  const fallback = Math.min(20, total);
  if (!Number.isFinite(AI_CLASSIFIER_MAX_ITEMS)) return Math.max(1, fallback);
  const normalized = Math.floor(AI_CLASSIFIER_MAX_ITEMS);
  return Math.max(1, Math.min(total, normalized));
}

function buildAiSuitabilityCacheKey(place) {
  return [
    normalizeCompareText(place?.title || ""),
    normalizeCompareText(place?.roadAddress || place?.address || "")
  ]
    .filter(Boolean)
    .join("|");
}

function getCachedAiSuitability(cacheKey) {
  if (!cacheKey) return null;
  const cached = aiSuitabilityCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    aiSuitabilityCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedAiSuitability(cacheKey, value) {
  if (!cacheKey || !value) return;
  if (aiSuitabilityCache.size >= AI_CLASSIFIER_CACHE_LIMIT) {
    const oldestKey = aiSuitabilityCache.keys().next().value;
    if (oldestKey) {
      aiSuitabilityCache.delete(oldestKey);
    }
  }
  aiSuitabilityCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + AI_CLASSIFIER_CACHE_TTL_MS
  });
}

function buildAiCandidate(place, id) {
  const blogSummary = Array.isArray(place?.blogReviews)
    ? place.blogReviews
      .slice(0, 4)
      .map((review) => `${String(review?.title || "").trim()} ${String(review?.description || "").trim()}`.trim())
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1200)
    : "";

  return {
    id: String(id),
    name: String(place?.title || "").trim(),
    category: String(place?.category || "").trim(),
    address: String(place?.roadAddress || place?.address || "").trim(),
    description: String(place?.description || "").trim(),
    blogReviewTotal: Number(place?.blogReviewTotal || 0),
    blogSummary
  };
}

function normalizeAiDecision(rawDecision) {
  if (!rawDecision || typeof rawDecision !== "object") return null;
  const suitable = Boolean(rawDecision.suitable);
  const confidenceRaw = Number(rawDecision.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : suitable ? 0.6 : 0.5;
  const reason = String(rawDecision.reason || "").trim().slice(0, 240);
  return { suitable, confidence, reason };
}

async function classifyPlacesWithOpenAi(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return new Map();
  }

  const schema = {
    name: "kid_place_classification",
    strict: true,
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              suitable: { type: "boolean" },
              confidence: { type: "number" },
              reason: { type: "string" }
            },
            required: ["id", "suitable", "confidence", "reason"],
            additionalProperties: false
          }
        }
      },
      required: ["results"],
      additionalProperties: false
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getAiTimeoutMs());

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: schema
        },
        messages: [
          {
            role: "system",
            content: "당신은 12개월~6세 유아/아동 동반 장소 분류기다. 네이버 지도/블로그 정보 기반으로 가족 방문 적합도를 판정한다. 사진촬영 전용 장소, 성인/유흥/비가족 장소는 제외한다."
          },
          {
            role: "user",
            content: [
              "다음 후보 장소를 suitable(추천) / unsuitable(제외)로 분류해줘.",
              "판정 기준:",
              "1) 12개월~6세 아이와 실제로 시간을 보내기 적합한가",
              "2) 추천 대상은 공원/유적지/박물관/미술관/공연장/가족친화 가게(카페·식당·서점·완구점 포함)",
              "3) 블로그 요약에서 유아 동반 동선, 편의시설, 실제 체험 근거를 우선 반영",
              "4) 사진관/포토부스/인생네컷 계열은 무조건 제외",
              "5) 학원/어린이집/의료/사무/유흥 계열은 제외",
              "6) 정원/가든은 아이 동반 놀이·산책 근거가 부족하면 제외",
              "후보 JSON:",
              JSON.stringify({ candidates })
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`openai classify failed (${response.status})`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return new Map();

    const parsed = JSON.parse(content);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    const map = new Map();
    results.forEach((result) => {
      const id = String(result?.id || "");
      if (!id) return;
      const normalized = normalizeAiDecision(result);
      if (!normalized) return;
      map.set(id, normalized);
    });
    return map;
  } finally {
    clearTimeout(timer);
  }
}

async function applyAiSuitabilityFilter(places) {
  if (!shouldUseAiClassifier()) {
    return places;
  }

  if (!Array.isArray(places) || !places.length) {
    return places;
  }

  const limit = getAiMaxItems(places.length);
  const targetPlaces = places.slice(0, limit);
  const pending = [];
  const decisionByKey = new Map();

  targetPlaces.forEach((place, index) => {
    const key = buildAiSuitabilityCacheKey(place);
    if (!key) return;
    const cached = getCachedAiSuitability(key);
    if (cached) {
      decisionByKey.set(key, cached);
      return;
    }
    pending.push({ place, index, key });
  });

  if (pending.length) {
    try {
      const candidates = pending.map(({ place, index }) => buildAiCandidate(place, index));
      const aiResults = await classifyPlacesWithOpenAi(candidates);
      pending.forEach(({ key, index }) => {
        const decision = normalizeAiDecision(aiResults.get(String(index)));
        if (!decision) return;
        decisionByKey.set(key, decision);
        setCachedAiSuitability(key, decision);
      });
    } catch (error) {
      console.error("AI place classification failed. Fallback to heuristic filter.", error);
      return places;
    }
  }

  const minConfidence = getAiMinConfidence();

  return places.filter((place, index) => {
    if (index >= limit) return true;
    const key = buildAiSuitabilityCacheKey(place);
    const decision = key ? decisionByKey.get(key) : null;
    if (!decision) return true;

    place.aiSuitable = decision.suitable;
    place.aiConfidence = decision.confidence;
    place.aiReason = decision.reason;

    if (decision.suitable) return true;
    return decision.confidence < minConfidence;
  });
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
  const mobileHomeLink = placeLinks.mobileHomeLink || "";
  const photoLink = placeLink || imagePayload.link;

  return {
    placeLink,
    reviewLink,
    blogReviewLink,
    mobileHomeLink,
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

  const mobileBase = `https://m.place.naver.com/${safeType}/${safeId}`;
  return {
    placeLink: `${mobileBase}/home`,
    reviewLink: `${mobileBase}/review/visitor`,
    blogReviewLink: `${mobileBase}/review/ugc`,
    mobileHomeLink: `${mobileBase}/home`
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

  const plans = [
    { query, sort: "sim", display: 5 },
    { query, sort: "date", display: 5 },
    { query: `${query} 아이와 함께`, sort: "sim", display: 4 }
  ];
  const settled = await Promise.all(plans.map((plan) => fetchBlogPlan(plan)));
  const deduped = new Map();
  let maxTotal = 0;

  settled.forEach((result) => {
    if (!result) return;
    if (Number.isFinite(result.total)) {
      maxTotal = Math.max(maxTotal, result.total);
    }
    result.reviews.forEach((review) => {
      const key = String(review.link || "").trim() || `${review.title}|${review.postDate}`;
      if (!key || deduped.has(key)) return;
      deduped.set(key, review);
    });
  });

  const merged = [...deduped.values()].slice(0, 6);
  return {
    total: Math.max(maxTotal, merged.length),
    reviews: merged
  };
}

async function fetchBlogPlan(plan) {
  const query = String(plan?.query || "").trim();
  if (!query) return null;

  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(plan?.display || 3));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", String(plan?.sort || "sim"));

  const response = await requestNaverApi(url);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    total: Number(data.total || 0),
    reviews: items.map(normalizeBlogItem).filter((item) => item.title || item.description)
  };
}

function normalizeBlogItem(item) {
  return {
    title: stripHtml(item?.title || "").trim(),
    description: stripHtml(item?.description || "").trim(),
    link: toHttpsUrl(item?.link || ""),
    bloggerName: stripHtml(item?.bloggername || "").trim(),
    postDate: String(item?.postdate || "")
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
