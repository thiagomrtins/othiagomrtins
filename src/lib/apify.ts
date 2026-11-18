import { rankSuggestions, suggestionSeeds, type RawSuggestion } from "./searches";
import { buildTrending, GENERIC_TAGS, toHashtag } from "./trends";
import type { Language, SearchPhrase, TopComment, Trending, VideoCard } from "./types";

const ACTOR = "clockworks~tiktok-scraper";
const SUGGEST_ACTOR = "memo23~tiktok-suggestions-scraper";
const API = "https://api.apify.com/v2";

export const VIDEOS_TO_SHOW = 8;
export const COMMENTS_TO_SHOW = 5;
// Vídeos pedidos por frase ou hashtag. Com o IP do Brasil, ~90% vêm em português.
const PER_BRANCH = 8;
// O TikTok decide o idioma pelo IP de quem busca, não por parâmetro. Este país vai no proxy.
const PT_PROXY = "BR";
// Hashtags novas tiradas dos vídeos em português, se a primeira rodada não bastar.
const SNOWBALL_TAGS = 3;
// Comentários buscados por vídeo, só quando a pessoa abre. Cada um custa ~US$ 0,00125.
const COMMENTS_TO_FETCH = 10;
// Tempo máximo de uma execução. Passou disso, abortamos para o custo não escapar.
const MAX_WAIT_MS = 240_000;

interface RawVideo {
  id?: string;
  text?: string;
  textLanguage?: string;
  diggCount?: number;
  playCount?: number;
  webVideoUrl?: string;
  videoMeta?: { coverUrl?: string; originalCoverUrl?: string };
  authorMeta?: { name?: string };
  hashtags?: { name?: string }[];
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Inicia a execução, espera até MAX_WAIT_MS e, se estourar, aborta (para parar de cobrar).
async function runActorRaw<T>(token: string, actor: string, input: unknown): Promise<T[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const started = await fetchJson<{ data: { id: string; defaultDatasetId: string } }>(
    `${API}/acts/${actor}/runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(input),
    },
  );
  const { id, defaultDatasetId } = started.data;

  const deadline = Date.now() + MAX_WAIT_MS;
  let status = "RUNNING";
  while (Date.now() < deadline) {
    const run = await fetchJson<{ data: { status: string } }>(`${API}/actor-runs/${id}`, {
      headers: auth,
    });
    status = run.data.status;
    if (status !== "READY" && status !== "RUNNING") break;
    await sleep(4000);
  }
  if (status === "READY" || status === "RUNNING") {
    await fetch(`${API}/actor-runs/${id}/abort`, { method: "POST", headers: auth }).catch(() => {});
    throw new Error("Tempo esgotado");
  }
  if (status !== "SUCCEEDED") throw new Error(`Execução terminou como ${status}`);

  return fetchJson<T[]>(
    `${API}/datasets/${defaultDatasetId}/items?format=json&clean=true&limit=200`,
    { headers: auth },
  );
}

const runActor = (token: string, input: unknown) => runActorRaw<RawVideo>(token, ACTOR, input);

// Frases que o TikTok sugere quando alguém digita na busca (autocomplete), no Brasil.
// O TikTok decide pelo IP, então usamos o grupo de proxy RESIDENCIAL com país BR
// (o grupo padrão da conta gratuita só tem IPs dos EUA e dá erro).
export async function fetchSearchPhrases(subject: string, token: string): Promise<SearchPhrase[]> {
  const seeds = suggestionSeeds(subject);
  const rows = await runActorRaw<RawSuggestion>(token, SUGGEST_ACTOR, {
    keywords: seeds,
    regions: ["BR"],
    languages: ["pt"],
    maxSuggestionsPerKeyword: 6,
    includeMetadata: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "BR" },
  });
  return rankSuggestions(rows, subject, seeds);
}

const BASE_INPUT = {
  commentsPerPost: 0, // comentários só sob demanda (veja fetchTopComments)
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
};

// Remove repetidos, mantém só português quando pedido, e ordena por curtidas.
function pick(items: RawVideo[], onlyPt: boolean): RawVideo[] {
  const unique = new Map<string, RawVideo>();
  for (const v of items) {
    if (!v.id || !v.webVideoUrl || unique.has(v.id)) continue;
    if (onlyPt && v.textLanguage !== "pt") continue;
    unique.set(v.id, v);
  }
  return [...unique.values()].sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0));
}

function topNewHashtags(videos: RawVideo[], used: Set<string>): string[] {
  const count = new Map<string, number>();
  for (const v of videos) {
    for (const h of v.hashtags ?? []) {
      const t = toHashtag(h.name ?? "");
      if (t.length < 3 || GENERIC_TAGS.has(t) || used.has(t)) continue;
      count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SNOWBALL_TAGS)
    .map(([t]) => t);
}

function toCard(v: RawVideo): VideoCard {
  return {
    id: v.id as string,
    url: v.webVideoUrl as string,
    cover: v.videoMeta?.coverUrl ?? v.videoMeta?.originalCoverUrl ?? null,
    likes: v.diggCount ?? 0,
    views: v.playCount ?? 0,
    caption: v.text ?? "",
    author: v.authorMeta?.name ?? "",
    language: v.textLanguage ?? null,
  };
}

export interface SearchOutput {
  videos: VideoCard[];
  trending: Trending;
}

// Os cards são só os 8 primeiros, mas o ranking usa TODOS os vídeos buscados (mais dados, mesmo custo).
function finish(all: RawVideo[], subject: string): SearchOutput {
  return {
    videos: all.slice(0, VIDEOS_TO_SHOW).map(toCard),
    trending: buildTrending(all, subject.replace(/^#/, "")),
  };
}

// Itens que começam com "#" viram hashtags; os outros viram frases de busca.
export async function searchViralVideos(
  branches: string[],
  language: Language,
  token: string,
): Promise<SearchOutput> {
  if (language !== "pt") {
    const items = await runActor(token, {
      ...BASE_INPUT,
      searchQueries: [branches[0]],
      searchSection: "/video",
      videoSearchSorting: "MOST_LIKED",
      resultsPerPage: VIDEOS_TO_SHOW,
    });
    const all = pick(items, false);
    return finish(all, branches[0]);
  }

  const tags = [...new Set(branches.filter((b) => b.startsWith("#")).map(toHashtag))].filter(
    (t) => t.length >= 2,
  );
  const phrases = branches.filter((b) => !b.startsWith("#"));

  const ptInput = { ...BASE_INPUT, proxyCountryCode: PT_PROXY, resultsPerPage: PER_BRANCH };
  const jobs: Promise<RawVideo[]>[] = [];
  if (phrases.length > 0) {
    // Sem videoSearchSorting: a ordenação "mais curtidos" do TikTok foge da localização
    // (testado: 0 de 12 em português). Ordenamos por curtidas depois, aqui dentro.
    jobs.push(runActor(token, { ...ptInput, searchQueries: phrases, searchSection: "/video" }));
  }
  if (tags.length > 0) {
    jobs.push(runActor(token, { ...ptInput, hashtags: tags }));
  }

  let items = (await Promise.all(jobs)).flat();
  let picked = pick(items, true);

  // Poucos vídeos em português: aprendemos hashtags com os que já achamos e buscamos de novo.
  if (picked.length < VIDEOS_TO_SHOW) {
    const next = topNewHashtags(picked, new Set(tags));
    if (next.length > 0) {
      const more = await runActor(token, { ...ptInput, hashtags: next });
      items = [...items, ...more];
      picked = pick(items, true);
    }
  }
  return finish(picked, branches.find((b) => !b.startsWith("#")) ?? branches[0]);
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
