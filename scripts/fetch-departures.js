// scripts/fetch-departures.js
// Scrapes w3.srbvoz.rs for each configured station and writes data/departures.json

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// ─── Station config ───────────────────────────────────────────────────────────
// Add or remove stations here. Code = internal srbvoz station ID.
const STATIONS = [
  { name: 'BATAJNICA',        code: '16204' },
  { name: 'BEOGRAD CENTAR',   code: '16094' },
  { name: 'NOVI BEOGRAD',     code: '16100' },
  { name: 'ZEMUN',            code: '16102' },
  { name: 'BEOGRAD DUNAV',    code: '16096' },
  { name: 'PANČEVO VOJLOVICA',code: '16210' },
  { name: 'OVCA',             code: '16214' },
  { name: 'RESNIK',           code: '16108' },
  { name: 'RAKOVICA',         code: '16110' },
  { name: 'BEOGRAD PROKOP',   code: '16098' },
];

const BASE_URL = 'https://w3.srbvoz.rs/redvoznje//stanicni';

// Format today's date as DD.MM.YYYY
function todayFormatted() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Build the URL for a station
function buildUrl(stationName, stationCode, date) {
  return `${BASE_URL}/${encodeURIComponent(stationName)}/${stationCode}/${date}/0000/polazak/999/sr`;
}

// Parse the HTML table into an array of departure objects
function parseDepartures(html, stationName) {
  const $ = cheerio.load(html);
  const departures = [];

  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return; // skip header / expanded rows

    const trainNo   = $(cells[0]).text().trim();
    const departure = $(cells[1]).text().trim();
    const destStation = $(cells[2]).text().trim();
    const arrival   = $(cells[3]).text().trim();
    const rank      = $(cells[4]).text().trim();
    const delay     = $(cells[6]).text().trim();
    const note      = $(cells[7]).text().trim();

    // Filter out expanded detail rows (they repeat train number in long text)
    if (!trainNo || !/^\d+$/.test(trainNo)) return;
    if (!departure.match(/^\d{2}:\d{2}$/)) return;

    departures.push({
      trainNo,
      departure,
      destination: destStation,
      arrival,
      rank: rank || null,
      delay: delay || null,
      note: note || null,
    });
  });

  return departures;
}

// Fetch one station
async function fetchStation(station, date) {
  const url = buildUrl(station.name, station.code, date);
  console.log(`Fetching: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BG-VOZ-PWA/1.0)',
        'Accept-Language': 'sr,en;q=0.9',
      },
      timeout: 15000,
    });

    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${station.name}`);
      return { station: station.name, departures: [], error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const departures = parseDepartures(html, station.name);
    console.log(`  → ${departures.length} departures`);
    return { station: station.name, departures };
  } catch (err) {
    console.error(`  Error fetching ${station.name}:`, err.message);
    return { station: station.name, departures: [], error: err.message };
  }
}

// Main
async function main() {
  const date = todayFormatted();
  console.log(`\nBG:VOZ scraper — date: ${date}\n`);

  const results = {};

  for (const station of STATIONS) {
    const data = await fetchStation(station, date);
    results[station.name] = {
      departures: data.departures,
      ...(data.error ? { error: data.error } : {}),
    };
    // Small delay to be polite to the server
    await new Promise(r => setTimeout(r, 500));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    stations: results,
  };

  // Ensure output directory exists
  const outDir = path.resolve('data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'departures.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✓ Written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
