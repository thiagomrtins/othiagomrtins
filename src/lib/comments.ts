// Normaliza comentários vindos dos dois Actors e fica com os 5 mais curtidos.
// Sem dependências, para testar fácil.
import type { TopComment } from "./types";

export const COMMENTS_TO_SHOW = 5;

type Row = Record<string, unknown>;

function clean(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, 500) : null;
}

function like(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function author(name: unknown): string {
  return typeof name === "string" ? name.replace(/[^\w.\-]/g, "").slice(0, 40) : "";
}

// "rápido" = apidojo/tiktok-comments-scraper (likeCount, user.username)
// "padrão" = clockworks/tiktok-comments-scraper (diggCount, uniqueId)
export function topComments(rows: unknown[], kind: "fast" | "standard"): TopComment[] {
  const out: TopComment[] = [];
  for (const raw of rows) {
    const r = (raw ?? {}) as Row;
    const text = clean(r.text);
    if (!text) continue;
    if (kind === "fast") {
      const user = (r.user ?? {}) as Row;
      out.push({ text, likes: like(r.likeCount), author: author(user.username) });
    } else {
      out.push({ text, likes: like(r.diggCount), author: author(r.uniqueId) });
    }
  }
  return out.sort((a, b) => b.likes - a.likes).slice(0, COMMENTS_TO_SHOW);
}
