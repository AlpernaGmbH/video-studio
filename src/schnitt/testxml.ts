/** Winziger XML-Leser nur für Tests: Elemente mit Attributen und Kindern. Versteht genau das, was `fcpxml.ts` schreibt (keine CDATA, keine Kommentare). */
export interface Knoten {
  name: string;
  attr: Record<string, string>;
  kinder: Knoten[];
}

const unesc = (s: string): string => s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

export function liesXml(text: string): Knoten {
  const re = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const wurzel: Knoten = { name: "#wurzel", attr: {}, kinder: [] };
  const stapel: Knoten[] = [wurzel];
  const ohneKopf = text.replace(/<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(ohneKopf))) {
    const [, zu, name, attrText, selbst] = m;
    if (zu) {
      const oben = stapel.pop();
      if (!oben || oben.name !== name) throw new Error(`Schliessendes </${name}> passt nicht zu <${oben?.name}>`);
      continue;
    }
    const attr: Record<string, string> = {};
    for (const a of attrText!.matchAll(/([\w:-]+)="([^"]*)"/g)) attr[a[1]!] = unesc(a[2]!);
    const k: Knoten = { name: name!, attr, kinder: [] };
    stapel[stapel.length - 1]!.kinder.push(k);
    if (!selbst) stapel.push(k);
  }
  if (stapel.length !== 1) throw new Error(`Element <${stapel[stapel.length - 1]!.name}> nicht geschlossen`);
  if (wurzel.kinder.length !== 1) throw new Error("Genau ein Wurzelelement erwartet");
  return wurzel.kinder[0]!;
}

export const finde = (k: Knoten, name: string): Knoten[] => k.kinder.filter((x) => x.name === name);
export function findeAlle(k: Knoten, name: string): Knoten[] {
  return [...(k.name === name ? [k] : []), ...k.kinder.flatMap((x) => findeAlle(x, name))];
}

/** «1001/30000s», «5s», «0s» → Sekunden. */
export function zeitZuSekunden(z: string): number {
  const m = /^(-?\d+)(?:\/(\d+))?s$/.exec(z);
  if (!m) throw new Error(`Keine FCPXML-Zeit: ${z}`);
  return Number(m[1]) / Number(m[2] ?? 1);
}
