/** Minimaler Argument-Parser: positionale Argumente, --flag, --key wert, wiederholbares --set k=v. */
export interface Args {
  pos: string[];
  opt: Record<string, string | true>;
  set: Record<string, string>;
}

export function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const opt: Record<string, string | true> = {};
  const set: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const roh = a.slice(2);
    const eq = roh.indexOf("=");
    const key = eq >= 0 ? roh.slice(0, eq) : roh;
    let value: string | true;
    if (eq >= 0) value = roh.slice(eq + 1);
    else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) value = argv[++i]!;
    else value = true;
    if (key === "set") {
      if (value === true || !value.includes("=")) throw new Error("--set erwartet Schlüssel=Wert");
      const [k, ...rest] = value.split("=");
      set[k!] = rest.join("=");
    } else opt[key] = value;
  }
  return { pos, opt, set };
}

/** Wandelt --set-Werte in JSON-Werte um: Zahlen, true/false, JSON-Listen, sonst Text. */
export function werteAusSet(set: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(set)) {
    if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
    else if (v === "true" || v === "false") out[k] = v === "true";
    else if (/^[[{]/.test(v)) {
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    } else out[k] = v;
  }
  return out;
}
