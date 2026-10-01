# 독주자 구현 및 검증

## 승인과 파일

- 사용자 신규 어빌리티 명세(33427873 첨부), GPT 제작 아이콘 확정 및 원본 PNG 제공을 기준으로 구현.
- Ability ID: front-runner. 한국어 독주자 / 영어 Front Runner.
- 변경: game/abilities.ts, config.ts, abilityRewards.ts, engine.ts, types.ts, roundRanking.ts(신규), roundSummary.ts, frontRunner.test.ts(신규), quadCore.test.ts; ui/abilityCatalog.ts, AbilityCard.tsx, OnlineScoreboard.tsx, ResponsivePreview.tsx, AbilitySelectionPanel.test.ts; i18n/locales/ko-KR.ts, en-US.ts; public/assets/abilities/front-runner.png; TODO/DECISIONS/본 기록.
- 커밋·push·운영 배포 미실행. 이전 쿼드 코어 미커밋 변경 보존.

## 판정 및 정산

- R1: resolvePrimary의 3일차 Swiss 전체 처리 종료 후.
- R2(v2): resolveSplitRuns의 RUN1/RUN2 전체 처리 후. 이전 규칙(v1)은 resolveSecondary 완료 후.
- R3: resolvePrimary에서 assignSurvivalBoundary 완료 후. survival이 남으면 지급하지 않음. resolveSurvival에서 실제 탈락 확정·survival 삭제·ROUND_RESULT 진입 후 지급.
- R4: resolveSecondary의 Winner/Survival Group 전체 결과와 탈락 처리 후. Primary/배열 첫 자리에서는 지급하지 않음.
- R5: resolvePrimary의 Final placement → Quad Core → 기타 기존 ability/interest 이후 GAME_RESULT에서 finalMatch.results의 place===1을 그대로 사용. 이후 captureRewards 및 최종 점수 계산.
- 공통 rewardRoundLeader는 ROUND_RESULT/GAME_RESULT 완료 단계만 허용하고 survival 잔존 시 반환. 모든 지급 대상은 지급 전 먼저 확정.
- R1~R4 정렬은 기존 createRoundSummary의 누적 Point → BB → 안정적 좌석 순서를 compareRoundStanding으로 추출해 재사용. OnlineScoreboard도 같은 함수를 사용하며 기존 p1..p8 ID 보조 정렬 보존. 기존 순위 정책 변경 없음.
- R5는 누적 Point/Final Total이 아닌 placement. 공동 place1은 해당 독주자 보유자 각각 +7P. ICM/placement 값 자체를 변경하지 않음.
- FRONT_RUNNER_POINTS={1:3,2:4,3:5,4:6,5:7} 단일 설정.
- abilityLeaderRounds로 라운드별 판정 완료를 영속 기록. 미발동인 경우도 기록하여 재접속·재시도 후 순위 재평가 차단. abilityEvents reason=round-leader, totals에는 추가분만 기록.
- R1~R4 보상은 매치 중간 보상이 아니므로 별도 round event로 저장하고 roundSummary에서 합산. R5는 final match ledger에 포함하므로 이중 합산하지 않음.
- AI 전략, 자본주의 정산 함수/기존 호출 위치, 공용 카드 풀, 순위/탈락/기본 지급 수치는 변경하지 않음.

## 아이콘·UI

- 원본은 1254×1254 RGB PNG. 원본 다운로드 파일 보존.
- imagegen으로 바깥 검은 배경을 투명화한 RGBA 파생본 사용(alpha 0~255 확인). 승인된 숫자1/왕관/인물/붉은금빛 구성 보존을 요청하고 육안 검수. 생성형 편집이므로 원본 내부 픽셀의 완전 일치를 보장하는 처리 방식은 아님.
- 작업공간 output/imagegen/front-runner-approved-cutout.md에 원본·결과·프롬프트 기록.
- 별도 프레임/애니메이션 없음: 기존 AbilityArtwork, Promise.all(frame decode, icon decode), 공통 중심50%/30.8%, width54%/height36% 그대로.
- 12종, 8명 고유 선택, 미선택4. 서버 slotCount 유지. 모바일4×3 전부 실제 카드, PC6×2.
- 한영 전면 설명 및 상세 조건, 개발 fixture ability-front-runner.

## 검증 결과

- 신규 frontRunner.test.ts 17개: R1~R4 지급/BB 및 좌석 동률/탈락 제외/미발동 재판정 방지/매치·그룹·생존 대기 차단/실제 R1·R2 종료/R3 생존/R4 그룹/R5 공동1위·총점과 구분·ledger/자본주의 독립성/12번째 슬롯과 직렬화복원.
- 전체: 76파일/537테스트 통과(161.16초). R5에서 hand category를 다시 검사하지 않고 기존 place를 그대로 신뢰하도록 최종 가드 정리한 뒤 frontRunner+finalShowdown 26개 추가 통과.
- Worker 실제 Cloudflare 런타임: 13/13 통과(54.36초). 두 WebSocket R1~R5, reconnect, alarm, 저장/중복 처리 등.
- npm run build 통과: Wrangler 타입 생성, 클라이언트 tsc-b, Worker tsc, Vite client/Worker 산출물.
- 변경 파일 ESLint 통과. 전체 lint는 기존 OnlineApp.tsx:94 react-hooks/set-state-in-effect 1건 실패. 이전 작업부터 있던 판매 확인 UI 코드이며 미변경.
- 브라우저360×780/402×874/1280×900 페이지 scrollWidth/Height가 viewport와 일치.12버튼, 모바일4열/PC6열, 프레임과 아이콘 공통 visibility 확인.
- 360 모달 client/scrollHeight544/544, 상세조건243/243. 확대·닫기·상세펼침 확인. 캡처 output/imagegen/front-runner-implemented-mobile.png.

## 별도 발견: 기존 자본주의 정산 경로

- 현재 v2 R2 resolveSplitRuns에는 rewardAbilityInterest 호출이 없다.
- R3 resolveSurvival에서는 survival을 삭제하기 전에 rewardAbilityInterest를 호출하므로 그 함수의 survival guard로 지급이 생략된다.
- 독주자 때문에 생긴 변경이 아니며, 이번 명세의 기존 ability/정산 유지 지시에 따라 수정하지 않았다. 해당 경로의 자본주의 누락 여부를 별도 회귀 테스트와 함께 수정 검토할 필요가 있다.

## 후속 해결 — 2026-09-30

- 위 발견은 당시 사실로 보존한다. 사용자 승인 범위에서 R2 이자 호출 누락과 R3 생존 상태 해제 순서를 회귀 테스트로 재현한 뒤 수정했다. 방어 조건과 20% 규칙은 유지했다. [수정·검증 기록](2026-09-30-capitalism-interest.md).
- 독주자 자체는 이후 2026-09-29 배포에 포함되었음이 `holto-chess/OPERATIONS.md`의 4897398 / b45ebf2d-7ce4-4202-b395-c2f906a5226b 기록으로 확인된다. 이번 이자 수정의 배포와는 별개다. 전체 운영 효과 플레이는 미검증이다.
