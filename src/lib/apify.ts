import type { Language, TopComment, VideoCard } from "./types";

const ACTOR = "clockworks~tiktok-scraper";
const API = "https://api.apify.com/v2";

export const VIDEOS_TO_SHOW = 8;
export const COMMENTS_TO_SHOW = 5;
// Comentários buscados por vídeo. Cada um custa ~US$ 0,00125: quanto maior,
// melhor a chance de achar os mais curtidos, e mais cara a busca.
const COMMENTS_TO_FETCH = 10;
// Em português buscamos um pouco a mais, porque filtramos o idioma depois.
const FETCH_MULTIPLIER_PT = 1.5;

interface RawVideo {
  id?: string;
  text?: string;
  textLanguage?: string;
  diggCount?: number;
  playCount?: number;
  webVideoUrl?: string;
  videoMeta?: { coverUrl?: string; originalCoverUrl?: string };
  authorMeta?: { name?: string };
  commentsDatasetUrl?: string | null;
}

interface RawComment {
  text?: string;
  diggCount?: number;
  uniqueId?: string;
  user?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    // Nunca devolvemos o corpo da resposta: pode conter o token na URL.
    throw new Error(`Apify respondeu ${res.status}`);
  }
  return (await res.json()) as T;
}

async function topComments(
  datasetUrl: string | null | undefined,
  token: string,
): Promise<TopComment[]> {
  if (!datasetUrl) return [];
  try {
    const url = new URL(datasetUrl);
    // Só aceitamos o próprio Apify, para o token nunca ir parar em outro host.
    if (url.hostname !== "api.apify.com") return [];
    url.searchParams.set("token", token);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "true");
    const raw = await fetchJson<RawComment[]>(url.toString());
    return raw
      .filter((c) => typeof c.text === "string" && c.text.length > 0)
      .sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0))
      .slice(0, COMMENTS_TO_SHOW)
      .map((c) => ({
        text: c.text as string,
        likes: c.diggCount ?? 0,
        author: c.uniqueId ?? c.user ?? "",
      }));
  } catch {
    return [];
  }
}

export async function searchViralVideos(
  query: string,
  language: Language,
  token: string,
): Promise<VideoCard[]> {
  const pt = language === "pt";
  const fetchCount = pt
    ? Math.ceil(VIDEOS_TO_SHOW * FETCH_MULTIPLIER_PT)
    : VIDEOS_TO_SHOW;

  const input = {
    searchQueries: [query],
    searchSection: "/video",
    videoSearchSorting: "MOST_LIKED",
    resultsPerPage: fetchCount,
    commentsPerPost: COMMENTS_TO_FETCH,
    proxyCountryCode: pt ? "BR" : "None",
    // Não baixamos vídeo nem capa: só usamos o link da imagem que já vem no resultado.
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  };

  // O token vai no cabeçalho, não na URL.
  const items = await fetchJson<RawVideo[]>(
    `${API}/acts/${ACTOR}/run-sync-get-dataset-items?format=json&clean=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    },
  );

  const filtered = items
    .filter((v) => v.webVideoUrl && v.id)
    .filter((v) => !pt || !v.textLanguage || v.textLanguage === "pt")
    .sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0))
    .slice(0, VIDEOS_TO_SHOW);

  return Promise.all(
    filtered.map(async (v) => ({
      id: v.id as string,
      url: v.webVideoUrl as string,
      cover: v.videoMeta?.coverUrl ?? v.videoMeta?.originalCoverUrl ?? null,
      likes: v.diggCount ?? 0,
      views: v.playCount ?? 0,
      caption: v.text ?? "",
      author: v.authorMeta?.name ?? "",
      language: v.textLanguage ?? null,
      comments: await topComments(v.commentsDatasetUrl, token),
    })),
  );
}
