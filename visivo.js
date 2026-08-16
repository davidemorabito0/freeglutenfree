/* ══════════════════════════════════════════════════════════════════════
   VERIFICA VISIVA — questo apre l'app in un browser vero, misura la
   posizione di ogni elemento di testo e segnala le sovrapposizioni.
   E' il controllo che mancava: jsdom non calcola il layout, quindi le
   scritte accavallate non poteva vederle.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const FILE = 'file://' + path.resolve('app.html');

const SCHERMI = [
  { nome: 'iPhone SE',      w: 375, h: 667 },
  { nome: 'iPhone 14 Pro',  w: 393, h: 852 },
  { nome: 'iPhone Pro Max', w: 430, h: 932 },
];

const problemi = [];

// finto ambiente: niente rete, posizione fissa, dati plausibili
const PRELUDIO = () => {
  // Leaflet arriva da una rete che qui non c'e': lo sostituisco, altrimenti
  // lo script si ferma alla prima riga e non si verifica niente.
  const nulla = () => {
    const o = {
      addTo(){return o}, on(){return o}, remove(){}, setView(){return o},
      getBounds(){ return { contains:()=>true, getSouth:()=>37.05, getWest:()=>15.25,
        getNorth:()=>37.10, getEast:()=>15.32,
        getNorthWest:()=>({distanceTo:()=>9000}), getSouthEast:()=>({}) }; },
      getZoom(){return 14}, getCenter(){return {lat:37.075,lng:15.286}},
      invalidateSize(){}, clearLayers(){}
    };
    return o;
  };
  window.L = { map:nulla, tileLayer:nulla, layerGroup:nulla, circleMarker:nulla,
               control:{ zoom:nulla } };
  const punti = (lat, lng) => ({
    elements: [
      { type: 'node', id: Math.round(lat * 1e4) * 10 + 1, lat, lon: lng, tags: { name: 'Parafarmacia Medical Service Center', amenity: 'pharmacy', operator: 'Riccioli Francesca e C.', 'addr:city': 'Siracusa', 'addr:street': 'Via Tisia', 'addr:housenumber': '112', phone: '0931123456' } },
      { type: 'node', id: Math.round(lat * 1e4) * 10 + 2, lat: lat + 0.003, lon: lng, tags: { name: 'In Coop', shop: 'supermarket', brand: 'Coop', 'addr:city': 'Siracusa' } },
      { type: 'node', id: Math.round(lat * 1e4) * 10 + 3, lat: lat - 0.003, lon: lng, tags: { name: 'Green Beauty Boutique', shop: 'herbalist', 'addr:city': 'Siracusa' } },
      { type: 'node', id: Math.round(lat * 1e4) * 10 + 4, lat: lat + 0.005, lon: lng + 0.002, tags: { name: 'Osteria Interamente Senza Glutine del Porto Grande', amenity: 'restaurant', 'diet:gluten_free': 'only', cuisine: 'sicilian;seafood', website: 'https://x.it', phone: '0931999', 'addr:city': 'Siracusa', 'addr:street': 'Lungomare Alfeo', takeaway: 'yes', 'diet:lactose_free': 'yes', description: 'Cucina interamente dedicata, senza alcun contatto con farine di frumento.' } },
      { type: 'node', id: Math.round(lat * 1e4) * 10 + 5, lat: lat - 0.005, lon: lng, tags: { name: 'Bar Ortigia', amenity: 'bar', 'diet:gluten_free': 'yes', 'addr:city': 'Siracusa' } },
    ]
  });
  window.__punti = punti;
  const vero = window.fetch;
  window.fetch = (u, o) => {
    const s = String(u);
    if (s.includes('_indice')) return Promise.resolve({ ok: false });
    if (s.includes('nominatim')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ address: { city: 'Siracusa' } }) });
    if (s.includes('overpass')) {
      const m = String((o && o.body) || '').match(/around:\d+,(-?[\d.]+),(-?[\d.]+)/);
      const la = m ? +m[1] : 37.075, ln = m ? +m[2] : 15.286;
      return new Promise(r => setTimeout(() => r({ ok: true, json: () => Promise.resolve(punti(la, ln)) }), 120));
    }
    return vero(u, o);
  };
  navigator.geolocation.getCurrentPosition = ok => setTimeout(() => ok({ coords: { latitude: 37.075, longitude: 15.286 } }), 60);
};

/* Trova coppie di elementi con testo che si sovrappongono pur non essendo
   uno dentro l'altro: e' la firma esatta delle scritte accavallate. */
const RILEVA = () => {
  const visibile = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight + 400;
  };
  const testoProprio = el => [...el.childNodes]
    .filter(n => n.nodeType === 3 && n.textContent.trim().length > 1).length > 0;

  const nodi = [...document.querySelectorAll('body *')]
    .filter(el => !el.closest('.lancio[hidden]'))
    .filter(el => testoProprio(el) && visibile(el))
    .map(el => ({ el, r: el.getBoundingClientRect(), t: el.textContent.trim().slice(0, 40) }));

  const scontri = [];
  for (let i = 0; i < nodi.length; i++) {
    for (let j = i + 1; j < nodi.length; j++) {
      const a = nodi[i], b = nodi[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // strati diversi (modale sopra la pagina) non sono un difetto
      const za = a.el.closest('.foglio,.modale,.vetrina,.lancio,.schede');
      const zb = b.el.closest('.foglio,.modale,.vetrina,.lancio,.schede');
      if (za !== zb) continue;
      const sx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const sy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (sx > 4 && sy > 4) {
        scontri.push({
          a: a.t, b: b.t,
          ca: a.el.className || a.el.tagName, cb: b.el.className || b.el.tagName,
          area: Math.round(sx * sy)
        });
      }
    }
  }
  // testo che esce dal proprio contenitore
  const traboccati = [];
  for (const n of nodi) {
    const p = n.el.parentElement;
    if (!p) continue;
    const pr = p.getBoundingClientRect();
    if (getComputedStyle(p).overflow !== 'visible') continue;
    if (n.r.bottom > pr.bottom + 4) {
      traboccati.push({ t: n.t, dentro: p.className || p.tagName, sotto: Math.round(n.r.bottom - pr.bottom) });
    }
  }
  // elementi che escono dallo schermo in larghezza
  const inCarosello = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
      if (p === document.body) break;
    }
    return false;
  };
  const fuori = nodi.filter(n => (n.r.left < -2 || n.r.right > innerWidth + 2) && !inCarosello(n.el))
    .map(n => ({ t: n.t, c: n.el.className, l: Math.round(n.r.left), r: Math.round(n.r.right) }));

  return { scontri, traboccati, fuori, conta: nodi.length };
};

