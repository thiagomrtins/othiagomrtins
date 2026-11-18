import test from "node:test";
import assert from "node:assert/strict";
import { buildTrending, toHashtag } from "../src/lib/trends.ts";

const v = (text, likes, tags) => ({ text, diggCount: likes, hashtags: tags.map((name) => ({ name })) });

test("toHashtag normaliza acentos, caixa e símbolos", () => {
  assert.equal(toHashtag("#Pele Saudável!"), "pelesaudavel");
  assert.equal(toHashtag("CuidadosComAPele"), "cuidadoscomapele");
});

test("conta hashtags por vídeo, soma curtidas e ignora genéricas e o próprio assunto", () => {
  const videos = [
    v("rotina de pele", 1000, ["skincare", "fyp", "dermatologista", "pele"]),
    v("rotina noturna", 500, ["skincare", "pele", "viral"]),
    v("manchas no rosto", 200, ["skincare"]),
  ];
  const t = buildTrending(videos, "dermatologista");
  const labels = t.hashtags.map((h) => h.label);
  assert.ok(!labels.includes("#fyp") && !labels.includes("#viral"), "genéricas");
  assert.ok(!labels.includes("#dermatologista"), "o próprio assunto");
  assert.equal(t.hashtags[0].label, "#skincare");
  assert.equal(t.hashtags[0].videos, 3);
  assert.equal(t.hashtags[0].likes, 1700);
  assert.equal(t.analyzed, 3);
  assert.deepEqual(t.searches, []);
});

test("uma mesma hashtag repetida no mesmo vídeo conta uma vez", () => {
  const t = buildTrending([v("x", 10, ["pele", "Pele", "#pele"])], "outro");
  assert.equal(t.hashtags[0].videos, 1);
});

test("temas exigem 2+ vídeos e ignoram palavras de enchimento", () => {
  const videos = [v("rotina importante de manchas", 10, []), v("rotina para manchas hoje", 20, []), v("cravos qualquer", 5, [])];
  const labels = buildTrending(videos, "pele").terms.map((x) => x.label);
  assert.ok(labels.includes("rotina") && labels.includes("manchas"));
  assert.ok(!labels.includes("importante") && !labels.includes("qualquer") && !labels.includes("cravos"));
});

test("entradas vazias ou estranhas não quebram", () => {
  const t = buildTrending([{}, { text: undefined, hashtags: undefined }, v("", 0, [])], "x");
  assert.equal(t.analyzed, 3);
  assert.deepEqual(t.hashtags, []);
});
