import type { SearchPhrase } from "./types";

export interface RawSuggestion {
  suggestion?: string;
  seedKeyword?: string;
  rank?: number;
  tiktokRank?: number;
}

// Sem acento, minúsculo e sem espaços: "Skin Care" e "skincare" viram a mesma coisa.
const squash = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Pontos de partida do autocomplete. É a partir deles que o TikTok completa a frase.
export function suggestionSeeds(subject: string): string[] {
  const q = subject.trim();
  return [`como fazer ${q}`, `como funciona ${q}`, q];
}

// Mantém só frases que falam do assunto, tira repetidas e ordena pela posição que o TikTok deu.
// Não existe volume de busca nesses dados: a ordem é a do TikTok, e não uma contagem.
export function rankSuggestions(
  rows: RawSuggestion[],
  subject: string,
  seeds: string[],
  limit = 10,
): SearchPhrase[] {
  const words = subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  const needles = words.length > 0 ? words : [squash(subject)];
  const subjectKey = squash(subject);
  const seedKeys = new Set([...seeds.map(squash), `${subjectKey}s`]);
  const seedOrder = new Map(seeds.map((s, i) => [s.toLowerCase(), i]));

  const items = rows
    .map((r) => ({
      text: (r.suggestion ?? "").trim().replace(/\s+/g, " "),
      seed: r.seedKeyword ?? "",
      rank: r.rank ?? r.tiktokRank ?? 99,
    }))
    .filter((r) => {
      if (r.text.length < 4 || r.text.length > 80) return false;
      const key = squash(r.text);
      // Repetir o próprio ponto de partida não acrescenta nada.
      if (seedKeys.has(key)) return false;
      return needles.some((n) => key.includes(n));
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (seedOrder.get(a.seed.toLowerCase()) ?? 9) - (seedOrder.get(b.seed.toLowerCase()) ?? 9),
    );

  const seen = new Set<string>();
  const out: SearchPhrase[] = [];
  for (const it of items) {
    const key = squash(it.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ phrase: it.text, seed: it.seed });
    if (out.length >= limit) break;
  }
  return out;
}