const attesa = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  for (const s of SCHERMI) {
    console.log(`\n\x1b[1m▸ ${s.nome}  ${s.w}×${s.h}\x1b[0m`);
    const pg = await browser.newPage();
    pg.on('pageerror', e => problemi.push(`${s.nome}: errore di pagina — ${e.message.split('\n')[0]}`));
    pg.on('requestfailed', () => {});
    await pg.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.evaluateOnNewDocument(PRELUDIO);
    await pg.goto(FILE, { waitUntil: 'networkidle0' });
    await attesa(2200);

    const tappe = [
      ['schermata iniziale', async () => { }],
      ['vicino a me', async () => { await pg.click('[data-meta="v-vicino"]'); await attesa(1400); }],
      ['vicino · spesa', async () => { await pg.click('[data-modo="comprare"]'); await attesa(1400); }],
      ['mappa', async () => { await pg.click('[data-vista="v-mappa"]'); await attesa(700); }],
      ['viaggi', async () => { await pg.click('[data-vista="v-viaggi"]'); await attesa(400); await pg.click('[data-citta="Milano"]'); await attesa(1600); }],
      ['io', async () => { await pg.click('[data-vista="v-salvati"]'); await attesa(400); }],
      ['carta del celiaco', async () => { await pg.click('#s-carta'); await attesa(500); }],
      ['buoni mensili', async () => { await pg.click('#f-chiudi'); await attesa(300); await pg.click('#s-buoni'); await attesa(500); }],
      ['profilo', async () => { await pg.click('#f-chiudi'); await attesa(300); await pg.click('#s-profilo'); await attesa(500); }],
      ['scheda locale', async () => { await pg.click('#f-chiudi'); await attesa(300); await pg.click('[data-vista="v-vicino"]'); await attesa(400); await pg.click('[data-apri]'); await attesa(600); }],
    ];

    for (const [nome, azione] of tappe) {
      try { await azione(); } catch (e) { problemi.push(`${s.nome} · ${nome}: non raggiungibile (${e.message.split('\n')[0]})`); continue; }
      // scorro tutta la schermata, non solo la prima parte
      const alt = await pg.evaluate(() => {
        const c = document.querySelector('.foglio.aperto') || document.querySelector('.vista.attiva') || document.body;
        return c.scrollHeight;
      });
      let esito = { scontri: [], traboccati: [], fuori: [], conta: 0 };
      for (let y = 0; y < Math.max(alt, 1); y += s.h - 120) {
        await pg.evaluate(yy => {
          const c = document.querySelector('.foglio.aperto') || document.querySelector('.vista.attiva');
          if (c) c.scrollTop = yy;
        }, y);
        await attesa(120);
        const e = await pg.evaluate(RILEVA);
        esito.scontri.push(...e.scontri); esito.traboccati.push(...e.traboccati);
        esito.fuori.push(...e.fuori); esito.conta = Math.max(esito.conta, e.conta);
        if (y + s.h >= alt) break;
      }
      const unici = a => [...new Map(a.map(x => [JSON.stringify(x), x])).values()];
      const sc = unici(esito.scontri), tr = unici(esito.traboccati), fu = unici(esito.fuori);
      const tot = sc.length + tr.length + fu.length;
      console.log(`  ${tot ? '✗' : '✓'} ${nome.padEnd(22)} ${esito.conta} elementi di testo`);
      sc.forEach(x => { const m = `${s.nome} · ${nome}: «${x.a}» sovrapposto a «${x.b}» (${x.ca} / ${x.cb}, ${x.area}px²)`; console.log('      ' + m); problemi.push(m); });
      tr.forEach(x => { const m = `${s.nome} · ${nome}: «${x.t}» esce di ${x.sotto}px da .${x.dentro}`; console.log('      ' + m); problemi.push(m); });
      fu.forEach(x => { const m = `${s.nome} · ${nome}: «${x.t}» fuori schermo (${x.l}→${x.r} su ${s.w})`; console.log('      ' + m); problemi.push(m); });
    }

    if (process.env.FOTO) {
      await pg.evaluate(() => { const f = document.querySelector('.foglio.aperto'); if (f) f.classList.remove('aperto'); });
      await attesa(300);
      await pg.screenshot({ path: `foto-${s.nome.replace(/\s/g, '')}.png` });
    }
    await pg.close();
  }

  await browser.close();
  console.log('\n\x1b[1mESITO VISIVO\x1b[0m');
  if (!problemi.length) console.log('  \x1b[32mNessuna sovrapposizione, nessun testo fuori posto.\x1b[0m');
  else { console.log(`  \x1b[31m${problemi.length} da sistemare\x1b[0m`); process.exitCode = 1; }
})();
