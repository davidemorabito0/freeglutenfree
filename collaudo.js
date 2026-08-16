const fs = require('fs');
const { JSDOM } = require('jsdom');
const h = fs.readFileSync('app.html', 'utf8');

const js = h.split('<script>').pop().split('</scr' + 'ipt>')[0];
const css = h.split('<style>')[1].split('</style>')[0];
const markup = h.split('<script')[0];

const problemi = [];
const nota = (zona, t) => problemi.push(`[${zona}] ${t}`);
const sez = t => console.log('\n\x1b[1m' + t + '\x1b[0m');
const ok = (n, x, det) => { console.log('  ' + (x ? '✓' : '✗') + ' ' + n + (det ? '  → ' + det : '')); if (!x) nota('funzioni', n + (det ? ': ' + det : '')); };

// ─────────────────────────────────────────── ambiente
function apri() {
  const dom = new JSDOM(h.replace(/<script src="[^"]*"><\/script>/g, ''),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.github.io/f/' });
  const w = dom.window;
  const finto = () => ({
    addTo() { return this }, on() { return this }, remove() { }, setView() { return this },
    getBounds: () => ({
      contains: () => true, getSouth: () => 38.1, getWest: () => 15.5, getNorth: () => 38.3, getEast: () => 15.7,
      getNorthWest: () => ({ distanceTo: () => 8000 }), getSouthEast: () => ({})
    }),
    getZoom: () => 14, getCenter: () => ({ lat: 38.19, lng: 15.55 }), invalidateSize() { }, clearLayers() { }
  });
  w.L = { map: finto, tileLayer: finto, layerGroup: finto, circleMarker: finto, control: { zoom: finto } };
  w.navigator.geolocation = { getCurrentPosition: ok2 => ok2({ coords: { latitude: 38.19, longitude: 15.55 } }) };
  w.URL.createObjectURL = () => 'blob:x';
  // finta rete: risponde con dati plausibili
  w.fetch = (u, o) => {
    if (String(u).includes('_indice.json')) return Promise.resolve({ ok: false });
    if (String(u).includes('nominatim')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ address: { city: 'Messina' } }) });
    // rispondo intorno alle coordinate davvero richieste, come farebbe Overpass
    const m = String(o && o.body || '').match(/(?:around:\d+,|,)(-?\d+\.\d+),(-?\d+\.\d+)/);
    const LA = m ? +m[1] : 38.19, LN = m ? +m[2] : 15.55;
    return Promise.resolve({
      ok: true, json: () => Promise.resolve({
        elements: [
          { type: 'node', id: Math.round(LA*1e4)*10+1, lat: LA, lon: LN, tags: { name: 'Osteria Senza Glutine', amenity: 'restaurant', 'diet:gluten_free': 'only', phone: '090123', 'addr:city': 'Messina', 'addr:street': 'Via Roma' } },
          { type: 'node', id: Math.round(LA*1e4)*10+2, lat: LA+0.004, lon: LN+0.004, tags: { name: 'Bar Centro', amenity: 'bar', 'diet:gluten_free': 'yes' } },
          { type: 'node', id: Math.round(LA*1e4)*10+3, lat: LA-0.004, lon: LN-0.004, tags: { name: 'Farmacia Duomo', amenity: 'pharmacy' } },
          { type: 'node', id: Math.round(LA*1e4)*10+4, lat: LA+0.008, lon: LN+0.008, tags: { name: 'Conad', shop: 'supermarket', brand: 'Conad' } }
        ]
      }), text: () => Promise.resolve(h)
    });
  };
  const errori = [];
  w.addEventListener('error', e => errori.push(e.message));
  const orig = w.console.error;
  w.console.error = (...a) => errori.push(a.join(' '));
  try { w.eval(js); } catch (e) { errori.push('ECCEZIONE AVVIO: ' + e.message); }
  return { w, d: w.document, errori };
}

