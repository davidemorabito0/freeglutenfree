/* ══════════════════════════════════════════════════════════════════════
   SPAZZOLATA — preme ogni comando di ogni schermata.
   Per ciascuno verifica che: non compaiano errori, la pagina resti
   reattiva, e da dove si finisce si possa tornare indietro.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const http = require('http');

const CHROME = '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const PORTA = 8085;
const attesa = ms => new Promise(r => setTimeout(r, ms));
const BASE = fs.readFileSync('visivo.js', 'utf8').split('const PRELUDIO = () => {')[1].split('\n};')[0];

/* Finto server completo: autenticazione, profili, luoghi, recensioni. */
const SERVER = `
const _db = () => { try { return JSON.parse(localStorage.getItem('__db') ||
  '{"rece":[],"abusi":[],"salvati":[],"salute":null,"profilo":{"id":"u1","nome":"Davide","avatar_url":null}}'); }
  catch(e){ return {rece:[],abusi:[],salvati:[],salute:null,profilo:{id:'u1',nome:'Davide'}}; } };
const _sd = d => { try { localStorage.setItem('__db', JSON.stringify(d)); } catch(e){} };
const vecchia = window.fetch;
window.fetch = (u, o) => {
  const s = String(u), m = (o && o.method) || 'GET';
  const corpo = () => { try { return JSON.parse(o.body); } catch(e){ return null; } };
  const ok = d => Promise.resolve({ ok:true, status:200, text:()=>Promise.resolve(JSON.stringify(d)) });
  const d = _db();
  if (s.includes('/auth/v1/signup') || s.includes('grant_type=password'))
    return ok({ access_token:'t', refresh_token:'r', user:{ id:'u1', email:'d@x.it' } });
  if (s.includes('/auth/v1/logout') || s.includes('/auth/v1/recover')) return ok({});
  if (s.includes('/rest/v1/profili')) { if (m==='PATCH'){ Object.assign(d.profilo, corpo()); _sd(d); return ok(null);} return ok([d.profilo]); }
  if (s.includes('/rest/v1/profilo_salute')) { if (m==='POST'){ d.salute = corpo()[0]; _sd(d); return ok(null);} return ok(d.salute?[d.salute]:[]); }
  if (s.includes('elimina_miei_dati_salute')) { d.salute=null; _sd(d); return ok(null); }
  if (s.includes('elimina_mio_account')) { _sd({rece:[],abusi:[],salvati:[],salute:null,profilo:{id:'u1',nome:'Davide'}}); return ok(null); }
  if (s.includes('/rest/v1/salvati')) { if (m==='POST'){ d.salvati=[...d.salvati,...corpo()]; _sd(d); return ok(null);} 
    if (m==='DELETE') return ok(null); return ok(d.salvati); }
  if (s.includes('/rest/v1/cancellati')) { if (m==='POST') return ok(null); return ok([]); }
  if (s.includes('/rest/v1/recensioni')) {
    if (m==='POST'){ const r=corpo()[0]; const i=d.rece.findIndex(x=>x.chiave===r.chiave && x.autore_id===r.autore_id);
      const v={...r,id:i>=0?d.rece[i].id:Date.now(),creato_il:new Date().toISOString(),segnalazioni:0,autore:{nome:'Davide',avatar_url:null}};
      i>=0?d.rece[i]=v:d.rece.push(v); _sd(d); return ok(null); }
    if (m==='DELETE'){ d.rece=[]; _sd(d); return ok(null); }
    const ch=decodeURIComponent((s.split('chiave=eq.')[1]||'').split('&')[0]);
    return ok(ch ? d.rece.filter(x=>x.chiave===ch) : d.rece); }
  if (s.includes('/rest/v1/abusi')) { d.abusi.push(corpo()[0]); _sd(d); return ok(null); }
  if (s.includes('/storage/')) return ok({});
  return vecchia(u, o);
};
`;

const problemi = [];
const nota = t => problemi.push(t);
const sez = t => console.log('\n\x1b[1m' + t + '\x1b[0m');

