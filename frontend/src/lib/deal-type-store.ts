import type { DealType, RealEstateType } from "@/lib/types";

const KEY = "ddone.projectDealTypes.v1";

type StoreShape = Record<
  string,
  { dealType: DealType; realEstateType?: RealEstateType | null }
>;

function safeParse(json: string | null): StoreShape {
  if (!json) return {};
  try {
    const obj = JSON.parse(json) as unknown;
    if (!obj || typeof obj !== "object") return {};
    return obj as StoreShape;
  } catch {
    return {};
  }
}

export function setProjectDealType(
  projectId: string,
  dealType: DealType,
  realEstateType?: RealEstateType | null,
) {
  const current = safeParse(localStorage.getItem(KEY));
  current[projectId] = { dealType, realEstateType: realEstateType ?? null };
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function getProjectDealType(
  projectId: string,
): { dealType: DealType; realEstateType?: RealEstateType | null } | undefined {
  const current = safeParse(localStorage.getItem(KEY));
  return current[projectId];
}

