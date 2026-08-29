import type {
  CartItem,
  GroceryState,
  ProductMatch,
  RecipeDraft,
  RecipeDraftIngredient,
  ShoppingEquipmentItem,
  ShoppingFrequentItem,
  ShoppingOrder,
  ShoppingPantryItem,
  ShoppingPreferredStore,
  ShoppingProfile,
} from "@agents/types";

export type DisplayTextMessage = {
  id: string;
  role: "user" | "assistant" | "reasoning";
  content: string;
};

export type DisplayToolCall = {
  id: string;
  role: "tool";
  name: string;
  parameters: unknown;
  result?: unknown;
  status: "running" | "complete" | "failed";
};

export type DisplayMessage = DisplayTextMessage | DisplayToolCall;

export const INITIAL_GROCERY_STATE: GroceryState = {
  shopping_list: [],
  list_title: "",
  product_matches: [],
  cart: [],
  shopping_profile: {
    pantry: [],
    equipment: [],
    recent_orders: [],
    frequent_items: [],
  },
  meal_plan: "",
  recipe: {
    title: "",
    description: "",
    servings: "",
    notes: "",
    ingredients: [],
    steps: [],
    tags: [],
  },
  weekly_deals: "",
  status: "idle",
  notes: "",
  review_summary: "",
  kroger_connected: false,
};

type ToolCall = {
  id: string;
  name: string;
  parameters: unknown;
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

export function toDisplayMessage(message: unknown, index: number): DisplayTextMessage | null {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  if (record.role !== "user" && record.role !== "assistant" && record.role !== "reasoning") {
    return null;
  }
  const content = textFromContent(record.content);
  if (!content) return null;
  return {
    id: typeof record.id === "string" ? record.id : `${record.role}-${index}`,
    role: record.role,
    content,
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function decodedValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function messageToolCalls(message: Record<string, unknown>): ToolCall[] {
  if (!Array.isArray(message.toolCalls)) return [];
  return message.toolCalls.flatMap((value, index) => {
    const call = recordValue(value);
    const fn = recordValue(call?.function);
    if (!call || !fn || typeof fn.name !== "string") return [];
    return [
      {
        id: typeof call.id === "string" ? call.id : `${message.id ?? "tool"}-${index}`,
        name: fn.name,
        parameters: decodedValue(fn.arguments),
      },
    ];
  });
}

function toolFailed(result: unknown): boolean {
  const record = recordValue(result);
  return record?.ok === false || record?.error != null;
}

export function toDisplayMessages(messages: readonly unknown[]): DisplayMessage[] {
  const records = messages.map(recordValue).filter((message) => message !== null);
  const toolResults = new Map<string, unknown>();
  for (const message of records) {
    if (message.role === "tool" && typeof message.toolCallId === "string") {
      toolResults.set(message.toolCallId, decodedValue(textFromContent(message.content)));
    }
  }

  const items: DisplayMessage[] = [];
  for (const [index, message] of records.entries()) {
    if (message.role === "assistant") {
      for (const toolCall of messageToolCalls(message)) {
        const hasResult = toolResults.has(toolCall.id);
        const result = toolResults.get(toolCall.id);
        const failed = hasResult && toolFailed(result);
        items.push({
          id: toolCall.id,
          role: "tool",
          name: toolCall.name,
          parameters: toolCall.parameters,
          ...(hasResult ? { result } : {}),
          status: !hasResult ? "running" : failed ? "failed" : "complete",
        });
      }
    }

    const textMessage = toDisplayMessage(message, index);
    if (!textMessage) continue;
    const previous = items.at(-1);
    if (textMessage.role === "reasoning" && previous?.role === "reasoning") {
      if (textMessage.content !== previous.content) {
        previous.content = `${previous.content}\n\n${textMessage.content}`;
      }
      continue;
    }
    items.push(textMessage);
  }
  return items;
}

const displayMessageRevisionCache = new WeakMap<DisplayMessage, string>();

function displayMessageRevision(message: DisplayMessage): string {
  const cached = displayMessageRevisionCache.get(message);
  if (cached !== undefined) return cached;

  const revision =
    message.role === "tool"
      ? JSON.stringify([message.name, message.status, message.parameters, message.result])
      : message.content;
  displayMessageRevisionCache.set(message, revision);
  return revision;
}

export function stabilizeDisplayMessages(
  previous: readonly DisplayMessage[],
  next: readonly DisplayMessage[],
): DisplayMessage[] {
  const previousByIdentity = new Map(
    previous.map((message) => [`${message.role}:${message.id}`, message]),
  );
  const stable = next.map((message) => {
    const prior = previousByIdentity.get(`${message.role}:${message.id}`);
    return prior && displayMessageRevision(prior) === displayMessageRevision(message)
      ? prior
      : message;
  });

  return stable.length === previous.length &&
    stable.every((message, index) => message === previous[index])
    ? (previous as DisplayMessage[])
    : stable;
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

function pantryItems(value: unknown): ShoppingPantryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ShoppingPantryItem => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.name === "string" &&
      typeof record.quantity === "number" &&
      typeof record.added_at === "number" &&
      (record.expires_at === undefined || typeof record.expires_at === "number")
    );
  });
}

