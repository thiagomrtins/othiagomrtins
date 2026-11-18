import type { Language, TopComment, VideoCard } from "./types";

const ACTOR = "clockworks~tiktok-scraper";
const API = "https://api.apify.com/v2";

export const VIDEOS_TO_SHOW = 8;
export const COMMENTS_TO_SHOW = 5;
// Vídeos pedidos por ramificação em português. Só cerca de metade vem em português,
// então 5 ramificações x 6 vídeos costumam render bem mais que os 8 necessários.
const PER_BRANCH_PT = 6;
// Comentários buscados por vídeo, só quando a pessoa abre. Cada um custa ~US$ 0,00125.
const COMMENTS_TO_FETCH = 10;

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
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    // Nunca devolvemos o corpo da resposta: pode conter dados sensíveis.
    throw new Error(`Apify respondeu ${res.status}`);
  }
  return (await res.json()) as T;
}

function runActor(token: string, input: unknown): Promise<RawVideo[]> {
  // O token vai no cabeçalho, não na URL.
  return fetchJson<RawVideo[]>(
    `${API}/acts/${ACTOR}/run-sync-get-dataset-items?format=json&clean=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

export async function searchViralVideos(
  queries: string[],
  language: Language,
  token: string,
): Promise<VideoCard[]> {
  const pt = language === "pt";
  const items = await runActor(token, {
    searchQueries: queries,
    searchSection: "/video",
    videoSearchSorting: "MOST_LIKED",
    resultsPerPage: pt ? PER_BRANCH_PT : VIDEOS_TO_SHOW,
    commentsPerPost: 0, // comentários só sob demanda (veja fetchTopComments)
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });

  const unique = new Map<string, RawVideo>();
  for (const v of items) {
    if (!v.id || !v.webVideoUrl || unique.has(v.id)) continue;
    if (pt && v.textLanguage !== "pt") continue;
    unique.set(v.id, v);
  }

  return [...unique.values()]
    .sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0))
    .slice(0, VIDEOS_TO_SHOW)
    .map((v) => ({
      id: v.id as string,
      url: v.webVideoUrl as string,
      cover: v.videoMeta?.coverUrl ?? v.videoMeta?.originalCoverUrl ?? null,
      likes: v.diggCount ?? 0,
      views: v.playCount ?? 0,
      caption: v.text ?? "",
      author: v.authorMeta?.name ?? "",
      language: v.textLanguage ?? null,
    }));
}

// Busca os comentários de UM vídeo. Custa cerca de US$ 0,017, por isso só roda quando a pessoa pede.
export async function fetchTopComments(videoUrl: string, token: string): Promise<TopComment[]> {
  const items = await runActor(token, {
    postURLs: [videoUrl],
    resultsPerPage: 1,
    commentsPerPost: COMMENTS_TO_FETCH,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  const datasetUrl = items[0]?.commentsDatasetUrl;
  if (!datasetUrl) return [];

  const url = new URL(datasetUrl);
  // Só aceitamos o próprio Apify, para o token nunca ir parar em outro host.
  if (url.hostname !== "api.apify.com") return [];
  url.searchParams.set("format", "json");
  url.searchParams.set("clean", "true");
  const raw = await fetchJson<RawComment[]>(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return raw
    .filter((c) => typeof c.text === "string" && c.text.length > 0)
    .sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0))
    .slice(0, COMMENTS_TO_SHOW)
    .map((c) => ({ text: c.text as string, likes: c.diggCount ?? 0, author: c.uniqueId ?? "" }));
}
