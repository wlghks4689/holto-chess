const sourceBase = 'https://github.com/wlghks4689/holto-chess/blob/56372585f3bc150f256fccf4aed27e6f11890a86/';
const rounds = [
  ['R1 · 8명', '상점에서 첫 두 장을 고릅니다.', '게임 내 재화 50BB로 시작합니다. 네 장이 놓인 상점에서 두 장을 사고, 필요하면 비용을 내고 상점을 새로고침합니다.', '내 카드 2장 + 보드 5장 중 가장 강한 5장', '지금 살 두 장과 상점 새로고침 여부'],
  ['R2 · 8명', '모은 세 장으로 두 번씩 겨룹니다.', '공개된 카드에서 한 장을 구매하는 드래프트로 세 번째 카드를 얻습니다. 같은 세 장을 두 보드에 사용하고, 상대를 바꿔 두 매치를 치릅니다.', '내 카드 3장 + 각 RUN의 보드 5장 중 가장 강한 5장', '기존 두 장에 더할 세 번째 카드'],
  ['R3 · 8 → 6명', '경매에서 네 번째 카드를 구합니다.', '16장 중 필요한 카드에 입찰합니다. 한 명당 최대 한 장을 낙찰받고, 낙찰받지 못하면 남은 카드를 기본가 두 배에 구매하는 순서로 이어집니다.', '내 카드 정확히 2장 + 보드 정확히 3장', '어떤 카드에 얼마까지 입찰할지'],
  ['R4 · 6 → 4명', '다섯 장을 모아 조별 승부에 들어갑니다.', '공개 드래프트와 상점을 거칩니다. 첫 경기 결과에 따라 승자조와 생존조로 나뉘며, 생존조에서는 한 명만 다음 라운드에 진출합니다.', '내 카드 5장 + 보드 5장 중 가장 강한 5장', '다섯 장의 구성과 다음 라운드에 남길 재화'],
  ['R5 · 4 → 3명', '여섯 장을 세 핸드로 나눕니다.', '승점 선두가 상대를 고릅니다. 여섯 장을 두 장씩 나누고, 각각 다른 보드에서 세 번 승부합니다.', '각 RUN의 내 카드 2장 + 보드 5장', '강한 카드를 어느 RUN에 배치할지'],
  ['R6 · 3인 결승', '결승에 낼 다섯 장을 확정합니다.', '보유한 5~7장에서 다섯 장이 출전합니다. 남긴 카드는 모두에게 공개됩니다. 누적 승점과 남은 BB도 최종 순위에 반영됩니다.', '출전 카드 5장 + 공통 보드 5장 중 가장 강한 5장', '기본 출전 조합을 그대로 쓸지, 다른 카드로 바꿀지'],
];
document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => {
  const data = rounds[Number(button.dataset.round)];
  ['round-kicker', 'round-title', 'round-description', 'round-rule', 'round-intent'].forEach((id, i) => { document.getElementById(id).textContent = data[i]; });
  document.querySelectorAll('[data-round]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
}));
const cases = [
  {
    label: '사례 01 · R2 규칙 개편', title: '모은 세 장을 함께 쓰도록<br>R2의 카드 사용법을 바꿨습니다.',
    intro: '초반에 모은 카드의 조합이 두 번째 라운드부터 쓰이게 하고 싶었습니다. 세 장 전체를 사용하는 개편안을 채택하고, 안내와 화면 표시 방식도 정했습니다.',
    ownership: '맡은 일: 개편안 채택, 안내·표시 방식과 적용 범위 결정',
    visual: '<figure class="case-visual"><img src="assets/r2-prep.png" alt="카드 세 장과 예상 승률을 표시한 R2 준비 화면" loading="lazy"><figcaption>R2 준비 화면 · 2026.10.15 개발용 테스트</figcaption></figure>',
    reasonTitle: '세 번째 카드가 앞선 두 장과 같이 쓰이도록',
    reason: '예를 들어 5♥·6♥를 모은 뒤 7♥를 샀다면 세 장의 연결이 승부에 반영돼야 한다고 봤습니다. 두 RUN 모두 같은 세 장 전체와 보드에서 가장 강한 다섯 장을 고르는 개편안을 승인했습니다.',
    decisions: [
      '승점과 카드 가격은 유지하고, 세 장을 사용하는 판정 방식으로 바꿨습니다.',
      '경기 전에는 카드 세 장과 예상 승률 하나를 보여주도록 선택했습니다. 규칙 설명은 안내 화면과 ? 도움말에서 확인하게 했습니다.',
      '접속 중인 플레이어가 모두 안내를 확인하면 바로 진행하도록 했습니다. 연결만 끊긴 사람은 제한 시간까지 기다리도록 정했습니다.',
      '이미 진행 중인 경기는 시작한 규칙으로 마치고, 새 게임부터 바뀐 규칙을 적용하도록 선택했습니다.',
    ],
    result: '구현 후 같은 시드로 기존·개편 규칙을 비교한 300게임 실험에서, 스트레이트를 노리는 봇 전략의 R2 평균 획득 승점은 3.60에서 4.03으로 올랐습니다. 카드 조합을 활용하는 전략에서 나타난 변화를 볼 수 있었습니다.',
    limit: '봇 전략을 비교한 결과입니다. 실제 이용자의 재미나 전략 선택이 어떻게 달라지는지는 플레이 테스트가 더 필요합니다.',
    details: '2026.10.14 기록. 정책별 480석, 비율 지표의 표준오차는 약 ±2%p로 보고됐습니다. 판정·카드 수·대진·안내 확인 조건을 테스트했으며, 신규 테스트에는 1,200개 무작위 대진 이력이 포함됩니다. 당시 온라인 2브라우저 검증은 인증 오류로 완료하지 못했습니다.',
    sources: [['당시 규칙 변경 기록', 'product_doc/DECISIONS.md#L598-L617'], ['판정·진행 테스트', 'holto-chess/src/game/r2BestThree.test.ts']],
  },
  {
    label: '사례 02 · 봇의 카드 구매', title: '봇이 카드를 다시 찾을 때와<br>지금 패를 유지할 때를 정했습니다.',
    intro: '상점 새로고침을 리롤이라고 부릅니다. 봇이 싼 조합이라는 이유로 리롤을 포기하지 않게 하고, 좋은 패가 있을 때는 유지하도록 조건을 정했습니다.',
    ownership: '맡은 일: 개선 요구사항 제안, 리롤 조건과 중단 기준 지정',
    visual: '<div class="bars" role="img" aria-label="당시 봇 4200석 비교에서 E등급 패 선택 비율이 12.0퍼센트에서 1.7퍼센트로 감소"><span class="small-label">평가표의 낮은 등급(E)을 고른 비율</span><div><span>변경 전 <b>12.0%</b></span><div class="track"><i style="width:100%"></i></div></div><div><span>변경 후 <b>1.7%</b></span><div class="track"><i class="after" style="width:14.17%"></i></div></div><span class="chart-note">초기 상태 600개 · 변경 전후 각각 봇 4,200석<br>2026.10.12 실험</span></div>',
    reasonTitle: '더 나은 카드를 찾되, 좋은 패까지 버리지는 않게',
    reason: 'R1 평가를 안정화하면서 10BB 미만 조합의 리롤 차단을 없애도록 요청했습니다. 좋은 카드 한 장을 잠그고 나머지를 다시 찾는 부분 리롤도 요청했습니다. 더 좋은 패를 찾을 기회를 주되, 이미 좋은 조합을 살 수 있을 때는 리롤을 강제하지 않도록 했습니다.',
    decisions: [
      '현재 구매와 추가 리롤의 기대값을 비교하도록 요청했습니다. 한 장 보존과 어빌리티별 추가 리롤도 판단에 포함했습니다.',
      '88·99처럼 8 이상의 포켓 페어(같은 랭크 두 장)를 살 수 있다면 리롤을 강제하지 않도록 했습니다.',
      '구매 가능 횟수를 모두 썼다면 리롤을 막도록 정했습니다. 더 이상 살 수 없는 상황에서 재화만 쓰지 않게 한 조건입니다.',
    ],
    result: '같은 초기 상태에서 비교한 결과, E등급 패를 고른 봇은 4,200석 중 503석에서 73석으로 줄었습니다. 대신 경기 전 평균 잔여 BB는 28.15에서 21.62로 감소했습니다. 더 나은 패를 얻는 데 재화를 더 쓴 결과도 함께 봐야 합니다.',
    limit: '패 평가표상의 선택 품질을 본 실험입니다. 실제 대전 승률과는 다른 지표이며, 이후 어빌리티 변경까지 반영한 결과는 아닙니다.',
    details: '2026.10.12 실험. 169개 시작 패의 사전 계산 표와 새 상점 표본을 사용한 구현입니다. 표·표본 수·보상 근사·계산 재사용은 AI 협업 과정에서 구체화됐습니다. 관련 테스트와 카드 소유 기록 확인이 수행됐으며, 당시 기존 공개 정보 테스트 실패 1건은 남아 있었습니다.',
    sources: [['요청한 행동 조건', 'product_doc/DECISIONS.md#L587-L596'], ['실험 결과와 한계', 'product_doc/qa/2026-10-12-r1-ai-improvement.md'], ['리롤 판단 코드', 'holto-chess/src/game/r1ShopStrategy.ts']],
  },
  {
    label: '사례 03 · 결승 카드 선택', title: '결승에 낼 다섯 장과<br>나머지 카드의 공개 방식을 정했습니다.',
    intro: '결승에서는 최대 일곱 장 중 다섯 장이 출전합니다. 기본 조합을 먼저 보여주고 교체 여부를 고르게 했으며, 출전하지 않는 카드의 공개 시점과 표시 위치도 정했습니다.',
    ownership: '맡은 일: 출전 규칙 제안, 선택 시간과 공개·표시 방식 지정',
    visual: '<figure class="case-visual"><img src="assets/r6-prep.png" alt="출전 다섯 장과 남은 카드를 표시한 3인 결승 준비 화면" loading="lazy"><figcaption>결승 준비 화면 · 남은 카드 0·1·2장 조건의 개발용 테스트</figcaption></figure>',
    reasonTitle: '기본 다섯 장을 놓고, 바꿀지만 고르게 했습니다.',
    reason: '보유 카드에서 가장 강한 다섯 장을 기본 출전 조합으로 놓도록 정했습니다. 플레이어는 10초 동안 다른 조합으로 바꿀 수 있고, 시간이 끝나면 놓인 카드로 출전합니다. 출전하지 않는 카드는 BURN으로 표시하고 준비 화면부터 모두에게 공개하도록 했습니다.',
    decisions: [
      '출전 다섯 장과 공통 보드 다섯 장 중 가장 강한 다섯 장으로 결승을 치르도록 정했습니다.',
      'BURN 카드는 각 플레이어의 손패 아래에 표시하도록 지정했습니다. 최종 순위표에도 출전 카드와 남은 카드를 함께 보여주도록 했습니다.',
      '순위표의 BURN 카드는 흐리게 표시해, 실제 출전한 다섯 장과 구분하도록 정했습니다.',
    ],
    result: '구현 후에는 남은 카드가 없을 때 예상 승률의 위치가 달라지는 문제가 확인됐습니다. 빈 카드 자리도 유지하도록 보완됐고, PC와 모바일에서 남은 카드가 0·1·2장인 경우의 배치가 점검됐습니다.',
    limit: '화면 배치는 개발용 테스트로 확인했습니다. 플레이어가 조합을 고르기 쉬워졌는지, 공개된 카드를 얼마나 활용하는지는 별도 플레이 테스트가 필요합니다.',
    details: '결승 명세는 2026.10.07 사용자 결정, 후속 화면 확인은 2026.10.16 기록입니다. 빈 슬롯과 그리드 정렬, 표시 승률 계산 위치 수정은 AI 구현 과정의 작업입니다. PC 1440×900·모바일 393×852로 확인했으며, 당시 보고된 운영 경기의 멈춤 현상이 이 화면 수정으로 해결됐다고 결론 내리지는 않았습니다.',
    sources: [['결승 규칙·화면 명세', 'product_doc/DECISIONS.md#L481-L482'], ['구현 후 화면 점검', 'product_doc/qa/2026-10-16-r6-prep.md']],
  },
];
function showCase(index) {
  const c = cases[index];
  document.getElementById('case-content').innerHTML = `<div class="case-top"><div><span class="small-label">${c.label}</span><h3>${c.title}</h3><p>${c.intro}</p><p class="ownership">${c.ownership}</p></div>${c.visual}</div><div class="case-story"><section><span class="small-label">바꾸려던 점</span><h4>${c.reasonTitle}</h4><p>${c.reason}</p></section><section><h4>정한 규칙과 조건</h4><ul>${c.decisions.map(text => `<li>${text}</li>`).join('')}</ul></section></div><section class="case-outcome"><h4>확인한 결과</h4><p>${c.result}</p><p class="case-limit">${c.limit}</p></section><details class="case-evidence"><summary>실험 조건과 개발 기록</summary><p>${c.details}</p><div class="case-sources">${c.sources.map(([label, path]) => `<a href="${sourceBase + path}" target="_blank" rel="noreferrer">${label} ↗</a>`).join('')}</div></details>`;
  document.querySelectorAll('[data-case]').forEach(item => { const active = Number(item.dataset.case) === index; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
}
document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => showCase(Number(button.dataset.case))));
document.getElementById('decision-link').href = sourceBase + 'product_doc/DECISIONS.md';
showCase(0);
