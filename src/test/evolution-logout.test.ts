import { afterEach, describe, expect, it, vi } from "vitest";
import { evolutionLogoutInstance } from "@/lib/evolution/evolutionapi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logout da Evolution", () => {
  it("desconecta a instância selecionada pelo endpoint de logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await evolutionLogoutInstance("linha-teste", {
      baseUrl: "https://evolution.example",
      apiKey: "",
      instance: "helena",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/instance/logout/linha-teste"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
