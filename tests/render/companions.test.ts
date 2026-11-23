import { EmergencyDepartment } from '../../src/model/ed';
import { realisticParams } from '../../src/model/params';
import { LiveDriver } from '../../src/render/drivers';
import { bedRect, clinicPlan, fillOrder, hospitalCafe, routeNodes, type Segment, type SitePlan } from '../../src/render/companions/plans';
import { DISPENSE, Social, checkCode, normalizeCode, type Companion } from '../../src/render/companions/social';
import type { Vec } from '../../src/render/layout';

const plans = () => [hospitalCafe(), clinicPlan(0, 30), clinicPlan(1, 40), clinicPlan(2, 50)];

/** ¿Se cruzan los segmentos pq y ab (incluidos los extremos)? */
function crosses(p: Vec, q: Vec, s: Segment): boolean {
  const o = (a: Vec, b: Vec, c: Vec) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const on = (a: Vec, b: Vec, c: Vec) => Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9;
  const [d1, d2, d3, d4] = [o(s.a, s.b, p), o(s.a, s.b, q), o(p, q, s.a), o(p, q, s.b)];
  if (d1 !== d2 && d3 !== d4) return true;
  return (d1 === 0 && on(s.a, s.b, p)) || (d2 === 0 && on(s.a, s.b, q)) || (d3 === 0 && on(p, q, s.a)) || (d4 === 0 && on(p, q, s.b));
}

/** Paredes sólidas: interiores + fondo (x = 0, y = 0) menos sus puertas. */
function solid(plan: SitePlan): Segment[] {
  const back: Segment[] = [];
  const cut = (axis: 'x' | 'y', len: number) => {
    const gaps = plan.backDoors.filter((d) => (axis === 'y' ? d.a.x === 0 && d.b.x === 0 : d.a.y === 0 && d.b.y === 0)).map((d) => (axis === 'y' ? [d.a.y, d.b.y] : [d.a.x, d.b.x]));
    let from = 0;
    for (const [g0, g1] of gaps.sort((a, b) => a[0] - b[0])) {
      back.push(axis === 'y' ? { a: { x: 0, y: from }, b: { x: 0, y: g0 } } : { a: { x: from, y: 0 }, b: { x: g0, y: 0 } });
      from = g1;
    }
    back.push(axis === 'y' ? { a: { x: 0, y: from }, b: { x: 0, y: len } } : { a: { x: from, y: 0 }, b: { x: len, y: 0 } });
  };
  if (plan.site >= 0) {
    cut('y', plan.h);
    cut('x', plan.w);
  } else cut('y', 16);
  return [...plan.walls, ...back];
}

