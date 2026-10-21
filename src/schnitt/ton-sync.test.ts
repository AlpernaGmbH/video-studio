import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findeStille } from "./stille";
import { dekodiereMono, fensterArgs, fft, findeVersatz, findeVersatzAusHuellkurven, huellkurve, kreuzkorrelation, listeTonDateien, messerMitCache, paareTon, schneideTonFenster, type Versatz } from "./ton-sync";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** Zufallszahlen mit festem Startwert, damit die Tests gleich bleiben. */
const zufall = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};
/** Eine Hüllkurve, die wie Sprache aussieht: glatte Zufallswerte mit zufällig verteilten Pausen. Jede Zahl `seed` ergibt eine andere. */
const sprache = (n: number, seed: number): Float64Array => {
  const r = zufall(seed);
  const roh = Array.from({ length: n + 40 }, () => r());
  const pausen = Array.from({ length: Math.ceil(n / 150) + 1 }, () => r() < 0.4);
  const aus = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < 20; j++) s += roh[i + j]!;
    aus[i] = s / 20 + (pausen[Math.floor(i / 150)] ? -0.3 : 0);
  }
  const mittel = aus.reduce((a, b) => a + b, 0) / n;
  return aus.map((x) => x - mittel);
};

describe("fft und kreuzkorrelation", () => {
  it("fft und Rückweg ergeben das Ausgangssignal", () => {
    const re = Float64Array.from([1, 2, 3, 4, 0, -1, 5, 2]);
    const im = new Float64Array(8);
    const kopie = Float64Array.from(re);
    fft(re, im);
    fft(re, im, true);
    kopie.forEach((x, i) => expect(re[i]).toBeCloseTo(x, 9));
  });

  it("die Kreuzkorrelation stimmt mit der direkten Summe überein", () => {
    const x = Float64Array.from([1, 2, -1, 0.5, 3]);
    const y = Float64Array.from([0.5, -2, 1, 4, 1, -1, 2]);
    const c = kreuzkorrelation(x, y);
    for (let k = 0; k < c.length; k++) {
      const lag = k - (x.length - 1);
      let direkt = 0;
      for (let t = 0; t < x.length; t++) if (t + lag >= 0 && t + lag < y.length) direkt += x[t]! * y[t + lag]!;
      expect(c[k]).toBeCloseTo(direkt, 9);
    }
  });
});

