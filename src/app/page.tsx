"use client";

import dynamic from "next/dynamic";
import { FormEvent, useRef, useState } from "react";
import type { ExpandResult, Language, SearchResult } from "@/lib/types";

// Os resultados só aparecem depois da primeira busca: carregamos esse código só então.
const VideoCardView = dynamic(() => import("@/components/VideoCardView").then((m) => m.VideoCardView));
const YoutubeSection = dynamic(() => import("@/components/YoutubeSection").then((m) => m.YoutubeSection));
const TrendingBlock = dynamic(() => import("@/components/TrendingBlock").then((m) => m.TrendingBlock));

type Screen = "search" | "results";
type View = "videos" | "trending" | "youtube";

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("pt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<ExpandResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Frases usadas na última busca: o botão "Refazer" só liga se a seleção mudou.
  const [searchedWith, setSearchedWith] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  // Tela de pesquisa ou tela de resultados (com o menu lateral), e qual painel está aberto.
  const [screen, setScreen] = useState<Screen>("search");
  const [view, setView] = useState<View>("videos");
  // Cada busca ganha um número; respostas de buscas antigas são ignoradas.
  const requestId = useRef(0);

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro na busca");
    return data as T;
  }

  async function runSearch(q: string, lang: Language, variants: string[]) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const v = variants.length > 0 ? `&v=${encodeURIComponent(variants.join("|"))}` : "";
      const data = await getJson<SearchResult>(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}${v}`);
      if (id === requestId.current) {
        setResult(data);
        setSearchedWith(variants);
      }
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setError(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  // Uma etapa só: busca já com as frases sugeridas. Os chips ficam na tela para refinar depois.
  async function start(q: string) {
    setScreen("results");
    setView("videos");
    setResult(null);
    setBranches(null);
    if (language === "global") return runSearch(q, language, []);
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    let variants = [q];
    try {
      const data = await getJson<ExpandResult>(`/api/expand?q=${encodeURIComponent(q)}`);
      if (id !== requestId.current) return;
      setBranches(data);
      setSelected(data.queries);
      variants = data.queries;
    } catch {
      // Sem sugestões, buscamos só pelo que a pessoa digitou: a busca não depende delas.
    }
    if (id !== requestId.current) return;
    await runSearch(q, "pt", variants);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void start(query);
  }

  // Volta para a tela da barra de pesquisa. Cancela qualquer busca em andamento (as respostas
  // dela são ignoradas) e mantém o que a pessoa tinha digitado.
  function back() {
    requestId.current++;
    setScreen("search");
    setResult(null);
    setBranches(null);
    setError(null);
    setLoading(false);
  }

  // Clicar numa frase do ranking pesquisa aquele assunto.
  function pickPhrase(phrase: string) {
    setQuery(phrase);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void start(phrase);
  }

  function toggle(q: string) {
    setSelected((cur) => (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]));
  }

  // ---------------------------------------------------------------- tela de pesquisa
  if (screen === "search") {
    return (
      <main className="home">
        <h1>Busca <span>Viral</span></h1>
        <p className="sub">Descubra os vídeos mais curtidos do TikTok em qualquer assunto.</p>

        <form onSubmit={onSubmit} className="form">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: marketing digital, receitas fit, investimentos…"
            maxLength={80}
            required
            autoFocus
          />
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="pt">🇧🇷 Conteúdo em português</option>
            <option value="global">🌎 Global</option>
          </select>
          <button>Buscar</button>
        </form>
      </main>
    );
  }

  // ---------------------------------------------------------------- tela de resultados
  const hasResults = !!result && result.videos.length > 0;
  // "short" é o rótulo curto usado no celular, onde as três opções precisam caber lado a lado.
  const items: { id: View; label: string; short: string; badge?: string; disabled?: boolean }[] = [
    { id: "videos", label: "Em alta no TikTok", short: "TikTok", badge: hasResults ? String(result!.videos.length) : undefined },
    { id: "trending", label: "Hashtags e buscas em alta", short: "Hashtags", disabled: !hasResults },
    { id: "youtube", label: "YouTube", short: "YouTube", disabled: !hasResults },
  ];

  return (
    <main className="shell">
      <aside className="side">
        <p className="brand">Busca <span>Viral</span></p>
        <button type="button" className="back" onClick={back}>
          ← Voltar à pesquisa
        </button>
        <nav aria-label="Seções dos resultados" className="menu">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`menu-item${view === it.id ? " active" : ""}${it.id === "youtube" ? " yt-item" : ""}`}
              aria-current={view === it.id ? "page" : undefined}
              disabled={it.disabled}
              onClick={() => setView(it.id)}
            >
              <span className="long">{it.label}</span>
              <span className="short">{it.short}</span>
              {it.badge && <small>{it.badge}</small>}
            </button>
          ))}
        </nav>
        <p className="side-query">
          Pesquisa: <strong>“{result?.query ?? branches?.query ?? query}”</strong>
          <br />
          {language === "pt" ? "🇧🇷 em português" : "🌎 global"}
        </p>
      </aside>

      <div className="content">
        {/* ---- painel: vídeos em alta no TikTok ---- */}
        <div hidden={view !== "videos"}>
          <h2 className="view-title">Em alta no TikTok</h2>

          {loading && !result && (
            <p className="hint" role="status">
              Isso costuma levar de 10 a 30 segundos. Buscas repetidas são instantâneas.
            </p>
          )}

          {branches && (
            <section className="branches">
              <p>
                Frases usadas na busca sobre <strong>{branches.query}</strong>
                {branches.source === "rules" && " (sugestões simples)"}. Desmarque as que não quiser e refaça a busca:
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
                disabled={
                  loading ||
                  selected.length === 0 ||
                  (selected.length === searchedWith.length && selected.every((q) => searchedWith.includes(q)))
                }
                onClick={() => runSearch(branches.query, "pt", selected)}
              >
                {loading ? "Buscando…" : `Refazer busca (${selected.length})`}
              </button>
            </section>
          )}

          {error && (
            <p className="error">
              {error} Use “Voltar à pesquisa” para tentar de novo.
            </p>
          )}
          {result?.demo && (
            <p className="notice">Modo demonstração: sem token do Apify, os dados abaixo são fictícios.</p>
          )}
          {loading && !result && (
            <section className="grid" aria-busy="true" aria-label="Carregando resultados">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="card skeleton" />
              ))}
            </section>
          )}

          {result && result.videos.length === 0 && (
            <p>Nenhum vídeo em português encontrado. Tente outras ramificações.</p>
          )}

          {hasResults && (
            <p className="count">
              {result!.videos.length} {result!.videos.length === 1 ? "vídeo encontrado" : "vídeos encontrados"}
              {result!.language === "pt" ? " em português" : ""}, do mais curtido para o menos curtido.
            </p>
          )}

          <section className="grid">
            {result?.videos.map((v, i) => <VideoCardView key={v.id} video={v} rank={i + 1} />)}
          </section>
        </div>

        {/* ---- painel: hashtags e buscas em alta ---- */}
        <div hidden={view !== "trending"}>
          {hasResults && <TrendingBlock trending={result!.trending} onPick={pickPhrase} />}
        </div>

        {/* ---- painel: YouTube (continua montado para a busca em segundo plano seguir rodando) ---- */}
        <div hidden={view !== "youtube"}>
          {hasResults && (
            <YoutubeSection
              key={`${result!.fetchedAt}:${result!.query}`}
              query={result!.query}
              language={result!.language}
            />
          )}
        </div>
      </div>
    </main>
  );
}
