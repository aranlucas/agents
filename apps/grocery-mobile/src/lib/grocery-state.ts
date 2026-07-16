import type { CartItem, GroceryState, PantryItem, ProductMatch } from "@agents/types";

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

export type DisplayGroceryList = {
  id: string;
  role: "grocery-list";
  state: GroceryState;
};

export type DisplayMessage = DisplayTextMessage | DisplayToolCall | DisplayGroceryList;

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

function applyGroceryTool(state: GroceryState, name: string, parameters: unknown): GroceryState {
  const input = recordValue(parameters);
  if (!input) return state;

  switch (name) {
    case "set_shopping_list":
      return normalizeGroceryState({
        ...state,
        shopping_list: stringArray(input.items),
        product_matches: [],
      });
    case "set_product_matches":
      return normalizeGroceryState({ ...state, product_matches: input.items });
    case "update_cart":
      return normalizeGroceryState({ ...state, cart: input.items });
    case "update_pantry":
      return normalizeGroceryState({ ...state, pantry: input.items });
    case "set_meal_plan":
      return normalizeGroceryState({ ...state, meal_plan: input.plan, status: "planning" });
    case "set_weekly_deals":
      return normalizeGroceryState({ ...state, weekly_deals: input.deals });
    case "mark_list_ready":
      return normalizeGroceryState({ ...state, review_summary: input.summary, status: "ready" });
    default:
      return state;
  }
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
  let groceryState = normalizeGroceryState({});
  for (const [index, message] of records.entries()) {
    if (message.role === "assistant") {
      for (const toolCall of messageToolCalls(message)) {
        const hasResult = toolResults.has(toolCall.id);
        const result = toolResults.get(toolCall.id);
        const failed = hasResult && toolFailed(result);
        if (hasResult && !failed) {
          groceryState = applyGroceryTool(groceryState, toolCall.name, toolCall.parameters);
        }
        items.push({
          id: toolCall.id,
          role: "tool",
          name: toolCall.name,
          parameters: toolCall.parameters,
          ...(hasResult ? { result } : {}),
          status: !hasResult ? "running" : failed ? "failed" : "complete",
        });
        if (
          toolCall.name === "mark_list_ready" &&
          hasResult &&
          !failed &&
          (groceryState.shopping_list?.length ?? 0) > 0
        ) {
          items.push({
            id: `${toolCall.id}-grocery-list`,
            role: "grocery-list",
            state: normalizeGroceryState(groceryState),
          });
        }
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
      : message.role === "grocery-list"
        ? JSON.stringify(message.state)
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

export function stabilizeGroceryState(previous: GroceryState, next: GroceryState): GroceryState {
  return previous.status === next.status &&
    previous.meal_plan === next.meal_plan &&
    previous.weekly_deals === next.weekly_deals &&
    previous.notes === next.notes &&
    previous.review_summary === next.review_summary &&
    previous.kroger_connected === next.kroger_connected &&
    arraysEqual(previous.shopping_list, next.shopping_list, (left, right) => left === right) &&
    arraysEqual(
      previous.product_matches,
      next.product_matches,
      (left, right) =>
        left.query === right.query &&
        left.name === right.name &&
        left.upc === right.upc &&
        left.image_url === right.image_url &&
        left.price === right.price &&
        left.size === right.size,
    ) &&
    arraysEqual(
      previous.cart,
      next.cart,
      (left, right) =>
        left.name === right.name &&
        left.quantity === right.quantity &&
        left.price === right.price &&
        left.upc === right.upc,
    ) &&
    arraysEqual(
      previous.pantry,
      next.pantry,
      (left, right) => left.name === right.name && left.quantity === right.quantity,
    )
    ? previous
    : next;
}

function arraysEqual<Value>(
  left: readonly Value[] | undefined,
  right: readonly Value[] | undefined,
  equals: (left: Value, right: Value) => boolean,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => equals(value, right[index] as Value));
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + (item.price ?? 0) * item.quantity, 0);
}

export function pantryNames(items: readonly PantryItem[]): Set<string> {
  return new Set(items.map((item) => item.name.trim().toLocaleLowerCase()));
}
