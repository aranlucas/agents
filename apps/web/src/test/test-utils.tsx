import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { expect } from "vitest";

export async function renderSmoke(label: string, element: ReactElement) {
  try {
    expect(renderToStaticMarkup(element)).toEqual(expect.any(String));
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return;
    }
    throw new Error(`render failed: ${label}`, { cause: error });
  }
}

export async function interactSmoke(label: string, element: ReactElement) {
  try {
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element);
    });
    const root = tree!.root;
    for (const button of root.findAllByType("button")) {
      // Skip Base UI dropdown triggers — they use createPortal (incompatible with
      // react-test-renderer) and their enhanced-click handlers inspect native event
      // properties that don't exist in this synthetic environment.
      if (button.props["aria-haspopup"]) continue;

      if (typeof button.props.onClick === "function") {
        await act(async () => {
          await button.props.onClick({
            nativeEvent: {} as Event,
            detail: 0,
            type: "click",
            preventDefault: () => {},
            stopPropagation: () => {},
          });
        });
      }
    }
    for (const input of [...root.findAllByType("input"), ...root.findAllByType("textarea")]) {
      if (typeof input.props.onChange === "function") {
        await act(async () => {
          input.props.onChange({ target: { value: "Updated" } });
        });
      }
    }
    await act(async () => {
      tree!.unmount();
    });
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return;
    }
    throw new Error(`interaction failed: ${label}`, { cause: error });
  }
}
