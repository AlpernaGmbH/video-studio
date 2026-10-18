import type { Akteur } from "../core/schemas";
import type { Inhalt } from "./inhalt";

/** Gemeinsame Bausteine der Tests im Ordner `inhalte`. */
export const JETZT = "2026-10-17T09:00:00Z";
export const mensch: Akteur = { typ: "mensch", name: "Andrej" };
export const claude: Akteur = { typ: "system", name: "Claude" };
const leer = { entscheid: "" as const, grund: "", von: "", am: "" };

export function inhalt(p: Partial<Inhalt> = {}): Inhalt {
  return {
    id: "c-0001",
    titel: "Wartezeit beim Zahnarzt",
    format: "Reel",
    plattformen: ["Instagram"],
    marke: "alperna",
    markeUrls: [],
    profil: "Alperna",
    quelle: "Manuell",
    referenz: "",
    hook: "Dreissig Minuten Wartezeit sind kein Naturgesetz.",
    winkel: "Ein Praxisteam zeigt, wie es die Wartezeit halbiert hat",
    beleg: "Praxis Hofer, Herisau: Wartezeit von 32 auf 14 Minuten, gemessen im September 2026",
    aufwand: "Dreh nötig",
    status: "Neu",
    torI: { ...leer, entscheid: "offen" },
    torP: { ...leer, entscheid: "offen" },
    statusVon: "",
    statusGrund: "",
    statusAm: "",
    statusVorPause: "",
    dateien: "Footage: rohmaterial/praxis-hofer/empfang-01.mov | Empfang, Totale",
    ziel: "",
    publishing: undefined,
    geplantFuer: "",
    batch: "",
    offeneMarkierungen: 0,
    url: "https://www.notion.so/c0001",
    seite: "c0001",
    erstellt: "2026-10-10T08:00:00Z",
    ...p,
  };
}
