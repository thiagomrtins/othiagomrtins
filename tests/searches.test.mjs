import test from "node:test";
import assert from "node:assert/strict";
import { rankSuggestions, suggestionSeeds } from "../src/lib/searches.ts";

const rows = [
  { suggestion: "como fazer skin care em casa", seedKeyword: "como fazer skincare", rank: 1 },
  { suggestion: "Como fazer Skin Care", seedKeyword: "como fazer skincare", rank: 2 },
  { suggestion: "como funciona skincare coreano", seedKeyword: "como funciona skincare", rank: 2 },
  { suggestion: "escala 5x2 como funciona", seedKeyword: "como funciona skincare", rank: 5 },
  { suggestion: "skin care em casa", seedKeyword: "skincare", rank: 1 },
  { suggestion: "SKINCARE EM CASA", seedKeyword: "skincare", rank: 3 },
  { suggestion: "skincares", seedKeyword: "skincare", rank: 4 },
  { suggestion: "", seedKeyword: "skincare", rank: 1 },
];

test("seeds têm os três pontos de partida", () => {
  assert.deepEqual(suggestionSeeds(" skincare "), ["como fazer skincare", "como funciona skincare", "skincare"]);
});

test("filtra ruído, repetidas e ecos do assunto; ordena pelo TikTok", () => {
  const seeds = suggestionSeeds("skincare");
  const out = rankSuggestions(rows, "skincare", seeds).map((x) => x.phrase);
  assert.ok(!out.includes("escala 5x2 como funciona"), "frase fora do assunto");
  assert.ok(!out.some((p) => p === "Como fazer Skin Care"), "repete o ponto de partida");
  assert.ok(!out.includes("skincares"), "plural do próprio assunto");
  assert.equal(out.filter((p) => p.toLowerCase().replace(/\s/g, "") === "skincareemcasa").length, 1, "sem duplicata");
  assert.equal(out[0], "como fazer skin care em casa");
});

test("respeita o limite", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ suggestion: `skincare tema ${i}`, seedKeyword: "skincare", rank: i }));
  assert.equal(rankSuggestions(many, "skincare", ["skincare"], 10).length, 10);
});
