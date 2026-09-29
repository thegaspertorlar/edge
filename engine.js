(function (root) {
  "use strict";
  const N = 7,
    dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
  const xy = (p) => [p % N, Math.floor(p / N)];
  function adjacent(p) {
    let [x, y] = xy(p);
    return dirs
      .map(([dx, dy]) =>
        x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N
          ? (y + dy) * N + x + dx
          : -1,
      )
      .filter((p) => p >= 0);
  }
  function initial(l) {
    return { p: l.start, e: l.enemies.slice(), t: 0 };
  }
  function key(s) {
    return s.p + "|" + s.e.join(",") + "|" + s.t;
  }
  function transition(l, s, p) {
    if (!adjacent(s.p).includes(p) || l.walls.includes(p)) return null;
    if (s.e.includes(p))
      return { dead: true, reason: "Bir gözcünün bulunduğu kareye girdin." };
    let t = (s.t + 1) % 2;
    if ((l.pulses || []).includes(p) && t === 1)
      return { dead: true, reason: "Enerji karesi bu turda aktifti." };
    if (p === l.goal) return { p, e: s.e.slice(), t, won: true };
    let e = s.e.slice();
    for (let i = 0; i < e.length; i++) {
      let pos = e[i];
      const step = () => {
        if ((l.period || 2) === 2 && s.t !== i % 2) return pos;
        let [x, y] = xy(pos),
          [px, py] = xy(p);
        let dx = px - x,
          dy = py - y;
        let order =
          Math.abs(dx) >= Math.abs(dy)
            ? [
                [Math.sign(dx), 0],
                [0, Math.sign(dy)],
              ]
            : [
                [0, Math.sign(dy)],
                [Math.sign(dx), 0],
              ];
        if (i % 2) order.reverse();
        for (let [a, b] of order) {
          if (!a && !b) continue;
          let q = (y + b) * N + x + a;
          if (
            x + a >= 0 &&
            x + a < N &&
            y + b >= 0 &&
            y + b < N &&
            !l.walls.includes(q) &&
            !e.some((v, j) => j !== i && v === q)
          )
            return q;
        }
        return pos;
      };
      e[i] = step();
    }
    if (e.includes(p))
      return { dead: true, p, e, t, reason: "Gözcü bu hamlede seni yakaladı." };
    return { p, e, t };
  }
  function solve(l, s = initial(l), limit = 90000) {
    let q = [s],
      prev = [-1],
      moves = [-1],
      seen = new Set([key(s)]),
      head = 0;
    while (head < q.length && q.length < limit) {
      let i = head++,
        a = q[i];
      for (let p of adjacent(a.p)) {
        let b = transition(l, a, p);
        if (!b || b.dead) continue;
        let k = key(b);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push(b);
        prev.push(i);
        moves.push(p);
        if (b.won) {
          let path = [],
            j = q.length - 1;
          while (prev[j] >= 0) {
            path.push(moves[j]);
            j = prev[j];
          }
          return path.reverse();
        }
      }
    }
    return null;
  }
  root.EdgeEngine = { N, xy, adjacent, initial, transition, solve, key };
  if (typeof module !== "undefined") module.exports = root.EdgeEngine;
})(typeof window !== "undefined" ? window : globalThis);
