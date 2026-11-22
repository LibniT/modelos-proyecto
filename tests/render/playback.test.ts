import type { SimEvent } from '../../src/engine/events';
import type { Snapshot } from '../../src/model/ed';
import { Playback } from '../../src/render/playback';
import { along, route } from '../../src/render/layout';
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
});