const clic = (w, el) => { if (el) el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const attendi = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════
(async () => {
  const { w, d, errori } = apri();
  await attendi(400);

  sez('1 · AVVIO');
  ok('nessuna eccezione', errori.length === 0, errori[0]);
  ok('schermata iniziale visibile', !d.querySelector('#lancio').hidden);
  ok('caricamento arriva in fondo', /pronto/.test(d.querySelector('#carico-mini').textContent));
  ok('sottotitolo aggiornato', /Messina|posti/.test(d.querySelector('#lancio-sotto').textContent));

  sez('2 · I QUATTRO INGRESSI DEL ROMBO');
  for (const [meta, vista] of [['v-vicino', 'Vicino'], ['v-mappa', 'Mappa'], ['v-viaggi', 'Viaggi'], ['v-salvati', 'Io']]) {
    const { w: w2, d: d2 } = apri();
    await attendi(300);
    clic(w2, d2.querySelector(`[data-meta="${meta}"]`));
    await attendi(420);
    ok(`${vista}: apre la vista giusta`, d2.querySelector('#' + meta).classList.contains('attiva'));
    ok(`${vista}: chiude la schermata iniziale`, d2.querySelector('#lancio').classList.contains('via'));
  }

  sez('3 · BARRA IN BASSO');
  for (const t of d.querySelectorAll('.scheda-tab')) {
    clic(w, t);
    await attendi(60);
    const v = t.dataset.vista;
    ok(`${t.textContent.trim()} → ${v}`, d.querySelector('#' + v).classList.contains('attiva')
      && [...d.querySelectorAll('.vista.attiva')].length === 1);
  }

  sez('4 · SOTTOMENU E VIE D\'USCITA');
  clic(w, d.querySelector('[data-vista="v-salvati"]'));
  await attendi(60);
  for (const [sel, nome] of [['#s-carta', 'Carta del celiaco'], ['#s-tessera', 'La mia tessera'],
  ['#s-buoni', 'Buoni mensili'], ['#s-profilo', 'Il mio profilo']]) {
    clic(w, d.querySelector(sel));
    await attendi(80);
    const f = d.querySelector('#foglio');
    const aperto = f.classList.contains('aperto');
    const chiudi = f.querySelector('#f-chiudi');
    ok(`${nome}: si apre`, aperto);
    ok(`${nome}: ha il tasto indietro`, !!chiudi);
    if (chiudi) {
      clic(w, chiudi); await attendi(60);
      ok(`${nome}: il tasto indietro chiude`, !f.classList.contains('aperto'));
    }
  }

  sez('5 · SCHEDA LOCALE');
  clic(w, d.querySelector('[data-vista="v-vicino"]'));
  await attendi(120);
  const primaCard = d.querySelector('[data-apri]');
  ok('esiste almeno un risultato', !!primaCard);
  if (primaCard) {
    clic(w, primaCard); await attendi(80);
    const f = d.querySelector('#foglio');
    ok('scheda locale si apre', f.classList.contains('aperto'));
    ok('scheda ha il tasto indietro', !!f.querySelector('#f-chiudi'));
    ok('scheda ha il tasto salva', !!f.querySelector('#f-salva'));
    clic(w, f.querySelector('#f-salva')); await attendi(40);
    ok('salvataggio registrato', /Salvato/.test(f.querySelector('#f-salva-t').textContent));
    clic(w, f.querySelector('#f-chiudi')); await attendi(60);
    ok('si torna indietro', !f.classList.contains('aperto'));
  }

  sez('6 · FINESTRE MODALI');
  clic(w, d.querySelector('[data-vista="v-mappa"]'));
  await attendi(60);
  for (const [sel, nome] of [['#b-tipi', 'Filtro tipo'], ['#b-guida', 'Guida livelli']]) {
    clic(w, d.querySelector(sel)); await attendi(60);
    const m = d.querySelector('#modale');
    ok(`${nome}: si apre`, !m.hidden);
    ok(`${nome}: ha il tasto di chiusura`, !!d.querySelector('#m-ok'));
    clic(w, d.querySelector('#m-ok')); await attendi(40);
    ok(`${nome}: si chiude`, m.hidden);
  }

  sez('7 · VETRINA A SCHERMO PIENO');
  clic(w, d.querySelector('[data-vista="v-salvati"]')); await attendi(60);
  clic(w, d.querySelector('#s-carta')); await attendi(80);
  clic(w, d.querySelector('#b-mostra')); await attendi(60);
  const vt = d.querySelector('#vetrina');
  ok('vetrina si apre', !vt.hidden);
  ok('vetrina ha il tasto chiudi', !!d.querySelector('#v-chiudi'));
  clic(w, d.querySelector('#v-chiudi')); await attendi(40);
  ok('vetrina si chiude', vt.hidden);
  clic(w, d.querySelector('#f-chiudi'));

  sez('8 · INTERRUTTORE MODALITÀ');
  clic(w, d.querySelector('[data-vista="v-mappa"]')); await attendi(60);
  clic(w, d.querySelector('[data-modo="comprare"]')); await attendi(400);
  const accesi = [...d.querySelectorAll('[data-modo="comprare"]')].every(b => b.getAttribute('aria-pressed') === 'true');
  ok('entrambi gli interruttori si aggiornano', accesi);
  ok('spettro cambia contenuto', /Farmacia|Super|Bio/.test(d.querySelector('#spettro').textContent));
  clic(w, d.querySelector('[data-modo="mangiare"]')); await attendi(300);
  ok('si torna a mangiare', /100% GF|Da verificare/.test(d.querySelector('#spettro').textContent));

  sez('9 · VIAGGI');
  clic(w, d.querySelector('[data-vista="v-viaggi"]')); await attendi(60);
  ok('città iconiche presenti', d.querySelectorAll('[data-citta]').length === 8);
  ok('campo di ricerca presente', !!d.querySelector('#q-citta'));
  clic(w, d.querySelector('#b-tutte')); await attendi(60);
  ok('elenco alfabetico si apre', !d.querySelector('#modale').hidden);
  ok('elenco è ordinato', (() => {
    const n = [...d.querySelectorAll('[data-scegli]')].map(x => x.textContent);
    return JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => a.localeCompare(b, 'it')));
  })());
  clic(w, d.querySelector('#m-ok')); await attendi(40);
  clic(w, d.querySelector('[data-citta="Milano"]')); await attendi(1000);
  ok('scelta città produce risultati', d.querySelectorAll('#lista-viaggio [data-apri]').length > 0,
     d.querySelector('#lista-viaggio').textContent.trim().replace(/\s+/g,' ').slice(0,70));

  // ══════════════════════════════════════════════════════════════
  sez('10 · COERENZA DEL CODICE');

  const dichiarate = [...js.matchAll(/^(?:async )?function ([a-zA-Z0-9_]+)/gm)].map(m => m[1]);
  const dupFun = dichiarate.filter((x, i) => dichiarate.indexOf(x) !== i);
  ok('nessuna funzione dichiarata due volte', dupFun.length === 0, dupFun.join(', '));

  const costanti = [...js.matchAll(/^const ([A-Za-z0-9_]+)\s*=/gm)].map(m => m[1]);
  const dupCost = costanti.filter((x, i) => costanti.indexOf(x) !== i);
  ok('nessuna costante dichiarata due volte', dupCost.length === 0, dupCost.join(', '));

  const mai = dichiarate.filter(f => (js.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length < 2);
  ok('nessuna funzione morta', mai.length === 0, mai.join(', '));

  // nomi coerenti: un solo verbo per famiglia
  const fam = {};
  dichiarate.forEach(f => { const v = f.match(/^[a-z]+/)[0]; (fam[v] ||= []).push(f); });
  const verbi = Object.keys(fam).sort();
  console.log('  · verbi usati: ' + verbi.map(v => `${v}(${fam[v].length})`).join(' '));
  const sinonimi = [['disegna', 'costruisci', 'dipingi', 'renderizza'], ['apri', 'mostra', 'visualizza']];
  sinonimi.forEach(g => {
    const usati = g.filter(v => fam[v]);
    if (usati.length > 1) nota('nomi', `verbi sinonimi in uso: ${usati.join(' / ')} → ${usati.map(v => fam[v].join(',')).join(' | ')}`);
  });

  // id referenziati nel JS ma mai creati, né in markup né dinamicamente
  const idMarkup = new Set([...markup.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));
  const idDinamici = new Set([...js.matchAll(/id="([a-zA-Z0-9_${}.\-]+)"/g)].map(m => m[1]));
  const usatiJS = [...new Set([...js.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]))];
  const fantasma = usatiJS.filter(i => !idMarkup.has(i) && !idDinamici.has(i));
  ok('nessun id fantasma', fantasma.length === 0, fantasma.join(', '));

  const idDupMarkup = [...markup.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]);
  const dupId = idDupMarkup.filter((x, i) => idDupMarkup.indexOf(x) !== i);
  ok('nessun id ripetuto nel markup', dupId.length === 0, dupId.join(', '));

  sez('11 · FOGLI DI STILE');
  const selettori = [...css.matchAll(/^\.([a-zA-Z0-9_-]+)\s*\{/gm)].map(m => m[1]);
  const dupSel = [...new Set(selettori.filter((x, i) => selettori.indexOf(x) !== i))];
  ok('nessuna classe ridefinita', dupSel.length === 0, dupSel.join(', '));

  const zeta = [...css.matchAll(/z-index:\s*(\d+)/g)].map(m => +m[1]).sort((a, b) => a - b);
  console.log('  · livelli di sovrapposizione: ' + [...new Set(zeta)].join(' < '));
  ok('la schermata iniziale sta sopra le viste', /\.lancio\{[^}]*z-index:1850/s.test(css));
  ok('la vetrina sta sopra i fogli', /\.vetrina\{[^}]*z-index:1900/s.test(css));

  // testi potenzialmente sovrapposti: elementi in absolute senza z-index nei cappelli
  const absSenzaZ = [...css.matchAll(/\.([a-zA-Z0-9_-]+)(::after|::before)?\{([^}]*position:absolute[^}]*)\}/gs)]
    .filter(m => !/z-index|pointer-events:none/.test(m[3])).map(m => m[1] + (m[2] || ''));
  console.log('  · in posizione assoluta senza livello né trasparenza ai tocchi: ' + (absSenzaZ.join(', ') || 'nessuno'));

  sez('12 · CONTENUTI');
  ok('titolo di pagina', /freeglutenfree/.test(h.match(/<title>([^<]*)<\/title>/)[1]));
  ok('descrizione per i motori', (markup.match(/name="description" content="([^"]+)"/) || ['', ''])[1].length > 120);
  ok('versione coerente ovunque', (() => {
    const a = (js.match(/const VERSIONE = '([^']+)'/) || [])[1];
    const b = (markup.match(/v(\d+\.\d+) &middot;/) || [])[1];
    return a && b && a === b;
  })(), (js.match(/const VERSIONE = '([^']+)'/) || [])[1] + ' vs ' + (markup.match(/v(\d+\.\d+) &middot;/) || [])[1]);


  sez('13 · RISCHIO SOVRAPPOSIZIONI');
  const flexButton = /\.riga-card\{[^}]*display:flex/.test(css);
  const capoInButton = [...js.matchAll(/<button class="riga-card"[\s\S]{0,400}?<\/button>/g)]
    .filter(m => /white-space:\s*normal/.test(m[0]));
  ok('nessun pulsante flex con testo a capo', capoInButton.length === 0,
     capoInButton.length + ' casi (in WebKit non crescono in altezza)');
  ok('le scelte descritte usano .opzione', /class="opzione"/.test(js));
  ok('.opzione non e un button', !/<button class="opzione"/.test(js));
  ok('.riga-corpo taglia gli eccessi', /\.riga-corpo\{[^}]*overflow:hidden/.test(css));
  const senzaCapo = /\.riga-corpo \.meta\{[^}]*white-space:nowrap/.test(css);
  ok('la meta resta su una riga', senzaCapo);
  // ogni testo lungo deve stare in un contenitore che cresce
  const lunghi = [...js.matchAll(/<(div|p) class="(meta|testo)"[^>]*>\$\{esc\((\w+)\.desc\)\}/g)];
  ok('descrizioni lunghe in contenitori elastici', lunghi.every(m => m[2]!=='meta'));

  // ══════════════════════════════════════════════════════════════
  sez('ESITO');
  if (!problemi.length) console.log('  \x1b[32mNessun problema rilevato.\x1b[0m');
  else { console.log('  \x1b[31m' + problemi.length + ' da sistemare:\x1b[0m'); problemi.forEach(p => console.log('   • ' + p)); }
})();
