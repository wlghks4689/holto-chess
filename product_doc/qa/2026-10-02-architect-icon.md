# 건축가 아이콘 검은 배경 제거 — 2026-10-02

- 원인: `AbilityVisibility.tsx`의 `AbilityBadge`는 `abilityIconUrl(architect)`로 공통 WebP를 사용한다. 기존 이미지 자체에 원형 장식 바깥 검은 사각형이 포함돼 있었다.
- 처리: 내장 image_gen 편집으로 외부만 투명화. 원형 장식과 내부 카드 성/푸른 배경을 유지하도록 요청했다. 생성형 편집이므로 내부 픽셀의 완전 동일성을 보장하지 않는다. CSS 및 게임 규칙 변경 없음.
- 저장: `holto-chess/asset-source/abilities/architect.png`, `holto-chess/public/assets/abilities/architect.webp`, `holto-chess/public/assets/abilities/guide/architect.webp`. 기존 최적화 스크립트와 같은 크기/압축 옵션으로 건축가 두 파생본만 생성했다. 기존 원본은 Git 이력으로 복구 가능하다.
- 검증: 원본과 512×512/192×192 WebP 모두 네 모서리 alpha=0~1/255, 중앙 alpha=253. 최종 512px 이미지 육안 확인. 통합 코드 전체 테스트 83파일/599개 및 타입 검사 통과. 브라우저 실제 플레이는 미검증.
- 생성 프롬프트: “Use case: background-extraction. Edit target: supplied architect game ability icon. Remove ONLY the black square background OUTSIDE the circular metallic ornamental frame, replacing that exterior with actual alpha transparency. Preserve the complete circular silver/gold frame including blue diamond tips, interior castle built from playing cards, interior dark blue background, blue light/glow, all colors and composition. Do not redesign, do not remove interior black areas, do not add elements or text. Keep square canvas, centered icon, full frame uncropped. This is a precise cutout for small game player profile icons.”
- 기존 미커밋 작업은 `b16b5ce`에 보존하고, 원격 최신 규칙과 `6cbd073`으로 통합하여 origin/main 푸시 및 재-pull 완료. 이 이미지 변경은 그 이후 별도 미커밋 상태이며 배포하지 않았다.
