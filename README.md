# 키즈 나들이 코스 추천 (MVP)

12개월~6세 아이를 키우는 가족을 위한 지도 기반 나들이 코스 추천 프로토타입입니다.

## 주요 기능

- 상단 지도 + 하단 추천 코스 리스트 UI
- 주변 반경(km), 사용 가능 시간(분), 출발 지점 설정
- 거리/시간을 함께 고려해 여러 코스를 추천
- 연령대(12개월~6세)에 맞는 장소 필터링
- 네이버 지역 검색 API 프록시 연동 시 근처 가게·공원·유적지·박물관·미술관·공연장 코스 추천
- 우측 지도 패널에서 상가 사진/별점(리뷰 기반 추정)/리뷰 링크 표시

## 실행 방법

1. `index.html` 하단 스크립트에서 `window.NAVER_MAP_KEY_ID` 값을 본인 Key ID로 바꿉니다.
2. 기본 모드(정적 샘플 장소)로는 `index.html`을 브라우저에서 열면 바로 실행됩니다.

## 근처 상가/가게 검색 연동

네이버 지도 JS API는 지도 렌더링용이며, 실제 상가 검색은 `네이버 검색 API(지역)`를 별도로 호출해야 합니다.

### Render로 바로 연결(권장)

1. 아래 링크로 Render 배포를 실행합니다.  
   [Deploy on Render](https://render.com/deploy?repo=https://github.com/thoughtt1/kidson)
2. 환경 변수 두 개를 입력합니다.
   - `NAVER_SEARCH_CLIENT_ID`
   - `NAVER_SEARCH_CLIENT_SECRET`
3. 배포 완료 후 프록시 URL 확인:
   - `https://thoughtt1-kidson-proxy.onrender.com/api/nearby-places`
4. 현재 `index.html` 기본값이 위 URL로 연결되어 있어, 배포 완료 후 바로 `코스 검색`이 동작합니다.
5. Render에서 서비스명이 달라졌다면 `index.html`의 `window.NAVER_LOCAL_PROXY_URL`만 해당 URL로 수정합니다.

### AI 장소 분류 엔진(선택)

장소 품질을 더 높이고 싶다면 프록시에 AI 분류를 켤 수 있습니다.

1. Render 환경 변수 추가
   - `AI_CLASSIFIER_ENABLED=1`
   - `OPENAI_API_KEY=...`
   - `OPENAI_MODEL=gpt-4o-mini` (원하는 모델로 변경 가능)
   - 선택값:
     - `AI_CLASSIFIER_MIN_CONFIDENCE=0.55`
     - `AI_CLASSIFIER_MAX_ITEMS=20`
     - `AI_CLASSIFIER_TIMEOUT_MS=12000`
2. 저장 후 재배포하면, 프록시가 후보 장소를 AI로 한 번 더 분류해
   - 사진/포토 계열,
   - 아동 비적합 장소,
   - 근거 없는 정원/가든
   등을 추가로 걸러냅니다.

### 로컬 프록시 실행(대안)

1. 네이버 검색 API(지역)용 `Client ID`, `Client Secret`을 발급합니다.
2. 서버 프록시를 실행합니다.
3. `index.html`의 `window.NAVER_LOCAL_PROXY_URL` 값을 `http://localhost:8787/api/nearby-places`로 바꿉니다.

예시(로컬 실행):

```bash
NAVER_SEARCH_CLIENT_ID=발급받은_ID \
NAVER_SEARCH_CLIENT_SECRET=발급받은_SECRET \
AI_CLASSIFIER_ENABLED=1 \
OPENAI_API_KEY=발급받은_KEY \
OPENAI_MODEL=gpt-4o-mini \
node nearby-proxy.mjs
```

프록시 엔드포인트(공통):

- `GET /api/nearby-places?lat=37.57&lng=126.97&radiusKm=3&queries=키즈카페,놀이터`
- `withDetails=1`일 때 이미지/블로그 리뷰를 합쳐서 상세 정보를 반환합니다.

## 참고

- 지도는 네이버 지도 JavaScript API(v3)를 사용합니다.
- `ncp_iam_...` 형태의 IAM Access Key는 브라우저 코드에 넣지 마세요.
- `Client Secret`은 비밀번호와 같으므로 프론트엔드 코드에 넣으면 안 됩니다.
- 별점은 블로그 리뷰 수 기반의 추정값이며, 공식 플레이스 평점과 다를 수 있습니다.
- 서비스 URL(도메인) 등록이 되지 않으면 지도 타일이 표시되지 않습니다.
- 추천 로직은 MVP용 그리디(heuristic) 방식입니다.
- 운영 서비스에서는 장소 데이터/타일 정책을 검토해 상용 플랜으로 확장하세요.
