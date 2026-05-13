#!/usr/bin/env node
/**
 * Генератор venue.json
 *
 * Создаёт JSON-описание зала из набора параметров.
 * Использование:
 *   node scripts/generate-venue.js <preset>
 *
 * Доступные пресеты определены ниже в объекте PRESETS.
 * Чтобы добавить свой зал — добавьте новый ключ в PRESETS и запустите скрипт.
 *
 * Можно также импортировать функцию buildVenue() из этого файла
 * и использовать программно.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'venues');

// =============================================================================
// ПРЕСЕТЫ ЗАЛОВ
// =============================================================================
// Каждый пресет — набор параметров для buildVenue.
// Чтобы создать новый зал — добавьте сюда новый ключ и запустите скрипт.

const PRESETS = {
  'hall-concert': {
    id: 'hall-concert',
    name: 'Концертный зал · 600 мест',
    description: 'Классический концертный зал с партером и двумя балконами',
    categories: [
      { id: 'vip',      label: 'VIP',      price: 250, color: '#1a1a1a' },
      { id: 'standard', label: 'Партер',   price: 120, color: '#6a6a6a' },
      { id: 'economy',  label: 'Балкон',   price:  60, color: '#a8a8a8' },
    ],
    stage: { x: 0, y: 0, z: -2, width: 12, depth: 1.5 },
    sections: [
      {
        type: 'rectangular',
        id: 'parter', label: 'Партер',
        origin: { x: 0, y: 0, z: 2 }, rotation: 0,
        rows: 12, seatsPerRow: 24,
        vipFront: 3, vipCenterFrom: 8, vipCenterTo: 16,
        defaultCategory: 'standard',
        aisle: [11, 12], aisleEndRow: 10,
        soldRatio: 0.15,
      },
      {
        type: 'rectangular',
        id: 'balcony-left', label: 'Балкон левый',
        origin: { x: -10, y: 2.5, z: 4 }, rotation: 0.25,
        rows: 5, seatsPerRow: 10,
        defaultCategory: 'economy',
        soldRatio: 0.2,
      },
      {
        type: 'rectangular',
        id: 'balcony-right', label: 'Балкон правый',
        origin: { x: 10, y: 2.5, z: 4 }, rotation: -0.25,
        rows: 5, seatsPerRow: 10,
        defaultCategory: 'economy',
        soldRatio: 0.2,
      },
    ],
  },

  'hall-theatre': {
    id: 'hall-theatre',
    name: 'Театр · 320 мест',
    description: 'Камерный театр с амфитеатром, без балконов',
    categories: [
      { id: 'premium', label: 'Премьер',  price: 180, color: '#1a1a1a' },
      { id: 'regular', label: 'Основной', price:  90, color: '#6a6a6a' },
    ],
    stage: { x: 0, y: 0, z: -2, width: 10, depth: 1.5 },
    sections: [
      {
        type: 'rectangular',
        id: 'orchestra', label: 'Партер',
        origin: { x: 0, y: 0, z: 2 }, rotation: 0,
        rows: 10, seatsPerRow: 20,
        vipFront: 4, vipCenterFrom: 6, vipCenterTo: 14,
        defaultCategory: 'regular',
        vipCategory: 'premium',
        soldRatio: 0.1,
      },
      {
        type: 'rectangular',
        id: 'amphitheatre', label: 'Амфитеатр',
        origin: { x: 0, y: 1.2, z: 13 }, rotation: 0,
        rows: 6, seatsPerRow: 20,
        defaultCategory: 'regular',
        soldRatio: 0.15,
      },
    ],
  },

  'hall-club': {
    id: 'hall-club',
    name: 'Клуб · 120 мест',
    description: 'Камерная площадка для небольших концертов',
    categories: [
      { id: 'table',    label: 'Стол',     price: 100, color: '#1a1a1a' },
      { id: 'standing', label: 'Стоячая',  price:  40, color: '#a8a8a8' },
    ],
    stage: { x: 0, y: 0, z: -2, width: 8, depth: 1.2 },
    sections: [
      {
        type: 'rectangular',
        id: 'tables', label: 'Столы',
        origin: { x: 0, y: 0, z: 1 }, rotation: 0,
        rows: 4, seatsPerRow: 12,
        defaultCategory: 'table',
        soldRatio: 0.25,
      },
      {
        type: 'rectangular',
        id: 'standing', label: 'Стоячая зона',
        origin: { x: 0, y: 0, z: 6 }, rotation: 0,
        rows: 6, seatsPerRow: 12,
        defaultCategory: 'standing',
        soldRatio: 0.3,
      },
    ],
  },
};

// =============================================================================
// ЛОГИКА ГЕНЕРАЦИИ
// =============================================================================

function buildRectangularSection(spec) {
  const seats = [];
  const seatPitchX = 0.55;
  const rowPitchZ = 0.85;

  for (let r = 0; r < spec.rows; r++) {
    for (let s = 0; s < spec.seatsPerRow; s++) {
      // Пропуск в проходах (если заданы)
      if (spec.aisle?.includes(s) && r < (spec.aisleEndRow ?? spec.rows)) continue;

      // Определение категории
      let category = spec.defaultCategory;
      const isFront = r < (spec.vipFront ?? 0);
      const isCenter = spec.vipCenterFrom !== undefined
        ? s >= spec.vipCenterFrom && s < spec.vipCenterTo
        : false;
      if (isFront && isCenter) {
        category = spec.vipCategory ?? 'vip';
      }

      seats.push({
        id: `${spec.id}-r${r}-s${s}`,
        row: r + 1,
        number: s + 1,
        category,
        x: (s - spec.seatsPerRow / 2 + 0.5) * seatPitchX,
        z: r * rowPitchZ,
        status: Math.random() < (spec.soldRatio ?? 0.15) ? 'sold' : 'available',
      });
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    origin: spec.origin,
    rotation: spec.rotation,
    seats,
  };
}

export function buildVenue(preset) {
  const sections = preset.sections.map((spec) => {
    if (spec.type === 'rectangular') {
      return buildRectangularSection(spec);
    }
    throw new Error(`Unknown section type: ${spec.type}`);
  });

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    categories: preset.categories,
    stage: preset.stage,
    sections,
    modelCalibration: { scale: 1, x: 0, y: 0, z: 0, rotY: 0 },
  };
}

// =============================================================================
// CLI
// =============================================================================

const arg = process.argv[2];

mkdirSync(OUTPUT_DIR, { recursive: true });

if (arg === 'all' || !arg) {
  // Генерируем всё + index
  const indexEntries = [];
  for (const [key, preset] of Object.entries(PRESETS)) {
    const venue = buildVenue(preset);
    const outPath = join(OUTPUT_DIR, `${key}.json`);
    writeFileSync(outPath, JSON.stringify(venue, null, 2));
    const totalSeats = venue.sections.reduce((s, sec) => s + sec.seats.length, 0);
    indexEntries.push({
      id: venue.id,
      name: venue.name,
      description: venue.description,
      file: `${key}.json`,
      seatCount: totalSeats,
    });
    console.log(`✓ ${outPath} (${totalSeats} seats)`);
  }
  const indexPath = join(OUTPUT_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify({ venues: indexEntries }, null, 2));
  console.log(`✓ ${indexPath}`);
} else if (PRESETS[arg]) {
  const venue = buildVenue(PRESETS[arg]);
  const outPath = join(OUTPUT_DIR, `${arg}.json`);
  writeFileSync(outPath, JSON.stringify(venue, null, 2));
  console.log(`✓ ${outPath}`);
} else {
  console.error(`Unknown preset: ${arg}`);
  console.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
  console.error(`Or use 'all' to generate everything.`);
  process.exit(1);
}
