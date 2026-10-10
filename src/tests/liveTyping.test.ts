import { describe, expect, it } from "vitest";
import { LiveTypingSession } from "../liveTyping/session";

describe("LiveTypingSession", () => {
  it("switches modes by resetting counters and filter history while preserving text", () => {
    const session = new LiveTypingSession();
    session.activate("h", 10);
    session.activate("i", 20);

    const fixed = session.setMode("fixed");
    expect(fixed).toMatchObject({
      mode: "fixed",
      text: "hi",
      totalActivations: 0,
      acceptedActivations: 0,
      suppressedActivations: 0,
      currentThresholdMs: 180,
      lastAction: null,
    });

    const firstFixedKey = session.activate("h", 25);
    expect(firstFixedKey.lastAction).toEqual({ key: "h", accepted: true });
    expect(session.setMode("adaptive")).toMatchObject({
      mode: "adaptive",
      text: "hih",
      totalActivations: 0,
      currentThresholdMs: 180,
    });
  });

  it("appends accepted keys and excludes suppressed repeats", () => {
    const session = new LiveTypingSession();
    session.setMode("fixed");
    session.activate("h", 100);
    const suppressed = session.activate("h", 150);
    const accepted = session.activate("e", 300);

    expect(suppressed.lastAction).toEqual({ key: "h", accepted: false });
    expect(accepted).toMatchObject({
      text: "he",
      totalActivations: 3,
      acceptedActivations: 2,
      suppressedActivations: 1,
    });
  });

  it.each(["hello", "book", "letter"])("keeps legitimate repeats in %s at ordinary intervals", (phrase) => {
    const session = new LiveTypingSession();
    session.setMode("adaptive");
    [...phrase].forEach((key, index) => session.activate(key, index * 300));

    expect(session.getSnapshot().text).toBe(phrase);
    expect(session.getSnapshot().suppressedActivations).toBe(0);
  });

  it("resets filter history after unfiltered editing controls", () => {
    const session = new LiveTypingSession();
    session.setMode("fixed");
    session.activate("a", 100);
    session.activate("a", 150);
    expect(session.getSnapshot().text).toBe("a");

    session.backspace();
    const afterBackspace = session.activate("a", 160);
    expect(afterBackspace.text).toBe("a");
    expect(afterBackspace.totalActivations).toBe(3);
    expect(afterBackspace.suppressedActivations).toBe(1);

    const afterClear = session.clearText();
    expect(afterClear.text).toBe("");
    expect(session.activate("a", 170).text).toBe("a");
  });

  it("resets text, counters, last action, and filter state but keeps the selected mode", () => {
    const session = new LiveTypingSession();
    session.setMode("adaptive");
    session.activate("x", 100);
    session.activate("x", 150);

    expect(session.resetSession()).toEqual({
      mode: "adaptive",
      text: "",
      totalActivations: 0,
      acceptedActivations: 0,
      suppressedActivations: 0,
      currentThresholdMs: 180,
      lastAction: null,
    });
    expect(session.activate("x", 160).lastAction?.accepted).toBe(true);
  });
});