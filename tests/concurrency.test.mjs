import test from "node:test";
import assert from "node:assert/strict";
import { raceWithGrace, sleep, CANCELLED } from "../src/lib/concurrency.ts";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Tarefa que termina em `ms` com `value`, mas respeita o cancelamento.
const job = (ms, value) => (signal) => sleep(ms, signal).then(() => value);

test("sleep acorda na hora quando cancelado", async () => {
  const c = new AbortController();
  const t0 = Date.now();
  const p = sleep(5000, c.signal);
  setTimeout(() => c.abort(), 30);
  await assert.rejects(p, (e) => e.message === CANCELLED);
  assert.ok(Date.now() - t0 < 500);
});

test("sleep com sinal já cancelado falha de imediato", async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(sleep(1000, c.signal), (e) => e.message === CANCELLED);
});

test("raceWithGrace: todas terminam dentro do prazo, devolve todas", async () => {
  const out = await raceWithGrace([job(20, "a"), job(40, "b"), job(60, "c")], 500);
  assert.deepEqual(out.sort(), ["a", "b", "c"]);
});

test("raceWithGrace: a lenta é cortada e não segura as rápidas", async () => {
  const t0 = Date.now();
  const out = await raceWithGrace([job(20, "rapida1"), job(40, "rapida2"), job(5000, "lenta")], 100);
  const gasto = Date.now() - t0;
  assert.deepEqual(out.sort(), ["rapida1", "rapida2"]);
  assert.ok(gasto < 600, `levou ${gasto} ms, devia cortar a lenta`);
});

test("raceWithGrace: tarefa que falha não derruba as outras e o erro é reportado", async () => {
  const erros = [];
  const falha = () => Promise.reject(new Error("deu ruim"));
  const out = await raceWithGrace([job(20, "ok"), falha], 200, (e) => erros.push(e.message));
  assert.deepEqual(out, ["ok"]);
  assert.deepEqual(erros, ["deu ruim"]);
});

test("raceWithGrace: cancelamento por corte não é reportado como erro", async () => {
  const erros = [];
  await raceWithGrace([job(10, "ok"), job(5000, "lenta")], 50, (e) => erros.push(e.message));
  assert.deepEqual(erros, []);
});

test("raceWithGrace: se todas falham, devolve lista vazia", async () => {
  const falha = () => Promise.reject(new Error("x"));
  assert.deepEqual(await raceWithGrace([falha, falha], 100, () => {}), []);
  assert.deepEqual(await raceWithGrace([], 100), []);
});
