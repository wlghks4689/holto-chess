# PORENA 구현 보고서

## Existing Hold'em Reference

참조 저장소: `https://github.com/wlghks4689/holdem-game` (읽기 전용 조사)

- `src/holdem/cards.ts`: `Suit`, 숫자 Rank, 덱 생성, Fisher–Yates 셔플 구조를 수정 후 사용했습니다. PORENA의 카드 소유권 추적을 위해 안정적인 `card.id`를 추가했습니다.
- `src/holdem/pokerEval.ts`: 5장 족보 판정, 카테고리별 키커 배열, 휠 스트레이트, 조합 기반 BEST 5, 비교 규칙을 수정 후 사용했습니다. 7장 전용 API를 5~10장 후보로 일반화하고 결과에 `bestFive`와 `displayName`을 포함했습니다.
- `src/app/holdem/components/Card.tsx`: 이미지 대신 랭크/수트 기호로 카드를 그리는 렌더링 문법과 모바일 크기 원칙을 참고했습니다. PORENA 시각 체계에 맞춘 독립 컴포넌트로 새로 작성했습니다.
- `src/app/holdem/components/HoleCards.tsx`, `BoardDisplay.tsx`: BEST 5 포함 카드 glow, 미사용 카드 dim, 승자 focus 구조를 로직만 참고해 다인 쇼다운으로 확장했습니다.
- `src/app/holdem/showdownPresentation.ts`, `madeHandFxPresentation.ts`, `scripts/verify-showdown-presentation.ts`: 족보명과 결정적 쇼다운 표현, Made Hand 등급 분리를 참고했습니다.
- `src/holdem/gameReducer.ts`, 베팅/블라인드/팟/액션 타이머/AI/온라인 방 코드는 사용하지 않았습니다. Hold'em 상태와 강하게 결합되어 있고 PORENA 규칙 경계에 불필요하기 때문입니다.
- 별도 이미지·사운드 카드 자산은 원본에 존재하지 않았습니다. 원본 역시 CSS 카드 렌더링을 사용하므로 복사한 바이너리 자산은 없습니다.

## PORENA Original Implementation

- 52개 고유 엔트리의 `AVAILABLE / RESERVED_IN_SHOP / OWNED` 상태와 소유·예약 플레이어 역참조를 구현했습니다.
- 상점 생성 시 즉시 예약하고, 리롤·판매·탈락 시 반환하며 모든 변경 뒤 무결성을 검사합니다.
- BB 단일 경제, 라운드당 구매 2회, 보유 한도, 가격표, floor 판매가, 수입과 연승/연패 보정을 config로 분리했습니다.
- R1 Hold'em, R2 Run It Twice와 반복 Sudden Death, R3 정확한 Omaha 2+3, R4 10장 후보 BEST 5와 3-way, R5 보드 없는 4-way를 구현했습니다.
- 8→8→6→6→4→4 흐름과 R2/R4 승자·패자조를 일반 참가자 배열 기반으로 처리합니다.
- R2 후 초기 증강과 R4 후 상점 확장 포함 후기 증강을 데이터 기반으로 분리했습니다. 상점은 5칸으로 제한됩니다.
- 최종 점수는 `누적 승점 + config 족보 점수 + floor(BB/10)`으로 계산합니다.
- 보드 카드는 의도대로 소유 카드풀과 완전히 분리된 가상 덱에서 생성합니다.

## 안전한 판단과 임시 규칙

- 정확한 승점은 미확정이므로 `BALANCE.points`에 임시값을 두었습니다: R1 1, R2 1차 1, R2 승자조 2, R3 2, R4 1차 2, R4 승자조 1위 3.
- 족보 점수 역시 임시 config입니다: 0/2/4/7/10/12/16/22/30.
- 승리 BB는 각 실제 매치 승자에게 지급하며, 패자조 생존 승리에는 BB만 주고 추가 Point는 주지 않습니다. 연승·연패 상한은 기획 미확정이므로 제한하지 않고 config 계산식으로 격리했습니다.
- AI는 기획 범위의 완성형 AI가 아니라 구매 가능한 상점 카드 중 높은 Rank를 우선 구매하는 규칙 검증용 대리자입니다.
- 리롤은 기존 예약을 먼저 반환한 뒤 전체 AVAILABLE에서 다시 뽑으므로 우연히 같은 카드가 다시 등장할 수 있습니다. 이는 강제 제외 규칙이 기획에 없기 때문입니다.