describe("findeVersatzAusHuellkurven", () => {
  const basis = sprache(6000, 7);

  it("findet einen positiven Versatz (die Aufnahme beginnt früher) auf 10 Millisekunden genau", () => {
    const video = basis.slice(1000, 4000);
    const ton = basis.slice(400, 5600);
    const r = findeVersatzAusHuellkurven(video, ton)!;
    expect(r.versatz).toBe(6);
    expect(r.sicherheit).toBe("hoch");
    expect(r.ueberlappung).toBe(1);
  });

  it("findet einen negativen Versatz (die Aufnahme beginnt später)", () => {
    const video = basis.slice(1000, 4000);
    const ton = basis.slice(1300, 5000);
    expect(findeVersatzAusHuellkurven(video, ton)!.versatz).toBe(-3);
  });

  it("findet den Versatz auch bei anderem Pegel, anderem Raumklang und Rauschen", () => {
    const r = zufall(3);
    const video = basis.slice(1000, 4000).map((x) => 0.4 * x + 0.1 * (r() - 0.5));
    const ton = basis.slice(400, 5600).map((x) => x + 0.15 * (r() - 0.5));
    const ergebnis = findeVersatzAusHuellkurven(video, ton)!;
    expect(ergebnis.versatz).toBe(6);
    expect(ergebnis.sicherheit).not.toBe("niedrig");
  });

  it("findet den Versatz auch, wenn die Hüllkurven nur in ihrem Ausschnitt verschiedene Grundpegel haben (Pegel schwankt langsam)", () => {
    // Ein langsamer Pegelverlauf (Mikrofon wandert, Sprecher dreht den Kopf) verschiebt den Mittelwert je Ausschnitt. Ohne Abzug des Ausschnitts-Mittelwerts
    // gewinnt der Versatz, an dem beide Kurven gleichzeitig hoch liegen, nicht der, an dem sie übereinstimmen.
    const video = basis.slice(1000, 4000).map((x, i) => x + 2 + 4 * (i / 3000));
    const ton = basis.slice(400, 5600).map((x, i) => x + 1.5 + 4 * (i / 5200));
    const r = findeVersatzAusHuellkurven(video, ton)!;
    expect(r.versatz).toBe(6);
  });

  it("findet bei Aufnahmen, die nichts miteinander zu tun haben, keinen sicheren Treffer (mehrere Zufallsaufnahmen)", () => {
    for (const [a, b] of [[1, 2], [11, 12], [21, 22], [31, 32], [41, 42], [51, 52]]) {
      const r = findeVersatzAusHuellkurven(sprache(3000, a!), sprache(5000, b!))!;
      expect(r.sicherheit, `Seeds ${a}/${b}, Wert ${r.wert}`).toBe("niedrig");
    }
  });

  it("verlangt, dass die Aufnahme das Video zu mindestens 80 Prozent abdeckt", () => {
    const video = basis.slice(1000, 4000);
    // die Aufnahme endet nach 1000 Werten des Videos: nur 33 Prozent Überlappung, auch wenn die Stelle stimmt
    expect(findeVersatzAusHuellkurven(video, basis.slice(0, 2000))).toBeUndefined();
    // knapp 90 Prozent: erlaubt
    expect(findeVersatzAusHuellkurven(video, basis.slice(1000, 3700))!.ueberlappung).toBeGreaterThanOrEqual(0.8);
  });

  it("wird bei einem Muster, das sich wiederholt, unsicher, weil es mehr als einen guten Versatz gibt", () => {
    const einmal = sprache(600, 5);
    const periodisch = new Float64Array(4200);
    for (let i = 0; i < periodisch.length; i++) periodisch[i] = einmal[i % 600]!;
    const r = findeVersatzAusHuellkurven(periodisch.slice(0, 1500), periodisch)!;
    expect(r.sicherheit).toBe("niedrig");
  });

  it("gibt bei zu kurzem Ton nichts zurück", () => {
    expect(findeVersatzAusHuellkurven(new Float64Array(100), basis)).toBeUndefined();
    expect(findeVersatzAusHuellkurven(basis, new Float64Array(0))).toBeUndefined();
  });
});

describe("huellkurve", () => {
  it("bildet 100 Werte je Sekunde, zieht den Mittelwert ab und folgt der Lautstärke", () => {
    // 2 s Stille, 2 s laut, bei 8 kHz
    const s = new Int16Array(8000 * 4);
    for (let i = 16000; i < 32000; i++) s[i] = Math.round(8000 * Math.sin(i / 3));
    const h = huellkurve(s);
    expect(h).toHaveLength(400);
    expect(h.reduce((a, b) => a + b, 0) / h.length).toBeCloseTo(0, 6);
    expect(h[300]!).toBeGreaterThan(h[100]! + 5);
  });
});

describe("paareTon", () => {
  const v = (versatz: number, wert: number): Versatz => ({ versatz, wert, sicherheit: wert >= 0.75 ? "hoch" : wert >= 0.55 ? "mittel" : "niedrig", ueberlappung: 1 });

  it("nimmt je Video die beste Aufnahme, wenn sie sicher genug ist", async () => {
    const tabelle: Record<string, Record<string, Versatz | undefined>> = {
      "a.mp4": { "x.wav": v(3, 0.95), "y.wav": v(9, 0.2) },
      "b.mp4": { "x.wav": v(1, 0.3), "y.wav": v(-2, 0.9) },
    };
    const r = await paareTon(["a.mp4", "b.mp4"], ["x.wav", "y.wav"], async (vi, t) => tabelle[vi]![t]);
    expect(r.paare.map((p) => [p.video, p.ton, p.versatz.versatz])).toEqual([["a.mp4", "x.wav", 3], ["b.mp4", "y.wav", -2]]);
    expect(r.unsicher).toEqual([]);
  });

  it("meldet einen unsicheren Treffer und benutzt ihn nicht", async () => {
    const r = await paareTon(["a.mp4"], ["x.wav"], async () => v(3, 0.3));
    expect(r.paare).toEqual([]);
    expect(r.unsicher[0]).toMatchObject({ video: "a.mp4", ton: "x.wav" });
  });

  it("meldet Videos, zu denen sich nichts messen liess (zum Beispiel ohne Kameraton)", async () => {
    const r = await paareTon(["a.mp4"], ["x.wav"], async () => undefined);
    expect(r.ohneTreffer).toEqual(["a.mp4"]);
    expect(r.paare).toEqual([]);
  });

  it("eine Aufnahme darf zu mehreren Videos passen", async () => {
    const r = await paareTon(["a.mp4", "b.mp4"], ["x.wav"], async (vi) => v(vi === "a.mp4" ? 3 : 63, 0.9));
    expect(r.paare.map((p) => p.ton)).toEqual(["x.wav", "x.wav"]);
  });
});

