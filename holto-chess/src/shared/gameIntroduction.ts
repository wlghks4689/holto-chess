// Public introduction copy; the home screen exposes only its link, not the descriptive paragraph.
export const GAME_INTRO = {
  'ko-KR': {
    summary: '포레나(PORENA)는 포커 덱빌딩과 오토배틀을 결합한 전략 포커 게임입니다. 카드를 직접 모아 패를 설계하고, 어빌리티와 BB를 관리하며 6라운드에서 겨룹니다.',
    link: '게임 소개',
  },
  'en-US': {
    summary: 'PORENA combines poker deck-building with autobattles. Build your own hands, manage abilities and BB, and compete across six rounds.',
    link: 'About the game',
  },
} as const;

export function initialHomeHtml(): string {
  return `<main style="max-width:640px;margin:10vh auto;padding:24px;font-family:Arial,sans-serif;line-height:1.8"><h1>포레나 PORENA</h1><p><a href="/about">${GAME_INTRO['ko-KR'].link}</a></p><noscript><p>게임 플레이에는 JavaScript가 필요합니다. 게임 소개는 JavaScript 없이도 읽을 수 있습니다.</p></noscript></main>`;
}
