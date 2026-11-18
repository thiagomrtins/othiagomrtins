"use client";

import { FormEvent, useState } from "react";
import { VideoCardView } from "@/components/VideoCardView";
import type { ExpandResult, Language, SearchResult } from "@/lib/types";

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("pt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<ExpandResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro na busca");
    return data as T;
  }

  async function runSearch(q: string, lang: Language, variants: string[]) {
    setLoading(true);
    setError(null);
    try {
      const v = variants.length > 0 ? `&v=${encodeURIComponent(variants.join("|"))}` : "";
      setResult(await getJson<SearchResult>(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}${v}`));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      setLoading(false);
    }
  }

  // Em português, primeiro mostramos as ramificações para a pessoa escolher.
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    setBranches(null);
    if (language === "global") return runSearch(query, language, []);
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<ExpandResult>(`/api/expand?q=${encodeURIComponent(query)}`);
      setBranches(data);
      setSelected(data.queries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      setLoading(false);
    }
  }

  function toggle(q: string) {
    setSelected((cur) => (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]));
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
        <button disabled={loading}>{loading ? "Aguarde…" : language === "pt" ? "Sugerir buscas" : "Buscar"}</button>
      </form>

      {branches && (
        <section className="branches">
          <p>
            Buscas em português sobre <strong>{branches.query}</strong>
            {branches.source === "rules" && " (sugestões simples)"}. Desmarque as que não quiser:
          </p>
          <div className="chips">
            {branches.queries.map((q) => (
              <label key={q} className={selected.includes(q) ? "chip on" : "chip"}>
                <input type="checkbox" checked={selected.includes(q)} onChange={() => toggle(q)} />
                {q}
              </label>
            ))}
          </div>
          <button
            disabled={loading || selected.length === 0}
            onClick={() => runSearch(branches.query, "pt", selected)}
          >
            {loading ? "Buscando…" : `Buscar vídeos (${selected.length})`}
          </button>
        </section>
      )}

      {error && <p className="error">{error}</p>}
      {result?.demo && (
        <p className="notice">Modo demonstração: sem token do Apify, os dados abaixo são fictícios.</p>
      )}
      {result && result.videos.length === 0 && (
        <p>Nenhum vídeo em português encontrado. Tente outras ramificações.</p>
      )}

      <section className="grid">
        {result?.videos.map((v, i) => <VideoCardView key={v.id} video={v} rank={i + 1} />)}
      </section>
    </main>
  );
}
