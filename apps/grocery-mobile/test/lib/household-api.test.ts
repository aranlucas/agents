import { describe, expect, it, vi } from "vitest";
import { createHouseholdApi, HouseholdApiError } from "@/lib/household-api";

describe("household API", () => {
  it("authenticates requests with a fresh Clerk token and verified user header", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json([{ id: "hh_1", name: "Home", role: "owner" }]),
    );
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com/",
      getToken: async () => "fresh-token",
      userId: "user_123",
      fetcher,
    });

    await expect(api.listHouseholds()).resolves.toEqual([
      { id: "hh_1", name: "Home", role: "owner" },
    ]);
    const request = fetcher.mock.lastCall?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new TypeError("expected a Request");
    expect(request.url).toBe("https://gateway.example.com/api/grocery/households");
    expect(request.headers.get("accept")).toBe("application/json");
    expect(request.headers.get("authorization")).toBe("Bearer fresh-token");
    expect(request.headers.get("x-clerk-user-id")).toBe("user_123");
  });

  it("serializes list mutations and encodes path identifiers", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ id: "item_1", checked_by: "user_123" }),
    );
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com",
      getToken: async () => "token",
      userId: "user_123",
      fetcher,
    });

    await api.updateItem("list/one", "item one", { checked: true });
    const request = fetcher.mock.lastCall?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new TypeError("expected a Request");
    expect(request.url).toBe(
      "https://gateway.example.com/api/grocery/lists/list%2Fone/items/item%20one",
    );
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get("authorization")).toBe("Bearer token");
    expect(request.headers.get("x-clerk-user-id")).toBe("user_123");
    await expect(request.text()).resolves.toBe(JSON.stringify({ checked: true }));
  });

  it("saves complete personal lists and structured recipes", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => Response.json({ id: "saved_1" }));
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com",
      getToken: async () => "token",
      userId: "user_123",
      fetcher,
    });

    await api.createList("Weekend", undefined, [{ name: "Milk", quantity: "1" }]);
    const listRequest = fetcher.mock.lastCall?.[0];
    expect(listRequest).toBeInstanceOf(Request);
    if (!(listRequest instanceof Request)) throw new TypeError("expected a Request");
    expect(listRequest.url).toBe("https://gateway.example.com/api/grocery/lists");
    expect(listRequest.method).toBe("POST");
    await expect(listRequest.text()).resolves.toBe(
      JSON.stringify({ title: "Weekend", items: [{ name: "Milk", quantity: "1" }] }),
    );

    await api.createRecipe({
      title: "Pasta",
      ingredients: [{ name: "Pasta", quantity: "1", unit: "lb" }],
      steps: ["Boil pasta"],
    });
    const recipeRequest = fetcher.mock.lastCall?.[0];
    expect(recipeRequest).toBeInstanceOf(Request);
    if (!(recipeRequest instanceof Request)) throw new TypeError("expected a Request");
    expect(recipeRequest.url).toBe("https://gateway.example.com/api/grocery/recipes");
    expect(recipeRequest.method).toBe("POST");
    await expect(recipeRequest.text()).resolves.toBe(
      JSON.stringify({
        title: "Pasta",
        ingredients: [{ name: "Pasta", quantity: "1", unit: "lb" }],
        steps: ["Boil pasta"],
      }),
    );
  });

  it("surfaces typed API errors", async () => {
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com",
      getToken: async () => "token",
      userId: "user_123",
      fetcher: vi.fn(async () =>
        Response.json({ error: "grocery_invite_expired" }, { status: 410 }),
      ),
    });

    const error = await api.joinHousehold("ABCDEFGH").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HouseholdApiError);
    expect(error).toMatchObject({ status: 410, code: "grocery_invite_expired" });
    expect((error as Error).message).toContain("expired");
  });

  it("does not fetch without an authenticated Clerk session", async () => {
    const fetcher = vi.fn();
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com",
      getToken: async () => null,
      userId: "user_123",
      fetcher,
    });

    await expect(api.listHouseholds()).rejects.toThrow("refresh your session");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
