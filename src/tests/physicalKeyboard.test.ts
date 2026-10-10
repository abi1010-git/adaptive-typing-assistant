import { describe, expect, it } from "vitest";
import { getPhysicalKeyCommand } from "../liveTyping/physicalKeyboard";

describe("physical keyboard routing", () => {
  it("routes letters, Space, and Backspace to the live keyboard commands", () => {
    expect(getPhysicalKeyCommand("A")).toBe("a");
    expect(getPhysicalKeyCommand("z")).toBe("z");
    expect(getPhysicalKeyCommand(" ")).toBe("Space");
    expect(getPhysicalKeyCommand("Backspace")).toBe("Backspace");
  });

  it("leaves shortcuts, modifiers, and unrelated keys to the browser", () => {
    expect(getPhysicalKeyCommand("a", { ctrlKey: true })).toBeNull();
    expect(getPhysicalKeyCommand("a", { metaKey: true })).toBeNull();
    expect(getPhysicalKeyCommand("a", { altKey: true })).toBeNull();
    expect(getPhysicalKeyCommand("ArrowLeft")).toBeNull();
    expect(getPhysicalKeyCommand("Enter")).toBeNull();
  });
});