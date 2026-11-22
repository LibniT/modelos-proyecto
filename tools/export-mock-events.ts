/**
 * Exporta un registro de eventos REAL del motor para desarrollar la escena
 * sin depender del motor en vivo: src/render/mock/events.json
 * Uso: npm run mock
 */
import { writeFileSync } from 'node:fs';
import { EmergencyDepartment } from '../src/model/ed';
import { realisticParams } from '../src/model/params';

const ed = new EmergencyDepartment(realisticParams(), { seed: 2026, recordEvents: true });
ed.step(8 * 60); // empezar a las 8:00 con el sistema ya cargado
ed.drainEvents();
const initial = ed.snapshot();
ed.step(8 * 60 + 180); // 3 horas de eventos
const events = ed.drainEvents();
writeFileSync('src/render/mock/events.json', JSON.stringify({ description: 'Modo realista, semilla 2026, de 08:00 a 11:00 (t en minutos desde 00:00 del día 1).', initial, events }, null, 1));
console.log(`${events.length} eventos, ${initial.patients.length} pacientes iniciales`);
