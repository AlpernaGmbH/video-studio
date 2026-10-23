#!/usr/bin/env python3
"""
Adapter: nimmt die Schalter von openai-whisper und führt faster-whisper aus.

Gedacht für Linux ohne Apple-Silizium (zum Beispiel die Cloud-Sitzung), wo `openai-whisper` mit PyTorch zu schwer wäre.
Auf dem Mac bleibt `./studio whisper einrichten` der Weg. Einrichtung hier:

    python3 -m venv ~/.local/share/video-studio/whisper-faster
    ~/.local/share/video-studio/whisper-faster/bin/pip install faster-whisper
    export STUDIO_WHISPER_BIN=/pfad/zu/scripts/whisper-faster.py   (Python der Umgebung im Shebang oder `python3 scripts/whisper-faster.py`)

Schalter wie bei openai-whisper: <datei> --model M --language L|auto --word_timestamps True --output_format json --output_dir D
Ausgabe: <datei ohne Endung>.json im Format von openai-whisper (text, language, segments mit words).
Das Modell wird beim ersten Lauf geladen; die Aufnahme verlässt den Rechner nicht.
"""
import argparse
import json
import os
import subprocess
import sys


def lade_audio(datei: str):
    """Ton als 16-kHz-Mono-Wellenform über ffmpeg. So hängt der Adapter nicht an der Version von PyAV (faster-whisper 1.2 und neuere PyAV-Versionen vertragen sich nicht immer)."""
    import numpy as np

    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", datei, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg konnte den Ton nicht lesen: " + r.stderr.decode("utf-8", "replace").strip().splitlines()[-1:][0] if r.stderr.strip() else "ffmpeg konnte den Ton nicht lesen")
    return np.frombuffer(r.stdout, dtype=np.float32)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("datei")
    p.add_argument("--model", default="small")
    p.add_argument("--language", default="auto")
    p.add_argument("--word_timestamps", default="True")
    p.add_argument("--output_format", default="json")
    p.add_argument("--output_dir", default=".")
    a = p.parse_args()
    if a.output_format != "json":
        print("Dieser Adapter schreibt nur JSON", file=sys.stderr)
        return 2
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper fehlt: pip install faster-whisper", file=sys.stderr)
        return 3

    modell = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("STUDIO_WHISPER_THREADS", "4")))
    sprache = None if a.language in ("auto", "", None) else a.language
    segmente, info = modell.transcribe(
        lade_audio(a.datei),
        language=sprache,
        word_timestamps=a.word_timestamps.lower() == "true",
        vad_filter=True,
        condition_on_previous_text=False,
    )
    aus = []
    for i, s in enumerate(segmente):
        aus.append(
            {
                "id": i,
                "start": float(s.start),
                "end": float(s.end),
                "text": s.text,
                "words": [{"word": w.word, "start": float(w.start), "end": float(w.end), "probability": float(w.probability)} for w in (s.words or [])],
            }
        )
    os.makedirs(a.output_dir, exist_ok=True)
    ziel = os.path.join(a.output_dir, os.path.splitext(os.path.basename(a.datei))[0] + ".json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump({"text": "".join(s["text"] for s in aus), "language": info.language, "segments": aus}, f, ensure_ascii=False)
    print(f"{info.language} ({info.language_probability:.2f}), {len(aus)} Segmente", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
