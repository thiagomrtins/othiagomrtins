// Validação de tudo que vem do navegador ou do TikTok. Sem dependências, para testar fácil.

export const QUERY_MIN = 2;
export const QUERY_MAX = 80;

// Limpa um texto digitado: tira caracteres de controle e invisíveis, junta espaços.
// Devolve null se sobrar menos de 2 ou mais de 80 caracteres.
export function cleanText(raw: unknown, max = QUERY_MAX): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .normalize("NFC")
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length >= QUERY_MIN && s.length <= max ? s : null;
}

// "a|b|c" vindo da URL -> lista limpa, sem repetidas, com no máximo `max` itens.
export function parseBranches(raw: string | null, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split("|")) {
    const s = cleanText(part);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Só aceitamos link de vídeo do próprio TikTok, em https.
const TIKTOK_VIDEO = /^https:\/\/(www\.)?tiktok\.com\/@[\w.\-]{1,64}\/video\/\d{5,25}$/;
export function isTikTokVideoUrl(url: unknown): url is string {
  return typeof url === "string" && url.length <= 200 && TIKTOK_VIDEO.test(url);
}

// Link de imagem: só https. (A tela ainda restringe os domínios pela política de segurança.)
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 2000) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Número inteiro positivo vindo de variável de ambiente, com padrão seguro.
export function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
