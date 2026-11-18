import "server-only";
import { topComments } from "./comments";
import { raceWithGrace, sleep } from "./concurrency";
import { isTikTokVideoUrl, safeHttpsUrl } from "./sanitize";
import { parseApifyYoutube, YOUTUBE_LIMIT } from "./youtube";
import { rankSuggestions, suggestionSeeds, type RawSuggestion } from "./searches";
import { buildTrending, GENERIC_TAGS, toHashtag } from "./trends";
import type { Language, SearchPhrase, TopComment, Trending, VideoCard, YoutubeVideo } from "./types";

const ACTOR = "clockworks~tiktok-scraper";
const SUGGEST_ACTOR = "memo23~tiktok-suggestions-scraper";
// YouTube: o rápido leva ~5 s e custa ~US$ 0,01 (10 vídeos); o de reserva leva 18 a 50 s e custa ~US$ 0,04.
const YOUTUBE_FAST_ACTOR = "grow_media~youtube-search-api";
const YOUTUBE_ACTOR = "streamers~youtube-scraper";
// Comentários: o rápido leva ~3 s e custa US$ 0,0003 por comentário; o padrão leva ~28 s e US$ 0,00125.
const COMMENTS_FAST_ACTOR = "apidojo~tiktok-comments-scraper";
const COMMENTS_STD_ACTOR = "clockworks~tiktok-comments-scraper";
const API = "https://api.apify.com/v2";

// Abaixo disto, a busca faz uma segunda rodada automática para tentar completar.
export const VIDEOS_TO_SHOW = 8;
// Teto de cards na tela. A tela mostra TODOS os vídeos que a chamada já trouxe (já pagos),
// em ordem de curtidas, até este limite.
export const MAX_VIDEOS_SHOWN = 40;
// Vídeos pedidos por frase ou hashtag. Com o IP do Brasil, ~90% vêm em português.
const PER_BRANCH = 8;
// O TikTok decide o idioma pelo IP de quem busca, não por parâmetro. Este país vai no proxy.
const PT_PROXY = "BR";
// Hashtags novas tiradas dos vídeos em português, se a primeira rodada não bastar.
const SNOWBALL_TAGS = 3;
// Depois que a PRIMEIRA execução de vídeos termina, as outras têm este tempo para acabar.
// Medido: um bloqueio do TikTok seguido de nova tentativa leva ~17 s em vez de ~9 s.
const STRAGGLER_GRACE_MS = 10_000;

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

interface RunLimits {
  // Teto de custo desta execução, em dólares. O Apify para o Actor ao chegar nele.
  maxCostUsd: number;
  // Tempo máximo de espera; passou disso, a execução é abortada.
  maxWaitMs: number;
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
  { maxCostUsd, maxWaitMs }: RunLimits,
  signal?: AbortSignal,
): Promise<T[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const qs = `maxTotalChargeUsd=${maxCostUsd}&timeout=${Math.ceil(maxWaitMs / 1000)}`;
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
    const deadline = Date.now() + maxWaitMs;
    let status = "RUNNING";
    let wait = 1000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Cancelado");
      const run = await fetchJson<{ data: { status: string } }>(`${API}/actor-runs/${id}`, {
        headers: auth,
      });
      status = run.data.status;
      if (status !== "READY" && status !== "RUNNING") break;
      await sleep(wait, signal);
      wait = Math.min(wait + 500, 3000); // começa rápido e vai espaçando
    }
    if (status === "READY" || status === "RUNNING") throw new Error("Tempo esgotado");
    if (status !== "SUCCEEDED") throw new Error(`Execução terminou como ${status}`);

    return await fetchJson<T[]>(
      `${API}/datasets/${defaultDatasetId}/items?format=json&clean=true&limit=200`,
      { headers: auth },
    );
  } catch (err) {
    await abortRun(id, auth);
    // Cancelada ou sem tempo: o que a execução já tinha produzido foi cobrado, então aproveitamos.
    const cut = err instanceof Error && (err.message === "Cancelado" || err.message === "Tempo esgotado");
    if (cut) {
      try {
        const partial = await fetchJson<T[]>(
          `${API}/datasets/${defaultDatasetId}/items?format=json&clean=true&limit=200`,
          { headers: auth },
        );
        if (partial.length > 0) return partial;
      } catch {
        // sem resultado parcial
      }
    }
    throw err;
  }
}

// Teto de custo por execução. O Apify exige no mínimo US$ 0,50 (testado: valores menores são
// recusados com HTTP 400). Uma execução normal gasta de US$ 0,01 a 0,12, então o teto só
// pega execuções fora do normal.
const MAX_COST_USD = 0.5;
// Tempos máximos de espera (medidos: vídeos 15 a 64 s, frases 8 a 12 s, comentários ~30 s).
const VIDEO_RUN_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 100_000 };
const PHRASES_RUN_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 40_000 };
const COMMENTS_FAST_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 30_000 };
const COMMENTS_STD_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 90_000 };
const YOUTUBE_FAST_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 30_000 };
const YOUTUBE_RUN_LIMITS: RunLimits = { maxCostUsd: MAX_COST_USD, maxWaitMs: 90_000 };

const runActor = (
  token: string,
  input: unknown,
  limits: RunLimits = VIDEO_RUN_LIMITS,
  signal?: AbortSignal,
) => runActorRaw<RawVideo>(token, ACTOR, input, limits, signal);

