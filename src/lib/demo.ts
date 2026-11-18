import type { Language, VideoCard } from "./types";

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
    comments: Array.from({ length: 5 }, (_, j) => ({
      text: pt ? `Comentário de exemplo ${j + 1}` : `Sample comment ${j + 1}`,
      likes: Math.round(12_000 / (j + 1)),
      author: `fa_${j + 1}`,
    })),
  }));
}
