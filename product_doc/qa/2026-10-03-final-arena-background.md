# R5 배경 역할 분리 (2026-10-03)

- 사용자 승인: R5 매칭 로딩은 일반 매칭 배경, 파이널 쇼다운만 final 아레나 전용 배경. 파이널에 두 배경을 겹치지 않는다.
- 매칭 로딩의 FinalArenaBackdrop 제거. 카드 뒷면 28장 및 프로필 배치는 유지.
- 파이널 쇼다운의 기존 FinalArenaBackdrop을 viewport 전체 fixed 배경으로 사용한다. main.game-arena의 일반 배경 이미지를 비활성화하고 cinema-final의 장식 배경을 transparent로 바꿨다. 아레나 카메라/명암 효과 및 카드 연출은 유지.
- 관련 준비/쇼다운/최종 연출 회귀 4파일 64테스트 통과. R5 준비 테스트는 final 이미지와 배경 노드가 없고 카드 정보가 공개되지 않는지 확인한다.
- 전체 lint 및 앱 타입 검사(tsc -b), diff 공백 검사 통과.
- 내장 브라우저 PC 및 402×874 확인: 매칭 final 배경 노드 0, 일반 match-arena 사용. 쇼다운 final 배경 하나가 viewport 전체를 덮으며 모바일 전용 이미지 선택 확인. PC/모바일 증거: assets/2026-10-03-final-arena-only-pc.jpg, assets/2026-10-03-final-arena-only-mobile.jpg.
- 빌드·전체/Worker 전용 테스트·실기기 실경기 재검증은 미실시. 커밋·푸시·배포 미실행.
