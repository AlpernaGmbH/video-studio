import { describe, expect, it } from "vitest";
import { EinbettungsFehler, einbettungsAdresse, leseEinbettung, leseLink, linksAusText } from "./embed";

/** Eine selbst gebaute Einbettungsseite: Das JSON steckt als Text in einem JSON, die Schrägstriche sind maskiert, wie auf der echten Seite. */
function seite(medium: unknown, kontext: Record<string, unknown> = {}): string {
  const inner = JSON.stringify({ context: { type: "GraphVideo", shortcode: "TEST123456", copyright_blocked: false, ...kontext }, gql_data: { shortcode_media: medium } });
  const eingebettet = JSON.stringify(inner).replace(/\//g, "\\/");
  return `<!doctype html><html><body><script>requireLazy([],function(){init([{"isRichEmbed":true,"contextJSON":${eingebettet}}])})</script></body></html>`;
}

describe("leseLink", () => {
  it("erkennt Reels und Beiträge samt Kurzcode, Verfolgungsparameter stören nicht", () => {
    expect(leseLink("https://www.instagram.com/reel/DetbRtDRQUP/?mdxt=NTNmeGhwNm9ycjEx")).toMatchObject({ art: "reel", code: "DetbRtDRQUP" });
    expect(leseLink("https://www.instagram.com/reels/DetbRtDRQUP/")).toMatchObject({ art: "reel", code: "DetbRtDRQUP" });
    expect(leseLink("https://www.instagram.com/p/Dei5MKHgHyB/")).toMatchObject({ art: "beitrag", code: "Dei5MKHgHyB" });
  });
  it("merkt sich die Folie, bei der der Link gespeichert wurde", () => {
    expect(leseLink("https://www.instagram.com/p/Dei5MKHgHyB/?img_index=5&mdxt=x")).toMatchObject({ art: "beitrag", folie: 5 });
    expect(leseLink("https://www.instagram.com/p/Dei5MKHgHyB/?img_index=0").folie).toBeUndefined();
    expect(leseLink("https://www.instagram.com/p/Dei5MKHgHyB/?img_index=abc").folie).toBeUndefined();
  });
  it("erkennt ein Profil nur, wenn der Weg ein einziges Konto ist", () => {
    expect(leseLink("https://www.instagram.com/lemonadsstudio?xtok=MXJh")).toMatchObject({ art: "profil", code: "lemonadsstudio" });
    expect(leseLink("https://www.instagram.com/jdomito_?psln=x")).toMatchObject({ art: "profil", code: "jdomito_" });
    expect(leseLink("https://www.instagram.com/explore").art).toBe("unbekannt");
    expect(leseLink("https://www.instagram.com/a/b/c").art).toBe("unbekannt");
  });
  it("erkennt YouTube in beiden Schreibweisen", () => {
    expect(leseLink("https://www.youtube.com/watch?v=H9yhVi_8eVU")).toMatchObject({ art: "youtube", code: "H9yhVi_8eVU" });
    expect(leseLink("https://youtu.be/H9yhVi_8eVU")).toMatchObject({ art: "youtube", code: "H9yhVi_8eVU" });
    expect(leseLink("https://www.youtube.com/watch").art).toBe("unbekannt");
  });
  it("lässt Fremdes und Unlesbares als unbekannt stehen, ohne zu werfen", () => {
    expect(leseLink("https://example.com/reel/DetbRtDRQUP/").art).toBe("unbekannt");
    expect(leseLink("kein link").art).toBe("unbekannt");
    expect(leseLink("https://www.instagram.com/reel/x/").art).toBe("unbekannt");
  });
});

describe("linksAusText", () => {
  const text = [
    "für marketing system",
    "",
    "https://www.instagram.com/reel/DetbRtDRQUP/?mdxt=a",
    "ads auch reinmachen: https://www.instagram.com/reel/Dc2A1V4qLzi/?cplk=b",
    "nochmal: https://www.instagram.com/reel/DetbRtDRQUP/?mdxt=andere",
    "beste graphics: https://www.instagram.com/lemonadsstudio?xtok=c",
  ].join("\n");
  it("findet Links hinter Beschriftungen und lässt Doppelte desselben Codes weg", () => {
    expect(linksAusText(text).map((l) => `${l.art}:${l.code}`)).toEqual(["reel:DetbRtDRQUP", "reel:Dc2A1V4qLzi", "profil:lemonadsstudio"]);
  });
  it("behält den ersten Link eines doppelten Codes, nicht den späteren", () => {
    expect(linksAusText(text)[0]!.url).toContain("mdxt=a");
  });
});

describe("einbettungsAdresse", () => {
  it("gibt es für Reels und Beiträge, nicht für Profile und YouTube", () => {
    expect(einbettungsAdresse(leseLink("https://www.instagram.com/reel/DetbRtDRQUP/"))).toBe("https://www.instagram.com/reel/DetbRtDRQUP/embed/captioned/");
    expect(einbettungsAdresse(leseLink("https://www.instagram.com/p/Dei5MKHgHyB/"))).toBe("https://www.instagram.com/p/Dei5MKHgHyB/embed/captioned/");
    expect(einbettungsAdresse(leseLink("https://www.instagram.com/lemonadsstudio"))).toBeUndefined();
    expect(einbettungsAdresse(leseLink("https://youtu.be/H9yhVi_8eVU"))).toBeUndefined();
  });
});

describe("leseEinbettung", () => {
  it("liest ein Reel: Medium, Text, Zähler und Dauer", () => {
    const e = leseEinbettung(
      seite({
        __typename: "GraphVideo",
        shortcode: "TEST123456",
        is_video: true,
        display_url: "https://cdn.example/bild.jpg",
        video_url: "https://cdn.example/v/film.mp4?a=1&b=2",
        video_duration: "46.67",
        video_view_count: 28474,
        edge_liked_by: { count: 1368 },
        edge_media_to_caption: { edges: [{ node: { text: "Erster Satz\n\n#tag" } }] },
        owner: { username: "testkonto" },
      }),
    );
    expect(e).toEqual({
      code: "TEST123456",
      typ: "video",
      konto: "testkonto",
      beschreibung: "Erster Satz\n\n#tag",
      likes: 1368,
      ansichten: 28474,
      dauer: 46.67,
      folien: [{ nr: 1, art: "video", videoUrl: "https://cdn.example/v/film.mp4?a=1&b=2", bildUrl: "https://cdn.example/bild.jpg", dauer: 46.67 }],
    });
  });

  it("liest ein Karussell mit Bild- und Videofolien in der Reihenfolge des Beitrags", () => {
    const e = leseEinbettung(
      seite({
        __typename: "GraphSidecar",
        shortcode: "TEST123456",
        is_video: false,
        display_url: "https://cdn.example/1.jpg",
        edge_sidecar_to_children: {
          edges: [
            { node: { is_video: false, display_url: "https://cdn.example/1.jpg" } },
            { node: { is_video: true, display_url: "https://cdn.example/2.jpg", video_url: "https://cdn.example/2.mp4", video_duration: 7.5 } },
            { node: { is_video: false, display_url: "https://cdn.example/3.jpg" } },
          ],
        },
      }),
    );
    expect(e.typ).toBe("karussell");
    expect(e.folien.map((f) => [f.nr, f.art])).toEqual([
      [1, "bild"],
      [2, "video"],
      [3, "bild"],
    ]);
    expect(e.folien[1]).toMatchObject({ videoUrl: "https://cdn.example/2.mp4", dauer: 7.5 });
  });

  it("zählt eine Videofolie ohne Videoadresse als Bild, statt sie zu erfinden", () => {
    const e = leseEinbettung(seite({ shortcode: "TEST123456", is_video: true, display_url: "https://cdn.example/a.jpg" }));
    expect(e.folien).toEqual([{ nr: 1, art: "bild", bildUrl: "https://cdn.example/a.jpg" }]);
  });

  const grund = (html: string) => {
    try {
      leseEinbettung(html);
    } catch (f) {
      return f instanceof EinbettungsFehler ? f.grund : `anderer Fehler: ${String(f)}`;
    }
    return "kein Fehler";
  };

  it("meldet jeden Fehlfall mit Grund", () => {
    expect(grund("<html>Anmelden</html>")).toBe("keine_daten");
    expect(grund(`<script>"contextJSON":"{kaputt"</script>`)).toBe("keine_daten");
    expect(grund(seite(null))).toBe("keine_daten");
    expect(grund(seite({ shortcode: "x", is_video: true, video_url: "https://cdn.example/v.mp4" }, { copyright_blocked: true }))).toBe("gesperrt");
    expect(grund(seite({ shortcode: "x", is_video: false }))).toBe("keine_medien");
  });
});
