# 조일고등학교 스마트기술과 홈페이지

## 구조
- `public/` — 정적 홈페이지 (index.html, admin.html, assets/). 배포 폴더.
- `netlify/functions/` — 서버 함수: `auth`(관리자 로그인), `content`(콘텐츠 JSON), `media`(사진·썸네일 파일)
- `netlify/lib/` — 공통 코드 (저장소 이름, 세션, 콘텐츠 검증)
- `netlify.toml` — 배포 설정 (상대 경로만 사용)

## 데이터 저장 (Netlify Blobs)
| 저장소 | 내용 |
|---|---|
| `joil-content` (키 `content`) | 영상·앨범·사진 목록, 학과 소개 문구 |
| `joil-media` (키 = 사진 UUID) | 업로드한 사진 파일 |
| `joil-backups` | 저장할 때마다 직전 상태 자동 백업 (최근 300개) |
| `joil-media-trash` | 삭제한 사진 파일 보관 |
| `joil-auth` | 로그인 실패 횟수 |

운영(production) 배포만 위 저장소를 사용합니다. Deploy Preview·브랜치 배포·로컬 개발은 `test-` 접두어가 붙은 별도 저장소를 사용하므로 테스트가 운영 데이터를 건드리지 않습니다.

저장소가 비어 있으면 서버는 아무것도 만들지 않고 `{ "empty": true }`만 응답하며, 홈페이지는 `assets/initial.js`에 내장된 2026-11-06 스냅샷(영상 7개, 앨범 7개, 사진 204장)을 표시합니다. 관리자가 처음 저장할 때 그 스냅샷이 그대로 기록됩니다.

## 환경 변수
- `ADMIN_PASSWORD` — 관리자 비밀번호
- `ADMIN_SESSION_SECRET` — 로그인 쿠키 서명용 임의 문자열 (16자 이상)

## 로컬 테스트
```
npm install
netlify dev --port 8889
```
