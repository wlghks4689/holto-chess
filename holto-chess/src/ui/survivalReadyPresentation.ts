export function isSurvivalParticipant(playerIds: readonly string[], viewerId: string): boolean {
  return playerIds.includes(viewerId);
}

export function survivalReadyActionLabel(playerIds: readonly string[], viewerId: string): string {
  return isSurvivalParticipant(playerIds, viewerId) ? "타이브레이크 시작하기" : "관전하기";
}
