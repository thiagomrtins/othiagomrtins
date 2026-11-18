export type Language = "pt" | "global";

export interface TopComment {
  text: string;
  likes: number;
  author: string;
}

export interface VideoCard {
  id: string;
  url: string;
  cover: string | null;
  likes: number;
  views: number;
  caption: string;
  author: string;
  language: string | null;
}

export interface TrendTopic {
  label: string;
  videos: number;
  likes: number;
}

export interface Trending {
  hashtags: TrendTopic[];
  terms: TrendTopic[];
  analyzed: number;
}

export interface SearchResult {
  query: string;
  language: Language;
  queries: string[];
  videos: VideoCard[];
  trending: Trending;
  demo: boolean;
  cached: boolean;
  fetchedAt: string;
}

export interface ExpandResult {
  query: string;
  queries: string[];
  source: "ai" | "rules";
}