// Frases que o TikTok sugere quando alguém digita na busca (autocomplete), no Brasil.
// O TikTok decide pelo IP, então usamos o grupo de proxy RESIDENCIAL com país BR
// (o grupo padrão da conta gratuita só tem IPs dos EUA e dá erro).
export async function fetchSearchPhrases(
  subject: string,
  token: string,
  signal?: AbortSignal,
): Promise<SearchPhrase[]> {
  const seeds = suggestionSeeds(subject);
  const rows = await runActorRaw<RawSuggestion>(token, SUGGEST_ACTOR, {
    keywords: seeds,
    regions: ["BR"],
    languages: ["pt"],
    maxSuggestionsPerKeyword: 6,
    includeMetadata: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "BR" },
  }, PHRASES_RUN_LIMITS, signal);
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

// Os cards mostram todos os vídeos encontrados (até MAX_VIDEOS_SHOWN), e o ranking usa os mesmos.
function finish(all: RawVideo[], subject: string): SearchOutput {
  return {
    videos: all.slice(0, MAX_VIDEOS_SHOWN).map(toCard),
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

  // Uma execução por frase, todas ao mesmo tempo (uma execução com várias frases processa uma
  // depois da outra e fica lenta). Quando a primeira termina, as outras têm poucos segundos para
  // acabar; a que travar é abortada e usamos o que já chegou. Custo extra: US$ 0,001 por execução.
  // Sem videoSearchSorting: a ordenação "mais curtidos" do TikTok foge da localização
  // (testado: 0 de 12 em português). Ordenamos por curtidas depois, aqui dentro.
  const jobs: ((signal: AbortSignal) => Promise<RawVideo[]>)[] = phrases.map(
    (phrase) => (signal) =>
      runActor(token, { ...ptInput, searchQueries: [phrase], searchSection: "/video" }, VIDEO_RUN_LIMITS, signal),
  );
  if (tags.length > 0) {
    jobs.push((signal) => runActor(token, { ...ptInput, hashtags: tags }, VIDEO_RUN_LIMITS, signal));
  }

  const results = await raceWithGrace(jobs, STRAGGLER_GRACE_MS, (err) =>
    console.error("[apify]", err instanceof Error ? err.message : "erro desconhecido"),
  );
  if (results.length === 0) throw new Error("Todas as buscas falharam");
  let items = results.flat();
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

// Busca os comentários de UM vídeo e devolve os 5 mais curtidos. Só roda quando a pessoa pede.
// Tenta primeiro o Actor rápido (~3 s, ~US$ 0,003); se falhar ou vier vazio, usa o padrão (~28 s).
// Pedimos 30 para ter mais chance de pegar os mais curtidos de verdade (o Actor pode devolver menos).
export async function fetchTopComments(videoUrl: string, token: string): Promise<TopComment[]> {
  try {
    const rows = await runActorRaw<unknown>(
      token,
      COMMENTS_FAST_ACTOR,
      { postURLs: [videoUrl], maxCommentsPerPost: 30, includeReplies: false },
      COMMENTS_FAST_LIMITS,
    );
    const fast = topComments(rows, "fast");
    if (fast.length > 0) return fast;
  } catch (err) {
    console.error("[apify] comentários (rápido):", err instanceof Error ? err.message : "erro");
  }
  const rows = await runActorRaw<unknown>(
    token,
    COMMENTS_STD_ACTOR,
    { postURLs: [videoUrl], commentsPerPost: 10, maxRepliesPerComment: 0 },
    COMMENTS_STD_LIMITS,
  );
  return topComments(rows, "standard");
}

// Quando não há YOUTUBE_API_KEY (ou a cota do Google acabou). Tenta primeiro o Actor rápido
// (~5 s, ~US$ 0,01, usa a API do YouTube por trás e aceita país e idioma como dica). Se falhar ou
// vier vazio, usa o Actor de reserva (18 a 50 s, ~US$ 0,04, sem filtro de idioma).
// O de reserva é instável: às vezes termina "com sucesso" devolvendo só um registro vazio (o
// endereço da busca, sem vídeos). Nesse caso tentamos mais uma vez (extra de ~US$ 0,004).
export async function fetchYoutubeViaApify(
  query: string,
  token: string,
  language: Language = "pt",
): Promise<YoutubeVideo[]> {
  try {
    const rows = await runActorRaw<unknown>(
      token,
      YOUTUBE_FAST_ACTOR,
      {
        q: query,
        maxResults: YOUTUBE_LIMIT,
        useFilters: true,
        order: "viewCount",
        safeSearch: "moderate",
        ...(language === "pt" ? { regionCode: "BR", relevanceLanguage: "pt" } : {}),
      },
      YOUTUBE_FAST_LIMITS,
    );
    const fast = parseApifyYoutube(rows);
    if (fast.length > 0) return fast;
    console.error("[apify] YouTube (rápido) sem vídeos");
  } catch (err) {
    console.error("[apify] YouTube (rápido):", err instanceof Error ? err.message : "erro");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const items = await runActorRaw<unknown>(
      token,
      YOUTUBE_ACTOR,
      {
        searchQueries: [query],
        maxResults: YOUTUBE_LIMIT,
        maxResultsShorts: 0,
        maxResultStreams: 0,
        sortingOrder: "views",
        transcriptionAndSubtitle: "NONE",
      },
      YOUTUBE_RUN_LIMITS,
    );
    const videos = parseApifyYoutube(items);
    if (videos.length > 0) return videos;
    console.error("[apify] YouTube (reserva) sem vídeos na tentativa", attempt + 1);
  }
  return [];
}
