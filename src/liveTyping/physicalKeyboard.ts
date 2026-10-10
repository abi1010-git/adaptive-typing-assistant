export interface KeyboardModifiers {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type PhysicalKeyCommand = "Space" | "Backspace" | string;

export function getPhysicalKeyCommand(
  key: string,
  modifiers: KeyboardModifiers = {},
): PhysicalKeyCommand | null {
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) return null;
  if (key === " ") return "Space";
  if (key === "Backspace") return "Backspace";
  if (/^[a-z]$/i.test(key)) return key.toLowerCase();
  return null;
}