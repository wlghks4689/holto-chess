import { ABILITY_CARDS } from "./abilityCatalog";

export const ABILITY_FRAME = "/assets/abilities/platinum-frame-aligned.png";
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

export function preloadAbilityArtwork(): void {
  if (typeof Image === "undefined") return;
  for (const asset of [ABILITY_FRAME, ...Object.values(ABILITY_CARDS).map(file => `/assets/abilities/${file}`)]) {
    void decodeAbilityImage(asset).catch(() => {});
  }
}
