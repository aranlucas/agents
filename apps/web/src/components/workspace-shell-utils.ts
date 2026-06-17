export type PanelState = "closed" | "split";
export type PanelAction = "open" | "close" | "toggle-open";

export function nextPanelState(state: PanelState, action: PanelAction): PanelState {
  switch (action) {
    case "open":
      return "split";
    case "close":
      return "closed";
    case "toggle-open":
      return state === "closed" ? "split" : "closed";
    default:
      return state;
  }
}
