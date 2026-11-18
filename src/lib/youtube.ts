// Tudo sobre os vídeos do YouTube que não depende do Next.js, para testar fácil.
// Links e capas NUNCA vêm do que a API devolve: montamos a partir do id do vídeo (11 caracteres
// de letras, números, "_" e "-"), então nada estranho chega à tela.
import type { Language, YoutubeVideo } from "./types";

export const YOUTUBE_LIMIT = 10;
const ID_RE = /^[\w-]{11}$/;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// A busca do YouTube devolve títulos com entidades HTML (&amp;, &#39;). A tela escapa o texto
// sozinha, então aqui só desfazemos a codificação para o título aparecer certo.
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED[e.toLowerCase()] ?? match;
  });
}

export function toYoutubeVideo(v: {
  id: unknown;
  title: unknown;
  channel: unknown;
  views: unknown;
}): YoutubeVideo | null {
  if (typeof v.id !== "string" || !ID_RE.test(v.id)) return null;
  if (typeof v.title !== "string") return null;
  const title = decodeEntities(v.title).replace(/\s+/g, " ").trim().slice(0, 150);
  if (!title) return null;
  const channel =
    typeof v.channel === "string" ? decodeEntities(v.channel).replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const n = Number(v.views);
  return {
    id: v.id,
    title,
    channel,
    views: Number.isFinite(n) && n >= 0 ? Math.floor(n) : null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  };
}

// Do mais visto para o menos visto, sem repetidos, no máximo YOUTUBE_LIMIT.
export function rankByViews(list: (YoutubeVideo | null)[]): YoutubeVideo[] {
  const seen = new Set<string>();
  const out: YoutubeVideo[] = [];
  for (const v of list) {
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out.sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, YOUTUBE_LIMIT);
}

// Resultado do Actor streamers/youtube-scraper (campos conferidos em uma execução real).
export function parseApifyYoutube(items: unknown[]): YoutubeVideo[] {
  return rankByViews(
    items.map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      if (it.type !== undefined && it.type !== "video") return null;
      return toYoutubeVideo({ id: it.id, title: it.title, channel: it.channelName, views: it.viewCount });
    }),
  );
}

interface YtError {
  error?: { errors?: { reason?: string }[] };
}

async function ytGet<T>(url: URL, key: string, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(url, {
    // A chave vai no cabeçalho, e não na URL, para não aparecer em registros.
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    let reason = "";
    try {
      const body = (await res.json()) as YtError;
      reason = String(body?.error?.errors?.[0]?.reason ?? "").replace(/[^A-Za-z]/g, "").slice(0, 40);
    } catch {
      // sem corpo legível
    }
    throw new Error(`YouTube respondeu ${res.status}${reason ? ` (${reason})` : ""}`);
  }
  return (await res.json()) as T;
}

// API oficial (YouTube Data API v3). Aceita país e idioma, o que o Actor do Apify não aceita.
// Custo de cota: search.list = 100 unidades, videos.list = 1 (cota grátis diária: 10.000).
export async function fetchOfficialYoutube(
  query: string,
  language: Language,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<YoutubeVideo[]> {
  const search = new URL("https://www.googleapis.com/youtube/v3/search");
  search.searchParams.set("part", "snippet");
  search.searchParams.set("type", "video");
  search.searchParams.set("order", "viewCount");
  search.searchParams.set("maxResults", String(YOUTUBE_LIMIT));
  search.searchParams.set("safeSearch", "moderate");
  search.searchParams.set("q", query);
  if (language === "pt") {
    search.searchParams.set("regionCode", "BR");
    search.searchParams.set("relevanceLanguage", "pt");
  }
  const found = await ytGet<{ items?: { id?: { videoId?: string } }[] }>(search, apiKey, fetchFn);
  const ids = (found.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => typeof id === "string" && ID_RE.test(id));
  if (ids.length === 0) return [];

  // Segunda chamada (1 unidade): números reais de visualizações, para ordenar direito.
  const details = new URL("https://www.googleapis.com/youtube/v3/videos");
  details.searchParams.set("part", "snippet,statistics");
  details.searchParams.set("id", ids.join(","));
  details.searchParams.set("maxResults", String(YOUTUBE_LIMIT));
  const data = await ytGet<{
    items?: {
      id?: string;
      snippet?: { title?: string; channelTitle?: string };
      statistics?: { viewCount?: string };
    }[];
  }>(details, apiKey, fetchFn);

  return rankByViews(
    (data.items ?? []).map((i) =>
      toYoutubeVideo({
        id: i.id,
        title: i.snippet?.title,
        channel: i.snippet?.channelTitle,
        views: i.statistics?.viewCount,
      }),
    ),
  );
}
