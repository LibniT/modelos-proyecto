import type { SimEvent } from '../../src/engine/events';
import type { Snapshot } from '../../src/model/ed';
import { Playback } from '../../src/render/playback';
import { ambulanceRoute, along, route } from '../../src/render/layout';
import mock from '../../src/render/mock/events.json';

const initial = mock.initial as unknown as Snapshot;
const events = mock.events as unknown as SimEvent[];

describe('Reproductor de eventos de la escena (T05)', () => {
  it('reproduce todo el mock: los que salen desaparecen y nadie comparte silla', () => {
    const pb = new Playback(initial);
    pb.push(events);
    const departed = new Set(events.filter((e) => e.type === 'DEPARTURE').map((e) => e.patientId));
    let t = initial.t;
    while (!pb.done) {
      t += 0.25;
      pb.advance(t);
      const seats = [...pb.figures.values()].filter((f) => f.slot !== undefined).map((f) => `${f.zone}#${f.slot}`);
      expect(new Set(seats).size).toBe(seats.length);
    }
    for (const id of departed) expect(pb.figures.has(id!)).toBe(false);
  });

  it('un MOVE recorre la ruta en exactamente su duración y llega al destino', () => {
    const pb = new Playback(initial);
    pb.push(events);
    const mv = events.find((e) => e.type === 'MOVE' && e.from === 'admission')!;
    pb.advance(mv.t);
    const f = pb.figures.get(mv.patientId!)!;
    const start = pb.position(f, mv.t);
    const mid = pb.position(f, mv.t + mv.duration! / 2);
    const end = pb.position(f, mv.t + mv.duration!);
    expect(end).toEqual(pb.target(f));
    expect(mid).not.toEqual(start);
    expect(mid).not.toEqual(end);
    expect(pb.position(f, mv.t + mv.duration!, true)).toEqual(end); // modo salto (> ×120)
  });

  it('nada se mueve entre eventos: sin MOVE en curso la posición no cambia', () => {
    const pb = new Playback(initial);
    pb.push(events);
    for (let k = 1; k < events.length; k++) {
      const a = events[k - 1].t;
      const b = events[k].t;
      if (b - a < 1e-6) continue;
      pb.advance(a);
      for (const f of pb.figures.values()) {
        if (f.walk && a < f.walk.t0 + f.walk.dur) continue;
        expect(pb.position(f, b - 1e-6)).toEqual(pb.position(f, a));
      }
    }
  });

  it('la ruta pasa por el pasillo central cuando cruza de lado', () => {
    const path = route({ x: 4.5, y: 2.5 }, { x: 0.5, y: 8 });
    expect(path).toHaveLength(4);
    expect(along(path, 0)).toEqual(path[0]);
    expect(along(path, 1)).toEqual(path[3]);
  });

  it('T12: la ambulancia recorre su ruta en exactamente la duración del traslado y desaparece al llegar', () => {
    const pb = new Playback(initial);
    pb.push(events);
    const start = events.find((e) => e.type === 'TRANSFER_START')!;
    const end = events.find((e) => e.type === 'TRANSFER_END' && e.patientId === start.patientId)!;
    const amb = start.resourceId!;
    pb.advance(start.t);
    expect(pb.figures.get(start.patientId!)!.hidden).toBe(true); // el paciente va dentro
    const route = ambulanceRoute(amb);
    expect(pb.ambulancePosition(amb, start.t)).toEqual(route[0]);
    const mid = pb.ambulancePosition(amb, start.t + start.duration! / 2)!;
    expect(mid.x).toBeCloseTo((route[0].x + route[1].x) / 2, 9);
    expect(pb.transfers.get(amb)!.clinic).toBe(start.data!.clinic);
    expect(end.t).toBeCloseTo(start.t + start.duration!, 9); // el motor llega cuando dijo
    pb.advance(end.t);
    expect(pb.transfers.has(amb)).toBe(false);
    expect(pb.ambulancesAway.has(amb)).toBe(true); // sigue fuera: regresa sin evento
  });
});
