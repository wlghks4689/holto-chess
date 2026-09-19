/** Hold'em made-hand palette, without changing PORENA's hand evaluation. */
export function madeTone(name: string) {
  return ({ "스트레이트": "straight", "플러시": "flush", "풀하우스": "full-house", "포카드": "quads", "스트레이트 플러시": "straight-flush", "로열 스트레이트 플러시": "royal" } as Record<string, string>)[name] ?? "default";
}
