# PORENA · 이미지 에셋 브리프

현재 적용된 에셋은 `public/assets/table/main-table.webp` 하나입니다. 아래 목록은 아직
없는 에셋이며, 전부 **없어도 게임은 정상 동작**하도록 CSS placeholder가 들어가 있습니다.

## 원칙

- 텍스트 · 버튼 · BB / Point / 가격 등 동적 UI는 **이미지로 만들지 않습니다**. React/CSS로 유지합니다.
- 이미지는 배경과 장식 레이어에만 사용합니다.
- 모든 파일은 `public/assets/<카테고리>/` 아래에 두고, 코드에서 `/assets/...` 절대경로로 참조합니다.
- 카드 앞면은 이미지로 만들지 않습니다. 랭크/수트 기호를 CSS로 그리는 현재 방식을 유지합니다.

## 필요한 에셋

| # | 파일명 | 권장 크기 | 투명 | 용도 |
|---|---|---|:--:|---|
| 1 | `assets/table/main-table.webp` | 1920×1080 | 아니오 | **적용 완료.** 게임 진행 중 배경 |
| 2 | `assets/table/final-table.webp` | 1920×1080 | 아니오 | R5 THE LAST HAND 전용 배경 |
| 3 | `assets/cards/card-back.webp` | 240×336 | 아니오 | 카드 뒷면 (시네마틱 공개 전) |
| 4 | `assets/frames/avatar-frame.webp` | 128×128 | 예 | 플레이어 칩 프로필 테두리 |
| 5 | `assets/frames/avatar-frame-winner.webp` | 128×128 | 예 | 매치 승자 강조 테두리 |
| 6 | `assets/fx/winner-glow.webp` | 512×512 | 예 | 승자 연출 글로우 오버레이 |
| 7 | `assets/augments/icon-<augmentId>.webp` | 96×96 | 예 | 증강 9종 아이콘 (아래 id 목록) |

증강 id: `suit_discount`, `reroll_discount`, `sell_bonus`, `win_bonus`, `pair_points`,
`shop_plus_one`, `shop_plus_two`, `rank_discount`, `r5_hand_bonus`

## 아트 디렉션

전체 톤은 현재 UI와 맞춥니다. 딥 그린/차콜 바탕(`#081710`~`#0a1d15`), 민트 액센트(`#6ee7a8`),
DM Mono 계열 타이포. 네온이 과하지 않은 차분한 하이엔드 포커룸 분위기입니다.

## 생성용 prompt

**2. final-table.webp**
> A dark luxurious poker table viewed from directly above, deep emerald felt with
> subtle charcoal vignette, faint gold rim light around the table edge, empty
> surface with no cards or chips, cinematic low-key lighting, photorealistic,
> centered composition with generous negative space in the middle, 16:9

**3. card-back.webp**
> Playing card back design, deep forest green with a subtle geometric chess-knight
> motif embossed in darker green, thin mint-green border inset, matte finish,
> flat straight-on view, no text, no numbers, 5:7 aspect ratio

**4. avatar-frame.webp**
> Circular UI frame ring for a player avatar, thin brushed metal in dark charcoal
> with a faint mint-green inner glow, transparent center and transparent
> background, game HUD asset, no text

**5. avatar-frame-winner.webp**
> Circular UI frame ring for a player avatar, polished gold with a warm inner
> glow and small radiating light flecks, transparent center and transparent
> background, victory state, game HUD asset, no text

**6. winner-glow.webp**
> Soft radial burst of mint-green and pale gold light on a fully transparent
> background, centered, fading smoothly to nothing at the edges, subtle particle
> motes, overlay effect asset, no text

**7. 증강 아이콘 (공통 틀)**
> Minimal flat game icon on a transparent background, single mint-green and pale
> gold accent on dark rounded-square plate, thick simple shapes, no text, no
> letters, centered, 96px UI icon. Subject: `<아래 표현>`

| augment id | subject 표현 |
|---|---|
| `suit_discount` | a spade symbol with a small price tag |
| `reroll_discount` | two circular arrows forming a refresh loop |
| `sell_bonus` | an open hand returning a coin |
| `win_bonus` | a laurel wreath around a coin |
| `pair_points` | two identical cards side by side |
| `shop_plus_one` | a shop shelf with one extra empty slot |
| `shop_plus_two` | a shop shelf with two extra empty slots |
| `rank_discount` | a low-number card with a downward price arrow |
| `r5_hand_bonus` | a fanned five-card hand with a star |

## 적용 방법

1. 파일을 `public/assets/...` 경로에 그대로 둡니다.
2. 배경류(1·2)는 `src/ui/styles.css`의 `.game-arena` 패턴을 따라 `background-image`로 붙입니다.
3. 프레임·아이콘류는 해당 컴포넌트에서 `<img>`가 아니라 CSS `background-image`로 붙여
   레이아웃이 에셋 유무에 영향받지 않게 합니다.
4. 에셋이 없을 때도 현재 CSS만으로 읽히는 상태가 유지되어야 합니다.
