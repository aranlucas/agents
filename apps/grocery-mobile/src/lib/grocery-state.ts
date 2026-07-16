import type { CartItem, GroceryState, PantryItem, ProductMatch } from "@agents/types";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function toDisplayMessage(message: unknown, index: number): DisplayMessage | null {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  if (record.role !== "user" && record.role !== "assistant") return null;
  const content = textFromContent(record.content);
  if (!content) return null;
  return {
    id: typeof record.id === "string" ? record.id : `${record.role}-${index}`,
    role: record.role,
    content,
  };
}

export function toDisplayMessages(messages: readonly unknown[]): DisplayMessage[] {
  return messages
    .map(toDisplayMessage)
    .filter((message): message is DisplayMessage => message !== null);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CartItem => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return typeof record.name === "string" && typeof record.quantity === "number";
  });
}

function pantryItems(value: unknown): PantryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PantryItem => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return typeof record.name === "string" && typeof record.quantity === "string";
  });
}

function productMatches(value: unknown): ProductMatch[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ProductMatch => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.query === "string" &&
      typeof record.name === "string" &&
      typeof record.upc === "string" &&
      (record.image_url === undefined ||
        (typeof record.image_url === "string" &&
          /^https:\/\/([a-z0-9-]+\.)*kroger\.com(?:[:/]|$)/iu.test(record.image_url))) &&
      (record.price === undefined || typeof record.price === "number") &&
      (record.size === undefined || typeof record.size === "string")
    );
  });
}

export function normalizeGroceryState(value: unknown): GroceryState {
  const state = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = state.status;
  return {
    shopping_list: stringArray(state.shopping_list),
    product_matches: productMatches(state.product_matches),
    cart: cartItems(state.cart),
    pantry: pantryItems(state.pantry),
    meal_plan: typeof state.meal_plan === "string" ? state.meal_plan : undefined,
    weekly_deals: typeof state.weekly_deals === "string" ? state.weekly_deals : undefined,
    notes: typeof state.notes === "string" ? state.notes : undefined,
    review_summary: typeof state.review_summary === "string" ? state.review_summary : undefined,
    status: status === "idle" || status === "planning" || status === "ready" ? status : "idle",
    kroger_connected: state.kroger_connected === true,
  };
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + (item.price ?? 0) * item.quantity, 0);
}

export function pantryNames(items: readonly PantryItem[]): Set<string> {
  return new Set(items.map((item) => item.name.trim().toLocaleLowerCase()));
}
