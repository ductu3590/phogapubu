// Nhãn món (PA-4): chủ quán gắn ở admin (menu_items.badge). Giá trị lạ → không hiện, không vỡ.
export type MenuBadgeKey = "best_seller" | "signature";

export function menuBadge(v: unknown): { key: MenuBadgeKey; label: string } | null {
  if (v === "best_seller") return { key: v, label: "Best seller" };
  if (v === "signature") return { key: v, label: "Món của quán" };
  return null;
}
