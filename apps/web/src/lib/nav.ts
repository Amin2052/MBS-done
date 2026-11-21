/**
 * The navigation catalogue. Only screens that exist and pass tests appear here (spec 7):
 * a legacy module is not "implemented" because the desktop app had it. When a module
 * lands, it adds a route and an entry together.
 */
import type { MessageKey } from "./messages.ts";

export type NavIconName = "grid" | "building";

export interface NavItem {
  id: "dashboard" | "profile";
  path: string;
  labelKey: MessageKey;
  icon: NavIconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", path: "/", labelKey: "nav.dashboard", icon: "grid" },
  { id: "profile", path: "/profile", labelKey: "nav.profile", icon: "building" },
];
