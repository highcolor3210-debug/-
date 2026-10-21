// プレビュー用の小さな Molang 評価器（このアドオンとバニラのプレイヤーで使う範囲だけ）
// Molang を JavaScript に書き換えて評価する。sin/cos は度。分からないクエリ・変数は 0

const D2R = Math.PI / 180;
const M = {
  sin: (x) => Math.sin(x * D2R),
  cos: (x) => Math.cos(x * D2R),
  abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt,
  floor: Math.floor, round: Math.round, ceil: Math.ceil,
  clamp: (v, a, b) => Math.min(Math.max(v, a), b),
  lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, b) => a % b,
  pi: Math.PI,
  random: (a, b) => a + Math.random() * (b - a),
};

function transpile(src) {
  // 文字列以外を小文字に（Molang は大文字小文字を区別しない）
  const parts = src.split(/('[^']*')/);
  let js = parts
    .map((p, i) => {
      if (i % 2 === 1) return p;
      return p
        .toLowerCase()
        .replace(/\b(query|q)\./g, "Q.")
        .replace(/\b(variable|v)\./g, "V.")
        .replace(/\b(context|c)\./g, "C.")
        .replace(/\b(temp|t)\./g, "T.")
        .replace(/\bmath\./g, "M.")
        .replace(/\bthis\b/g, "0");
    })
    .join("");
  const isStatements = /;/.test(js) || /(^|[^=!<>])=($|[^=])/.test(js);
  if (!isStatements) return `return (${js});`;
  // 文の並び（return があればその値）
  return js;
}

const cache = new Map();
function compile(src) {
  let f = cache.get(src);
  if (!f) {
    const body = transpile(src);
    try {
      f = new Function("M", "Q", "V", "C", "T", body);
    } catch (e) {
      throw new Error(`Molang の変換に失敗: ${src}\n→ ${body}\n${e}`);
    }
    cache.set(src, f);
  }
  return f;
}

function makeScope(queries, vars) {
  const Q = new Proxy(queries, { get: (o, k) => (k in o ? o[k] : 0) });
  const V = new Proxy(vars, { get: (o, k) => (k in o ? o[k] : 0), set: (o, k, v) => ((o[k] = v), true) });
  const C = new Proxy({}, { get: (o, k) => (k === "is_first_person" ? vars.is_first_person : 0) });
  return { Q, V, C };
}

/** 数値または Molang の文字列を評価 */
function evaluate(expr, scope) {
  if (typeof expr === "number") return expr;
  if (typeof expr === "boolean") return expr ? 1 : 0;
  const r = compile(String(expr))(M, scope.Q, scope.V, scope.C, {});
  if (r === undefined) return 0;
  return Number(r);
}

/** 文の並び（pre_animation など）を順に実行 */
function run(statements, scope) {
  for (const s of statements) compile(s)(M, scope.Q, scope.V, scope.C, {});
}

module.exports = { evaluate, run, makeScope };
