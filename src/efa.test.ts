import { describe, test, expect } from "bun:test";
import { normalizeLine, cleanStopName } from "./efa";

describe("normalizeLine", () => {
  test("strips spaces and uppercases", () => {
    expect(normalizeLine("S 2")).toBe("S2");
    expect(normalizeLine("  s6 ")).toBe("S6");
    expect(normalizeLine("Linie 3")).toBe("LINIE3");
  });
});

describe("cleanStopName", () => {
  test("returns 'locality, stop' when both differ", () => {
    const loc = { disassembledName: "Mühlburger Tor", parent: { name: "Karlsruhe" } };
    expect(cleanStopName(loc)).toBe("Karlsruhe, Mühlburger Tor");
  });

  test("collapses doubling when stop == locality", () => {
    const loc = { disassembledName: "Karlsruhe Hbf", parent: { name: "Karlsruhe Hbf" } };
    expect(cleanStopName(loc)).toBe("Karlsruhe Hbf");
  });

  test("falls back to name when no disassembledName", () => {
    const loc = { name: "Karlsruhe, Marktplatz" };
    expect(cleanStopName(loc)).toBe("Karlsruhe, Marktplatz");
  });
});
