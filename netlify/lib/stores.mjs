import { getStore } from '@netlify/blobs';

// 저장소 이름은 한 번 정해지면 바꾸지 않습니다. (바꾸면 기존 사진·콘텐츠를 찾지 못합니다.)
//  - joil-content       : 홈페이지 콘텐츠 JSON (키: "content")
//  - joil-media         : 업로드한 사진·썸네일·작은 영상 (키: 미디어 UUID)
//  - joil-backups       : 콘텐츠를 저장할 때마다 바로 이전 상태 자동 백업
//  - joil-media-trash   : 삭제한 사진 원본 보관 (삭제 전에 복사)
//  - joil-auth          : 로그인 실패 횟수 (무차별 대입 방지)
// 운영(production) 이외의 배포(Deploy Preview, 브랜치 배포, 로컬 개발)는 "test-" 접두어가 붙은
// 별도 저장소를 사용하므로 테스트가 운영 데이터를 절대 건드리지 않습니다.
export const STORE_NAMES = ['content', 'media', 'backups', 'media-trash', 'auth'];

export function isProduction(context) {
  return context?.deploy?.context === 'production';
}

export function store(context, name) {
  if (!STORE_NAMES.includes(name)) throw new Error('unknown store ' + name);
  const prefix = isProduction(context) ? '' : 'test-';
  return getStore({ name: `${prefix}joil-${name}`, consistency: 'strong' });
}
