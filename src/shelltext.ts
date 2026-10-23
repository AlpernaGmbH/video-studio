/** Ein Text als ein Wort für die Shell: in Hochkommas, ein Hochkomma darin wird zu '\''. Angaben aus dem Tool (Ordner, Namen) gehören nie ungeschützt in eine Befehlszeile. */
export const shellText = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
