# 모바일 UI 후속 6개 조정 — 2026-09-29

## 변경과 근거

1. R1 상점 보유 슬롯만 중앙 flex/2px gap. 싱글·온라인 page-shell에 data-round를 추가하여 범위를 제한했다. R2~R5의 동일 폭 grid는 유지한다. 360px 실측 카드 폭70.2px, 카드 사이2px.
2. 실제 플레이 탭의 R3 쇼다운은 콘텐츠587.1px, viewport852px인데 scrollHeight860px이었다. #root와 body의 시작 Y가8px이었다. 쇼다운 상단 margin8px이 일반 block root/body로 collapse되고 body min-height100vh(852px)에 더해져 발생했다. #root:has(>.cinema)에 display:flow-root를 적용한 뒤 root/body Y0, scrollHeight852/clientHeight852로 확인했다. overflow:hidden으로 페이지를 숨기지 않았다.
3. R2/R4 타이머를 DraftPrivateHand에서 r2-draft-heading으로 이동. 헤더 양쪽 공간은 타이머 유무에 관계없이 예약하고 실제 타이머만 absolute로 배치한다. 모바일38px 타이머와 title/help 겹침 없음. 360px 제목 X95.43~236.58, 도움말 X241.57~264.57, 타이머 X298.4~336.4. 내 보유 카드 중심X180 유지.
4. R2 스코어·보드·완료 RUN·보상·푸터 간격 축소. 모바일 완료 RUN 1 카드32→27px, desktop53→45px. 요약의 패배 카드 opacity.78/brightness.9/saturate.8. 전체 승패 판정과 진행 시간은 동일하다. RUN 1 결과, RUN 2 리버, RUN 2 완료에 보상/다음 진행 표시를 포함해 검사했다.
5. R3 플레이어 카드 rank/suit 크기를 기존 clamp에 각각1px 추가했다. 커뮤니티 카드 및 다른 라운드는 해당 선택자에 포함하지 않는다.
6. 매칭을 제목/가용 중앙 영역/푸터의 grid로 배치. 360×780 R1 프로필 top328.02, bottom517.30, 좌우154×189.28. R2 좌우154×280.4, R4 세 박스168×232.45와3+2 유지.

## 검증

| 범위 | 결과 |
|---|---|
| 360×780 영향16상태 | scrollHeight780/clientHeight780, 가로 초과/겹침/필수 버튼 이탈0 |
| 402×874 같은16상태 | scrollHeight874/clientHeight874, 가로 초과/겹침/필수 버튼 이탈0 |
| 실제 플레이 중 R3 | 860/852→852/852 |
| 1280×900 매칭 R1/R2 | 900/900, 양쪽 동일 규격/아이콘 |
| 1280×900 RUN 2 결과 | 900/900 |
| 관련 테스트 | R2DraftArena/cinematicRendering/ShowdownPrepPanel 56개 통과 |
| TypeScript/Vite | 통과 |

PC 상점 및 공개 드래프트의 기존 세로 스크롤은 유지된다. R5 등장 애니메이션의 batch-2 lift는 일시적 overlap을 보고하며 정착 검사를 별도로 한다. 실기기 Safari/온라인 전체 경기 완주는 미검증이다.

변경 파일 ESLint 검사 중 기존 OnlineApp.tsx:94의 useEffect 내 setPendingSale(null)이 react-hooks/set-state-in-effect 오류1건을 보고했다. 이번 OnlineApp 변경은 page-shell data-round 속성이다. 나머지 변경 TS/TSX 파일 ESLint는 통과했다.

## 검수 구조 보완

이전 쇼다운 fixture는 game-arena/page-shell 안에 있어 실제 root 직계 쇼다운의 margin collapse를 재현하지 못했다. 단일 쇼다운 fixture를 실제 구조로 변경하고 RUN 1 결과/RUN 2 리버 상태 및 보상/다음 진행 정보를 추가했다. 전체68개 상태 중 이번 작업은 영향16상태와 추가 R5 상태를 중심으로 검사했다.

## 이미지

- [R1 2px 카드 간격](assets/2026-09-29-followup/shop-r1-360.png)
- [상단 드래프트 타이머](assets/2026-09-29-followup/draft-timer-360.png)
- [RUN 2 완료](assets/2026-09-29-followup/run2-result-360.png)
- [중앙 매칭 프로필](assets/2026-09-29-followup/match-centered-360.png)
- [실제 플레이 R3](assets/2026-09-29-followup/actual-r3-360.png)
