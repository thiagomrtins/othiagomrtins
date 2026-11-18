"use client";

import { useEffect, useRef, useState } from "react";
import type { Language, YoutubeResult } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

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
  const box = useRef<HTMLElement>(null);
  const [data, setData] = useState<YoutubeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  // Só busca quando a seção chega perto da tela (1200 px antes, para já estar pronta quando a pessoa
  // chegar): quem não rola até o fim não gera custo.
  useEffect(() => {
    const el = box.current;
    if (!el) return;

    async function load() {
      if (started.current) return;
      started.current = true;
      setLoading(true);
      try {
        const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}&lang=${language}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Erro ao buscar no YouTube");
        setData(body as YoutubeResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao buscar no YouTube");
      } finally {
        setLoading(false);
      }
    }

    if (typeof IntersectionObserver === "undefined") {
      void load();
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect();
          void load();
        }
      },
      { rootMargin: "1200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query, language]);

  return (
    <section className="yt" ref={box} aria-labelledby="yt-title">
      <h2 id="yt-title">
        <PlayIcon /> Mais vistos no YouTube
      </h2>
      <p className="hint">
        Os 10 vídeos mais vistos sobre “{query}”. Clique para abrir no YouTube.
        {data && data.source !== "demo" && language === "pt" && " O YouTube prioriza o português do Brasil, mas pode incluir vídeos em outros idiomas."}
      </p>

      {loading && (
        <div className="yt-grid" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="yt-card yt-skeleton" />
          ))}
        </div>
      )}
      {error && <p className="yt-error">{error}</p>}
      {data && data.videos.length === 0 && <p className="hint">Nenhum vídeo encontrado no YouTube.</p>}

      {data && data.videos.length > 0 && (
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
