import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  krogerProductImageUrl,
  ProductResultsCard,
  productResultsSchema,
} from "./product-results-tool";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

vi.mock("@copilotkit/react-native", () => ({ useRenderTool: vi.fn() }));

async function render(element: React.ReactElement) {
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  return tree!;
}

describe("native product results frontend tool", () => {
  it("accepts compact exact product facts and derives the Kroger image from UPC", () => {
    const input = {
      title: "Milk matches",
      products: [
        {
          upc: "0009396651300",
          name: "Organic Valley Whole Milk",
          brand: "Organic Valley",
          size: "64 fl oz",
          price: 5.49,
          regularPrice: 6.49,
          pickup: true,
        },
      ],
    };

    expect(productResultsSchema.parse(input)).toEqual(input);
    expect(krogerProductImageUrl(input.products[0].upc)).toBe(
      "https://www.kroger.com/product/images/small/front/0009396651300",
    );
  });

  it("renders product facts and a safe fallback for malformed tool arguments", async () => {
    const products = await render(
      <ProductResultsCard
        args={{
          products: [{ upc: "0009396651300", name: "Whole Milk", price: 5.49, pickup: true }],
        }}
      />,
    );
    const renderedText = products.root
      .findAllByType("Text")
      .flatMap((node) => node.props.children)
      .join(" ");
    expect(renderedText).toContain("Whole Milk");
    expect(renderedText.replaceAll(" ", "")).toContain("$5.49");
    expect(renderedText).toContain("Pickup available");

    const fallback = await render(<ProductResultsCard args={{ products: [] }} />);
    expect(
      fallback.root
        .findAllByType("Text")
        .some((node) => String(node.props.children).includes("Product results unavailable")),
    ).toBe(true);

    await act(async () => {
      products.unmount();
      fallback.unmount();
    });
  });
});
