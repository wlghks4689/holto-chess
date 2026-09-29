# One-Screen QA — 2026-09-29

## 1. 이전 높이 증가 원인

상점 카드 wrap, 순위 한 명의 여러 행, 공개 드래프트 4열, 큰 프로필/여백의 조합이 문서를 늘렸다. 이전 fixture에는 실제 내비/헤더/하단 조작 일부가 빠졌고 전체 매트릭스는 세로 합격 판정에 부적합했다.

## 2. 밀도 규칙

모바일 내비54px, 본문 여백8px, 정상 흐름 하단 조작48px 이상을 예산에 포함했다. 상점 한 줄 균등 슬롯, 순위 한 줄 표, 공개 카드8열, 어빌리티5열. dvh/clamp로 여백·폰트·카드·행 높이를 함께 줄인다. 상세 히스토리는 overlay로 분리했다. 페이지 overflow 은폐는 추가하지 않았다.

## 3. 카드 수별 실측

360×780 상점 보유 카드, CSS px. 충분한 폭에서는 상한을 유지하고 부족하면 슬롯 수에 따라 줄어든다.

| 수량 | 폭×높이 |
|---|---|
| 2/3/4장 | 70.2×99.34 |
| 5장 | 약62.88×88.97 |
| 7장 | 약44.06×62.34 |

## 4. 순위표

8명×6열 한 줄 표. 긴 닉네임 ellipsis/title, BB123456.75·점수98765 fixture 확인. 카드·전적·BB·점수 유지. 모바일 히스토리를 연 상태도 페이지780/780 유지.

## 5. Draft

포커 카드16장8열×2행에 가격/타이머/선택 순서 포함. 어빌리티0/1/4/7/8명 선택 및 순서 상태 검사. 상세 dialog는 닫기 하나만 존재하고 제목/X/전환 안내 없음. 실측 scrollHeight=clientHeight=544, 배경 문서780px.

## 6. 매칭/R4

상대 아이콘 누락은 viewer에게만 abilityId를 넘기던 UI 조건 때문이었다. 이미 공개된 각 seat의 abilityId를 동일 PrepAvatar로 표시하도록 수정했고 미배정 fallback은 유지한다.

360×780 실측:일반R1 양쪽154×189.28, R2 양쪽154×280.4, R4 heads-up 양쪽154×248.45. 각각 아이콘1개. R4 3-WAY 매칭은 세 박스 모두168×232.45, 아이콘 각1개. R4 매칭/쇼다운의 카드5장3+2와 BEST5 유지.

## 7. 문서 높이

서비스 컴포넌트 기반 개발 fixture, 두 viewport 각각66상태 검사.

| 화면 | 360×780 scrollHeight/clientHeight | 402×874 scrollHeight/clientHeight |
|---|---|---|
| 상점 R1~R5 최소/중간/최대 | 780/780 | 874/874 |
| 어빌리티 선택/공개/순서 | 780/780 | 874/874 |
| 공개 드래프트 R2/R4 | 780/780 | 874/874 |
| 매칭/쇼다운 R1~R5 | 780/780 | 874/874 |
| R4 heads-up/3-WAY | 780/780 | 874/874 |
| 8명 순위 R1~R5/최종 | 780/780 | 874/874 |
| 대진표/런 배치 | 780/780 | 874/874 |

## 8. 검사와 한계

- 기본/추가 모바일 각각66상태:정착 후 pageVerticalOverflow=false, 가로 초과·카드 겹침·필수 버튼 이탈0건.
- R5 등장 애니메이션 중 일시적 overlap 검출 후 종료 상태 재검사0건. 모든 중간 프레임 무겹침을 보증하지 않는다.
- UI 테스트31파일190개 통과. TypeScript, 변경 TS/TSX ESLint, Vite client/worker build 통과.
- 작업 전후 src/game,src/core,src/shared,worker 파일 SHA256 목록 일치. 게임 로직 변경 없음.
- PC1280×900 주요8상태:매칭 프로필 대칭/아이콘 및 쇼다운 정상. PC에는 세로 스크롤이 남음:상점1108px, 순위1076px, 공개드래프트970px, 어빌리티929px, 최종1213px. 모바일 압축을 PC 전체에 강제하지 않았다. PC 최종 하단 버튼은 스크롤 후 접근한다.
- 실제 iPhone Safari/주소창 변화/온라인 전체 경기 완주/동시 접속, 낮은 가로모드와 확대 글꼴은 이번 검증에 포함하지 않는다.

## 9. 수정 전후

전은 구 fixture, 후는 내비/하단 조작 포함 fixture. 픽셀 동일 조건이 아닌 정보 밀도 비교이며 합격은 DOM 실측 기준이다.

| 화면 | 전 | 후 |
|---|---|---|
| 상점 | [전](assets/one-screen/before-shop-r4-5.png) | [후](assets/one-screen/after-shop-r4-5.png) |
| 순위 | [전](assets/one-screen/before-results-r4.png) | [후](assets/one-screen/after-results-r4.png) |
| 공개 드래프트 | [전](assets/one-screen/before-draft-r4.png) | [후](assets/one-screen/after-draft-r4.png) |
| R4 쇼다운 | [전](assets/one-screen/before-showdown-r4-5.png) | [후](assets/one-screen/after-showdown-r4-5.png) |

[대칭 매칭](assets/one-screen/after-match-r4-headsup.png)

## 10. 남은 기본 화면 예외

검사한360×780 단일66상태 중 한 화면에 들어오지 않는 상태는 없다. 가능한 모든 실시간 조합을 완주한 결과는 아니다. PC 세로 스크롤과 실기기 미검증은 위에 명시했다.
