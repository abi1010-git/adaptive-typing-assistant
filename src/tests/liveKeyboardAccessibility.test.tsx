import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("live keyboard accessibility markup", () => {
  it("exposes named keyboard keys, mode pressed state, and read-only text output", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain('role="group" aria-label="Keyboard mode"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Type space"');
    expect(markup).toContain('aria-label="Delete last character"');
    expect(markup).toContain('aria-describedby="live-keyboard-note"');
    expect(markup).toContain('readOnly=""');
  });
});