import { FINAL_ARENA_IMAGE, FINAL_ARENA_MOBILE_IMAGE, FINAL_ARENA_MOBILE_MEDIA } from "./finalShowdownPresentation";

export function FinalArenaBackdrop() {
  return <picture><source media={FINAL_ARENA_MOBILE_MEDIA} srcSet={FINAL_ARENA_MOBILE_IMAGE} /><img src={FINAL_ARENA_IMAGE} alt="" /></picture>;
}
