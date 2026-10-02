declare global {
  interface Window { porenaPlatform?: "web" | "crazygames" }
}

/** Read the boot-time decision; returning home never changes the platform. */
export function isCrazyGames(): boolean {
  return typeof window !== "undefined" && window.porenaPlatform === "crazygames";
}
