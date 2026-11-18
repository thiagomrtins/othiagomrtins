"use client";

import { FormEvent, useState } from "react";
import { VideoCardView } from "@/components/VideoCardView";
import type { Language, SearchResult } from "@/lib/types";

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("pt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${language}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na busca");
      setResult(data as SearchResult);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Viral Finder</h1>
      <p className="sub">Descubra os vídeos mais curtidos do TikTok em qualquer assunto.</p>

      <form onSubmit={onSubmit} className="form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex.: marketing digital, receitas fit, investimentos…"
          maxLength={80}
          required
        />
        <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          <option value="pt">🇧🇷 Conteúdo em português</option>
          <option value="global">🌎 Global</option>
        </select>
        <button disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
      </form>

      {error && <p className="error">{error}</p>}
      {result?.demo && (
        <p className="notice">Modo demonstração: sem token do Apify, os dados abaixo são fictícios.</p>
      )}
      {result && result.videos.length === 0 && <p>Nenhum vídeo encontrado. Tente outro termo.</p>}

      <section className="grid">
        {result?.videos.map((v, i) => <VideoCardView key={v.id} video={v} rank={i + 1} />)}
      </section>
    </main>
  );
}