describe("listeTonDateien", () => {
  it("nimmt Tonformate, sortiert natürlich und überspringt Versteckte, Videos und Ordner", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ton-"));
    try {
      for (const n of ["ZOOM10.WAV", "ZOOM2.wav", "a.m4a", ".versteckt.wav", "._x.wav", "clip.mp4", "notiz.txt"]) fs.writeFileSync(path.join(dir, n), "x");
      fs.mkdirSync(path.join(dir, "ordner.wav"));
      expect(listeTonDateien(dir)).toEqual(["a.m4a", "ZOOM2.wav", "ZOOM10.WAV"]);
      expect(listeTonDateien(path.join(dir, "gibt-es-nicht"))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hatFfmpeg)("mit echten Dateien (ffmpeg)", () => {
  /** Ein «Sprach»signal: Rauschen, das nach zwei unregelmässigen Mustern ein- und ausgeblendet wird. */
  const baue = (dir: string) => {
    const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
    const w = path.join(dir, "welt.wav");
    ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*(between(mod(t,2.3),0,0.7)+between(mod(t,3.7),1,1.6)+0.2*between(mod(t,5.9),2,3))':s=16000:d=40", w);
    return { ff, w };
  };

  it("findet den Versatz zwischen Kameraton und Recorder (Recorder 5 s früher), auch mit anderem Klang und Pegel", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ton-"));
    try {
      const { ff, w } = baue(dir);
      // Kamera: Welt ab 0 s, tiefpassgefiltert und leiser, als Video mit Bild
      ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=30", "-i", w, "-t", "30", "-af", "lowpass=f=2500,volume=0.3", "-shortest", path.join(dir, "kamera.mp4"));
      // Recorder: 5 s Vorlauf (Stille), dann dasselbe
      ff("-i", w, "-af", "adelay=5000|5000,volume=1.5", "-t", "36", path.join(dir, "recorder.wav"));
      const r = (await findeVersatz(path.join(dir, "kamera.mp4"), path.join(dir, "recorder.wav")))!;
      expect(r.versatz).toBeCloseTo(5, 1);
      expect(r.sicherheit).not.toBe("niedrig");
      // Recorder startet 3 s später: Versatz -3
      ff("-i", w, "-af", "atrim=start=3,asetpts=PTS-STARTPTS", path.join(dir, "spaeter.wav"));
      const s = (await findeVersatz(path.join(dir, "kamera.mp4"), path.join(dir, "spaeter.wav")))!;
      expect(s.versatz).toBeCloseTo(-3, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("findet bei einer fremden Aufnahme keinen sicheren Treffer; ein Video ohne Ton ergibt nichts", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ton-"));
    try {
      const { ff, w } = baue(dir);
      ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=30", "-i", w, "-t", "30", "-shortest", path.join(dir, "kamera.mp4"));
      ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*(between(mod(t,1.9),0,0.4)+between(mod(t,4.3),2,3.3))':s=16000:d=40", path.join(dir, "fremd.wav"));
      const r = await findeVersatz(path.join(dir, "kamera.mp4"), path.join(dir, "fremd.wav"));
      expect(r?.sicherheit).toBe("niedrig");
      ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=10", path.join(dir, "stumm.mp4"));
      expect(await dekodiereMono(path.join(dir, "stumm.mp4"))).toHaveLength(0);
      expect(await findeVersatz(path.join(dir, "stumm.mp4"), path.join(dir, "fremd.wav"))).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("fensterArgs", () => {
  it("schneidet bei positivem Versatz ab dort, ohne Verzögerung, genau so lang wie das Video, Mono und 16 kHz", () => {
    const a = fensterArgs("/t/aufnahme.wav", 5.5, 12, "/t/fenster.wav");
    expect(a.join(" ")).toBe("-y -v error -ss 5.5 -i /t/aufnahme.wav -t 12 -ac 1 -ar 16000 /t/fenster.wav");
  });

  it("legt bei negativem Versatz Stille davor (die Aufnahme beginnt erst nach dem Video), statt vor dem Beginn zu schneiden", () => {
    const a = fensterArgs("/t/aufnahme.wav", -2.25, 12, "/t/fenster.wav");
    expect(a.join(" ")).toBe("-y -v error -ss 0 -i /t/aufnahme.wav -af adelay=2250:all=1 -t 12 -ac 1 -ar 16000 /t/fenster.wav");
  });
});

describe.skipIf(!hatFfmpeg)("Tonfenster und Messer mit echten Dateien", () => {
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
  /** 12 s Aufnahme: Stille, nur von 7,0 bis 7,5 s ein Piepton. */
  const aufnahme = (dir: string) => {
    const w = path.join(dir, "aufnahme.wav");
    ff("-f", "lavfi", "-i", "aevalsrc=if(between(t\\,7\\,7.5)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=12", "-ac", "1", w);
    return w;
  };

  it("das Fenster beginnt beim Video: Der Piepton der Aufnahme bei 7,0 s liegt bei Versatz 5,5 bei 1,5 s des Fensters", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fenster-"));
    try {
      const ziel = path.join(dir, "fenster.wav");
      await schneideTonFenster(aufnahme(dir), 5.5, 4, ziel);
      const still = await findeStille(ziel, { dauer: 4 });
      // Stille von Anfang bis zum Piepton und danach bis zum Ende, jeweils mit Spielraum von 0,1 s
      expect(still).toHaveLength(2);
      expect(still[0]!.von).toBeLessThan(0.1);
      expect(still[0]!.bis).toBeGreaterThan(1.4);
      expect(still[0]!.bis).toBeLessThan(1.6);
      expect(still[1]!.von).toBeGreaterThan(1.9);
      expect(still[1]!.von).toBeLessThan(2.1);
      const probe = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", ziel]).stdout.toString());
      expect(probe.streams[0].sample_rate).toBe("16000");
      expect(probe.streams[0].channels).toBe(1);
      expect(Number(probe.streams[0].duration)).toBeCloseTo(4, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("bei negativem Versatz steht vorn Stille: Der Piepton bei 7,0 s der Aufnahme liegt bei Versatz −2 bei 9,0 s des Videos", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fenster-"));
    try {
      const ziel = path.join(dir, "fenster.wav");
      await schneideTonFenster(aufnahme(dir), -2, 12, ziel);
      const still = await findeStille(ziel, { dauer: 12 });
      expect(still[0]!.von).toBeLessThan(0.1);
      expect(still[0]!.bis).toBeGreaterThan(8.9);
      expect(still[0]!.bis).toBeLessThan(9.1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("der Messer mit Gedächtnis dekodiert jede Datei nur einmal und liefert dasselbe wie findeVersatz", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-messer-"));
    try {
      const w = path.join(dir, "welt.wav");
      ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*(between(mod(t,2.3),0,0.7)+between(mod(t,3.7),1,1.6)+0.2*between(mod(t,5.9),2,3))':s=16000:d=40", w);
      ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=30", "-i", w, "-t", "30", "-shortest", path.join(dir, "kamera.mp4"));
      ff("-i", w, "-af", "adelay=4000|4000", "-t", "36", path.join(dir, "recorder.wav"));
      const messe = messerMitCache();
      const a = (await messe(path.join(dir, "kamera.mp4"), path.join(dir, "recorder.wav")))!;
      const b = (await messe(path.join(dir, "kamera.mp4"), path.join(dir, "recorder.wav")))!;
      expect(a).toEqual(b);
      expect(a.versatz).toBeCloseTo(4, 1);
      // Lösche die Dateien: Die zweite Messung kommt aus dem Gedächtnis und braucht sie nicht mehr
      fs.rmSync(path.join(dir, "kamera.mp4"));
      fs.rmSync(path.join(dir, "recorder.wav"));
      expect(await messe(path.join(dir, "kamera.mp4"), path.join(dir, "recorder.wav"))).toEqual(a);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
