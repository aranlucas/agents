import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect } from "vitest";

const user = userEvent.setup();

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
    render(element);
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return;
    }
    throw new Error(`interaction failed: ${label}`, { cause: error });
  }
}
