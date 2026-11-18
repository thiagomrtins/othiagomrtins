"use client";

import { useEffect, useRef, useState } from "react";
import type { Language, YoutubeResult } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

// true  = busca em segundo plano assim que os resultados do TikTok aparecem; o botão só mostra os
//         cards (já prontos). Custa uma busca de YouTube (~US$ 0,01) por pesquisa feita.
// false = só busca quando a pessoa clica no botão (não gasta nada se ela não clicar, mas espera ~9 s).
const PREFETCH_IN_BACKGROUND = true;

function PlayIcon() {
  return (
    <svg className="yt-icon" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true">
      <rect width="28" height="20" rx="5" fill="#ff0000" />
      <path d="M11 6l8 4-8 4z" fill="#ffffff" />
    </svg>
  );
}

// Se a capa não carregar (vídeo apagado, rede), esconde o ícone de imagem quebrada.
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

export function YoutubeSection({ query, language }: { query: string; language: Language }) {
  const [data, setData] = useState<YoutubeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A pessoa já clicou no botão? Só então os cards aparecem.
  const [open, setOpen] = useState(false);
  const started = useRef(false);

  async function load() {
    if (started.current) return;
    started.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}&lang=${language}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao buscar no YouTube");
      setData(body as YoutubeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar no YouTube");
      started.current = false; // permite tentar de novo no clique
    } finally {
      setLoading(false);
    }
  }

  // Em segundo plano: espera um instante para não competir com a exibição dos cards do TikTok.
  useEffect(() => {
    if (!PREFETCH_IN_BACKGROUND) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language]);

  function onClick() {
    setOpen(true);
    if (!data) void load();
  }

  const ready = data !== null;
  const status = open
    ? null
    : ready
      ? "Pronto para abrir."
      : error
        ? null
        : loading
          ? "Carregando em segundo plano…"
          : null;

  return (
    <section className="yt" aria-labelledby="yt-title">
      <h2 id="yt-title">
        <PlayIcon /> Mais vistos no YouTube
      </h2>

      {!open && (
        <div className="yt-action">
          <button type="button" className="yt-button" onClick={onClick}>
            Buscar os vídeos mais vistos sobre o tema
          </button>
          <p className="hint" role="status">
            Tema: “{query}”. {status}
          </p>
        </div>
      )}

      {open && (
        <p className="hint">
          Os 10 vídeos mais vistos sobre “{query}”. Clique para abrir no YouTube.
          {data && data.source !== "demo" && language === "pt" &&
            " O YouTube prioriza o português do Brasil, mas pode incluir vídeos em outros idiomas."}
        </p>
      )}

      {open && loading && !data && (
        <div className="yt-grid" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="yt-card yt-skeleton" />
          ))}
        </div>
      )}
      {open && error && !loading && (
        <p className="yt-error">
          {error}{" "}
          <button type="button" className="yt-retry" onClick={() => void load()}>
            Tentar de novo
          </button>
        </p>
      )}
      {open && data && data.videos.length === 0 && <p className="hint">Nenhum vídeo encontrado no YouTube.</p>}

      {open && data && data.videos.length > 0 && (
        <div className="yt-grid">
          {data.videos.map((v) => (
            <a key={v.id} className="yt-card" href={v.url} target="_blank" rel="noopener noreferrer">
              <span className="yt-thumb">
                <Thumb src={v.thumb} />
              </span>
              <span className="yt-title">{v.title}</span>
              <span className="yt-meta">
                {v.channel}
                {v.channel && v.views !== null ? " · " : ""}
                {v.views !== null ? `${nf.format(v.views)} views` : ""}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
