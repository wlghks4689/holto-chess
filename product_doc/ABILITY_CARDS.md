# 어빌리티 카드

- 범위: 어빌리티 전용 선택 시퀀스와 서버 권한의 실제 게임 효과를 포함한다. 캐릭터 이름·초상은 사용하지 않는다.
- 서버 판정의 정본은 [ABILITY_RULES.md](ABILITY_RULES.md)다. 카드 문구는 표시용이며 게임 판정을 대체하지 않는다.
- 미리보기: 개발 서버에서 `/abilities-preview`를 연다.
- 공통 카드 비율은 2:3 세로형이며 PC·태블릿·모바일에서 유지한다. 카드를 누르면 `<dialog>`로 확대하고 Escape와 닫기 버튼을 지원한다.
- 확대한 카드를 다시 누르면(탭·클릭·Enter/Space) 뒷면으로 뒤집힌다. 뒷면은 같은 프레임에 판정 기준과 예외(`ability.card.<id>.details`)를 보여 준다. 앞면 설명은 짧게 두고, 스플릿·RUN별 판정·판매 후 재구매 같은 세부 사항은 뒷면에 적는다. 개발 서버 `/abilities-preview?sides=both`에서 12장의 앞·뒷면을 함께 검토한다.
- 문구는 HTML 텍스트로 렌더링하며 이미지 안에 글자를 굽지 않는다. 번역 키는 `ability.card.<id>.name/description`이다.
- 게임 시작 때 서버가 12장 중 중복 없이 8장을 순번 선택에 따라 배정한다. 선택 제한시간이 끝나면 서버가 남은 카드 중 하나를 골라 진행한다.

## 아이콘

런타임 에셋은 `holto-chess/public/assets/abilities/`, 원본은 `holto-chess/asset-source/abilities/`에 둔다. 런타임 파일은 원본에서 `node tools/perf/optimize-assets.mjs`로 만든다(아이콘 512px WebP, 프레임 960×1440 WebP, 가이드 썸네일 192px WebP). 원본을 바꾸면 스크립트를 다시 실행한다.

| 어빌리티 | 런타임 아이콘 | 원본 |
| --- | --- | --- |
| 왕가의 혈통 | `royal-blood.webp` | `royal-blood.png` |
| 타겟 스나이퍼 | `target-sniper.webp` | `target-sniper.png` |
| 언더독 | `underdog.webp` | `underdog.png` |
| 퍼스트 클래스 | `first-class.webp` | `first-class.png` |
| 황금의 손 | `golden-hand.webp` | `golden-hand.png` |
| 트레이더 | `trader.webp` | `trader.png` |
| 포식자 | `predator.webp` | `predator.png` |
| 건축가 | `architect.webp` | `architect.png` |
| 자본주의 | `capitalism.webp` | `capitalism.png` |
| 제로리스크 | `zero-risk.webp` | `zero-risk.png` |
| 쿼드 코어 | `quad-core.webp` | `quad-core.png` |
| 독주자 | `front-runner.webp` | `front-runner.png` |

프레임: `platinum-frame.webp` (원본 `platinum-frame-aligned.png`). 과거에 쓰던 `royal-blood.svg`, `architect.svg`, 정렬 전 `platinum-frame.png`는 런타임 참조가 없어 삭제했다.

아이콘은 카드 내부 원에 맞춰 크기와 중심을 보정했다. 어빌리티 드래프트는 프레임을 먼저 받고, 아이콘은 카드가 공개될 때 그 카드만 받는다. 공개되지 않은 어빌리티 아이콘은 받지 않는다. 카드 설명은 읽기 쉬운 고딕 계열 글꼴을 쓴다.

## 확인 기준

1440×900 및 390×844에서 한국어·영어 10종의 세로 비율, 아이콘 로딩, 프레임 안의 텍스트와 가로 넘침을 확인한다. 확대 창의 키보드 열기·닫기와 언어 전환도 확인한다. 실제 기기 검증은 별도다.
