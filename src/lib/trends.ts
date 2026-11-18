import type { Trending, TrendTopic } from "./types";

// Hashtags genéricas que não dizem nada sobre o assunto.
export const GENERIC_TAGS = new Set([
  "fyp", "foryou", "foryoupage", "fy", "viral", "viralvideo", "tiktok", "paravoce",
  "pravoce", "parati", "trending", "trend", "explore", "xyzbca", "brasil", "br", "video",
  "tiktokbrasil", "viralizar", "viralizou", "fypage", "fypシ", "foryoupageofficial",
]);

// Palavras comuns que não são tema. Lista curta de propósito: o filtro principal é aparecer em 2+ vídeos.
const STOPWORDS = new Set((
  "para como você voce está esta esse essa isso essas esses mais menos muito muita muitos muitas " +
  "quando onde porque pelo pela pelos pelas sobre entre depois antes ainda também tambem mesmo " +
  "mesma outro outra outros outras todo toda todos todas cada seus suas seu sua meus minha meu " +
  "nosso nossa fazer faça fazendo vamos vídeo video vídeos videos aqui assim então entao sempre " +
  "nunca coisa coisas gente pessoal ficar fica ficou tenho tem têm temos pode podem posso quer " +
  "quero vezes vez dica dicas segue siga seguir comenta comente comentários comentarios link bio " +
  "parte parte1 hoje agora já ainda onde qual quais quem tudo nada algo alguém ninguém depois " +
  "conta importante qualquer explico explica explicar explicando pessoas vocês quanto quantos começar " +
  "melhor melhores maneira forma jeito passo falar fala veja olha sobre ajuda ajudar precisa precisam " +
  "saber sabe sabia aprender aprenda descobrir conheça conheca tipo tipos exemplo claro certo errado"
).split(/\s+/));

export interface TrendVideo {
  text?: string;
  diggCount?: number;
  hashtags?: { name?: string }[];
}

export function toHashtag(raw: string): string {
  return raw
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

function rank(map: Map<string, { videos: number; likes: number }>, limit: number): TrendTopic[] {
  const all = [...map.entries()].map(([label, v]) => ({ label, ...v }));
  const sort = (a: TrendTopic, b: TrendTopic) =>
    b.videos - a.videos || b.likes - a.likes || a.label.localeCompare(b.label);
  const repeated = all.filter((t) => t.videos >= 2).sort(sort);
  // Poucos repetidos: completa com os mais curtidos, para o bloco não ficar vazio.
  if (repeated.length >= 5) return repeated.slice(0, limit);
  const singles = all
    .filter((t) => t.videos < 2)
    .sort((a, b) => b.likes - a.likes || a.label.localeCompare(b.label));
  return [...repeated, ...singles].slice(0, Math.min(limit, 5));
}

function bump(map: Map<string, { videos: number; likes: number }>, key: string, likes: number) {
  const cur = map.get(key) ?? { videos: 0, likes: 0 };
  cur.videos += 1;
  cur.likes += likes;
  map.set(key, cur);
}

// Conta hashtags e palavras-tema nos vídeos já buscados. Não faz nenhuma chamada nova.
export function buildTrending(videos: TrendVideo[], query: string): Trending {
  const queryWords = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  const queryTag = toHashtag(query);

  const tags = new Map<string, { videos: number; likes: number }>();
  const terms = new Map<string, { videos: number; likes: number }>();

  for (const v of videos) {
    const likes = v.diggCount ?? 0;

    const seenTags = new Set<string>();
    for (const h of v.hashtags ?? []) {
      const t = toHashtag(h.name ?? "");
      if (t.length < 3 || GENERIC_TAGS.has(t) || t === queryTag || seenTags.has(t)) continue;
      seenTags.add(t);
      bump(tags, `#${t}`, likes);
    }

    const caption = (v.text ?? "").replace(/#[^\s#]+|@[^\s@]+|https?:\/\/\S+/g, " ").toLowerCase();
    const seenWords = new Set<string>();
    for (const w of caption.match(/\p{L}{5,}/gu) ?? []) {
      const plain = w.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (STOPWORDS.has(w) || STOPWORDS.has(plain) || queryWords.includes(plain) || seenWords.has(w)) continue;
      seenWords.add(w);
      bump(terms, w, likes);
    }
  }

  // Só mostramos temas que aparecem em pelo menos 2 vídeos; um termo isolado é ruído.
  const repeatedTerms = new Map([...terms].filter(([, v]) => v.videos >= 2));
  return { hashtags: rank(tags, 10), terms: rank(repeatedTerms, 8), analyzed: videos.length };
}
