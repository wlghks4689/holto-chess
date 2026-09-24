# BAL-001 Codex 복구 인계 메모

상태: Codex 복구·검증 완료(밸런스 분석 미실행)

## 기준과 커밋

- 개발 기준: `main` / `3abd388ba115d8dde36e979f345985a3ca30cd3c`
- 복구 브랜치: `codex/balance-tool-repair`
- 복구 커밋: `cbcda77`
- 측정 집계 보강 커밋: `0416d19`
- BB 보상 원인 계측 커밋: `ad3e079`
- 원격: `origin/codex/balance-tool-repair`

모든 복구 커밋은 기준 커밋에서 분기한 독립 worktree에서 작성했다. `main`의 다른 UI/tutorial 미커밋 변경은 포함하지 않았다.

## 검증 증거

작업 디렉터리: `<worktree>/holto-chess`

```powershell
npm exec vitest -- run --config tools/balance-simulator/vitest.config.ts
node tools/balance-simulator/run.mjs --games 10 --seed 12345 --rerolls 0 --output <output>
```

- simulator tests: 6/6 통과
- 10게임 smoke: 10/10 완료, 실패 0
- R1 8명 → R2 8명 → R3 6명 → R4 4명 → R5 4명 확인
- BB 보상 원인별 JSON/Markdown 계측 확인

## 범위와 제한

- 게임 규칙과 실제 밸런스 수치는 변경하지 않았다.
- 측정은 휴리스틱 정책 기반이며 인간 메타의 대체가 아니다.
- 현재 시뮬레이터는 기본 8인 시작만 지원한다. 4·6인 비교는 미완료다.
- 후보 수치 주입과 현행/후보 비교 실행은 아직 추가하지 않았다.
- `other` BB는 일부 R2/R3/R4 특수 보상을 포함하므로 최종 경제 분석 전에 세분화가 필요하다.

## Claude 인계 상태

이번 단계에서 Claude가 수행할 분석 작업은 없다. `balance/BAL-001`의 기존 보고서는 과거 복구 전 상태를 설명하는 자료로만 보존한다. Codex가 필요하다고 판단하고 사용자가 별도 요청할 때만 새 분석을 시작한다.

## 다음 Codex 작업

1. 4·6·8인 실행 경로 지원 여부를 코드 근거로 확정
2. 후보 설정 주입 및 동일 seed 비교 기능 추가
3. R2/R3/R4 BB 보상 원인 세분화
4. 충분한 표본의 baseline 실행 후, 분석 필요 여부를 사용자에게 보고

이 메모 자체는 밸런스 수치 승인이나 게임 규칙 확정 문서가 아니다.
