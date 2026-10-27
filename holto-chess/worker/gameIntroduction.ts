import { SEARCH_ORIGIN } from '../src/shared/searchPages';

/** Public HTML without application JavaScript, identical for visitors and crawlers; no account or room state. */
export function gameIntroductionHtml(): string {
  const title = '포레나 PORENA | 패를 만드는 포커 덱빌딩 오토배틀러';
  const description = '52장 공용 카드에서 싸울 패를 직접 만드는 포커 덱빌딩 오토배틀러, 포레나. BB를 어디에 쓸지 결정하고 서로 다른 여섯 라운드에서 상대와 겨룹니다.';
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'AboutPage', '@id': `${SEARCH_ORIGIN}/about#page`,
    url: `${SEARCH_ORIGIN}/about`, name: title, description, inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: '포레나 PORENA', url: `${SEARCH_ORIGIN}/` },
    mainEntity: {
      '@type': 'VideoGame', '@id': `${SEARCH_ORIGIN}/#game`, name: '포레나 PORENA',
      alternateName: ['포레나', 'PORENA'], url: `${SEARCH_ORIGIN}/`, description,
      genre: ['포커 덱빌딩', '전략 카드 게임', '오토 배틀러'], inLanguage: ['ko-KR', 'en-US'],
    },
  };
  return `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${description}">
<link rel="canonical" href="${SEARCH_ORIGIN}/about"><link rel="icon" href="/favicon-32.png">
<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${SEARCH_ORIGIN}/about"><meta property="og:site_name" content="포레나 PORENA"><meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">
<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#07121e;color:#e7f3fa;font:16px/1.85 Arial,sans-serif;word-break:keep-all;overflow-wrap:anywhere}header,main,footer{width:min(880px,100%);margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #263e51}a{color:#a0eef0;text-underline-offset:4px}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700;letter-spacing:.08em}.brand img{width:36px;height:36px}h1{font-size:clamp(26px,5vw,38px);line-height:1.4;letter-spacing:-.025em}h2{font-size:22px;line-height:1.5;color:#b9f4f5;margin:0 0 12px}section{margin:32px 0;padding:24px;background:#0c2030;border:1px solid #294455;border-radius:12px}p{margin:12px 0}li{margin:8px 0}ul,ol{padding-left:24px}.lead{color:#bfdae5}.play{display:inline-block;padding:12px 22px;background:#89e8e8;color:#071c27;border-radius:8px;font-weight:700;text-decoration:none}footer{border-top:1px solid #263e51;display:flex;gap:18px;flex-wrap:wrap;font-size:14px}a:focus-visible{outline:2px solid #a0eef0;outline-offset:5px}@media(max-width:540px){header,main,footer{padding:18px}section{padding:18px;margin:24px 0}header>a:last-child{font-size:14px}}
section{margin:48px 0;padding:32px 0 0;background:none;border:0;border-top:1px solid #294455;border-radius:0}h1{font-size:clamp(27px,5vw,42px);line-height:1.45;letter-spacing:-.035em;margin:12px 0 24px}h2{font-size:24px;color:#d5f6f7;margin-bottom:16px}h3{font-size:18px;margin:24px 0 8px}.lead{font-size:19px;color:#d2e5ed}.eyebrow{font-size:13px;letter-spacing:.04em;color:#8fe2e5}.muted{color:#b4cbd5;font-size:14px}.jump-links{display:flex;flex-wrap:wrap;gap:10px 22px;margin:28px 0}.decision{margin:28px 0;padding:24px;border:1px solid #345567;border-radius:12px;background:#0c2030}.decision figcaption{font-size:14px;color:#b4cbd5}.cards{display:flex;gap:12px;margin:18px 0}.card{display:inline-flex;flex-direction:column;justify-content:center;align-items:center;width:64px;height:88px;background:#f3f1e9;color:#b82d3b;border-radius:7px;font:bold 25px/1.2 Arial,sans-serif}.decision strong{color:#d5f6f7}@media(max-width:540px){section{padding:24px 0 0;margin:36px 0}h2{font-size:22px}.decision{padding:18px}.lead{font-size:18px}}
</style></head><body>
<header><a class="brand" href="/"><img src="/favicon-192.webp" alt="">PORENA</a><a href="/">플레이 화면으로</a></header>
<main>
<p class="eyebrow">포커 덱빌딩 · 오토 배틀러</p>
<h1>포레나, 싸울 패부터 직접 만드는 포커.</h1>
<p class="lead">포커를 하다 보면 이런 생각이 듭니다. 딱 한 장만 바꿀 수 있다면, 이 패를 다음 판까지 가져갈 수 있다면.</p>
<p>포레나(PORENA)는 그 선택을 게임의 중심에 놓았습니다. 시작 패를 무작위로 받는 대신 카드를 직접 사고, 남기고, 팔면서 여섯 라운드 동안 쓸 패를 만들어 갑니다. 패를 준비하면 승부는 자동으로 진행됩니다.</p>
<p>다만 원하는 카드를 혼자 고르는 게임은 아닙니다. 나를 포함한 여덟 자리가 같은 52장을 나눠 씁니다. 내게 필요한 한 장이 이미 상대 손에 있을 수도 있습니다.</p>
<p><a class="play" href="/">포레나 플레이하기</a></p>
<nav class="jump-links" aria-label="게임 소개 목차"><a href="#shared-deck">52장을 함께 쓰는 이유</a><a href="#choices">한 장을 고르는 고민</a><a href="#pokerlike">발라트로와 다른 점</a><a href="#start">처음 시작한다면</a></nav>
<section id="shared-deck"><h2>같은 하트 한 장을 두 사람이 가질 수는 없습니다.</h2>
<p>상점에서 카드를 사고, 공개 드래프트에서 먼저 가져갈 카드를 고르고, 경매에서 필요한 한 장의 값을 정합니다. 누군가 카드를 가지고 있는 동안에는 그 카드가 다른 플레이어의 상점이나 드래프트, 경매에 나오지 않습니다.</p>
<p>플러시를 노리는데 같은 무늬가 좀처럼 보이지 않는다면, 다른 플레이어도 그 무늬를 모으고 있을 수 있습니다. 끝까지 찾을지, 지금 가진 카드로 다른 족보를 만들지 판단해야 합니다. 포레나의 덱빌딩은 내 패만 보는 일이 아닙니다.</p></section>
<section id="choices"><h2>좋은 카드보다, 지금 내게 필요한 카드.</h2>
<figure class="decision"><figcaption>이런 패를 가지고 있다면</figcaption><div class="cards" aria-label="하트 9와 하트 10"><span class="card">9<span aria-hidden="true">♥</span></span><span class="card">10<span aria-hidden="true">♥</span></span></div>
<p>같은 무늬를 더 모아 플러시를 기다릴까요? 다른 무늬의 9를 가져와 페어를 만들까요?</p><p><strong>카드 한 장을 고르는 일이, 다음 라운드의 계획을 고르는 일이 됩니다.</strong></p></figure>
<p>BB는 카드를 사고 상점을 새로 뽑는 데 쓰는 게임 속 자원입니다. 비싼 카드를 산 만큼 다른 선택에 쓸 BB는 줄어듭니다. 지금 패를 보강할지, 이후에 필요한 카드가 나올 때를 위해 남길지도 고민하게 됩니다.</p>
<p>게임을 시작할 때 받는 어빌리티 하나도 이 판단에 영향을 줍니다. 카드 구매나 자원 관리, 노리는 족보에 따라 같은 카드의 가치가 달라집니다. 높은 숫자만 모으는 방식으로는 매번 같은 답을 얻기 어렵습니다.</p></section>
<section id="autobattler"><h2>고르는 건 직접, 승부는 오토배틀로.</h2>
<p>포레나는 포커 족보로 겨루지만, 일반 홀덤처럼 매 스트리트마다 베팅하거나 블러프를 선언하는 게임은 아닙니다. 준비 단계에서 카드를 확보하고 라운드 규칙에 맞춰 출전할 패를 정하면, 보드가 열리면서 결과가 나옵니다.</p>
<p>내 선택이 옳았는지는 플랍, 턴, 리버가 열릴 때 드러납니다. 강한 패로 앞서다가 마지막 한 장에 역전당할 수도 있습니다. 확률을 없애는 대신, 그 확률에 어떤 패로 들어갈지를 직접 정하는 전략 포커입니다.</p>
<h3>서로 다른 여섯 라운드</h3><ol>
<li><strong>R1 · HOLD'EM SWISS</strong> — 직접 산 카드 2장으로 시작합니다. 내 카드와 보드에서 가장 좋은 5장으로 겨룹니다.</li>
<li><strong>R2 · RUN IT TWICE</strong> — 드래프트로 모은 카드 3장 전체를 두 RUN에서 사용합니다. 각 RUN은 내 카드 3장과 새 보드 5장 중 BEST 5로 승부합니다.</li>
<li><strong>R3 · AUCTION · OMAHA</strong> — 경매로 카드를 얻습니다. 4장을 가지고 있어도 내 카드 정확히 2장과 보드 정확히 3장을 써야 합니다.</li>
<li><strong>R4 · BEST FIVE OF TEN</strong> — 내 카드 5장과 보드 5장 중 최적의 조합을 찾습니다. 승자조와 생존조로 나뉩니다.</li>
<li><strong>R5 · RUN IT THREE TIMES</strong> — 카드 6장을 2장씩 나눠 세 번 겨룹니다. 어느 RUN에 강한 패를 둘지 배치가 중요해집니다.</li>
<li><strong>R6 · THE LAST HAND</strong> — 남은 3명이 결승을 치릅니다. 보유한 5~7장 중 출전할 5장을 정하고 보드와 함께 마지막 족보를 완성합니다.</li>
</ol><p>한 경기의 승리로 끝나지 않습니다. 라운드에서 모은 승점, 결승의 족보 점수, 남긴 BB가 최종 순위에 함께 반영됩니다. 당장의 강함과 끝까지 남길 자원 사이에서 계속 선택해야 합니다.</p></section>
<section id="pokerlike"><h2>발라트로 같은 게임을 찾고 있다면</h2>
<p>발라트로(Balatro)에서 포커 족보로 조합을 만들고, 카드를 고르며 계획을 바꾸는 재미를 좋아했다면 포레나의 출발점도 익숙할 수 있습니다. 포커를 다른 장르의 규칙으로 즐기는 포커라이크라는 점에서 만납니다.</p>
<p>다만 목표는 다릅니다. <a href="https://www.playbalatro.com/ko/faq/">발라트로는 포커 핸드와 조커의 조합으로 점수를 높이는 덱빌딩 게임</a>입니다. 포레나는 여러 플레이어가 한 덱을 공유하며 카드를 확보하고, 준비한 패로 상대와 자동 대결하는 쪽에 무게를 뒀습니다.</p>
<p>혼자 점수 조합을 키우는 게임을 그대로 기대하기보다는, 상대가 가져간 카드와 다음 라운드의 규칙까지 생각하는 포커 덱빌딩 오토배틀러를 떠올려 주세요.</p><p class="muted">포레나와 Balatro는 서로 별개의 게임입니다.</p></section>
<section id="start"><h2>포커를 잘 몰라도 시작할 수 있나요?</h2>
<p>처음부터 족보와 여섯 라운드를 모두 외울 필요는 없습니다. AI와 싱글 플레이로 카드 구매와 대결 흐름부터 익힐 수 있습니다. 친구와는 멀티플레이 방에서 함께 겨룰 수 있고, 빈자리는 AI가 채웁니다.</p>
<p>자세한 규칙이 궁금하면 시작 화면의 ‘게임 설명’에서 초보자 가이드와 규칙서를 읽어 주세요. PC와 모바일 브라우저에서 플레이할 수 있습니다.</p>
<p class="muted">BB와 승점은 게임 안에서만 사용하는 값입니다. 실제 돈을 걸거나 환전하는 기능은 없습니다.</p><p><a class="play" href="/">게임 시작 화면 열기</a></p></section>
</main><footer><a href="/">홈으로</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></footer></body></html>`;
}
