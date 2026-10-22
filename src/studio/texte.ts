/** Die Meldungen zur Verbindung mit dem Alperna-Tool, gemeinsam für `tool verbinden`, `tool hochladen` und die übrigen Befehle. */

export type Verbindung = { art: "ok" } | { art: "abgelehnt" } | { art: "aus" } | { art: "nicht-erreichbar"; status?: number };

export const VERBINDUNGSTEXT: Record<Verbindung["art"], string> = {
  ok: "Das Tool nimmt das Token an.",
  abgelehnt: "Das Tool lehnt das Token ab (falsch, widerrufen oder abgelaufen).",
  aus: "Das Tool antwortet mit «nicht gefunden»: Das Studio ist dort ausgeschaltet (NEXT_PUBLIC_FEATURE_STUDIO) oder die Adresse stimmt nicht.",
  "nicht-erreichbar": "Das Tool ist im Moment nicht erreichbar.",
};