describe('Plantas de las clínicas y cafeterías (T24)', () => {
  it('cada clínica dibuja exactamente las camas activas del motor, sin cruzar paredes', () => {
    const p = realisticParams();
    for (const [j, c] of p.clinics.entries()) {
      for (const beds of [c.beds, 12, 64]) {
        const plan = clinicPlan(j, beds);
        expect(plan.beds.length).toBe(beds);
        expect(new Set(fillOrder(plan)).size).toBe(beds);
        for (const b of plan.beds) {
          const r = bedRect(b);
          expect(r.x0).toBeGreaterThanOrEqual(0);
          expect(r.y0).toBeGreaterThanOrEqual(0);
          expect(r.x1).toBeLessThanOrEqual(plan.w);
          expect(r.y1).toBeLessThanOrEqual(plan.h);
          for (const s of plan.walls) {
            const inside = (v: Vec) => v.x > r.x0 && v.x < r.x1 && v.y > r.y0 && v.y < r.y1;
            expect(inside({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }) || crosses({ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, s)).toBe(false);
          }
        }
      }
    }
  });

  it('las tres plantas son distintas y la de 50 camas tiene alas seleccionables', () => {
    const [rc, lp, vv] = [clinicPlan(0, 30), clinicPlan(1, 40), clinicPlan(2, 50)];
    expect(rc.rooms.map((r) => r.name)).toContain('Recepción');
    expect(rc.rooms.map((r) => r.name)).toContain('Ala de los ventanales');
    expect(lp.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(['Corredor', 'Enfermería']));
    expect(vv.rooms.map((r) => r.name)).toContain('Patio');
    expect(vv.seats.filter((s) => s.kind === 'banca').length).toBeGreaterThan(4);
    expect(vv.wings.length).toBe(2);
  });

  it('los recorridos atraviesan puertas, nunca paredes, y todo es alcanzable desde la entrada', () => {
    for (const plan of plans()) {
      const walls = solid(plan);
      const legs: [Vec, Vec][] = plan.edges.map(([a, b]) => [plan.nodes[a], plan.nodes[b]]);
      for (const s of plan.seats) legs.push([plan.nodes[s.node], s.p]);
      for (const m of plan.machines) for (let i = 0; i < 4; i++) legs.push([plan.nodes[m.node], { x: m.front.x + m.step.x * i, y: m.front.y + m.step.y * i }]);
      for (const [p, q] of legs) for (const w of walls) expect(crosses(p, q, w), `${plan.name}: (${p.x},${p.y})→(${q.x},${q.y}) cruza una pared`).toBe(false);
      for (const n of Object.keys(plan.nodes)) expect(routeNodes(plan, plan.entry, n).at(-1)).toBe(n);
      // Dos sillas o puestos de fila nunca coinciden.
      const spots = [...plan.seats.map((s) => s.p), ...plan.machines.flatMap((m) => [0, 1, 2, 3].map((i) => ({ x: m.front.x + m.step.x * i, y: m.front.y + m.step.y * i })))];
      for (let i = 0; i < spots.length; i++) for (let k = i + 1; k < spots.length; k++) expect(Math.hypot(spots[i].x - spots[k].x, spots[i].y - spots[k].y)).toBeGreaterThan(0.5);
      expect(plan.machines.map((m) => m.kind)).toEqual(['refrescos', 'papas']);
    }
  });
});

describe('Máquinas por código (T24)', () => {
  it('acepta minúsculas y espacios y explica los códigos erróneos', () => {
    expect(normalizeCode(' a 3 ')).toBe('A3');
    expect(checkCode('refrescos', ' a3')).toMatchObject({ ok: true, product: { name: 'Limonada' } });
    expect(checkCode('papas', 'b2')).toMatchObject({ ok: true, product: { name: 'Papas de limón' } });
    expect(checkCode('refrescos', '  ')).toMatchObject({ ok: false, reason: 'Escribe el código del producto.' });
    expect(checkCode('refrescos', 'B1')).toMatchObject({ ok: false });
    expect((checkCode('refrescos', 'B1') as { reason: string }).reason).toMatch(/máquina de papas/);
    expect((checkCode('papas', 'Z9') as { reason: string }).reason).toMatch(/no existe/);
  });
});

/** Avanza el reloj social en pasos de 0,1 min y revisa los invariantes en cada paso. */
function run(s: Social, from: number, to: number, check = true): void {
  for (let t = from; t <= to + 1e-9; t += 0.1) {
    s.advance(t);
    if (!check) continue;
    for (const site of [-1, 0, 1, 2]) {
      const here = s.inSite(site);
      const plan = s.plan(site)!;
      expect(here.filter((c) => !c.mine).length).toBeLessThanOrEqual(plan.cap);
      // Nadie comparte silla ni puesto de fila.
      const seated = here.filter((c) => c.activity === 'sentado').map((c) => c.seat);
      expect(new Set(seated).size).toBe(seated.length);
      const still = here.filter((c) => !s.walking(c)).map((c) => `${c.at.x.toFixed(3)},${c.at.y.toFixed(3)}`);
      expect(new Set(still).size).toBe(still.length);
    }
  }
}

describe('Acompañantes (T24): modelo social propio', () => {
  it('es reproducible con la misma semilla y se detiene si el reloj no avanza (pausa)', () => {
    const a = new Social(plans(), 9),
      b = new Social(plans(), 9);
    run(a, 480, 600, false);
    run(b, 480, 600, false);
    const view = (s: Social) => [...s.companions.values()].map((c) => [c.id, c.activity, c.at.x, c.at.y]);
    expect(view(a)).toEqual(view(b));
    expect(a.companions.size).toBeGreaterThan(4);
    const before = JSON.stringify(view(a));
    for (let k = 0; k < 20; k++) a.advance(600); // pausa: el reloj de la sesión no cambia
    expect(JSON.stringify(view(a))).toBe(before);
  });

  it('Mi acompañante compra por código, una sola solicitud, y recibe su producto', () => {
    const s = new Social(plans(), 3);
    s.advance(480);
    const r = s.request(0, 'refrescos', 'a 3');
    expect(r.ok).toBe(true);
    expect(s.request(0, 'refrescos', 'A3')).toMatchObject({ ok: false }); // doble confirmación
    expect(s.request(1, 'papas', 'B1')).toMatchObject({ ok: false }); // otra máquina con solicitud en curso
    expect(s.myOrder!.state).toBe('en camino');
    run(s, 480.1, 520);
    expect(s.myOrder!.state).toBe('entregado');
    expect(s.mine!.holding?.name).toBe('Limonada');
    expect(s.inbox.map((o) => o.product.code)).toEqual(['A3']);
    // Luego papas en otra sede: deja la primera y entra por la puerta de la segunda.
    expect(s.request(2, 'papas', 'b3').ok).toBe(true);
    expect(s.mine!.site).toBe(2);
    run(s, 520.1, 560);
    expect(s.mine!.holding?.name).toBe('Papas picantes');
  });

  it('se puede cancelar en fila; no mientras despacha', () => {
    const s = new Social(plans(), 4);
    s.advance(480);
    s.request(-1, 'papas', 'B2');
    expect(s.cancel()).toBe(true);
    expect(s.myOrder!.state).toBe('cancelado');
    expect(s.cancel()).toBe(false);
    s.request(-1, 'papas', 'B2');
    let t = 480;
    while (s.myOrder!.state !== 'despachando' && t < 540) s.advance((t += 0.05));
    expect(s.myOrder!.state).toBe('despachando');
    expect(s.cancel()).toBe(false);
    s.advance(t + DISPENSE + 0.01);
    expect(s.myOrder!.state).toBe('entregado');
  });

  it('un acompañante automático y Mi acompañante comparten la máquina sin recibir el producto ajeno', () => {
    // Se buscan semillas en que alguien ya esté en la fila de la máquina de refrescos del hospital.
    for (let seed = 1; seed < 200; seed++) {
      const s = new Social(plans(), seed);
      let t = 480;
      s.advance(t);
      let other: Companion | undefined;
      while (t < 700 && !other) {
        s.advance((t += 0.1));
        other = s.inSite(-1).find((c) => c.machine === 0 && !c.mine && c.want !== undefined);
      }
      if (!other) continue;
      const theirs = other.want!;
      const code = theirs.code === 'A1' ? 'A2' : 'A1';
      expect(s.request(-1, 'refrescos', code).ok).toBe(true);
      run(s, t + 0.1, t + 30);
      expect(s.myOrder!.state).toBe('entregado');
      expect(s.mine!.holding!.code).toBe(code);
      if (s.companions.has(other.id)) expect(other.holding?.code).toBe(theirs.code);
      return;
    }
    throw new Error('Ninguna semilla produjo una fila');
  });
});

describe('Prueba clave (T24): las compras no cambian la simulación clínica', () => {
  it('misma semilla y parámetros, con y sin compras: eventos, traslados y métricas idénticos', () => {
    const make = () => {
      const ed = new EmergencyDepartment(realisticParams(), { seed: 2611, recordEvents: true });
      ed.step(8 * 60);
      return new LiveDriver(ed);
    };
    const a = make(),
      b = make();
    const social = new Social(plans(), 2611);
    const logA: unknown[] = [],
      logB: unknown[] = [];
    a.ed.onEvent((e) => logA.push(e));
    b.ed.onEvent((e) => logB.push(e));
    a.speed = b.speed = 600;
    const codes = ['A1', 'B3', 'A2', 'B1'];
    for (let frame = 0; frame < 60 * 60; frame++) {
      a.tick(1 / 60);
      social.advance(a.pb.t);
      if (frame % 300 === 0 && !social.orderActive) social.request((frame / 300) % 4 - 1, frame % 600 ? 'papas' : 'refrescos', codes[(frame / 300) % 4].replace(/^./, frame % 600 ? 'B' : 'A'));
      b.tick(1 / 60);
    }
    expect(a.ed.now).toBe(b.ed.now);
    expect(social.inbox.length).toBeGreaterThan(3);
    expect(logA).toEqual(logB);
    expect(logA.some((e) => (e as { type: string }).type === 'TRANSFER_START')).toBe(true);
    expect(a.ed.snapshot()).toEqual(b.ed.snapshot());
    expect(a.ed.metrics()).toEqual(b.ed.metrics());
  });
});
