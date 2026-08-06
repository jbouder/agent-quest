import { afterEach, describe, expect, it } from "vitest";
import { domControlFocused, focusableWithin, isTextEntry } from "./focus";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe("focusableWithin", () => {
  it("lists controls in tab order and skips the unreachable ones", () => {
    const host = mount(`
      <button type="button">one</button>
      <button type="button" disabled>skipped: disabled</button>
      <input />
      <div tabindex="-1">skipped: programmatic focus only</div>
      <select></select>
      <p>skipped: not a control</p>
      <a href="#x">link</a>
    `);
    expect(focusableWithin(host).map((el) => el.tagName)).toEqual([
      "BUTTON",
      "INPUT",
      "SELECT",
      "A",
    ]);
  });
});

describe("isTextEntry", () => {
  it("recognizes the fields that own every keystroke", () => {
    const host = mount("<input /><textarea></textarea><select></select>");
    for (const el of Array.from(host.children))
      expect(isTextEntry(el)).toBe(true);
  });

  it("is false for buttons and for non-elements", () => {
    const host = mount("<button type='button'>go</button>");
    expect(isTextEntry(host.firstElementChild)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("domControlFocused", () => {
  it("is false when nothing in particular has focus", () => {
    mount("<button type='button'>go</button>");
    expect(domControlFocused()).toBe(false);
  });

  it("is true once a control takes focus — the game must stand down", () => {
    const host = mount("<button type='button'>go</button>");
    (host.firstElementChild as HTMLElement).focus();
    expect(domControlFocused()).toBe(true);
  });

  it("ignores the game canvas, which is not a DOM control", () => {
    const host = mount('<canvas tabindex="0"></canvas>');
    (host.firstElementChild as HTMLElement).focus();
    expect(domControlFocused()).toBe(false);
  });
});
