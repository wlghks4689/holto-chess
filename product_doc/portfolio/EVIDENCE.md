# 조사 근거와 포트폴리오 주장

기준 SHA: 56372585f3bc150f256fccf4aed27e6f11890a86 / 2026-10-16.

| 주장·사례 | 확인한 소스 | 공개 시 표현 |
|---|---|---|
| 현행 6라운드·공유 52장·AI 빈 좌석 | README.md, product_doc/README.md, holto-chess/src/game/config.ts, engine.ts, cardPool.ts | 현재 저장소에서 확인된 프로토타입 규칙 |
| R2 개편 의도와 효과 | product_doc/DECISIONS.md R2-BEST3-001, src/game/r2BestThree.test.ts | 2026-10-14 의도·결정·당시 실험 기록 |
| R2 STRAIGHT 평균 승점 3.60→4.03 | DECISIONS.md의 동일 시드 300게임/정책당 480석 | 특정 정책의 시뮬레이션 값. 사람의 만족도·운영 승률 아님 |
| R1 E등급 선택 503→73/4,200 | product_doc/qa/2026-10-12-r1-ai-improvement.md, r1ShopStrategy.ts | 당시 600개 초기 상태 비교, 잔여 BB 28.15→21.62 동시 표기 |
| R6 BURN 0/1/2장 정보 배치 | product_doc/qa/2026-10-16-r6-prep.md 및 PC/모바일 QA 이미지 | 정적 fixture 검증. 운영 정지 원인 해결로 확대 금지 |
| 사용자와 AI의 역할 | product_doc/README.md, DECISIONS.md, 사용자 Codex·Claude 사용 확인 | 사용자 방향·규칙·밸런스 최종 승인, AI 구현·분석·검증 참여 |

이번 작업은 코드와 기록 대조 및 사이트 제작이다. 게임의 과거 시뮬레이션·전체 테스트를 다시 실행하지 않았다. 사이트 검증 결과는 별도 QA.md에 기록한다.

## 사용 에셋

- portfolio/assets/arena.webp ← holto-chess/public/assets/start/battlefield.webp (게임의 기존 배경 에셋)
- portfolio/assets/r2-prep.png ← product_doc/qa/assets/2026-10-15-r2-prep-desktop.png (개발 QA)
- portfolio/assets/r6-prep.png ← product_doc/qa/assets/2026-10-16-r6-prep-pc.png (정적 QA fixture)

개인 신상·연락처·이력·개인별 기여율은 소스에서 추정하지 않았다. 사이트는 공개 전 검토용이다.

## 본인 제안·결정 추적 — 2026-10-16 보완

사용자의 요청에 따라 DECISIONS의 명시적인 '사용자 지시·요청·선택·승인'을 찾아 사례에 반영했다. 아래 1인칭 문장은 그 기록을 읽기 쉽게 재작성한 요약이다. 원래 대화의 직접 인용이 아니다. 사용자 승인만 확인되는 항목을 최초 제안이나 개인 직접 구현으로 확대하지 않는다.

| 사례 | 기록 위치 | 확인되는 개인 기여 | 구현과 구분한 내용 |
|---|---|---|---|
| R2 빌드 연결 | DECISIONS.md:600-607 / R2-BEST3-001, 2026-10-14 | 세 장 전체 BEST FIVE 개편 승인. 자동 가이드 미노출·? 도움말 갱신, 카드 3장 한 줄·승률 하나, 연결만 끊긴 사람은 마감까지 대기, 진행 중 경기의 규칙 유지 선택 | 판정 코드·대진 알고리즘·테스트 작성·300게임 실험을 직접 수행했다고 쓰지 않음. 문서가 참조하는 R2_BEST_THREE_PROMPT.md 원본은 현재 저장소에서 찾지 못했으므로 최초 아이디어의 작성자는 확정하지 않음 |
| R1 봇 선택 | DECISIONS.md:587-596 / BOT-R1-001, QA 2026-10-12-r1-ai-improvement.md:승인 및 구현 범위 | 평가 안정화, 10BB 미만 차단 제거, 기대값 기반 추가 리롤, 좋은 카드 보존·부분 리롤, 능력별 보상 단계적 추가 요청. 88+ 리롤 비강제·구매 0회 리롤 금지 조건 명시 | 169개 표·표본 수·보상 근사·캐시를 본인 알고리즘으로 주장하지 않음 |
| R6 출전·공개 정보 | DECISIONS.md:481-482 / ROUND-FORMAT-001-p·q, 2026-10-07 | 공통 보드·기본 출전 5장·10초 교체 결정, BURN 준비 단계 공개, 손패 아래 배치·최종 순위표 표시 지정 | 빈 BURN 슬롯 유지·그리드 좌표 수정·Worker 이전은 2026-10-16 AI 구현·검증. 개인이 해당 CSS 수정안을 최초 제안했다고 쓰지 않음 |

개인 기획 의도는 명세에 명시된 목표 또는 결정 자체가 드러내는 범위에서만 작성했다. '사용자 반응이 좋아졌다', '기획자가 실험 수치를 보고 특정 규칙을 선택했다', '직접 실험을 실행했다'처럼 증거가 없는 원인·성과·행동은 추가하지 않았다.