function equipmentItems(value: unknown): ShoppingEquipmentItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ShoppingEquipmentItem => {
    const record = recordValue(item);
    return (
      record !== null &&
      typeof record.name === "string" &&
      typeof record.added_at === "number" &&
      (record.category === undefined || typeof record.category === "string")
    );
  });
}

function shoppingOrders(value: unknown): ShoppingOrder[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ShoppingOrder => {
    const record = recordValue(item);
    return (
      record !== null &&
      typeof record.id === "string" &&
      Array.isArray(record.items) &&
      record.items.every((orderItem) => {
        const entry = recordValue(orderItem);
        return (
          entry !== null &&
          typeof entry.upc === "string" &&
          typeof entry.name === "string" &&
          typeof entry.quantity === "number" &&
          (entry.price === undefined || typeof entry.price === "number")
        );
      }) &&
      typeof record.total_items === "number" &&
      typeof record.placed_at === "number" &&
      (record.estimated_total === undefined || typeof record.estimated_total === "number") &&
      (record.location_id === undefined || typeof record.location_id === "string") &&
      (record.notes === undefined || typeof record.notes === "string")
    );
  });
}

function frequentItems(value: unknown): ShoppingFrequentItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ShoppingFrequentItem => {
    const record = recordValue(item);
    return (
      record !== null &&
      typeof record.name === "string" &&
      typeof record.upc === "string" &&
      typeof record.orders === "number" &&
      typeof record.total_quantity === "number"
    );
  });
}

function preferredStore(value: unknown): ShoppingPreferredStore | undefined {
  const store = recordValue(value);
  if (
    !store ||
    typeof store.location_id !== "string" ||
    typeof store.name !== "string" ||
    typeof store.address !== "string" ||
    typeof store.chain !== "string" ||
    typeof store.set_at !== "number"
  ) {
    return undefined;
  }
  return store as ShoppingPreferredStore;
}

function shoppingProfile(value: unknown): ShoppingProfile {
  const profile = recordValue(value);
  const store = preferredStore(profile?.preferred_store);
  return {
    pantry: pantryItems(profile?.pantry),
    equipment: equipmentItems(profile?.equipment),
    recent_orders: shoppingOrders(profile?.recent_orders),
    frequent_items: frequentItems(profile?.frequent_items),
    ...(store ? { preferred_store: store } : {}),
  };
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

function recipeDraft(value: unknown): RecipeDraft | undefined {
  const recipe = recordValue(value);
  if (!recipe || typeof recipe.title !== "string") return undefined;
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.flatMap((value) => {
        const ingredient = recordValue(value);
        if (!ingredient || typeof ingredient.name !== "string") return [];
        return [
          {
            name: ingredient.name,
            quantity: typeof ingredient.quantity === "string" ? ingredient.quantity : "",
            unit: typeof ingredient.unit === "string" ? ingredient.unit : "",
            note: typeof ingredient.note === "string" ? ingredient.note : "",
          } satisfies RecipeDraftIngredient,
        ];
      })
    : [];
  const steps = stringArray(recipe.steps);
  if (!ingredients.length || !steps.length) return undefined;
  return {
    title: recipe.title,
    description: typeof recipe.description === "string" ? recipe.description : "",
    servings: typeof recipe.servings === "string" ? recipe.servings : "",
    notes: typeof recipe.notes === "string" ? recipe.notes : "",
    ingredients,
    steps,
    tags: stringArray(recipe.tags),
  };
}

export function normalizeGroceryState(value: unknown): GroceryState {
  const state = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = state.status;
  return {
    shopping_list: stringArray(state.shopping_list),
    list_title: typeof state.list_title === "string" ? state.list_title : undefined,
    product_matches: productMatches(state.product_matches),
    cart: cartItems(state.cart),
    shopping_profile: shoppingProfile(state.shopping_profile),
    meal_plan: typeof state.meal_plan === "string" ? state.meal_plan : undefined,
    recipe: recipeDraft(state.recipe),
    weekly_deals: typeof state.weekly_deals === "string" ? state.weekly_deals : undefined,
    notes: typeof state.notes === "string" ? state.notes : undefined,
    review_summary: typeof state.review_summary === "string" ? state.review_summary : undefined,
    status: status === "idle" || status === "planning" || status === "ready" ? status : "idle",
    kroger_connected: state.kroger_connected === true,
  };
}

export function stabilizeGroceryState(previous: GroceryState, next: GroceryState): GroceryState {
  return previous === next || JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + (item.price ?? 0) * item.quantity, 0);
}

export function pantryNames(items: readonly ShoppingPantryItem[]): Set<string> {
  return new Set(items.map((item) => item.name.trim().toLocaleLowerCase()));
}
