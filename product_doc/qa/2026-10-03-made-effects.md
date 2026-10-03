# 2026-10-03 메이드 연출·공개 플립

- 기준 main `abeb7b6`; 기존 미추적 `.wrangler-config/`, `varco-export/`, CrazyGames handoff 문서 보존.
- PC 내장 브라우저 `prefers-reduced-motion: reduce` 환경에서 상대 슬롯에 `can-flip`이 있지만 transition이 0s인 것을 실제 싱글 플레이로 확인. 어빌리티 전용 및 전역 reduced-motion CSS가 게임 내 모션 설정과 불일치했다. 기존 `useCinematicMotion`을 연결하고 활성화된 슬롯 회전에만 전역 예외를 적용. OS 설정·다른 모션은 변경하지 않음.
- 수정 후 실제 드래프트 상대 카드의 transition 0.6s, 회전 중 matrix3d(-0.405588, … -0.914056 …), 완료 후 180도 행렬을 확인. 이미지 프레임·아이콘 decode 완료 후 동시 공개하는 기존 로직 유지. 디바이스 성능 문제로 단정하지 않음.
- 트립스 `#fb923c`, 0.9초 단일 주황 펄스 추가. 스트레이트보다 낮은 불투명도·짧은 시간이며 스윕/궤도 장식 없음. 결과 리캡도 동일 팔레트 사용.
- 스트리트의 공개된 snapshot으로 족보명 strong에만 팔레트 적용. 프로필/카드 전체에 최종 족보 색상을 조기 적용하지 않음. 족보명 갱신의 기존 등장 애니메이션도 제거.
- R4 8-8-8-6-6→플랍 8 회귀 테스트: 프리플랍 보라, 플랍/턴/리버 빨강, 스트리트 카드 glow/전체 FX 없음, BEST5_GLOW에서 최종 FX 있음. 실제 평가기 트립스 샘플 및 게임 모션 설정 on/off 테스트 추가.
- 모바일 히스토리: 외부 90dvh 스크롤 패널 안의 45dvh 제한/스크롤을 제거하여 한 스크롤 영역에서 내용을 연속 표시.
- 브라우저 추가 확인: `/fx`에서 트립스 주황색과 0.9s 펄스 스타일 확인. 402×874 R1 결과 미리보기에서 히스토리 펼침 후 패널 top 43.69/bottom 830.28, 내부 max-height none/overflow visible 확인. 미리보기에는 짧은 히스토리만 있어 실제 긴 경기 기록의 터치 스크롤은 실기기 재검증 필요.
- 검증: unit 90파일 633개, Worker 5파일 33개 통과. lint 통과. build 명령 내 앱/Worker 타입 검사와 번들 생성 성공. Wrangler 로그 경로 EPERM 및 정적 분석 경고가 있었으나 Worker 테스트와 빌드는 종료 코드 0으로 완료.
- 커밋/push: `d5f07f8d2162ebcfec1727657da12eaae272eae6` (`main`, `origin/main`).
- 운영 Worker `porena` 버전 `3c33acf7-2781-4ba8-be07-9011a08f543e`, 100% 트래픽. `wrangler deploy --dry-run --keep-vars` 및 `wrangler deploy --keep-vars` 성공. 운영 `/`·`/api/health` HTTP 200, health `ok=true`.
- 미검증: 실제 iPhone Safari, 멀티플레이 전체 경기.
