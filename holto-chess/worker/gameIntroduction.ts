import { GAME_INTRO } from '../src/shared/gameIntroduction';
import { SEARCH_ORIGIN } from '../src/shared/searchPages';

/** A public, script-free page, identical for visitors and crawlers; no account or room state. */
export function gameIntroductionHtml(): string {
  const title = '포레나 게임 소개 | 포커 오토배틀·덱빌딩 전략 게임';
  const description = '포레나의 포커 오토배틀·덱빌딩 규칙을 소개합니다. 공용 덱에서 패를 설계하고 BB·어빌리티를 관리하는 6라운드 전략 포커 게임입니다.';
  return `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${description}">
<link rel="canonical" href="${SEARCH_ORIGIN}/about"><link rel="icon" href="/favicon-32.png">
<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${GAME_INTRO['ko-KR'].summary}"><meta property="og:url" content="${SEARCH_ORIGIN}/about"><meta property="og:site_name" content="포레나 PORENA">
<style>
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#07121e;color:#e7f3fa;font:16px/1.85 Arial,sans-serif;word-break:keep-all;overflow-wrap:anywhere}header,main,footer{width:min(880px,100%);margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #263e51}a{color:#a0eef0;text-underline-offset:4px}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700;letter-spacing:.08em}.brand img{width:36px;height:36px}h1{font-size:clamp(26px,5vw,38px);line-height:1.4;letter-spacing:-.025em}h2{font-size:22px;line-height:1.5;color:#b9f4f5;margin:0 0 12px}section{margin:32px 0;padding:24px;background:#0c2030;border:1px solid #294455;border-radius:12px}p{margin:12px 0}li{margin:8px 0}ul,ol{padding-left:24px}.lead{color:#bfdae5}.play{display:inline-block;padding:12px 22px;background:#89e8e8;color:#071c27;border-radius:8px;font-weight:700;text-decoration:none}footer{border-top:1px solid #263e51;display:flex;gap:18px;flex-wrap:wrap;font-size:14px}a:focus-visible{outline:2px solid #a0eef0;outline-offset:5px}@media(max-width:540px){header,main,footer{padding:18px}section{padding:18px;margin:24px 0}header>a:last-child{font-size:14px}}
</style></head><body>
<header><a class="brand" href="/"><img src="/favicon-192.webp" alt="">PORENA</a><a href="/">플레이 화면으로</a></header>
<main><h1>포레나 PORENA — 직접 패를 만드는 전략 포커</h1>
<p class="lead">${GAME_INTRO['ko-KR'].summary}</p>
<p>좋은 카드를 기다리는 대신 필요한 카드를 직접 모읍니다. 포커 족보를 바탕으로 어떤 패를 만들지, 지금 카드를 살지 자원을 남길지 판단하는 웹 전략 카드 게임입니다.</p>
<section><h2>포커 덱빌딩: 카드를 사고, 팔고, 고릅니다</h2>
<p>모든 플레이어가 한 벌의 52장 공용 덱을 함께 사용합니다. 다른 플레이어가 가진 카드는 내 상점에 나오지 않습니다. 상점과 공개 드래프트, 카드 경매에서 카드를 얻어 자신의 패를 구성합니다.</p>
<p>높은 카드만 모으는 것이 정답은 아닙니다. 페어를 완성할지, 스트레이트나 플러시를 연결할지, 다음 라운드까지 필요한 카드를 보존할지 생각해야 합니다. 카드를 팔고 상점을 새로 뽑는 선택도 패를 만드는 과정에 포함됩니다.</p></section>
<section><h2>포커 오토배틀: 배치한 패로 승부를 확인합니다</h2>
<p>준비 단계에서 카드를 모으고 배치를 확정하면 대결이 진행됩니다. 커뮤니티 카드가 플랍, 턴, 리버 순서로 열리고, 라운드별 규칙에 맞는 가장 강한 5장 조합으로 승패가 결정됩니다.</p>
<p>일반 홀덤처럼 매 스트리트마다 베팅 버튼을 누르는 방식이 아닙니다. 승부에 앞서 내 패와 자원을 설계하고, 쇼다운에서 그 선택의 결과를 확인하는 오토배틀 구조입니다.</p></section>
<section><h2>전략 포커: 지금의 강함과 다음 라운드를 함께 봅니다</h2>
<p>BB는 카드 구매와 상점 관리에 사용하는 게임 내 자원입니다. 좋은 패를 만드는 데 투자할 수도 있고, 후반 라운드를 위해 남길 수도 있습니다. 게임 시작 때 지급되는 어빌리티에 따라 카드 구매, 자원 관리, 노리는 족보의 방향이 달라집니다.</p>
<p>한 경기의 승패만으로 끝나지 않습니다. 라운드에서 쌓은 승점, 마지막 라운드의 족보, 남은 BB를 함께 보며 최종 순위를 겨룹니다.</p></section>
<section><h2>서로 다른 여섯 라운드</h2><ol>
<li><strong>TWO HAND</strong> — 내 카드 2장과 보드로 시작합니다.</li>
<li><strong>RUN IT TWICE</strong> — 중심 카드와 보조 카드를 배치해 두 RUN을 준비합니다.</li>
<li><strong>AUCTION · OMAHA</strong> — 경매로 카드를 얻고, 내 카드 2장과 보드 3장을 사용합니다.</li>
<li><strong>BEST FIVE</strong> — 내 카드와 보드 중 최적의 5장을 찾습니다.</li>
<li><strong>RUN IT THREE TIMES</strong> — 카드 6장을 세 핸드로 나누어 겨룹니다.</li>
<li><strong>THE LAST HAND</strong> — 마지막 출전 카드를 골라 최종 승부와 점수를 결정합니다.</li>
</ol><p>라운드를 거치며 플레이어가 탈락하고, 마지막까지 남은 플레이어가 최종 순위를 겨룹니다. 상세한 수치와 예외 규칙은 게임 시작 화면의 ‘게임 설명’에서 확인할 수 있습니다.</p></section>
<section><h2>웹에서 싱글 플레이와 멀티플레이</h2><p>PC와 모바일 브라우저에서 플레이할 수 있습니다. AI와 싱글 플레이로 흐름을 익히거나, 멀티플레이에서 다른 플레이어와 겨뤄 보세요. 처음이라면 시작 화면의 게임 설명에서 초보자 가이드부터 확인할 수 있습니다.</p><a class="play" href="/">포레나 플레이하기</a></section>
</main><footer><a href="/">홈으로</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></footer></body></html>`;
}
