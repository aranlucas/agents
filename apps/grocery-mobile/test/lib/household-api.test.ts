import { describe, expect, it, vi } from "vitest";
import { createHouseholdApi, HouseholdApiError } from "@/lib/household-api";

describe("household API", () => {
  it("authenticates requests with a fresh Clerk token and verified user header", async () => {
    const fetcher = vi.fn(async () => Response.json([{ id: "hh_1", name: "Home", role: "owner" }]));
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com/",
      getToken: async () => "fresh-token",
      userId: "user_123",
      fetcher,
    });

    await expect(api.listHouseholds()).resolves.toEqual([
      { id: "hh_1", name: "Home", role: "owner" },
    ]);
    expect(fetcher).toHaveBeenCalledWith("https://gateway.example.com/api/grocery/households", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer fresh-token",
        "x-clerk-user-id": "user_123",
      },
    });
  });

  it("serializes list mutations and encodes path identifiers", async () => {
    const fetcher = vi.fn(async () => Response.json({ id: "item_1", checked_by: "user_123" }));
    const api = createHouseholdApi({
      baseUrl: "https://gateway.example.com",
      getToken: async () => "token",
      userId: "user_123",
      fetcher,
    });

    await api.updateItem("list/one", "item one", { checked: true });
    expect(fetcher).toHaveBeenCalledWith(
      "https://gateway.example.com/api/grocery/lists/list%2Fone/items/item%20one",
      {
        method: "PATCH",
        body: JSON.stringify({ checked: true }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer token",
          "x-clerk-user-id": "user_123",
        },
      },
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
