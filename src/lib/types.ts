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
  comments: TopComment[];
}

export interface SearchResult {
  query: string;
  language: Language;
  videos: VideoCard[];
  demo: boolean;
  cached: boolean;
  fetchedAt: string;
}
