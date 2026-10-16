import { describe, expect, it } from "vitest";
import { PathError, RelPathSchema, relPath, resolveInRoot } from "./paths";

describe("relPath", () => {
  it("normalisiert Schrägstriche, ./ und doppelte Schrägstriche", () => {
    expect(relPath("Bibliothek\\B-Roll//./2026-09/A7C_0412.mov")).toBe("Bibliothek/B-Roll/2026-09/A7C_0412.mov");
  });

  it("macht zerlegte Umlaute (NFD, wie macOS sie liefert) zu NFC", () => {
    const nfd = "Bibliothek/Fotos/Zu\u0308rich.jpg";
    expect(relPath(nfd)).toBe("Bibliothek/Fotos/Zürich.jpg");
    expect(relPath(nfd)).not.toBe(nfd);
  });

  it.each(["/Users/andrej/OneDrive/Studio/x.mov", "C:\\Studio\\x.mov", "../x.mov", "a/../../x", "", "  ", "./"])("lehnt %j ab", (p) => {
    expect(() => relPath(p)).toThrow(PathError);
  });

  it("RelPathSchema meldet den Fehler als Zod-Issue", () => {
    const r = RelPathSchema.safeParse("/abs/pfad");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain("Absoluter Pfad");
  });
});

describe("resolveInRoot", () => {
  it("löst unterhalb der Wurzel auf", () => {
    expect(resolveInRoot("/studio", "Marken/alperna/logo.svg")).toBe("/studio/Marken/alperna/logo.svg");
  });
  it("verweigert Ausbrechen", () => {
    expect(() => resolveInRoot("/studio", "../etc/passwd")).toThrow(PathError);
  });
});
