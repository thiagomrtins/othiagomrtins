import type { Language, TopComment, Trending, VideoCard } from "./types";

// Dados fictícios para rodar sem token. Os links apontam para a home do TikTok.
export function demoVideos(query: string, language: Language): VideoCard[] {
  const pt = language === "pt";
  return Array.from({ length: 8 }, (_, i) => ({
    id: `demo-${i}`,
    url: "https://www.tiktok.com/",
    cover: null,
    likes: Math.round(980_000 / (i + 1)),
    views: Math.round(8_200_000 / (i + 1)),
    caption: pt
      ? `Exemplo ${i + 1}: vídeo viral sobre "${query}" #demonstracao`
      : `Example ${i + 1}: viral video about "${query}" #demo`,
    author: `criador_demo_${i + 1}`,
    language: pt ? "pt" : "en",
  }));
}

export function demoComments(): TopComment[] {
  return Array.from({ length: 5 }, (_, j) => ({
    text: `Comentário de exemplo ${j + 1}`,
    likes: Math.round(12_000 / (j + 1)),
    author: `fa_${j + 1}`,
  }));
}

export function demoTrending(): Trending {
  const t = (label: string, videos: number, likes: number) => ({ label, videos, likes });
  return {
    searches: [
      { phrase: "como fazer exemplo em casa", seed: "como fazer exemplo" },
      { phrase: "como funciona exemplo para iniciantes", seed: "como funciona exemplo" },
    ],
    hashtags: [t("#exemplo1", 5, 900_000), t("#exemplo2", 4, 400_000), t("#exemplo3", 3, 120_000)],
    terms: [t("exemplo", 4, 500_000), t("demonstração", 3, 200_000)],
    analyzed: 8,
  };
}