## 구조적 위험

- 52장 제약으로 다수 플레이어가 상점 잠금과 고슬롯 증강을 동시에 가지면 가용 카드가 부족할 수 있습니다. 엔진은 중복 대신 빈 슬롯을 허용합니다.
- R2/R4의 정확한 split은 새 보드를 무제한 생성합니다. 이론상 반복 가능하지만 매번 새 보드 signature를 강제해 실제 종료 확률을 높였습니다.
- 로컬 프로토타입이라 비공개 정보는 UI에서 가리지만 서버 권한 경계는 없습니다. 온라인화 시 플레이어별 상태 sanitize가 필요합니다.

## Match-scoped Community Board 리팩터링

1. 기존 구조: `PorenaGameState.communityBoards`와 `engine.ts`의 `uniqueBoard`가 라운드 전체 보드를 만들고 중복까지 금지했습니다. Primary와 Secondary가 만든 보드도 전역 배열에 누적했습니다.
2. 상태 변경: 전역 `communityBoards`를 제거했습니다. 보드의 진실 공급원은 각 `MatchResult.boards`이며, 보드별 평가 결과와 승자는 `boardResults`, `boardWinnerIds`에 저장합니다.
3. Match별 생성: `showdownDeck.ts`의 `createShowdownDeck`이 encounter 참가자의 전체 OWNED 카드 ID를 Set으로 만든 뒤 완전한 52장 덱에서 제외하고 셔플합니다.
4. 제외 범위: 실제 선택 홀카드가 아니라 참가자의 `ownedCardIds` 전체를 제거합니다. RESERVED, AVAILABLE, 다른 매치 참가자의 OWNED 카드는 제거하지 않습니다.
5. R2 Run It Twice: 한 번 만든 encounter 덱의 앞 5장을 BOARD 1, 다음 5장을 BOARD 2로 분리합니다. 두 보드의 10장은 서로 중복되지 않습니다.
6. R2 Secondary: 승자조와 패자조의 각 Heads-Up마다 새로운 encounter 덱을 별도로 만듭니다. Primary 덱이나 보드를 재사용하지 않습니다.
7. R2 Sudden Death: 기존 Run It Twice 덱의 남은 카드를 사용하지 않습니다. 동점 참가자의 전체 OWNED를 제외한 새로운 52장 기반 덱과 보드를 매번 생성합니다.
8. R3 Omaha: 각 Heads-Up 참가자의 최대 8장 OWNED를 제외한 보드를 생성하며, 평가는 기존의 정확한 홀 2장＋보드 3장 조합을 유지합니다.
9. R4 Primary: 세 Heads-Up이 각자 새로운 덱과 Community Board를 생성합니다.
10. R4 Secondary: Winner 3-Way와 Loser 3-Way는 참가자 집합과 Showdown Deck, Board가 모두 별개입니다.
11. Cross-match: 전역 보드 중복 검사를 제거했습니다. 독립 셔플이므로 서로 다른 매치 보드에서 동일 cardId가 나올 수 있습니다.
12. 원장 분리: 보드 함수는 새 `Card[]`만 반환하며 `ownershipCardPool`을 읽거나 변경하지 않습니다. 엔진은 참가자 ID로 OWNED 카드 값을 복사해 전달합니다.
13. 테스트: 참가자 카드 제외, R2 보드 간 중복 금지, RESERVED와 외부 플레이어 OWNED의 후보 유지, 보드 전후 원장 불변, R1/R2/R3/R4 encounter 분리를 포함해 총 15개 테스트로 확장했습니다.
14. UI: `GLOBAL BOARD` 표현을 제거하고 각 Match 카드에 `COMMUNITY BOARD`, `BOARD 1`, `BOARD 2`, `SUDDEN DEATH n`을 표시합니다. 각 보드별 BEST 5 glow와 dim 데이터도 따로 보존합니다.
15. 추가 문제: 보드가 매치별로 바뀌면서 로컬 사용자의 조기 탈락 경로가 재현되었습니다. 탈락 후 증강 선택과 상점에서 막히지 않도록 관전 모드와 생존 AI 자동 진행을 추가했습니다. R5는 계속 Community Board를 생성하지 않습니다.