(async () => {
  const server = http.createServer((q, r) => {
    if (q.url.endsWith('.js')) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(fs.readFileSync('app.html'));
  });
  await new Promise(r => server.listen(PORTA, r));

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'], protocolTimeout: 15000
  });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  let errori = [];
  pg.on('pageerror', e => errori.push(e.message.split('\n')[0]));
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;   // CDN e font bloccati qui
    errori.push('console: ' + t.slice(0, 90));
  });

  await pg.evaluateOnNewDocument(new Function(BASE));
  await pg.evaluateOnNewDocument(SERVER);

  const vivo = async () => {
    try { await pg.evaluate(() => 1); return true; } catch (e) { return false; }
  };
  const premi = async sel => {
    return pg.evaluate(s => {
      const e = document.querySelector(s);
      if (!e) return false;
      e.scrollIntoView({ block: 'nearest', inline: 'center' });
      setTimeout(() => e.click(), 0);
      return true;
    }, sel);
  };
  const testo = async sel => pg.evaluate(s =>
    (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);

  /* Riporta l'applicazione a uno stato noto e collegato. */
  const avvia = async () => {
    await pg.goto(`http://localhost:${PORTA}/`, { waitUntil: 'domcontentloaded' });
    await attesa(2600);
    await pg.evaluate(() => {
      Nube.scriviSess({ access_token:'t', refresh_token:'r', user:{ id:'u1', email:'d@x.it' } });
      Nube.profilo = { id:'u1', nome:'Davide' };
    });
    await premi('[data-meta="v-vicino"]');
    await attesa(1800);
    // congedo la scheda del profilo del primo avvio
    await pg.evaluate(() => document.querySelector('.foglio.aperto #f-chiudi')?.click());
    await attesa(400);
  };

  /* Molte schermate hanno tasti che compaiono solo quando c'e' qualcosa
     dentro: elimina, modifica, segnala. Senza dati resterebbero non
     provati, ed e' proprio li' che si annidano i guasti. */
  const semina = async () => {
    await pg.evaluate(() => {
      const luogo = [...S.locali.values()][0];
      if (luogo) {
        Archivio.salva({ k:luogo.k, nome:luogo.nome, lat:luogo.lat, lng:luogo.lng,
          modo:luogo.modo, liv:luogo.livello, cat:luogo.cat, tipo:luogo.tipo,
          comune:'Siracusa', coll:'Siracusa', stato:'provato', nota:'Nota di prova', orari:'chiuso il luned\u00ec' });
        Archivio.salva({ k:'mio:1', nome:'Trattoria di prova', lat:luogo.lat+0.001, lng:luogo.lng,
          modo:'mangiare', liv:'gf_100', tipo:'ristorante', origine:'mio', comune:'Siracusa',
          indirizzo:'Via Prova 1', coll:'Siracusa', stato:'preferito', nota:'Ottimo',
          foto:['data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='] });
      }
      Salute.scrivi({ condizione:'celiachia', sensibilita:'alta',
        tessera_ente:'ASL Siracusa', tessera_codice:'SR12345', tessera_scadenza:'2027-12-31',
        buoni_importo:90, buoni_spese:[{id:'1',data:new Date().toISOString(),importo:12.5,dove:'Farmacia'}] });
      const d = JSON.parse(localStorage.getItem('__db') || '{}');
      d.rece = d.rece || []; d.abusi = d.abusi || []; d.salvati = d.salvati || [];
      d.profilo = d.profilo || {id:'u1',nome:'Davide'};
      d.rece = [{ id:1, autore_id:'u1', chiave:luogo ? luogo.k : 'x', luogo_nome:luogo ? luogo.nome : 'Locale',
        comune:'Siracusa', voto:4, testo:'Racconto di prova', foto_urls:[], stato:'pubblicata',
        creato_il:new Date().toISOString(), autore:{nome:'Davide',avatar_url:null} },
        { id:2, autore_id:'u2', chiave:luogo ? luogo.k : 'x', luogo_nome:luogo ? luogo.nome : 'Locale',
        comune:'Siracusa', voto:2, testo:'Racconto altrui', foto_urls:[], stato:'pubblicata',
        creato_il:new Date().toISOString(), autore:{nome:'Marta',avatar_url:null} }];
      localStorage.setItem('__db', JSON.stringify(d));
      Rec.cache.clear();
      caricaMiei(); disegnaSalvati(); disegnaVicino(); disegnaMappa();
    });
    await attesa(600);
  };

  await avvia();
  await semina();

  // ═══════════════════════════════════════════════════ 1
  sez('1 · AVVIO');
  console.log(errori.length ? '  ✗ errori: ' + errori.join(' | ') : '  ✓ nessun errore all\'avvio');
  if (errori.length) nota('errori all\'avvio: ' + errori.join(' | '));
  errori = [];

  /* Elenca i comandi della superficie in cima. Li numera invece di
     marcarli: dopo ogni tocco il documento si ridisegna, e un marchio
     appiccicato prima non si ritroverebbe piu'. */
  const SUPERFICIE = `(document.querySelector('.modale:not([hidden])')
      || document.querySelector('.vetrina:not([hidden])')
      || document.querySelector('.foglio.aperto')
      || document.querySelector('.lancio:not(.via)')
      || document.querySelector('.vista.attiva'))`;

  const comandi = () => pg.evaluate(`(() => {
    const s = ${SUPERFICIE};
    if (!s) return [];
    const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 4 && r.height > 4; };
    return [...s.querySelectorAll('button, [role="button"], a[href]')].filter(vis).map(e => ({
      eti: (e.textContent || e.getAttribute('aria-label') || e.tagName).replace(/\\s+/g,' ').trim().slice(0,34),
      esterno: e.tagName === 'A' && /^https?:|^tel:|^mailto:/.test(e.getAttribute('href') || '')
    }));
  })()`);

  const premiIndice = i => pg.evaluate(`(() => {
    const s = ${SUPERFICIE};
    if (!s) return false;
    const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 4 && r.height > 4; };
    const e = [...s.querySelectorAll('button, [role="button"], a[href]')].filter(vis)[${i}];
    if (!e) return false;
    e.scrollIntoView({ block:'nearest', inline:'center' });
    setTimeout(() => e.click(), 0);
    return true;
  })()`);

  const superficieAperta = () => pg.evaluate(() => ({
    modale: !document.querySelector('.modale')?.hidden,
    vetrina: !document.querySelector('.vetrina')?.hidden,
    foglio: !!document.querySelector('.foglio.aperto'),
    vista: document.querySelector('.vista.attiva')?.id || null
  }));

  const chiudiTutto = async () => {
    for (let i = 0; i < 4; i++) {
      const s = await superficieAperta();
      if (s.modale) { await pg.evaluate(() => document.querySelector('#m-ok')?.click()); }
      else if (s.vetrina) { await pg.evaluate(() => document.querySelector('#v-chiudi')?.click()); }
      else if (s.foglio) { await pg.evaluate(() => document.querySelector('.foglio.aperto #f-chiudi')?.click()); }
      else break;
      await attesa(320);
    }
  };

  /* Preme ogni comando di una schermata, uno alla volta, tornando ogni
     volta al punto di partenza. */
  const spazzola = async (nome, raggiungi) => {
    await chiudiTutto();
    await raggiungi();
    await attesa(500);
    const elenco = await comandi();
    let premuti = 0, muti = 0;
    for (let i = 0; i < elenco.length; i++) {
      const c = elenco[i];
      if (c.esterno) continue;                    // link esterni: non li seguo
      errori = [];
      const primaDi = await superficieAperta();
      const ok = await premiIndice(i);
      if (!ok) { await chiudiTutto(); await raggiungi(); await attesa(400); continue; }
      await attesa(600);
      if (!await vivo()) { nota(`${nome} \u00b7 "${c.eti}": la pagina si blocca`); console.log(`  \u2717 "${c.eti}" blocca la pagina`); return; }
      if (errori.length) { nota(`${nome} \u00b7 "${c.eti}": ${errori[0]}`); console.log(`  \u2717 "${c.eti}" \u2192 ${errori[0]}`); }
      const dopo = await superficieAperta();
      const cambiato = JSON.stringify(primaDi) !== JSON.stringify(dopo);
      if (dopo.foglio && !primaDi.foglio && !await pg.evaluate(() => !!document.querySelector('.foglio.aperto #f-chiudi')))
        { nota(`${nome} \u00b7 "${c.eti}": apre un foglio senza tasto indietro`); console.log(`  \u2717 "${c.eti}" senza via d'uscita`); }
      if (dopo.modale && !primaDi.modale && !await pg.evaluate(() => !!document.querySelector('#m-ok')))
        { nota(`${nome} \u00b7 "${c.eti}": apre una finestra senza chiusura`); console.log(`  \u2717 "${c.eti}" finestra senza chiusura`); }
      if (dopo.vetrina && !primaDi.vetrina && !await pg.evaluate(() => !!document.querySelector('#v-chiudi')))
        { nota(`${nome} \u00b7 "${c.eti}": apre a schermo pieno senza chiusura`); console.log(`  \u2717 "${c.eti}" schermo pieno senza chiusura`); }
      if (!cambiato) muti++;
      premuti++;
      await chiudiTutto();
      await raggiungi();
      await attesa(380);
    }
    console.log(`  ${premuti} comandi premuti${muti ? ' · ' + muti + ' senza effetto visibile' : ''}`);
  };

  const vaiA = v => async () => { await premi(`[data-vista="${v}"]`); await attesa(500); };
  const apriFoglio = (v, sel) => async () => {
    await premi(`[data-vista="${v}"]`); await attesa(450);
    await premi(sel); await attesa(800);
  };

  sez('2 · LE QUATTRO SCHEDE');
  await spazzola('Vicino a me', vaiA('v-vicino'));
  await spazzola('Mappa', vaiA('v-mappa'));
  await spazzola('Viaggi', vaiA('v-viaggi'));
  await spazzola('Io', vaiA('v-salvati'));

  sez('3 · I SOTTOMENU');
  await spazzola('Carta del celiaco', apriFoglio('v-salvati', '#s-carta'));
  await spazzola('La mia tessera', apriFoglio('v-salvati', '#s-tessera'));
  await spazzola('Buoni mensili', apriFoglio('v-salvati', '#s-buoni'));
  await spazzola('Le mie recensioni', apriFoglio('v-salvati', '#s-recensioni'));
  await spazzola('Il mio profilo', apriFoglio('v-salvati', '#s-profilo'));
  await spazzola('Account', apriFoglio('v-salvati', '#b-profilo-utente'));

  sez('4 · SCHEDA DI UN LOCALE');
  await spazzola('Scheda locale', async () => {
    await premi('[data-vista="v-vicino"]'); await attesa(500);
    await premi('[data-apri]'); await attesa(1100);
  });

  sez('5 · AGGIUNGERE UN LOCALE');
  await spazzola('Nuovo locale', async () => {
    await premi('[data-vista="v-mappa"]'); await attesa(400);
    await premi('#b-nuovo'); await attesa(900);
  });

  sez('6 · CARICAMENTI');
  await chiudiTutto();
  await premi('[data-vista="v-viaggi"]'); await attesa(500);
  await premi('[data-citta="Milano"]');
  let inCorso = false;
  for (let i = 0; i < 12 && !inCorso; i++) {   // guardo spesso: puo' durare poco
    await attesa(60);
    inCorso = await pg.evaluate(() => !!document.querySelector('#carico'));
  }
  console.log('  ' + (inCorso ? '✓' : '✗') + ' l\'attesa mostra un indicatore');
  if (!inCorso) nota('la ricerca per citt\u00e0 non mostra alcun indicatore di attesa');
  await attesa(2200);
  const finito = await pg.evaluate(() => document.querySelectorAll('#lista-viaggio [data-apri]').length);
  console.log('  ' + (finito > 0 ? '✓' : '✗') + ` la ricerca produce risultati (${finito})`);
  if (!finito) nota('la ricerca per citt\u00e0 non produce risultati');

  await premi('[data-vista="v-vicino"]'); await attesa(600);
  const eroe = await testo('#eroe');
  console.log('  ' + (eroe.length > 4 ? '✓' : '✗') + ' la schermata Vicino a me mostra qualcosa');
  if (eroe.length <= 4) nota('la schermata Vicino a me resta vuota');

  sez('7 · MEMORIA');
  await chiudiTutto();
  await pg.evaluate(() => { const s = document.querySelector('[data-stella]'); if (s) s.click(); });
  await attesa(500);
  const salvatiPrima = await pg.evaluate(() => Archivio.tutti().length);
  await pg.reload({ waitUntil: 'domcontentloaded' }); await attesa(2600);
  const salvatiDopo = await pg.evaluate(() => Archivio.tutti().length);
  console.log('  ' + (salvatiDopo >= salvatiPrima && salvatiPrima > 0 ? '✓' : '✗')
    + ` i posti salvati sopravvivono al riavvio (${salvatiPrima} → ${salvatiDopo})`);
  if (!(salvatiDopo >= salvatiPrima && salvatiPrima > 0)) nota('i posti salvati non sopravvivono al riavvio');

  await browser.close();
  server.close();

  sez('ESITO');
  if (!problemi.length) console.log('  \x1b[32mNessun problema rilevato.\x1b[0m');
  else { console.log('  \x1b[31m' + problemi.length + ' da sistemare:\x1b[0m'); problemi.forEach(p => console.log('   • ' + p)); process.exitCode = 1; }
})();
