import { ABILITY_CARDS, type AbilityId } from "./abilityCatalog";

export const ABILITY_FRAME = "/assets/abilities/platinum-frame.webp";
export const abilityIconUrl = (ability: AbilityId) => `/assets/abilities/${ABILITY_CARDS[ability]}`;
const decodedImages = new Map<string, Promise<void>>();

export function decodeAbilityImage(src: string): Promise<void> {
  const cached = decodedImages.get(src);
  if (cached) return cached;
  const pending = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => { image.decode().then(resolve, reject); };
    image.onerror = () => reject(new Error(`Unable to load ability artwork: ${src}`));
    image.src = src;
  });
  decodedImages.set(src, pending);
  void pending.catch(() => { decodedImages.delete(src); });
  return pending;
}

/**
 * Warms only artwork that is on screen or about to be: the shared card frame and abilities that are already
 * revealed. Unrevealed abilities are never fetched, so a draft downloads the cards it shows and nothing else.
 */
export function preloadAbilityArtwork(revealed: readonly AbilityId[] = []): void {
  if (typeof Image === "undefined") return;
  for (const asset of [ABILITY_FRAME, ...revealed.map(abilityIconUrl)]) void decodeAbilityImage(asset).catch(() => {});
}
