import type { TranslationKey, TranslationParams } from "../i18n";

/** Current ICM ledger is retained for old snapshots; render its meaning in the viewer's locale. */
export function localizedIcmDetail(detail: string | undefined, translate: (key: TranslationKey, params?: TranslationParams) => string): string | null {
  if (!detail?.includes("ICM")) return null;
  const parts = /^공동 (\d+)위 · ([\d.]+)P ICM 분배 · ([\d.]+)BB → ([\d.]+)P$/.exec(detail);
  if (!parts) return detail;
  return translate("match.icmDetail", { place: parts[1]!, total: parts[2]!, stack: parts[3]!, share: parts[4]! });
}
