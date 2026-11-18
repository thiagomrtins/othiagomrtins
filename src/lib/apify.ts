import "server-only";
import { isTikTokVideoUrl, safeHttpsUrl } from "./sanitize";
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

const REQUEST_TIMEOUT_MS = 30_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Não repassamos o corpo da resposta (pode conter dados sensíveis). Só o "tipo" do erro,
    // limitado a letras minúsculas e hífens, para ajudar a achar o problema nos Logs.
    let type = "";
    try {
      const body = (await res.json()) as { error?: { type?: string } };
      type = String(body?.error?.type ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
    } catch {
      // sem corpo legível
    }
    throw new Error(`Apify respondeu ${res.status}${type ? ` (${type})` : ""}`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RunLimits {
  // Teto de custo desta execução, em dólares. O Apify para o Actor ao chegar nele.
  maxCostUsd: number;
}

async function abortRun(id: string, auth: Record<string, string>) {
  await fetch(`${API}/actor-runs/${id}/abort`, {
    method: "POST",
    headers: auth,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

// Inicia a execução e espera. Se estourar o tempo OU der qualquer erro no meio do caminho,
// aborta a execução, para ela não continuar gastando o seu saldo sem ninguém usar o resultado.
async function runActorRaw<T>(
  token: string,
  actor: string,
  input: unknown,
  { maxCostUsd }: RunLimits,
): Promise<T[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const qs = `maxTotalChargeUsd=${maxCostUsd}&timeout=${Math.ceil(MAX_WAIT_MS / 1000)}`;
  const started = await fetchJson<{ data: { id: string; defaultDatasetId: string } }>(
    `${API}/acts/${actor}/runs?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(input),
    },
  );
  const { id, defaultDatasetId } = started.data;

  try {
    const deadline = Date.now() + MAX_WAIT_MS;
    let status = "RUNNING";
    let wait = 1500;
    while (Date.now() < deadline) {
      const run = await fetchJson<{ data: { status: string } }>(`${API}/actor-runs/${id}`, {
        headers: auth,
      });
      status = run.data.status;
      if (status !== "READY" && status !== "RUNNING") break;
      await sleep(wait);
      wait = Math.min(wait + 500, 4000); // começa rápido e vai espaçando
    }
    if (status === "READY" || status === "RUNNING") throw new Error("Tempo esgotado");
    if (status !== "SUCCEEDED") throw new Error(`Execução terminou como ${status}`);

    return await fetchJson<T[]>(
      `${API}/datasets/${defaultDatasetId}/items?format=json&clean=true&limit=200`,
      { headers: auth },
    );
  } catch (err) {
    await abortRun(id, auth);
    throw err;
  }
}

// Teto de custo por execução. O Apify exige no mínimo US$ 0,50 (testado: valores menores são
// recusados com HTTP 400). Uma execução normal gasta de US$ 0,01 a 0,12, então o teto só
// pega execuções fora do normal.
const RUN_LIMITS: RunLimits = { maxCostUsd: 0.5 };
const VIDEO_RUN_LIMITS = RUN_LIMITS;
const PHRASES_RUN_LIMITS = RUN_LIMITS;
const COMMENTS_RUN_LIMITS = RUN_LIMITS;

const runActor = (token: string, input: unknown, limits: RunLimits = VIDEO_RUN_LIMITS) =>
  runActorRaw<RawVideo>(token, ACTOR, input, limits);

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
  }, PHRASES_RUN_LIMITS);
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
    if (!v.id || !isTikTokVideoUrl(v.webVideoUrl) || unique.has(v.id)) continue;
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
    cover: safeHttpsUrl(v.videoMeta?.coverUrl ?? v.videoMeta?.originalCoverUrl),
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

  // allSettled: se uma das buscas falhar, aproveitamos a outra em vez de jogar tudo fora.
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((r): r is PromiseFulfilledResult<RawVideo[]> => r.status === "fulfilled");
  for (const r of settled) {
    if (r.status === "rejected") {
      console.error("[apify]", r.reason instanceof Error ? r.reason.message : "erro desconhecido");
    }
  }
  if (ok.length === 0) throw new Error("Todas as buscas falharam");
  let items = ok.flatMap((r) => r.value);
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
  }, COMMENTS_RUN_LIMITS);
  const datasetUrl = items[0]?.commentsDatasetUrl;
  if (!datasetUrl) return [];

  let url: URL;
  try {
    url = new URL(datasetUrl);
  } catch {
    return [];
  }
  // Só aceitamos o próprio Apify, em https e na rota de datasets, para o token nunca ir parar em outro lugar.
  if (url.protocol !== "https:" || url.hostname !== "api.apify.com") return [];
  if (!url.pathname.startsWith("/v2/datasets/")) return [];
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
