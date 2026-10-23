# Dd_iThjj32v · «skills für design» · Karussell (7 Bild-Folien) · @ai.theshift · 2'074 Likes
Gespeichert bei Folie 7 (Abbinder «Follow us for AI and tech updates»). Quelle: alle 7 Folien gesehen (2 Folienbögen) plus die volle Beschreibung. **Die genannten GitHub-Repositories habe ich nicht geöffnet** (GitHub ist von dieser Sitzung aus gesperrt, HTTP 403); was sie enthalten, steht hier nur nach den Folien.

**Thema:** «Deine Claude-Code-Animationen sehen noch nach KI aus. Diese fünf freien **Skills** helfen»: Eine Skill ist eine Anleitungsdatei, die Claude vor dem Auftrag liest. Die Beschreibung rät: Skill einfügen, bevor man promptet; Animationsstil und Timing nennen; Szene für Szene verbessern. Newsletter-Werbung (Kommentar «SHIFT»).
**Hook (Folie 1):** schwarzer Grund, ein farbenfroher Zauberer aus Würfeln jongliert mit fünf Symbolen (Linie, Figur, React, Github, Netz), darunter fett «YOUR CLAUDE CODE ANIMATIONS STILL LOOK AI-GENERATED. THESE 5 FREE SKILLS CAN FIX THAT.»
**Die fünf Skills (Namen so, wie sie auf den Folien stehen, mit dem Leistungsversprechen):**
1. **Three.js** (`ClaudeAI-X/Threejs-skills`): interaktive 3D-Szenen, Partikel, Beleuchtung, GLTF-Modelle, Kamerasteuerung.
2. **GSAP** (`greensock/gsap-skills`): offizielle Anleitung des GSAP-Herstellers; Text-Reveal, ScrollTrigger, Zeitleisten.
3. **Design DNA** (`zanwei/design-dna`): bestehende Oberflächen «rückwärts» lesen: Layout, Typografie, Farbpalette.
4. **Motion Design** (`lottiefiles/motion-design-skill`): Lottie, SVG-Animation, Zeitleiste und Keyframes.
5. **Genjutsu** (`AThevon/genjutsu`): «preisgekrönte Oberflächen», Layout, Politur, hochwertige Animation.
**Gestaltung:** schwarz, weisse Grotesk, pro Skill ein Bildschirmfoto der Referenz und fünf Stichpunkte. Konto-Name oben rechts.
**Passt zu Alperna?** **Ja, als Prüfauftrag, nicht als Einbau.** Unsere Motion-Bibliothek nutzt bereits **GSAP lokal** und HyperFrames (Regel 4: keine externen Skripte; der Lint verbietet es). Eine **offizielle GSAP-Skill** könnte die Qualität der von Claude geschriebenen Stücke heben; ob sie existiert und was sie enthält, ist **ungeprüft**. Vorschlag: auf dem Mac ansehen (Lizenz, Inhalt), dann als **lokale Anleitung** in `prompts/` übernehmen oder verwerfen; **keine** direkte Abhängigkeit, keine Skripte von fremden Servern. «Design DNA» (fremde Oberflächen nachbauen) ist für uns nur zum Lesen von Stilen sinnvoll, nicht zum Kopieren.
**Belege:** (1) Folie 1 Titel und Zauberer; (2) Folie 3 «Code 2: GSAP, greensock/gsap-skills» mit der Liste Text Reveal, ScrollTrigger, Timeline; (3) Folie 5 «Code 4: Motion Design, lottiefiles/motion-design-skill».
**Eignung Marketing-System:** Motion-Werkstatt: die Qualität der Stücke hängt an der Anleitung (`prompts/`), nicht nur am Code; nächster Schritt wäre ein kleiner Test «gleiche Aufgabe mit und ohne Skill» (M6, spät).
