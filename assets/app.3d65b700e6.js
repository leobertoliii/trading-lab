// Logica pura degli strumenti di studio (nessun accesso alla pagina): si puo' testare con Node.
// Formule dal PDF "Trading da zero", Parte 2, cap. 6 (pag. 10).
(function (root) {
  const MAX_RISK_PCT = 2;        // tetto del PDF: 1-2% del capitale per operazione
  const MIN_RR = 2;              // il PDF consiglia almeno 1:2
  const COST_SHARE_LIMIT = 0.3;  // costi oltre il 30% del guadagno potenziale

  const num = (x) => (typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')));

  // Calcolatore del rischio. Input: capitale, rischioPct (in %), ingresso, stop, target,
  // commissioneLato (euro per lato), spreadPct (% del valore investito, giro completo).
  function calcRisk(inp) {
    const capitale = num(inp.capitale), rischioPct = num(inp.rischioPct), ingresso = num(inp.ingresso);
    const stop = num(inp.stop), target = num(inp.target);
    const commissione = num(inp.commissioneLato || 0) || 0, spreadPct = num(inp.spreadPct || 0) || 0;
    const errors = [], warnings = [];
    if (![capitale, rischioPct, ingresso, stop, target].every((v) => Number.isFinite(v) && v > 0)) {
      return { ok: false, errors: ['Compila capitale, rischio, ingresso, stop e target con numeri positivi.'], warnings };
    }
    const long = stop < ingresso && target > ingresso, short = stop > ingresso && target < ingresso;
    if (!long && !short) {
      return { ok: false, errors: ['Stop e target devono stare da parti opposte rispetto all\'ingresso (long: stop sotto e target sopra; short: il contrario).'], warnings };
    }
    const rischioEuro = capitale * rischioPct / 100;
    const rischioUnita = Math.abs(ingresso - stop), guadagnoUnita = Math.abs(target - ingresso);
    const quantita = Math.floor(rischioEuro / rischioUnita);           // azioni intere
    const investito = quantita * ingresso;
    const perditaMax = quantita * rischioUnita;                        // <= rischioEuro
    const guadagnoPot = quantita * guadagnoUnita;
    const rr = guadagnoUnita / rischioUnita;
    const costi = 2 * commissione + (spreadPct / 100) * investito;
    const perditaNetta = perditaMax + costi, guadagnoNetto = guadagnoPot - costi;
    const rrNetto = perditaNetta > 0 ? guadagnoNetto / perditaNetta : 0;
    const out = {
      ok: true, direzione: long ? 'long' : 'short', rischioEuro, quantita, investito, investitoPct: investito / capitale * 100,
      perditaMax, guadagnoPot, rr, winRatePareggio: 1 / (1 + rr), costi, perditaNetta, guadagnoNetto, rrNetto,
      winRatePareggioNetto: rrNetto > 0 ? 1 / (1 + rrNetto) : 1, errors, warnings,
    };
    if (quantita < 1) warnings.push('Con questo rischio non riesci a comprare nemmeno una unità intera: lo stop è troppo lontano o il capitale troppo piccolo.');
    if (investito > capitale) warnings.push('L\'importo da investire supera il capitale: servirebbe leva o un conto più grande. Il PDF sconsiglia la leva ai principianti.');
    if (rischioPct > MAX_RISK_PCT) warnings.push(`Rischio ${rischioPct}% del capitale: la regola del PDF è 1-2% per operazione.`);
    if (rr < MIN_RR) warnings.push(`Rapporto rischio/rendimento 1:${rr.toFixed(2)}: il PDF consiglia almeno 1:2.`);
    if (guadagnoPot > 0 && costi / guadagnoPot > COST_SHARE_LIMIT) {
      warnings.push(`I costi (${costi.toFixed(2)} euro) sono il ${Math.round(costi / guadagnoPot * 100)}% del guadagno potenziale: più operi, più è difficile vincere.`);
    }
    if (guadagnoNetto <= 0 && quantita >= 1) warnings.push('Dopo i costi il guadagno potenziale è zero o negativo.');
    return out;
  }

  // Controllo prima di un ordine demo: importo, rischio in % del capitale, R:R e avvisi (regole del PDF).
  // ord: {side, qty, price (ask per long, bid per short), sl, tp}; equity in euro/USDT; feePct per lato.
  function demoCheck(ord, equity, feePct) {
    const qty = num(ord.qty), price = num(ord.price), sl = num(ord.sl), tp = num(ord.tp);
    const out = { ok: false, warnings: [], errors: [] };
    if (!(qty > 0) || !(price > 0) || !(equity > 0)) { out.errors.push('Inserisci una quantità maggiore di zero.'); return out; }
    const sign = ord.side === 'short' ? -1 : 1;
    const hasSl = Number.isFinite(sl) && sl > 0, hasTp = Number.isFinite(tp) && tp > 0;
    if (hasSl && (sl - price) * sign >= 0) out.errors.push('Lo stop loss deve stare dalla parte della perdita (long: sotto il prezzo, short: sopra).');
    if (hasTp && (tp - price) * sign <= 0) out.errors.push('Il take profit deve stare dalla parte del guadagno (long: sopra il prezzo, short: sotto).');
    out.notional = qty * price;
    out.notionalPct = out.notional / equity * 100;
    out.feeRoundTrip = out.notional * (feePct || 0) * 2;
    if (hasSl) { out.maxLoss = qty * Math.abs(price - sl); out.maxLossPct = out.maxLoss / equity * 100; }
    if (hasSl && hasTp && !out.errors.length) out.rr = Math.abs(tp - price) / Math.abs(price - sl);
    if (out.notional > equity) out.warnings.push('L\'importo supera il capitale: il conto demo non usa la leva e rifiuterà l\'ordine.');
    if (!hasSl) out.warnings.push('Nessuno stop loss: il PDF dice di impostarlo sempre prima di entrare.');
    else if (out.maxLossPct > MAX_RISK_PCT) out.warnings.push(`Perdita massima ${out.maxLossPct.toFixed(2).replace('.', ',')}% del capitale: la regola del PDF è 1-2% per operazione.`);
    if (out.rr !== undefined && out.rr < MIN_RR) out.warnings.push(`Rapporto rischio/rendimento 1:${out.rr.toFixed(2)}: il PDF consiglia almeno 1:2.`);
    if (ord.side === 'short') out.warnings.push('Short: in teoria la perdita non ha limite (il prezzo può salire senza tetto). Da principiante il PDF consiglia solo long.');
    out.ok = !out.errors.length;
    return out;
  }

  // Esito del diario: prende il primo numero (es. "-3 (stop)" -> -3). null se non c'e'.
  function parseEsito(text) {
    const m = String(text || '').match(/[-+−]?\s*\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace('−', '-').replace(/\s/g, '').replace(',', '.')) : null;
  }

  function diaryStats(rows) {
    const v = rows.map((r) => parseEsito(r.esito)).filter((x) => x !== null);
    if (!v.length) return { n: 0 };
    const wins = v.filter((x) => x > 0), losses = v.filter((x) => x < 0);
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    return { n: v.length, winRate: wins.length / v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, avgWin, avgLoss };
  }

  const DIARY_COLS = [['data', 'Data'], ['titolo', 'Titolo'], ['motivo', 'Motivo'], ['entrata', 'Entrata'], ['stop', 'Stop'],
    ['target', 'Target'], ['esito', 'Esito'], ['lezione', 'Lezione']];

  // CSV con virgolette doppie raddoppiate; BOM iniziale perche' Excel/Numbers leggano gli accenti.
  function diaryToCsv(rows) {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    return '﻿' + [DIARY_COLS.map((c) => q(c[1])).join(',')].concat(rows.map((r) => DIARY_COLS.map((c) => q(r[c[0]])).join(','))).join('\r\n') + '\r\n';
  }

  const CHECKLIST = [
    'So spiegare in una frase perché sto entrando?',
    'Ho deciso prezzo di ingresso, stop loss e target PRIMA di entrare?',
    'La perdita massima è al massimo l\'1-2% del mio capitale?',
    'Il rapporto rischio/rendimento è almeno 1:2?',
    'Ho calcolato i costi (spread, commissioni, cambio)?',
    'Il titolo è liquido, con volumi sufficienti?',
    'Sto entrando per il mio piano o per paura di perdere l\'occasione?',
    'Ho già operazioni aperte che mi espongono allo stesso rischio?',
    'Sono tranquillo, riposato e senza fretta di rifarmi di una perdita?',
    'Ho scritto tutto nel diario?',
  ];

  const PLAN30 = [
    { settimana: 1, obiettivo: 'Capire gli strumenti senza rischiare denaro.', attivita: ['Leggi la guida e il glossario', 'Apri un conto demo (anche gratuito su TradingView)', 'Familiarizza con ordini, stop e grafici'] },
    { settimana: 2, obiettivo: 'Creare l\'abitudine alla disciplina.', attivita: ['Fai almeno 20 operazioni in demo seguendo un piano scritto', 'Imposta sempre lo stop prima di entrare', 'Compila il diario'] },
    { settimana: 3, obiettivo: 'Scoprire se hai davvero un vantaggio o solo fortuna.', attivita: ['Analizza il diario: quante operazioni vincenti', 'Calcola il rapporto medio rischio/rendimento, i costi e gli errori ricorrenti', 'Calcola l\'aspettativa'] },
    { settimana: 4, obiettivo: 'Decidere con i dati se e come proseguire.', attivita: ['Continua in demo fino ad almeno 50 operazioni', 'Valuta le tue emozioni: eri tranquillo o agitato?'] },
  ];

  // --- Salvataggio e ripristino dei dati personali (profilo, diario, checklist, piano, demo) ---
  // Nessun account: i dati restano nel browser. Il backup e' un file JSON che si porta su un altro dispositivo.
  const BACKUP_KEYS = ['tl_profile_v1', 'tl_diary_v1', 'tl_checklist_v1', 'tl_plan30_v1', 'tl_calc_v1', 'tl_demo_v1',
    'tl_guide_read_v1', 'tl_quiz_v1', 'tl_milestones_v1', 'tl_replay_v1', 'tl_cards_v1'];
  const MAX_BACKUP_CHARS = 2000000;
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const okStr = (x, n = 600) => typeof x === 'string' && x.length <= n;
  const VALID = {
    tl_profile_v1: (v) => isObj(v) && okStr(v.name || '', 24),
    tl_diary_v1: (v) => Array.isArray(v) && v.length <= 5000 && v.every((r) => isObj(r) && DIARY_COLS.every((c) => r[c[0]] === undefined || okStr(r[c[0]]))),
    tl_checklist_v1: (v) => Array.isArray(v) && v.length <= 10 && v.every((x) => x === null || typeof x === 'boolean'),
    tl_plan30_v1: (v) => isObj(v) && Object.keys(v).length <= 50 && Object.values(v).every((x) => typeof x === 'boolean'),
    tl_calc_v1: (v) => isObj(v) && Object.values(v).every((x) => okStr(String(x), 30)),
    tl_guide_read_v1: (v) => Array.isArray(v) && v.length <= 60 && v.every((x) => okStr(x, 12)),
    tl_quiz_v1: (v) => isObj(v) && Object.keys(v).length <= 20 && Object.values(v).every((x) => typeof x === 'boolean'),
    tl_cards_v1: (v) => isObj(v) && isObj(v.cards) && Object.keys(v.cards).length <= 400 && Number.isFinite(v.reviews) && v.reviews >= 0 &&
      Object.entries(v.cards).every(([k, c]) => okStr(k, 60) && isObj(c) && Number.isInteger(c.box) && c.box >= 0 && c.box <= 4 && Number.isInteger(c.seen) && c.seen >= 0),
    tl_replay_v1: (v) => isObj(v) && Number.isFinite(v.n) && v.n >= 0 && v.n <= 1000000 && Number.isFinite(v.wins) && v.wins >= 0 && Number.isFinite(v.totalR) &&
      (v.skips === undefined || Number.isFinite(v.skips)) && Array.isArray(v.last) && v.last.length <= 50 &&
      v.last.every((x) => isObj(x) && Number.isFinite(x.r) && okStr(String(x.reason || ''), 30) && okStr(String(x.side || ''), 8)),
    tl_milestones_v1: (v) => isObj(v) && (v.flags === undefined || (isObj(v.flags) && Object.values(v.flags).every((x) => typeof x === 'boolean'))) &&
      (v.demoMax === undefined || (Number.isFinite(v.demoMax) && v.demoMax >= 0 && v.demoMax <= 1000000)),
    tl_demo_v1: (v) => isObj(v) && Array.isArray(v.positions) && Array.isArray(v.history) && Number.isFinite(v.balance) && Number.isFinite(v.start_balance) &&
      v.positions.length <= 200 && v.history.length <= 20000 && Number.isFinite(v.next_id),
  };
  // get(key) -> valore gia' decodificato (o undefined)
  function makeBackup(get) {
    const data = {};
    for (const k of BACKUP_KEYS) { const v = get(k); if (v !== undefined && v !== null) data[k] = v; }
    return JSON.stringify({ app: 'trading-lab', version: 1, exported: new Date().toISOString(), data }, null, 1);
  }
  function parseBackup(text) {
    const fail = (m) => ({ ok: false, error: m });
    if (typeof text !== 'string' || !text.trim()) return fail('Il file è vuoto.');
    if (text.length > MAX_BACKUP_CHARS) return fail('Il file è troppo grande per essere un backup del Lab.');
    let j;
    try { j = JSON.parse(text); } catch (e) { return fail('Il testo non è un backup valido (JSON non leggibile).'); }
    if (!isObj(j) || j.app !== 'trading-lab' || j.version !== 1 || !isObj(j.data)) return fail('Non sembra un backup del Trading Lab.');
    const data = {}, counts = {};
    for (const [k, v] of Object.entries(j.data)) {
      if (!BACKUP_KEYS.includes(k)) return fail(`Contenuto non riconosciuto: ${k}.`);
      if (!VALID[k](v)) return fail(`I dati di «${k}» non sono validi.`);
      data[k] = v;
      counts[k] = Array.isArray(v) ? v.length : (k === 'tl_demo_v1' ? v.history.length : 1);
    }
    if (!Object.keys(data).length) return fail('Il backup non contiene dati.');
    return { ok: true, data, counts, exported: j.exported };
  }

  // --- Il mio percorso: tappe, progressi e livello (tutto calcolato da dati salvati nel browser) ---
  const GROUPS = ['Primi passi', 'Esploratore', 'Praticante', 'Studente avanzato'];
  const LEVELS = [[0, 'Curioso'], [25, 'Allievo'], [50, 'Praticante'], [75, 'Studente avanzato'], [100, 'Diplomato del Lab']];
  // ctx: {name, tutorialDone, guideRead[], guideParts{p1[],p2[],p3[]}, quiz{}, calcUsed, flags{}, demoMax, diaryCount}
  function computeMilestones(ctx) {
    const read = new Set(ctx.guideRead || []), flags = ctx.flags || {}, quiz = ctx.quiz || {}, parts = ctx.guideParts || {};
    const part = (p) => { const ids = parts[p] || []; const n = ids.filter((id) => read.has(id)).length; return { n, t: ids.length, done: ids.length > 0 && n === ids.length }; };
    const p1 = part('p1'), p2 = part('p2'), p3 = part('p3');
    const answered = Object.keys(quiz).filter((k) => +k >= 0 && +k < 8).length, known = Object.values(quiz).filter(Boolean).length;
    const demo = Math.max(0, Number(ctx.demoMax) || 0), diary = Math.max(0, Number(ctx.diaryCount) || 0), replay = Math.max(0, Number(ctx.replayN) || 0), cards = Math.max(0, Number(ctx.cardsN) || 0);
    const M = (id, g, titolo, desc, tab, done, progress) => ({ id, group: GROUPS[g], titolo, desc, tab, done: !!done, progress: progress || '' });
    const items = [
      M('nome', 0, 'Scegli il tuo nome', 'Qualsiasi nome o soprannome: non è un account, resta sul tuo dispositivo.', 'strumenti', (ctx.name || '').trim().length > 0),
      M('tutorial', 0, 'Guarda il tutorial', 'Una visita guidata del sito, spiegata da zero.', 'inizio', ctx.tutorialDone),
      M('basi', 0, 'Leggi le basi (Parte 1 della Guida)', 'Soldi, inflazione, azioni, ETF, CFD, rischio. Spunta «Segna come letto» a ogni capitolo.', 'guida', p1.done, `${p1.n}/${p1.t}`),
      M('overview', 1, 'Guarda i risultati', 'Apri la scheda Overview e leggi il verdetto e i consigli.', 'overview', flags.overview_seen),
      M('trade', 1, 'Guarda un\'operazione sul grafico', 'Nella scheda Trades clicca una riga: ti porta nel punto sul grafico.', 'trades', flags.trade_viewed),
      M('mercato', 1, 'Prova un altro mercato', 'Nel grafico scegli Ethereum o Solana invece di Bitcoin.', 'chart', flags.other_market),
      M('fortuna', 1, 'Scopri quanto conta la fortuna', 'In Allenati, la simulazione di tanti trader a testa o croce.', 'allenati', flags.luck_used),
      M('ripasso', 1, 'Ripassa 20 termini con le flashcard', 'In Allenati → Glossario e ripasso: prova a spiegare il termine, poi controlla.', 'allenati', cards >= 20, `${Math.min(cards, 20)}/20`),
      M('risparmio', 1, 'Prova un calcolatore di risparmio', 'Inflazione, interesse composto, regola del 72 o costi: in Allenati → Calcolatori.', 'allenati', flags.savings_used),
      M('calcolatore', 2, 'Usa il calcolatore del rischio', 'Cambia un valore e guarda quante unità comprare e quanto perdi al massimo.', 'strumenti', ctx.calcUsed),
      M('checklist', 2, 'Completa la checklist (10 su 10)', 'Le dieci domande prima di ogni operazione.', 'strumenti', flags.checklist_full),
      M('demo1', 2, 'Apri la prima operazione in demo', 'Con stop loss e take profit, sul conto di prova a soldi finti.', 'demo', flags.first_demo || demo >= 1),
      M('diario1', 2, 'Scrivi la prima riga nel diario', 'Data, motivo, stop, target, esito e lezione.', 'strumenti', diary >= 1),
      M('replay1', 2, 'Fai il tuo primo esercizio di replay', 'In Allenati: il grafico si ferma nel passato, tu decidi, poi vedi cosa succede.', 'allenati', replay >= 1),
      M('parte2', 3, 'Leggi la Parte 2 (Trading da zero)', 'Ordini, costi, grafici, gestione del rischio, psicologia, truffe.', 'guida', p2.done, `${p2.n}/${p2.t}`),
      M('quiz', 3, 'Fai l\'autotest (almeno 6 risposte giuste su 8)', 'Per ogni domanda mostra la risposta e segna se la sapevi.', 'guida', answered >= 8 && known >= 6, `${answered}/8 risposte, ${known} giuste`),
      M('demo20', 3, '20 operazioni in demo', 'Come nel piano dei 30 giorni: con stop sempre impostato.', 'demo', demo >= 20, `${Math.min(demo, 20)}/20`),
      M('replay10', 3, '10 esercizi di replay', 'Più esercizi fai, meno conta la fortuna: guarda come cambia il tuo R medio.', 'allenati', replay >= 10, `${Math.min(replay, 10)}/10`),
      M('diario10', 3, '10 righe nel diario', 'Annota anche le operazioni in perdita: insegnano di più.', 'strumenti', diary >= 10, `${Math.min(diary, 10)}/10`),
      M('parte3', 3, 'Leggi la Parte 3 (il Lab e i limiti dei backtest)', 'Come non farsi ingannare dai risultati di un backtest.', 'guida', p3.done, `${p3.n}/${p3.t}`),
      M('backup', 3, 'Salva un backup dei tuoi dati', 'Nella scheda Strumenti: un file da portare su un altro dispositivo.', 'strumenti', flags.backup),
    ];
    const done = items.filter((i) => i.done).length, total = items.length, percent = Math.round((done / total) * 100);
    const level = LEVELS.filter(([min]) => percent >= min).pop()[1];
    return { items, done, total, percent, level, next: items.find((i) => !i.done) || null, groups: GROUPS };
  }

  // Tutto cio' che il sito salva sul dispositivo (localStorage): mostrato nella finestra "Privacy e dati" e cancellabile.
  const PRIVACY_KEYS = [
    ['tl_profile_v1', 'Il tuo nome utente'], ['tl_name_asked_v1', 'Ricorda che ti è già stato chiesto il nome'], ['tl_tutorial_v1', 'Se hai visto o saltato il tutorial'],
    ['tl_theme_v1', 'Tema scelto (chiaro o scuro)'], ['tl_diary_v1', 'Il diario delle operazioni'], ['tl_checklist_v1', 'La checklist'], ['tl_plan30_v1', 'Il piano dei 30 giorni'],
    ['tl_calc_v1', 'Gli ultimi valori del calcolatore del rischio'], ['tl_demo_v1', 'Il conto demo (versione browser)'], ['tl_guide_read_v1', 'I capitoli della Guida segnati come letti'],
    ['tl_quiz_v1', 'Le risposte all\'autotest'], ['tl_milestones_v1', 'I progressi del percorso'], ['tl_replay_v1', 'Le statistiche del replay'], ['tl_cards_v1', 'Il ripasso a flashcard'],
  ];

  const api = { calcRisk, demoCheck, makeBackup, parseBackup, BACKUP_KEYS, PRIVACY_KEYS, computeMilestones, parseEsito, diaryStats, diaryToCsv, DIARY_COLS, CHECKLIST, PLAN30, MAX_RISK_PCT, MIN_RR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TOOLS = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
// Logica pura della scheda "Allenati": replay del mercato, simulazione della fortuna e calcolatori di risparmio.
// Nessun accesso alla pagina: si prova con Node (tests/train_core.test.js). Tutto serve solo per studiare.
(function (root) {
  const FEE = 0.0005, SLIP = 0.0002;               // come il backtest: 0,05% per lato + 0,02% di slippage per fill
  const MAX_BARS = 300;                            // un esercizio non resta aperto per sempre

  // --- numeri casuali ripetibili (stesso "seme" = stessa sequenza) ---
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =====================  1. REPLAY DEL MERCATO  =====================
  // candles: [{time, open, high, low, close}] in ordine di tempo.
  function atr(candles, i, n = 14) {
    let sum = 0, c = 0;
    for (let k = Math.max(1, i - n + 1); k <= i; k++) {
      const h = candles[k].high, l = candles[k].low, pc = candles[k - 1].close;
      sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      c++;
    }
    return c ? sum / c : 0;
  }

  // Punto di partenza casuale: ci sono abbastanza candele PRIMA (contesto) e DOPO (il "futuro" nascosto).
  function pickStart(len, rng, lead = 120, tail = 120) {
    if (len < lead + tail + 1) throw new Error('Pochi dati per un esercizio.');
    return lead + Math.floor(rng() * (len - lead - tail));
  }

  // Stop e target suggeriti: stop a 1,5 volte l'ATR (la "escursione media" delle ultime candele), target a rr volte lo stop.
  function suggestOrder(candles, i, side, rr = 2) {
    const entry = candles[i].close, a = atr(candles, i), dist = 1.5 * a, sign = side === 'long' ? 1 : -1;
    return { entry, stop: entry - sign * dist, target: entry + sign * rr * dist, atr: a };
  }

  // Controlla l'ordine come farebbe una piattaforma seria (e avvisa secondo le regole del PDF).
  function checkOrder(o) {
    const sign = o.side === 'long' ? 1 : -1, out = { ok: false, errors: [], warnings: [] };
    const entry = Number(o.entry), stop = Number(o.stop), target = Number(o.target);
    if (![entry, stop, target].every((x) => Number.isFinite(x) && x > 0)) { out.errors.push('Stop e target devono essere numeri positivi.'); return out; }
    if ((stop - entry) * sign >= 0) out.errors.push('Lo stop deve stare dalla parte della perdita (long: sotto il prezzo, short: sopra).');
    if ((target - entry) * sign <= 0) out.errors.push('Il target deve stare dalla parte del guadagno (long: sopra il prezzo, short: sotto).');
    if (out.errors.length) return out;
    out.risk = Math.abs(entry - stop); out.reward = Math.abs(target - entry);
    out.rr = out.reward / out.risk; out.riskPct = out.risk / entry * 100;
    out.costR = (FEE * 2 * entry + SLIP * 2 * entry) / out.risk;           // quanto pesano i costi, in R
    if (out.rr < 2) out.warnings.push(`Rapporto rischio/rendimento 1:${out.rr.toFixed(2)}: il PDF consiglia almeno 1:2.`);
    if (out.costR > 0.3) out.warnings.push(`Lo stop è vicino: i costi valgono circa ${out.costR.toFixed(2)} R a operazione.`);
    if (o.side === 'short') out.warnings.push('Short: in teoria la perdita non ha limite. Da principiante il PDF consiglia solo long.');
    out.ok = true;
    return out;
  }

  function openTrade(o, openIdx) {
    const sign = o.side === 'long' ? 1 : -1, fill = o.entry * (1 + sign * SLIP);
    return { side: o.side, entry: fill, stop: o.stop, target: o.target, openIdx, risk: Math.abs(fill - o.stop) };
  }

  function finish(trade, level, reason, idx) {
    const sign = trade.side === 'long' ? 1 : -1, exitFill = level * (1 - sign * SLIP);
    const fees = FEE * (trade.entry + exitFill);
    const r = ((exitFill - trade.entry) * sign - fees) / trade.risk;
    return { reason, exit: level, exitFill, r, idx, bars: idx - trade.openIdx, side: trade.side };
  }

  // Una candela nuova: scatta lo stop o il target? Regole prudenti, uguali al backtest del Lab.
  function stepTrade(trade, candle, idx) {
    const long = trade.side === 'long';
    const slHit = long ? candle.low <= trade.stop : candle.high >= trade.stop;
    const tpHit = long ? candle.high >= trade.target : candle.low <= trade.target;
    if (slHit) {                                                  // stop e target nella stessa candela: vale lo stop
      const gap = long ? candle.open < trade.stop : candle.open > trade.stop;   // salto oltre lo stop: si esce all'apertura
      return finish(trade, gap ? candle.open : trade.stop, 'stop', idx);
    }
    if (tpHit) return finish(trade, trade.target, 'target', idx);
    if (idx - trade.openIdx >= MAX_BARS) return finish(trade, candle.close, 'tempo scaduto', idx);
    return null;
  }

  function closeNow(trade, price, idx) { return finish(trade, price, 'chiusa a mano', idx); }

  function emptyStats() { return { n: 0, wins: 0, totalR: 0, skips: 0, last: [] }; }
  function recordResult(stats, res) {
    const s = { ...emptyStats(), ...stats, last: [...(stats.last || [])] };
    if (res.skipped) { s.skips += 1; return s; }
    s.n += 1; if (res.r > 0) s.wins += 1; s.totalR += res.r;
    s.last.push({ r: Math.round(res.r * 1000) / 1000, reason: res.reason, side: res.side });
    if (s.last.length > 50) s.last = s.last.slice(-50);
    return s;
  }

  // =====================  2. QUANTO CONTA LA FORTUNA  =====================
  // N trader decidono a testa o croce (win rate impostabile), rischiano riskPct del capitale e pagano costi pari a
  // costPctOfRisk del rischio a ogni operazione. Esempio del PDF: 40 trader, 200 operazioni, 1%, costi 8% del rischio.
  function simulateLuck(p) {
    const traders = Math.max(1, Math.min(200, Math.floor(p.traders ?? 40))), ops = Math.max(1, Math.min(1000, Math.floor(p.ops ?? 200)));
    const winRate = Math.min(1, Math.max(0, p.winRate ?? 0.5)), risk = (p.riskPct ?? 1) / 100, cost = (p.costPctOfRisk ?? 8) / 100;
    const rng = mulberry32(p.seed ?? 1);
    const curves = [];
    for (let t = 0; t < traders; t++) {
      let eq = 100; const c = [eq];
      for (let k = 0; k < ops; k++) {
        const stake = eq * risk;
        eq += (rng() < winRate ? stake : -stake) - stake * cost;
        c.push(eq);
      }
      curves.push(c);
    }
    const finals = curves.map((c) => c[c.length - 1]), order = finals.map((v, i) => i).sort((a, b) => finals[a] - finals[b]);
    const sorted = [...finals].sort((a, b) => a - b), mid = sorted.length >> 1;
    return {
      curves, finals, traders, ops, best: order[order.length - 1], worst: order[0], median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      above: finals.filter((v) => v > 100).length, bestValue: sorted[sorted.length - 1], worstValue: sorted[0],
      // quanto varrebbe in media ogni operazione (in % del capitale): se negativo, il "vantaggio" non c'e'
      edgePerOp: (winRate * (risk - risk * cost) + (1 - winRate) * (-risk - risk * cost)) * 100,
    };
  }

  // =====================  3. CALCOLATORI  =====================
  const pos = (x) => Number.isFinite(x) && x >= 0;
  const N = (x) => (typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')));

  // Quanto compri con la stessa somma tra N anni (potere d'acquisto): importo / (1 + inflazione)^anni.
  function inflation(amount, ratePct, years) {
    amount = N(amount); ratePct = N(ratePct); years = N(years);
    if (!pos(amount) || !pos(ratePct) || !pos(years)) return { ok: false, error: 'Inserisci numeri positivi (o zero).' };
    const real = (y) => amount / Math.pow(1 + ratePct / 100, y);
    return { ok: true, amount, years, real: real(years), lost: amount - real(years), lostPct: (1 - real(years) / amount) * 100,
      table: [5, 10, 20, 30].filter((y) => y !== years).concat([years]).sort((a, b) => a - b).map((y) => ({ years: y, real: real(y) })) };
  }

  // Interesse composto come nell'esempio del PDF: la somma iniziale cresce una volta all'anno; i versamenti mensili
  // maturano mese per mese (tasso annuo / 12). Con 100 euro al mese per 20 anni al 5% -> circa 41.103.
  function compound(p) {
    const initial = N(p.initial), monthly = N(p.monthly), rate = N(p.ratePct), years = Math.floor(N(p.years));
    if (![initial, monthly, rate].every(pos) || !Number.isFinite(years) || years < 1 || years > 80) return { ok: false, error: 'Inserisci numeri positivi e da 1 a 80 anni.' };
    const r = rate / 100, m = r / 12;
    const value = (y) => initial * Math.pow(1 + r, y) + (m === 0 ? monthly * 12 * y : monthly * (Math.pow(1 + m, 12 * y) - 1) / m);
    const series = [];
    for (let y = 0; y <= years; y++) series.push({ year: y, total: value(y), deposited: initial + monthly * 12 * y });
    const last = series[series.length - 1];
    return { ok: true, final: last.total, deposited: last.deposited, interest: last.total - last.deposited, series };
  }

  // Regola del 72: in quanti anni raddoppiano i soldi (stima rapida + valore esatto).
  function rule72(ratePct) {
    const r = N(ratePct);
    if (!(r > 0) || r > 100) return { ok: false, error: 'Inserisci un rendimento tra 0 e 100%.' };
    return { ok: true, approx: 72 / r, exact: Math.log(2) / Math.log(1 + r / 100) };
  }

  // I costi mangiano i guadagni: costo di un'operazione completa e di un mese di operazioni, in % della somma.
  function costDrag(p) {
    const notional = N(p.notional), fee = N(p.feePerSide), spread = N(p.spreadPct), ops = Math.floor(N(p.opsPerMonth));
    if (![notional, fee, spread].every(pos) || !(notional > 0) || !Number.isFinite(ops) || ops < 1 || ops > 1000) return { ok: false, error: 'Inserisci numeri positivi (operazioni da 1 a 1000).' };
    const perOp = 2 * fee + notional * spread / 100;
    return { ok: true, perOp, perOpPct: perOp / notional * 100, perMonth: perOp * ops, perMonthPct: perOp * ops / notional * 100, perYearPct: perOp * ops * 12 / notional * 100 };
  }

  // =====================  4. RIPASSO A FLASHCARD (sistema a scatole di Leitner)  =====================
  // Ogni carta sta in una scatola da 0 a 4. Se la sai sale di una scatola; se non la sai torna alla 0.
  // Le carte nelle scatole basse (e quelle mai viste) escono piu' spesso, quelle imparate ogni tanto per non dimenticarle.
  const BOX_WEIGHT = [8, 5, 3, 2, 1];
  const MASTERED_BOX = 3;
  function emptyCards() { return { cards: {}, reviews: 0 }; }
  function pickCard(ids, state, rng, lastId = null) {
    const pool = ids.filter((id) => id !== lastId);
    const cand = pool.length ? pool : ids;
    if (!cand.length) return null;
    const w = cand.map((id) => { const c = (state.cards || {})[id]; return c ? BOX_WEIGHT[c.box] : 10; });   // mai vista: peso alto
    let x = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x < 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function answerCard(state, id, known) {
    const cards = { ...(state.cards || {}) }, c = cards[id] || { box: 0, seen: 0 };
    cards[id] = { box: known ? Math.min(4, c.box + 1) : 0, seen: c.seen + 1 };
    return { cards, reviews: (state.reviews || 0) + 1 };
  }
  function cardProgress(state, ids) {
    const cs = state.cards || {};
    const seen = ids.filter((id) => cs[id]).length, mastered = ids.filter((id) => cs[id] && cs[id].box >= MASTERED_BOX).length;
    return { total: ids.length, seen, mastered, reviews: state.reviews || 0 };
  }

  const api = { mulberry32, atr, pickStart, emptyCards, pickCard, answerCard, cardProgress, BOX_WEIGHT, MASTERED_BOX, suggestOrder, checkOrder, openTrade, stepTrade, closeNow, emptyStats, recordResult, simulateLuck,
    inflation, compound, rule72, costDrag, FEE, SLIP, MAX_BARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TRAIN = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
// Versione STATICA del sito (Vercel, GitHub Pages...): al posto del server Flask, le stesse richieste
// (/api/overview, /api/trades, /api/chart, /web/*.json) vengono servite da file JSON gia' pronti nella cartella data/.
// I file si caricano solo quando servono (il grafico di un mercato a un timeframe e' un file a parte): la pagina iniziale e' leggera.
(function () {
  window.__DATA__ = { static: true };                     // segnala la versione statica agli altri script
  const real = window.fetch.bind(window);
  const cache = new Map();
  const base = document.baseURI;
  const get = (path) => {
    if (!cache.has(path)) {
      cache.set(path, real(new URL(path, base)).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); })
        .catch((e) => { cache.delete(path); throw e; }));
    }
    return cache.get(path);
  };
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  const fail = (status, error) => ({ ok: false, status, json: async () => ({ error }) });
  const FILES = { '/api/overview': 'data/overview.json', '/api/trades': 'data/trades.json' };

  window.fetch = async (url, opts) => {
    const s = String(url);
    if (/^https?:\/\//i.test(s)) return real(url, opts);  // indirizzi esterni (candele Kraken...): rete vera
    const u = new URL(s, 'http://x'), p = u.pathname, q = u.searchParams;
    try {
      if (FILES[p]) return ok(await get(FILES[p]));
      if (p.startsWith('/web/') && p.endsWith('.json')) return ok(await get('data/' + p.slice(5)));
      if (p === '/api/chart') return await chart(q);
    } catch (e) { return fail(503, 'dati non disponibili: ' + e.message); }
    return real(url, opts);
  };

  // Stessa logica del server: candele e pattern dello strumento nel timeframe richiesto, filtrati per intervallo.
  async function chart(q) {
    const index = await get('data/chart-index.json');
    const sym = q.get('symbol') || 'BTCUSDT', want = q.get('tf') || '5m', from = +q.get('from'), to = +q.get('to');
    const have = (tf) => { const e = (index[sym] || {})[tf]; return e && (tf === '1h' || tf === '4h' || tf === '1d' || from >= e.from) ? tf : null; };
    if (!index[sym]) return fail(400, 'strumento non valido');
    let tf = have(want) || (to - from > 250 * 86400 ? '1d' : to - from > 60 * 86400 ? '4h' : '1h');
    if (!have(tf)) tf = ['1h', '4h', '1d'].find(have);
    const m = await get(`data/chart/${sym}-${tf}.json`);
    const trades = sym === 'BTCUSDT' ? (await get('data/trades.json')) : [];
    return ok({
      symbol: sym, tf,
      note: tf !== want ? `candele ${want} non incluse nella versione statica: mostro ${tf} (con il server locale hai tutto)` : '',
      candles: m.candles.filter((c) => c.time >= from && c.time <= to),
      sweeps: m.sweeps.filter((x) => x.t >= from && x.t <= to),
      fvgs: m.fvgs.filter((g) => g.t <= to && g.t >= from - 3 * 86400 && (g.filled_t === null || g.filled_t >= from)),
      bos: m.bos.filter((b) => b.t >= from && b.t <= to),
      obs: m.obs.filter((z) => z.t <= to && z.end_t >= from),
      trades: trades.filter((t) => t.exit_t >= from && t.entry_t <= to),
    });
  }
})();

;
// Dashboard del Trading Lab. Solo lettura di dati storici.
const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmtTime = (t) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);
const pct = (x) => (x * 100).toFixed(1) + '%';
const num = (x, d = 2) => (x === null || x === undefined ? 'n/d' : Number(x).toFixed(d));
const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
let overview = null;

// ---------- Aiuto: pulsanti "?" ----------
// Le voci stanno in web/help.json. Ogni pulsante ha data-help="<id>".
// H(<id>) restituisce l'HTML del pulsante, da usare nei testi generati da JavaScript.
let HELP = {};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H = (id) => `<button type="button" class="qm" data-help="${id}" aria-expanded="false">?</button>`;
function labelHelpButtons(root = document) {
  root.querySelectorAll('.qm[data-help]').forEach((b) => b.setAttribute('aria-label', `Cos'è: ${HELP[b.dataset.help]?.titolo ?? b.dataset.help}`));
}
const pop = $('helppop');
let openBtn = null;
const isMobile = () => window.matchMedia('(max-width:600px)').matches;
function placeHelp() {
  if (!openBtn || isMobile()) return;
  const r = openBtn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left - 10), window.innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 50) top = Math.max(8, r.top - h - 8);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
function openHelp(btn) {
  const e = HELP[btn.dataset.help];
  if (!e) return;
  closeHelp(false);
  pop.innerHTML = `<button type="button" class="x" aria-label="Chiudi">×</button><h3>${esc(e.titolo)}</h3>` +
    `<h4>In parole semplici</h4><p>${esc(e.semplice)}</p><h4>Esempio</h4><p>${esc(e.esempio)}</p>` +
    `<h4>Cosa fare / Attenzione</h4><p>${esc(e.cosa_fare)}</p><h4>Fonte</h4><p class="src">${esc(e.fonte)}</p>` +
    `<div class="warn">${esc(HELP._avviso || '')}</div>`;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  openBtn = btn;
  placeHelp();
  pop.focus({ preventScroll: true });
}
function closeHelp(returnFocus = true) {
  if (!openBtn) return;
  pop.hidden = true;
  openBtn.setAttribute('aria-expanded', 'false');
  const b = openBtn; openBtn = null;
  if (returnFocus) b.focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.qm');
  if (b) { e.preventDefault(); e.stopPropagation(); if (openBtn === b) closeHelp(); else openHelp(b); return; }
  if (e.target.closest('#helppop .x')) { closeHelp(); return; }
  if (openBtn && !pop.contains(e.target)) closeHelp(false);
}, true);                                             // fase di cattura: ha la precedenza su ordinamento e click di riga
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHelp(); });
window.addEventListener('scroll', placeHelp, true);
window.addEventListener('resize', placeHelp);

// ---------- Schede ----------
const TAB_ID = { inizio: 'inizio', overview: 'overview', chart: 'chart-tab', trades: 'trades', guida: 'guida-tab', allenati: 'allenati-tab', strumenti: 'strumenti-tab', demo: 'demo-tab' };
window.tabListeners = [];                         // altre schede (es. Demo) si agganciano qui per sapere quando sono visibili
window.themeListeners = [];                       // altri grafici (es. il replay) si agganciano qui per cambiare colore col tema
function showTab(name) {
  closeHelp(false);
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === TAB_ID[name]));
  if (name === 'chart') { initChart(); resizeChart(); }
  if (name === 'overview' && window.markMilestone) window.markMilestone('overview_seen');
  window.tabListeners.forEach((f) => f(name));
}

// ---------- Tema chiaro/scuro ----------
// Di base segue il sistema; il pulsante nell'intestazione sceglie a mano e ricorda la scelta (tl_theme_v1).
const themeNow = () => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
let eqChart = null;
function applyChartTheme() {                       // i grafici leggono i colori alla creazione: al cambio tema vanno aggiornati
  const opts = (bg) => ({ layout: { background: { color: bg }, textColor: css('--mut') }, grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    timeScale: { borderColor: css('--line') }, rightPriceScale: { borderColor: css('--line') } });
  if (typeof chart !== 'undefined' && chart) chart.applyOptions(opts(css('--bg')));
  if (eqChart) eqChart.applyOptions(opts(css('--panel')));
  if (typeof candleSeries !== 'undefined' && candleSeries) candleSeries.applyOptions({ upColor: css('--green'), downColor: css('--red'), wickUpColor: css('--green'), wickDownColor: css('--red') });
  window.themeListeners.forEach((f) => { try { f(); } catch (e) { /* un grafico non pronto non deve bloccare gli altri */ } });
}
$('theme-btn').onclick = () => {
  const next = themeNow() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('tl_theme_v1', next); } catch (e) { /* senza storage: vale solo per questa visita */ }
  applyChartTheme();
};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyChartTheme());
new MutationObserver(applyChartTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });   // anche se il tema lo cambia chi ospita la pagina
document.querySelectorAll('.tab-btn').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ---------- Overview ----------
function card(label, value, sub = '', help = '') {
  return `<div class="card"><div class="v">${value}</div><div class="l">${label}${help ? H(help) : ''}</div><div class="s">${sub}</div></div>`;
}
const METRIC_ROWS = [
  ['Operazioni', 'c_operazioni', (m) => m.trades],
  ['Win rate', 'win_rate', (m) => (m.trades ? pct(m.win_rate) : '-')],
  ['R medio / expectancy', 'aspettativa', (m) => (m.trades ? `<span class="${cls(m.avg_r)}">${num(m.avg_r, 3)} R</span>` : '-')],
  ['R medio vincente', 'avg_win', (m) => (m.trades ? num(m.avg_win_r, 2) : '-')],
  ['R medio perdente', 'avg_loss', (m) => (m.trades ? num(m.avg_loss_r, 2) : '-')],
  ['Profit factor', 'profit_factor', (m) => (m.trades ? num(m.profit_factor) : '-')],
  ['Totale', 'totale_r', (m) => (m.trades ? `<span class="${cls(m.total_r)}">${num(m.total_r, 1)} R</span>` : '-')],
  ['Max drawdown', 'drawdown', (m) => (m.trades ? num(m.max_drawdown_r, 1) + ' R' : '-')],
  ['Serie perdite piu\' lunga', 'serie_perdite', (m) => (m.trades ? m.max_losing_streak : '-')],
  ['Costo medio per operazione', 'costi', (m) => (m.trades ? num(m.avg_cost_r, 3) + ' R' : '-')],
  ['Incertezza del R medio (± 2 errori standard)', 'errore_standard', (m) => (m.trades && m.se_r ? '± ' + num(2 * m.se_r, 3) + ' R' : '-')],
];
const PARAM_META = {
  pivot_n: ['Pivot swing', 'p_pivot_n'], fvg_min_gap_pct: ['Gap minimo FVG', 'p_fvg_min_gap_pct'],
  setup_window: ['Finestra setup (candele)', 'p_setup_window'], fee_pct: ['Commissione/lato', 'p_fee_pct'],
  slippage_pct: ['Slippage', 'p_slippage_pct'], min_risk_pct: ['Rischio minimo', 'p_min_risk_pct'],
  risk_per_trade_pct: ['Rischio per operazione', 'p_risk_per_trade_pct'],
};

async function loadOverview() {
  overview = await (await fetch('/api/overview')).json();
  const o = overview;
  $('subtitle').textContent = `${o.symbol} ${o.timeframe} · ${o.start.slice(0, 10)} → ${o.end.slice(0, 10)} (UTC)` + (window.__DATA__ ? ' · versione statica' : '');
  const sw = o.sweeps, fv = o.fvgs;
  $('cards').innerHTML =
    card('giorni di dati', o.days, '', 'c_giorni') + card('candele', o.candles.toLocaleString('it'), '', 'c_candele') +
    card('liquidity sweep', ((sw.bullish || 0) + (sw.bearish || 0)).toLocaleString('it'), `${sw.bullish || 0} sopra swing high · ${sw.bearish || 0} sotto swing low ${H('swing')}`, 'sweep') +
    card('Fair Value Gap', ((fv.bullish || 0) + (fv.bearish || 0)).toLocaleString('it'), `${fv.bullish || 0} rialzisti · ${fv.bearish || 0} ribassisti`, 'fvg') +
    card('operazioni', o.trades.toLocaleString('it'), `RR ${o.default_rr}`, 'c_operazioni');

  $('coverage').innerHTML = o.coverage.map((c) => {
    const col = c.pct >= 0.999 ? css('--green') : c.pct > 0 ? css('--amber') : css('--red');
    return `<div class="cell" style="background:${col}" title="${c.d}: ${(c.pct * 100).toFixed(0)}%"></div>`;
  }).join('');
  $('params').innerHTML = Object.entries(o.params).map(([k, v]) => {
    const [label, help] = PARAM_META[k] || [k, 'params'];
    return `<span class="chip">${label}: <b>${v}</b>${H(help)}</span>`;
  }).join('');
  $('rrlabel').textContent = o.default_rr;

  if (!o.metrics) {
    $('metrics').innerHTML = '<div class="banner">Nessun risultato: esegui <code>python -m lab.backtest</code>.</div>';
  } else {
    const m = o.metrics[o.default_rr.toFixed(1)];
    $('verdict').innerHTML = `<div class="banner"><span>${m.verdict}</span>${H('verdetto')}${H('sovradattamento')}</div>`;
    $('metrics').innerHTML = '<table><thead><tr><th></th><th>Sviluppo (primi 2/3)</th><th>Test (ultimo 1/3, mai toccato)</th></tr></thead><tbody>' +
      METRIC_ROWS.map(([l, h, f]) => `<tr><td>${l}${H(h)}</td><td>${f(m.dev)}</td><td>${f(m.test)}</td></tr>`).join('') + '</tbody></table>' +
      `<div style="color:var(--mut);margin-top:4px">Taglio sviluppo/test: ${o.metrics.split_time}</div>`;
    $('advice').innerHTML = (o.advice || []).map((a) =>
      `<div class="adv ${a.livello}"><span class="t">${esc(a.titolo)}</span><span class="p">${esc(a.periodo)}</span>${H(a.help)}<div class="b">${esc(a.testo)}</div></div>`).join('');
    const rrs = Object.keys(o.metrics).filter((k) => !isNaN(parseFloat(k)) && k !== 'split_time');
    $('rrtable').innerHTML = '<table><thead><tr><th>RR</th><th>Sviluppo: n</th><th>R medio</th><th>PF</th><th>Test: n</th><th>R medio</th><th>PF</th></tr></thead><tbody>' +
      rrs.map((k) => { const d = o.metrics[k].dev, t = o.metrics[k].test;
        return `<tr><td>${k}</td><td>${d.trades}</td><td class="${cls(d.avg_r)}">${num(d.avg_r, 3)}</td><td>${num(d.profit_factor)}</td>` +
               `<td>${t.trades}</td><td class="${cls(t.avg_r)}">${num(t.avg_r, 3)}</td><td>${num(t.profit_factor)}</td></tr>`; }).join('') + '</tbody></table>';
  }
  renderResearch(o.research || {});
  drawEquity(o.equity);
  const end = new Date(o.end);
  $('to').value = end.toISOString().slice(0, 10);
  $('from').value = new Date(end.getTime() - 2 * 86400e3).toISOString().slice(0, 10);
}

// ---------- Confronto strategie, mercati e timeframe ----------
// Dati dai file creati da lab.compare, lab.validate_older, lab.compare_indices (nessun calcolo qui).
const STRATS = { 'sweep+fvg': 'Sweep + FVG', 'bos+ob retest': 'BOS + order block (ritorno nella zona)', 'bos+ob mercato': 'BOS + order block (entrata a mercato)' };
// Asterisco: R medio lontano da zero piu' di 2 errori standard (non e' una garanzia: con tante prove qualcuno esce per caso).
const rcell = (m) => {
  if (!(m && m.trades)) return '<span class="rcell">-</span>';
  const se = m.se_r || 0, far = se > 0 && Math.abs(m.avg_r) >= 2 * se;
  const tip = se > 0 ? `R medio ${num(m.avg_r, 3)} ± ${num(2 * se, 3)} (2 errori standard)${far ? ': lontano da zero' : ': dentro il rumore, potrebbe essere caso'}` : '';
  return `<span class="rcell" title="${tip}"><span class="${cls(m.avg_r)}">${m.avg_r > 0 ? '+' : ''}${num(m.avg_r, 2)}${far ? '*' : ''}</span> <small>(${m.trades})</small></span>`;
};
function renderResearch(r) {
  const parts = [];
  parts.push('<p class="note" style="max-width:90ch">Ogni valore è il <b>R medio per operazione</b> (tra parentesi il numero di operazioni): verde sopra zero, rosso sotto. Con meno di circa 100 operazioni è dentro il rumore statistico. Un <b>*</b> segna i valori lontani da zero più di 2 errori standard (passa il mouse sul numero per vedere l\'incertezza) ' + H('errore_standard') + '. Le stesse regole e gli stessi costi per tutti: nessun parametro è stato ottimizzato.</p>');
  if (r.crypto) {
    const tfs = ['5m', '15m', '1h', '4h'];
    let rows = '';
    for (const s of Object.keys(STRATS)) for (const sym of Object.keys(r.crypto))
      rows += `<tr><td>${STRATS[s]}<br><small>${sym}</small></td>` + tfs.map((tf) => { const c = (r.crypto[sym][tf] || {})[s]; return c ? `<td>sviluppo ${rcell(c.dev)}test ${rcell(c.test)}</td>` : '<td>-</td>'; }).join('') + '</tr>';
    parts.push(`<details class="rbox" open><summary>Cripto, 2023-2026: 3 strategie × 3 mercati × 4 timeframe ${H('research_crypto')}</summary><div class="scroll"><table class="rtable"><thead><tr><th>Strategia / mercato</th>${tfs.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`);
  }
  if (r.older) {
    const tfs = ['1h', '4h'];
    let rows = '';
    for (const s of Object.keys(STRATS)) for (const sym of Object.keys(r.older))
      rows += `<tr><td>${STRATS[s]}<br><small>${sym} ${r.older[sym].start.slice(0, 4)}-${r.older[sym].end.slice(0, 4)}</small></td>` + tfs.map((tf) => `<td>${rcell((r.older[sym][tf] || {})[s])}</td>`).join('') + '</tr>';
    parts.push(`<details class="rbox"><summary>Dati mai usati, 2019-2023: le stesse regole, senza modifiche ${H('research_older')}</summary><div class="scroll"><table class="rtable"><thead><tr><th>Strategia / mercato</th>${tfs.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`);
  }
  if (r.indices) {
    let rows = '';
    for (const [mk, v] of Object.entries(r.indices)) for (const s of Object.keys(STRATS)) {
      if (!v[s]) continue;
      rows += `<tr><td>${STRATS[s]}<br><small>${mk} (${v.start.slice(0, 4)}-${v.end.slice(0, 4)})</small></td>` + ['costi crypto', 'costi ridotti'].map((sc) => `<td>sviluppo ${rcell(v[s][sc].dev)}test ${rcell(v[s][sc].test)}</td>`).join('') + '</tr>';
    }
    parts.push(`<details class="rbox"><summary>Indici e futures (Yahoo Finance) con due ipotesi di costi ${H('research_indices')}</summary><div class="scroll"><table class="rtable"><thead><tr><th>Strategia / mercato</th><th>Costi crypto (0,05% + 0,02%)</th><th>Costi ridotti (0,01% + 0,005%)</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">I costi sono ipotesi, non dati di un broker. I futures continui hanno salti ai cambi di contratto.</p></details>`);
  }
  parts.push(`<div class="adv warn"><span class="t">Attenzione: troppe prove danno falsi positivi</span>${H('confronti_multipli')}<div class="b">Sono state provate decine di combinazioni (strategie, mercati, timeframe). Con tante prove qualcuna esce positiva per caso. Conta solo ciò che resta positivo nel test, sui dati mai usati e su più mercati. Un backtest non dimostra che funzionerà in futuro.</div></div>`);
  $('research').innerHTML = Object.keys(r).length ? parts.join('') : '<p class="note">Nessun confronto salvato: esegui <code>python -m lab.compare</code>.</p>';
}

function drawEquity(points) {
  const el = $('equity');
  if (!points.length) return;
  const ch = LightweightCharts.createChart(el, { autoSize: true, layout: { background: { color: css('--panel') }, textColor: css('--mut') },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, timeScale: { borderColor: css('--line') }, rightPriceScale: { borderColor: css('--line') } });
  eqChart = ch;
  const s = ch.addLineSeries({ color: css('--blue'), lineWidth: 2 });
  const seen = new Set();   // tempi unici e crescenti
  s.setData(points.filter((p) => !seen.has(p.time) && seen.add(p.time)));
  if (overview.metrics) {
    s.createPriceLine({ price: 0, color: css('--mut'), lineStyle: 2, lineWidth: 1, title: '0' });
    const cut = Date.parse(overview.metrics.split_time.replace(' ', 'T').replace('+00:00', 'Z')) / 1000;
    s.setMarkers([{ time: points.find((p) => p.time >= cut)?.time ?? points[points.length - 1].time, position: 'aboveBar', color: css('--amber'), shape: 'arrowDown', text: 'inizio test' }]);
  }
  ch.timeScale().fitContent();
}

// ---------- Chart ----------
let chart, candleSeries, ctx, lastData = null, tfSec = 300, inited = false;
const TF_SEC = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };

function initChart() {
  if (inited) return;
  inited = true;
  chart = LightweightCharts.createChart($('chart'), { autoSize: true,
    layout: { background: { color: css('--bg') }, textColor: css('--mut') },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: css('--line') },
    rightPriceScale: { borderColor: css('--line') }, crosshair: { mode: 0 } });
  candleSeries = chart.addCandlestickSeries({ upColor: css('--green'), downColor: css('--red'), wickUpColor: css('--green'), wickDownColor: css('--red'), borderVisible: false });
  ctx = $('overlay').getContext('2d');
  const loop = () => { drawOverlay(); requestAnimationFrame(loop); };   // ridisegno a ogni frame: segue zoom e scroll
  loop();
  ['fSweep', 'fFvg', 'fTrade', 'fOpen', 'fBos', 'fOb'].forEach((id) => ($(id).onchange = applyMarkers));
  $('load').onclick = () => loadChart();
  const symbols = (overview && overview.chart_symbols) || ['BTCUSDT'];
  $('sym').innerHTML = symbols.map((s) => `<option>${s}</option>`).join('');
  $('sym').onchange = () => loadChart();
  loadChart();
}
function resizeChart() { if (chart) chart.applyOptions({}); }

const snap = (t) => Math.floor(t / tfSec) * tfSec;

async function loadChart(focus) {
  const from = Date.parse($('from').value + 'T00:00:00Z') / 1000;
  const to = Date.parse($('to').value + 'T23:59:59Z') / 1000;
  let tf = $('tf').value;
  if (tf === 'auto') { const d = (to - from) / 86400; tf = d <= 3 ? '5m' : d <= 14 ? '15m' : d <= 60 ? '1h' : d <= 250 ? '4h' : '1d'; }
  tfSec = TF_SEC[tf];
  const symbol = $('sym').value || 'BTCUSDT';
  if (symbol !== 'BTCUSDT' && window.markMilestone) window.markMilestone('other_market');
  $('chartinfo').textContent = 'Caricamento... (la prima volta per un nuovo strumento o timeframe può richiedere qualche secondo)';
  let data;
  try {
    const r = await fetch(`/api/chart?from=${from}&to=${to}&tf=${tf}&symbol=${symbol}`);
    data = await r.json();
    if (!r.ok) throw new Error(data.error || 'errore');
  } catch (e) { $('chartinfo').textContent = 'Impossibile caricare il grafico: ' + e.message; return; }
  lastData = data;
  if (lastData.tf) { tf = lastData.tf; tfSec = TF_SEC[tf]; }   // la versione statica puo' usare un timeframe diverso
  candleSeries.setData(lastData.candles);
  applyMarkers();
  if (focus) chart.timeScale().setVisibleRange({ from: focus.from, to: focus.to }); else chart.timeScale().fitContent();
  const note = lastData.note ? ` · ${lastData.note}` : (symbol !== 'BTCUSDT' ? ' · le operazioni del backtest esistono solo per BTCUSDT' : '');
  $('chartinfo').textContent = `${symbol} ${tf}: ${lastData.candles.length} candele · ${lastData.sweeps.length} sweep · ${lastData.fvgs.length} FVG · ${(lastData.bos || []).length} BOS · ${(lastData.obs || []).length} order block · ${lastData.trades.length} operazioni (orari UTC)${note}`;
}

function applyMarkers() {
  if (!lastData) return;
  const m = [];
  if ($('fSweep').checked) for (const s of lastData.sweeps)
    m.push({ time: snap(s.t), position: s.direction === 'bullish' ? 'aboveBar' : 'belowBar', color: css('--amber'),
             shape: s.direction === 'bullish' ? 'arrowDown' : 'arrowUp', text: 'sweep' });
  if ($('fBos').checked) for (const b of (lastData.bos || []))
    m.push({ time: snap(b.t), position: b.direction === 'bullish' ? 'belowBar' : 'aboveBar', color: '#a97bff', shape: 'square', text: 'BOS' });
  if ($('fTrade').checked) for (const t of lastData.trades) {
    m.push({ time: snap(t.entry_t), position: t.direction === 'long' ? 'belowBar' : 'aboveBar', color: css('--blue'), shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown', text: t.direction === 'long' ? 'LONG' : 'SHORT' });
    m.push({ time: snap(t.exit_t), position: t.direction === 'long' ? 'aboveBar' : 'belowBar', color: t.exit_reason === 'target' ? css('--green') : css('--red'), shape: 'circle', text: `${num(t.r, 1)}R` });
  }
  m.sort((a, b) => a.time - b.time);
  candleSeries.setMarkers(m);
}

function drawOverlay() {
  const cv = $('overlay'), w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!lastData || !lastData.candles.length) return;
  const ts = chart.timeScale(), first = lastData.candles[0].time, last = lastData.candles[lastData.candles.length - 1].time;
  const X = (t) => {                      // tempo -> pixel, anche se fuori dai dati caricati
    const s = snap(t);
    if (s <= first) return ts.timeToCoordinate(first) - ((first - s) / tfSec) * (ts.options().barSpacing || 6);
    if (s >= last) return ts.timeToCoordinate(last) + ((s - last) / tfSec) * (ts.options().barSpacing || 6);
    return ts.timeToCoordinate(s);
  };
  const Y = (p) => candleSeries.priceToCoordinate(p);

  if ($('fFvg').checked) {
    let n = 0;
    for (const g of lastData.fvgs) {
      if ($('fOpen').checked && g.filled_t !== null) continue;
      const x0 = X(g.t - 2 * tfSec), x1 = g.filled_t !== null ? X(g.filled_t) : w;
      const y0 = Y(g.top), y1 = Y(g.bottom);
      if ([x0, x1, y0, y1].some((v) => v === null || isNaN(v)) || x1 < 0 || x0 > w) continue;
      ctx.fillStyle = g.direction === 'bullish' ? 'rgba(38,166,154,.28)' : 'rgba(239,83,80,.28)';
      ctx.fillRect(x0, y0, Math.max(x1 - x0, 2), Math.max(y1 - y0, 1));
      if (++n > 600) break;
    }
  }
  if ($('fOb').checked) {
    let n = 0;
    for (const z of (lastData.obs || [])) {
      const x0 = X(z.ob_t), x1 = X(z.end_t), y0 = Y(z.top), y1 = Y(z.bottom);
      if ([x0, x1, y0, y1].some((v) => v === null || isNaN(v)) || x1 < 0 || x0 > w) continue;
      ctx.fillStyle = z.direction === 'bullish' ? 'rgba(79,140,255,.30)' : 'rgba(245,140,66,.30)';
      ctx.fillRect(x0, y0, Math.max(x1 - x0, 2), Math.max(y1 - y0, 1));
      if (++n > 400) break;
    }
  }
  if ($('fBos').checked) {
    ctx.strokeStyle = '#a97bff'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
    for (const b of (lastData.bos || [])) {
      const x0 = X(b.swing_t), x1 = X(b.t), y = Y(b.level);
      if ([x0, x1, y].some((v) => v === null || isNaN(v))) continue;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if ($('fSweep').checked) {
    ctx.strokeStyle = css('--amber'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    for (const s of lastData.sweeps) {
      const x0 = X(s.swing_t), x1 = X(s.t), y = Y(s.level);
      if ([x0, x1, y].some((v) => v === null || isNaN(v))) continue;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if ($('fTrade').checked) {
    for (const t of lastData.trades) {
      const x0 = X(t.entry_t), x1 = X(t.exit_t) + 4;
      for (const [price, color] of [[t.stop, css('--red')], [t.target, css('--green')], [t.entry, css('--blue')]]) {
        const y = Y(price);
        if ([x0, x1, y].some((v) => v === null || isNaN(v))) continue;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
    }
  }
}

function goToTrade(entry_t, exit_t) {
  if (window.markMilestone) window.markMilestone('trade_viewed');
  showTab('chart');
  const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  $('from').value = day(entry_t - 86400); $('to').value = day(exit_t + 86400); $('tf').value = '5m';
  const pad = Math.max(3 * 3600, (exit_t - entry_t));
  loadChart({ from: entry_t - pad, to: exit_t + pad });
}

// ---------- Trades ----------
let tradesData = [], sortKey = 'entry_t', sortDir = 1;
const TCOLS = [['entry_t', 'Ingresso (UTC)', fmtTime, 'col_ingresso'], ['exit_t', 'Uscita (UTC)', fmtTime, 'col_uscita'], ['direction', 'Dir.', (v) => v, 'long_short'],
  ['entry', 'Prezzo ingr.', (v) => num(v, 1), 'entry'], ['stop', 'Stop', (v) => num(v, 1), 'stop_loss'], ['target', 'Target', (v) => num(v, 1), 'take_profit'],
  ['exit', 'Prezzo usc.', (v) => num(v, 1), 'col_prezzo'], ['exit_reason', 'Motivo', (v) => v, 'motivo_uscita'], ['bars', 'Candele', (v) => v, 'durata'],
  ['r', 'R', (v) => `<span class="${cls(v)}">${num(v, 2)}</span>`, 'r_multiplo'], ['cost_r', 'Costi (R)', (v) => num(v, 2), 'col_costi']];

async function loadTrades() {
  tradesData = await (await fetch('/api/trades')).json();
  renderTrades();
}
function renderTrades() {
  tradesData.sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
  $('ttable').innerHTML = '<thead><tr>' + TCOLS.map(([k, l, , h]) => `<th class="sortable" data-k="${k}">${l}${k === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}${H(h)}</th>`).join('') + '</tr></thead><tbody>' +
    tradesData.map((t, i) => `<tr class="link" data-i="${i}">` + TCOLS.map(([k, , f]) => `<td>${f(t[k])}</td>`).join('') + '</tr>').join('') + '</tbody>';
  labelHelpButtons($('ttable'));
  $('ttable').querySelectorAll('th').forEach((th) => (th.onclick = () => { const k = th.dataset.k; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; renderTrades(); }));
  $('ttable').querySelectorAll('tbody tr').forEach((tr) => (tr.onclick = () => { const t = tradesData[tr.dataset.i]; goToTrade(t.entry_t, t.exit_t); }));
}

// ---------- Guida ----------
// Contenuti in web/guida.json (capitoli, percorso, autotest); i termini rimandano a voci di help.
let GUIDA = null;
const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const termText = (id) => { const e = HELP[id]; return e ? norm([e.titolo, e.semplice, e.esempio, e.cosa_fare].join(' ')) : ''; };
const capText = (c) => norm([c.titolo, c.riassunto, ...(c.punti || []), ...(c.tabelle || []).flatMap((t) => [t.titolo, ...t.intestazioni, ...t.righe.flat()])].join(' '));

function renderTable(t) {
  return `<div class="gtable"><table><caption>${esc(t.titolo)}</caption><thead><tr>${t.intestazioni.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    t.righe.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
}

function renderGuida(query = '') {
  if (!GUIDA) return;
  const q = norm(query.trim());
  $('guida-avviso').textContent = GUIDA.avviso;
  $('gpercorso').innerHTML = q ? '' : `<h2>Da dove inizio? ${H('percorso')}</h2><div class="steps">` + GUIDA.percorso.map((s) =>
    `<div class="step"><b>${esc(s.titolo)}</b><p>${esc(s.testo)}</p><button type="button" class="linkbtn" data-goto="${s.vai.tipo}:${s.vai.id}">${esc(s.vai.etichetta)}</button></div>`).join('') + '</div>';

  const readSet = new Set(lsGet(KEY_READ, [])), quizState = lsGet(KEY_QUIZ, {});
  let shown = 0, html = '';
  for (const parte of GUIDA.parti) {
    let part = '';
    for (const c of parte.capitoli) {
      let terms = c.termini;
      if (q) {
        const capMatch = capText(c).includes(q);
        const hits = c.termini.filter((id) => termText(id).includes(q));
        if (!capMatch && !hits.length) continue;
        if (!capMatch) terms = hits;
      }
      shown++;
      part += `<article class="gcap" id="gcap-${c.id}" tabindex="-1"><h3>${esc(c.titolo)}</h3><div class="fonte">${esc(c.fonte)}</div>` +
        `<p class="sum">${esc(c.riassunto)}</p>` +
        ((c.punti || []).length ? '<ul>' + c.punti.map((p) => `<li>${esc(p)}</li>`).join('') + '</ul>' : '') +
        (c.tabelle || []).map(renderTable).join('') +
        `<div class="terms">` + terms.map((id) => `<span class="term">${esc(HELP[id]?.titolo ?? id)}${H(id)}</span>`).join('') + '</div>' +
        `<label class="readrow"><input type="checkbox" data-read="${c.id}" ${readSet.has(c.id) ? 'checked' : ''}> Segna come letto</label></article>`;
    }
    if (part) html += `<h2>${esc(parte.titolo)}</h2>` + part;
  }
  $('gcontent').innerHTML = html || '<p style="color:var(--mut)">Nessun risultato. Prova con un\'altra parola.</p>';
  $('gcount').textContent = q ? `${shown} capitoli trovati` : '';

  const qa = GUIDA.autotest.map((a, i) => ({ ...a, i })).filter((a) => !q || norm(a.d + ' ' + a.r).includes(q));
  $('gautotest').innerHTML = qa.length ? `<h2>Autotest finale ${H('autotest')}</h2>` + qa.map((a) =>
    `<div class="qa"><div><b>${a.i + 1})</b> ${esc(a.d)}</div><button type="button" class="linkbtn" data-ans="${a.i}" aria-expanded="false" aria-controls="ans-${a.i}" style="margin-top:6px">Mostra la risposta</button>` +
    `<div class="ans" id="ans-${a.i}" hidden>${esc(a.r)} <button type="button" class="linkbtn" data-goto="capitolo:${a.cap}">Rileggi il capitolo</button>` +
    `<div class="self"><span style="color:var(--mut)">L'avevi indovinata?</span>` +
    `<button type="button" class="linkbtn ${quizState[a.i] === true ? 'on' : ''}" data-quiz="${a.i}:1">Sì, la sapevo</button>` +
    `<button type="button" class="linkbtn ${quizState[a.i] === false ? 'on' : ''}" data-quiz="${a.i}:0">No, da ripassare</button></div></div></div>`).join('') : '';
  $('gfonti').innerHTML = q ? '' : '<h2>Per approfondire (fonti ufficiali)</h2><ul>' + GUIDA.fonti.map((f) => `<li><b>${esc(f.nome)}</b>: ${esc(f.desc)}</li>`).join('') +
    '</ul><p style="color:var(--mut)">Aliquote, leve massime, orari e limiti sono nozioni generali che cambiano: verifica sempre sulle fonti ufficiali (Agenzia delle Entrate, Consob, Banca d\'Italia).</p>';
  labelHelpButtons($('guida-tab'));
}

// Capitoli letti e autovalutazione dell'autotest: servono al percorso nella pagina Inizio (dati solo nel browser).
const KEY_READ = 'tl_guide_read_v1', KEY_QUIZ = 'tl_quiz_v1';
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* senza storage: non si salva */ } };
window.guideTerms = () => (GUIDA ? [...new Set(GUIDA.parti.flatMap((p) => p.capitoli.flatMap((c) => c.termini)))].filter((id) => HELP[id]) : []);
window.guideParts = () => (GUIDA ? Object.fromEntries(GUIDA.parti.map((p) => [p.id, p.capitoli.map((c) => c.id)])) : {});
document.addEventListener('change', (e) => {
  const r = e.target.closest('[data-read]');
  if (!r) return;
  const set = new Set(lsGet(KEY_READ, []));
  if (r.checked) set.add(r.dataset.read); else set.delete(r.dataset.read);
  lsSet(KEY_READ, [...set]);
  if (window.renderPercorso) window.renderPercorso();
});
document.addEventListener('click', (e) => {
  const qz = e.target.closest('[data-quiz]');
  if (qz) {
    const [i, v] = qz.dataset.quiz.split(':'), st = lsGet(KEY_QUIZ, {});
    st[i] = v === '1'; lsSet(KEY_QUIZ, st);
    qz.parentElement.querySelectorAll('[data-quiz]').forEach((b) => b.classList.toggle('on', b === qz));
    if (window.renderPercorso) window.renderPercorso();
    return;
  }
  const ans = e.target.closest('[data-ans]');
  if (ans) {
    const box = $('ans-' + ans.dataset.ans), open = box.hidden;
    box.hidden = !open; ans.setAttribute('aria-expanded', String(open)); ans.textContent = open ? 'Nascondi la risposta' : 'Mostra la risposta';
    return;
  }
  const go = e.target.closest('[data-goto]');
  if (!go) return;
  const [tipo, id] = go.dataset.goto.split(':');
  if (tipo === 'tab') { showTab(id); return; }
  showTab('guida');
  $('gsearch').value = ''; renderGuida('');
  const el = $('gcap-' + id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.focus({ preventScroll: true }); }
});
$('gsearch').addEventListener('input', (e) => renderGuida(e.target.value));

// Avvio: prima le voci di aiuto, cosi' ogni "?" ha il suo titolo accessibile.
const getJson = (u) => fetch(u).then((r) => r.json()).catch(() => ({}));
Promise.all([getJson('/web/help.json'), getJson('/web/help_guida.json'), getJson('/web/guida.json'), getJson('/web/help_strumenti.json')])
  .then(([h, hg, g, hs]) => { HELP = { ...h, ...hg, ...hs }; GUIDA = g.parti ? g : null; labelHelpButtons(); renderGuida(); if (window.renderPercorso) window.renderPercorso(); })
  .then(loadOverview).then(() => labelHelpButtons()).then(loadTrades);

;
// Scheda "Strumenti": calcolatore del rischio, checklist, diario, piano dei 30 giorni.
// Solo per studiare: nessun ordine, nessun invio di dati. La logica sta in tools_core.js (testata con Node).
// I dati dell'utente restano nel browser (localStorage); se non e' disponibile, restano solo finche' la pagina e' aperta.
(function () {
  const T = window.TOOLS;
  const KEYS = { diary: 'tl_diary_v1', check: 'tl_checklist_v1', plan: 'tl_plan30_v1', calc: 'tl_calc_v1' };
  let storageOk = true;
  const mem = {};
  const load = (k, def) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { storageOk = false; return mem[k] ?? def; }
  };
  const save = (k, v) => {
    mem[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { storageOk = false; }
    const n = document.getElementById('storage-note');
    if (n) n.hidden = storageOk;
  };
  const eur = (x) => x.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';

  const root = document.getElementById('tools-root');
  root.innerHTML = `
    <section>
      <h2>Il tuo profilo e i tuoi dati ${H('profile_box')}</h2>
      <p class="note" style="max-width:80ch">Nessun account e nessuna password: il profilo è solo un nome che resta in questo browser. Diario, checklist, piano e conto demo (versione browser) si salvano qui. Per portarli su un altro dispositivo (o mandarli a un amico) salva un file di backup e caricalo dall'altra parte.</p>
      <div class="form" style="max-width:520px"><label for="p-name">Il tuo nome (visibile solo a te)<input id="p-name" maxlength="24" placeholder="es. Mario" autocomplete="off"></label></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:8px 0">
        <button type="button" class="pbtn" id="bk-export">Salva i miei dati (file) ${H('backup_export')}</button>
        <button type="button" class="pbtn ghost" id="bk-copy">Copia il backup negli appunti</button>
      </div>
      <div class="form" style="max-width:640px">
        <label for="bk-file">Carica un backup (file .json) ${H('backup_import')}<input id="bk-file" type="file" accept=".json,application/json"></label>
        <label for="bk-text">oppure incolla qui il testo del backup<textarea id="bk-text" class="tfield" rows="3" placeholder="{ &quot;app&quot;: &quot;trading-lab&quot;, ... }"></textarea></label>
      </div>
      <button type="button" class="pbtn ghost" id="bk-import">Ripristina da questo backup</button>
      <div id="bk-msg" aria-live="polite" style="margin-top:8px"></div>
    </section>
    <p class="note" id="storage-note" hidden>Il salvataggio nel browser non è disponibile: i dati restano solo finché questa pagina è aperta. Esporta il diario in CSV per conservarlo.</p>
    <div class="two">
      <section>
        <h2>Calcolatore del rischio ${H('tool_calc')}</h2>
        <div class="form" id="calc-form">
          <label for="in-capitale">Capitale (euro)${H('in_capitale')}<input id="in-capitale" inputmode="decimal"></label>
          <label for="in-rischio">Rischio per operazione (%)${H('in_rischio_pct')}<input id="in-rischio" inputmode="decimal"></label>
          <label for="in-ingresso">Prezzo di ingresso${H('entry')}<input id="in-ingresso" inputmode="decimal"></label>
          <label for="in-stop">Stop loss${H('stop_loss')}<input id="in-stop" inputmode="decimal"></label>
          <label for="in-target">Target${H('take_profit')}<input id="in-target" inputmode="decimal"></label>
          <label for="in-comm">Commissione per lato (euro)${H('in_commissione')}<input id="in-comm" inputmode="decimal"></label>
          <label for="in-spread">Spread (% giro completo)${H('spread')}<input id="in-spread" inputmode="decimal"></label>
        </div>
        <div class="note">Valori iniziali: esempio del PDF (Parte 2, cap. 6). Cambiali con i tuoi.</div>
        <div id="calc-out" aria-live="polite"></div>
      </section>
      <section>
        <h2>Checklist prima di ogni operazione ${H('tool_checklist')}</h2>
        <div id="check-list"></div>
        <div id="check-status" aria-live="polite" style="margin:8px 0"></div>
        <button type="button" class="pbtn ghost" id="check-reset">Azzera la checklist</button>
      </section>
    </div>

    <h2>Diario delle operazioni ${H('tool_diario')}</h2>
    <form id="diary-form" class="form" autocomplete="off">
      <label for="d-data">Data ${H('d_data')}<input id="d-data" type="date" required></label>
      <label for="d-titolo">Titolo ${H('d_titolo')}<input id="d-titolo" required></label>
      <label for="d-motivo">Motivo ${H('d_motivo')}<input id="d-motivo"></label>
      <label for="d-entrata">Entrata ${H('entry')}<input id="d-entrata" inputmode="decimal"></label>
      <label for="d-stop">Stop ${H('stop_loss')}<input id="d-stop" inputmode="decimal"></label>
      <label for="d-target">Target ${H('take_profit')}<input id="d-target" inputmode="decimal"></label>
      <label for="d-esito">Esito ${H('d_esito')}<input id="d-esito" placeholder="es. -3 (stop)"></label>
      <label for="d-lezione">Lezione ${H('d_lezione')}<input id="d-lezione"></label>
    </form>
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
      <button type="submit" form="diary-form" class="pbtn">Aggiungi al diario</button>
      <button type="button" class="pbtn ghost" id="diary-csv">Esporta CSV ${H('d_export')}</button>
      <button type="button" class="pbtn ghost" id="diary-copy">Copia CSV negli appunti ${H('d_copy')}</button>
      <button type="button" class="pbtn ghost" id="diary-clear">Cancella tutto</button>
      <span class="note">Compilalo anche per le operazioni in perdita: sono quelle che insegnano di più.</span>
    </div>
    <div id="diary-stats" aria-live="polite" style="margin:10px 0"></div>
    <div class="scroll"><table id="diary-table"></table></div>

    <h2>Piano dei 30 giorni ${H('piano_30')}</h2>
    <div id="plan"></div>
    <p class="note">Dopo la demo, se decidi di passare al reale, i trader prudenti iniziano con una cifra piccola che non cambia la vita se persa, e la considerano un costo di formazione (PDF Parte 2, cap. 9, pag. 13).</p>`;

  // ----- Calcolatore -----
  const CALC_IDS = { capitale: 'in-capitale', rischioPct: 'in-rischio', ingresso: 'in-ingresso', stop: 'in-stop', target: 'in-target', commissioneLato: 'in-comm', spreadPct: 'in-spread' };
  const calcDefault = { capitale: '1000', rischioPct: '1', ingresso: '50', stop: '48', target: '54', commissioneLato: '1', spreadPct: '0.1' };
  const calcState = { ...calcDefault, ...load(KEYS.calc, {}) };
  for (const [k, id] of Object.entries(CALC_IDS)) {
    const el = document.getElementById(id);
    el.value = calcState[k];
    el.addEventListener('input', () => { calcState[k] = el.value; save(KEYS.calc, calcState); renderCalc(); });
  }
  function renderCalc() {
    const r = T.calcRisk(calcState), out = document.getElementById('calc-out');
    if (!r.ok) { out.innerHTML = `<div class="adv warn"><div class="b">${esc(r.errors[0])}</div></div>`; return; }
    const cell = (v, l, h) => `<div><b>${v}</b><span>${l}</span>${h ? H(h) : ''}</div>`;
    out.innerHTML = `<div class="res">` +
      cell(`${r.quantita}`, `Quantità (${r.direzione})`, 'out_quantita') +
      cell(`${eur(r.investito)} (${r.investitoPct.toFixed(0)}% del capitale)`, 'Importo investito', 'out_investito') +
      cell(`${eur(r.perditaMax)} euro`, `Perdita massima (tetto: ${eur(r.rischioEuro)})`, 'out_perdita_max') +
      cell(`${eur(r.guadagnoPot)} euro`, 'Guadagno potenziale', 'out_guadagno_pot') +
      cell(`1:${r.rr.toFixed(2).replace('.', ',')}`, 'Rapporto rischio/rendimento', 'rr_ratio') +
      cell(pc(r.winRatePareggio), 'Win rate di pareggio (senza costi)', 'win_rate_pareggio') +
      cell(`${eur(r.costi)} euro`, 'Costi stimati (commissioni + spread)', 'costi') +
      cell(`${eur(r.guadagnoNetto)} / -${eur(r.perditaNetta)}`, 'Guadagno netto / perdita netta', 'costi') +
      cell(pc(r.winRatePareggioNetto), 'Win rate di pareggio dopo i costi', 'win_rate_pareggio') + '</div>' +
      r.warnings.map((w) => `<div class="adv warn"><div class="b">${esc(w)}</div></div>`).join('') +
      '<div class="note">Formula: quantità = (capitale × % di rischio) / (ingresso - stop), arrotondata per difetto. È un calcolo didattico, non un consiglio.</div>';
    labelHelpButtons(out);
  }

  // ----- Checklist -----
  const CHECK_HELP = ['piano_trading', 'esempio_operazione', 'rischio_1_2', 'rr_ratio', 'costi', 'liquidita_volumi', 'fomo', 'diversificazione', 'revenge_trading', 'diario'];
  let checks = load(KEYS.check, []);
  function renderChecklist() {
    document.getElementById('check-list').innerHTML = T.CHECKLIST.map((q, i) =>
      `<div class="chk ${checks[i] ? 'done' : ''}"><input type="checkbox" id="chk-${i}" data-chk="${i}" ${checks[i] ? 'checked' : ''}><label for="chk-${i}">${esc(q)}</label>${H(CHECK_HELP[i])}</div>`).join('');
    const n = checks.filter(Boolean).length;
    if (n === 10 && window.markMilestone) window.markMilestone('checklist_full');
    document.getElementById('check-status').innerHTML = `<div class="prog"><i style="width:${n * 10}%"></i></div>` +
      (n === 10 ? 'Checklist completa: 10 su 10. La decisione resta tua, e resta una simulazione di studio.'
        : `${n} su 10. Se anche una sola risposta è no, il PDF consiglia di aspettare.`);
    labelHelpButtons(document.getElementById('check-list'));
  }
  document.getElementById('check-list').addEventListener('change', (e) => {
    const i = e.target.dataset.chk; if (i === undefined) return;
    checks[i] = e.target.checked; save(KEYS.check, checks); renderChecklist();
  });
  document.getElementById('check-reset').onclick = () => { checks = []; save(KEYS.check, checks); renderChecklist(); };

  // ----- Diario -----
  let diary = load(KEYS.diary, []);
  const fmtDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s);
  function renderDiary() {
    const st = T.diaryStats(diary);
    document.getElementById('diary-stats').innerHTML =
      `Operazioni nel diario: <b>${diary.length}</b> (obiettivo settimana 2: 20; settimana 4: 50). ` +
      (st.n ? `Con esito numerico: ${st.n}, win rate ${pc(st.winRate, 0)}, esito medio per operazione (aspettativa) ${st.avg.toFixed(2).replace('.', ',')}, ` +
        `medio vincente ${st.avgWin.toFixed(2).replace('.', ',')}, medio perdente ${st.avgLoss.toFixed(2).replace('.', ',')}. Usa sempre la stessa unità (euro o R) ${H('d_stats')}` +
        (st.n < 30 ? '<div class="note">Con meno di 30 operazioni il risultato può essere solo fortuna.</div>' : '') : '');
    document.getElementById('diary-table').innerHTML = diary.length
      ? '<thead><tr>' + T.DIARY_COLS.map((c) => `<th>${c[1]}</th>`).join('') + '<th></th></tr></thead><tbody>' +
        diary.map((r, i) => '<tr>' + T.DIARY_COLS.map((c) => `<td>${esc(c[0] === 'data' ? fmtDate(r[c[0]]) : r[c[0]] ?? '')}</td>`).join('') +
          `<td><button type="button" class="pbtn ghost" data-del="${i}" aria-label="Elimina la riga ${i + 1}">Elimina</button></td></tr>`).join('') + '</tbody>'
      : '<caption style="text-align:left;color:var(--mut);padding:8px">Il diario è vuoto: aggiungi la prima riga qui sopra.</caption>';
    labelHelpButtons(document.getElementById('diary-stats'));
    renderPlan();
  }
  const today = () => new Date().toISOString().slice(0, 10);
  document.getElementById('d-data').value = today();
  document.getElementById('diary-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const row = {};
    for (const [k] of T.DIARY_COLS) row[k] = document.getElementById('d-' + k).value.trim();
    diary.push(row); save(KEYS.diary, diary);
    for (const [k] of T.DIARY_COLS) if (k !== 'data') document.getElementById('d-' + k).value = '';
    renderDiary();
  });
  document.getElementById('diary-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    diary.splice(+b.dataset.del, 1); save(KEYS.diary, diary); renderDiary();
  });
  document.getElementById('diary-csv').onclick = (e) => {
    if (e.target.closest('.qm')) return;
    const blob = new Blob([T.diaryToCsv(diary)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'diario_operazioni.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // Copia negli appunti: funziona anche dove i download sono bloccati (es. dentro un artefatto di Claude).
  async function copyText(text, msgEl) {
    try { await navigator.clipboard.writeText(text); msgEl.innerHTML = '<div class="adv info"><div class="b">Copiato negli appunti. Incollalo in un file di testo (per il CSV: salvalo come diario.csv e aprilo con Excel o Numbers).</div></div>'; }
    catch (e) {
      msgEl.innerHTML = '<div class="adv warn"><div class="b">Il browser non permette di copiare da qui. Seleziona il testo qui sotto e copialo a mano (Ctrl+C).</div></div>' +
        `<textarea class="tfield" rows="6" readonly id="copy-fallback">${esc(text)}</textarea>`;
      const t = document.getElementById('copy-fallback'); if (t) { t.focus(); t.select(); }
    }
  }
  document.getElementById('diary-copy').onclick = (e) => {
    if (e.target.closest('.qm')) return;
    copyText(T.diaryToCsv(diary).replace(/^﻿/, ''), document.getElementById('diary-stats'));
  };

  let clearArmed = null;
  document.getElementById('diary-clear').onclick = (e) => {        // conferma in due passaggi (niente finestre di dialogo)
    const b = e.currentTarget;
    if (!clearArmed) {
      b.textContent = 'Conferma: cancella tutto'; clearArmed = setTimeout(() => { clearArmed = null; b.textContent = 'Cancella tutto'; }, 4000);
    } else {
      clearTimeout(clearArmed); clearArmed = null; b.textContent = 'Cancella tutto'; diary = []; save(KEYS.diary, diary); renderDiary();
    }
  };

  // ----- Piano dei 30 giorni -----
  let plan = load(KEYS.plan, {});
  function renderPlan() {
    document.getElementById('plan').innerHTML = T.PLAN30.map((w) => {
      const done = w.attivita.filter((_, i) => plan[`w${w.settimana}a${i}`]).length;
      let extra = '';
      if (w.settimana === 2) extra = `<div class="note">Operazioni nel diario: ${diary.length} / 20</div>`;
      if (w.settimana === 4) extra = `<div class="note">Operazioni nel diario: ${diary.length} / 50</div>`;
      return `<div class="week"><h3>Settimana ${w.settimana} <span class="note">(${done}/${w.attivita.length})</span></h3><div class="obj">Obiettivo: ${esc(w.obiettivo)}</div>` +
        w.attivita.map((a, i) => `<div class="chk ${plan[`w${w.settimana}a${i}`] ? 'done' : ''}"><input type="checkbox" id="p-${w.settimana}-${i}" data-plan="w${w.settimana}a${i}" ${plan[`w${w.settimana}a${i}`] ? 'checked' : ''}><label for="p-${w.settimana}-${i}">${esc(a)}</label></div>`).join('') + extra + '</div>';
    }).join('');
  }
  document.getElementById('plan').addEventListener('change', (e) => {
    const k = e.target.dataset.plan; if (!k) return;
    plan[k] = e.target.checked; save(KEYS.plan, plan); renderPlan();
  });

  // ----- Profilo e backup -----
  const KEY_PROFILE = 'tl_profile_v1';
  const showPlayer = () => {
    const n = (load(KEY_PROFILE, {}).name || '').trim(); const el = document.getElementById('player');
    if (el) el.textContent = n ? `Utente: ${n}` : '';
    window.dispatchEvent(new Event('playerchange'));          // la pagina Inizio saluta per nome
  };
  const nameEl = document.getElementById('p-name');
  nameEl.value = (load(KEY_PROFILE, {}).name || '');
  nameEl.addEventListener('input', () => { save(KEY_PROFILE, { name: nameEl.value.trim().slice(0, 24) }); showPlayer(); });
  showPlayer();
  // Usata anche dal tutorial: imposta il nome (qualunque testo, max 24 caratteri) e aggiorna campo e intestazione.
  window.setPlayerName = (name) => {
    const n = String(name || '').trim().slice(0, 24);
    save(KEY_PROFILE, { name: n }); nameEl.value = n; showPlayer();
  };

  const bkMsg = document.getElementById('bk-msg');
  const readStore = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined; } catch (e) { return mem[k]; } };
  const backupText = () => T.makeBackup(readStore);
  document.getElementById('bk-export').onclick = (e) => {
    if (e.target.closest('.qm')) return;
    const blob = new Blob([backupText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'trading_lab_backup.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    bkMsg.innerHTML = '<div class="adv info"><div class="b">Backup creato. Se il download non parte (alcune pagine li bloccano), usa «Copia il backup negli appunti».</div></div>';
    if (window.markMilestone) window.markMilestone('backup');
  };
  document.getElementById('bk-copy').onclick = () => { copyText(backupText(), bkMsg); if (window.markMilestone) window.markMilestone('backup'); };
  document.getElementById('bk-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2000000) { bkMsg.innerHTML = '<div class="adv alert"><div class="b">Il file è troppo grande per essere un backup del Lab.</div></div>'; return; }
    document.getElementById('bk-text').value = await f.text();
  });
  let importArmed = null;
  document.getElementById('bk-import').onclick = (e) => {      // conferma in due passaggi: l'import SOSTITUISCE i dati attuali
    const r = T.parseBackup(document.getElementById('bk-text').value);
    if (!r.ok) { bkMsg.innerHTML = `<div class="adv alert"><div class="b">${esc(r.error)}</div></div>`; return; }
    const b = e.currentTarget;
    if (!importArmed) {
      const parts = Object.entries(r.counts).map(([k, n]) => `${k.replace('tl_', '').replace('_v1', '')}: ${n}`).join(', ');
      bkMsg.innerHTML = `<div class="adv warn"><div class="b">Backup valido (${esc(parts)}). Ripristinarlo sostituisce i dati di questo browser. Clicca di nuovo per confermare.</div></div>`;
      b.textContent = 'Conferma: sostituisci i miei dati';
      importArmed = setTimeout(() => { importArmed = null; b.textContent = 'Ripristina da questo backup'; }, 6000);
      return;
    }
    clearTimeout(importArmed); importArmed = null;
    window.__importing = true;                                   // blocca i salvataggi automatici della demo fino al ricaricamento
    for (const [k, v] of Object.entries(r.data)) save(k, v);
    bkMsg.innerHTML = '<div class="adv info"><div class="b">Dati ripristinati. Ricarico la pagina...</div></div>';
    setTimeout(() => location.reload(), 600);
  };

  renderCalc(); renderChecklist(); renderDiary();
  document.getElementById('storage-note').hidden = storageOk;
})();

;
// Conto DEMO che gira tutto nel browser: copia fedele di lab/demo.py (stessi controlli, stessi messaggi).
// Soldi virtuali, nessun broker, nessuna chiave. Lo stato si salva dove decide chi lo usa (localStorage).
(function (root) {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const START_BALANCE = 10000;
  const FEE_PCT = 0.0005;                      // come config.FEE_PCT: 0,05% per lato

  class DemoError extends Error {}

  class DemoAccount {
    // storage: {get(): oggetto|null, set(obj)}; opzionale.
    constructor(storage, opts = {}) {
      this.storage = storage || null;
      this.feePct = opts.feePct === undefined ? FEE_PCT : opts.feePct;
      const start = opts.startBalance || START_BALANCE;
      this.state = { start_balance: start, balance: start, positions: [], history: [], next_id: 1, created: new Date().toISOString() };
      const saved = this.storage && this.storage.get();
      if (saved && Array.isArray(saved.positions) && Array.isArray(saved.history)) this.state = saved;   // dati corrotti: si riparte
    }

    _save() { if (this.storage) this.storage.set(this.state); }

    reset() {
      const sb = this.state.start_balance;
      this.state = { start_balance: sb, balance: sb, positions: [], history: [], next_id: 1, created: new Date().toISOString() };
      this._save();
    }

    openNotional() { return this.state.positions.reduce((a, p) => a + p.qty * p.entry, 0); }

    open(symbol, side, qty, bid, ask, sl = null, tp = null) {
      if (!SYMBOLS.includes(symbol)) throw new DemoError(`Strumento non disponibile: ${symbol}.`);
      if (side !== 'long' && side !== 'short') throw new DemoError('La direzione deve essere long o short.');
      if (!(typeof qty === 'number' && qty > 0)) throw new DemoError('La quantità deve essere maggiore di zero.');
      if (!(bid > 0 && ask >= bid)) throw new DemoError('Prezzi non validi.');
      const entry = side === 'long' ? ask : bid, sign = side === 'long' ? 1 : -1;
      if (sl !== null && (sl - entry) * sign >= 0) throw new DemoError('Lo stop loss deve stare dalla parte della perdita (long: sotto il prezzo, short: sopra).');
      if (tp !== null && (tp - entry) * sign <= 0) throw new DemoError('Il take profit deve stare dalla parte del guadagno (long: sopra il prezzo, short: sotto).');
      const notional = qty * entry, fee = notional * this.feePct;
      if (this.openNotional() + notional > this.state.balance - fee) {
        throw new DemoError('Importo troppo grande: il conto demo non usa la leva, il totale delle posizioni non può superare la liquidità.');
      }
      this.state.balance -= fee;
      const pos = { id: this.state.next_id++, symbol, side, qty, entry, sl, tp, sl0: sl, fee_open: fee, opened: new Date().toISOString() };
      this.state.positions.push(pos);
      this._save();
      return pos;
    }

    _find(id) {
      const p = this.state.positions.find((x) => x.id === id);
      if (!p) throw new DemoError('Posizione non trovata.');
      return p;
    }

    modify(id, sl, tp) {
      const pos = this._find(id), sign = pos.side === 'long' ? 1 : -1;
      if (sl !== null && (sl - pos.entry) * sign >= 0 && pos.sl0 === null) throw new DemoError('Lo stop loss deve stare dalla parte della perdita.');
      if (tp !== null && (tp - pos.entry) * sign <= 0) throw new DemoError('Il take profit deve stare dalla parte del guadagno.');
      pos.sl = sl; pos.tp = tp;
      if (pos.sl0 === null && sl !== null) pos.sl0 = sl;        // il rischio iniziale (per R) e' il primo stop messo
      this._save();
      return pos;
    }

    close(id, bid, ask, reason = 'manuale') {
      const pos = this._find(id);
      return this.closeAt(id, pos.side === 'long' ? bid : ask, reason);    // si vende al bid, si ricompra all'ask
    }

    // Chiude a un prezzo deciso (usata anche dal recupero). whenIso: quando e' successo; recovered: scoperto dopo.
    closeAt(id, exit, reason, whenIso = null, recovered = false) {
      const pos = this._find(id), sign = pos.side === 'long' ? 1 : -1;
      const gross = (exit - pos.entry) * pos.qty * sign;
      const feeClose = pos.qty * exit * this.feePct;
      this.state.balance += gross - feeClose;
      const net = gross - feeClose - pos.fee_open;
      const risk = pos.sl0 ? pos.qty * Math.abs(pos.entry - pos.sl0) : null;
      const rec = { ...pos, exit, closed: whenIso || new Date().toISOString(), reason, recovered, pnl: net, r: risk ? net / risk : null };
      this.state.positions = this.state.positions.filter((p) => p.id !== id);
      this.state.history.push(rec);
      this._save();
      return rec;
    }

    // RECUPERO: mentre la pagina era chiusa nessuno guardava il prezzo. Alla riapertura si rileggono le candele
    // passate {SIMBOLO: [[tempoSec, open, high, low, close], ...]} (ordinate) e si applicano stop e target AL LORO LIVELLO,
    // alla candela in cui sono stati toccati. Regole prudenti, come nel backtest:
    //  - stop e target toccati nella stessa candela -> vale lo stop;
    //  - se la candela APRE gia' oltre lo stop (salto di prezzo) si esce all'apertura, peggio dello stop.
    // Limite: le candele sono prezzi di scambio, non bid/ask (spread ignorato), e vengono da un altro exchange.
    recover(candlesBySymbol, sinceMs = 0) {
      const closed = [];
      for (const pos of [...this.state.positions]) {
        const cs = candlesBySymbol[pos.symbol];
        if (!cs) continue;
        const from = Math.max(Date.parse(pos.opened), sinceMs || 0) / 1000, long = pos.side === 'long';
        for (const [t, o, h, l] of cs) {
          if (t < from) continue;                               // candele precedenti all'apertura o all'ultimo controllo
          const slHit = pos.sl !== null && (long ? l <= pos.sl : h >= pos.sl);
          const tpHit = pos.tp !== null && (long ? h >= pos.tp : l <= pos.tp);
          if (slHit) { closed.push(this.closeAt(pos.id, long ? Math.min(pos.sl, o) : Math.max(pos.sl, o), 'stop', new Date(t * 1000).toISOString(), true)); break; }
          if (tpHit) { closed.push(this.closeAt(pos.id, pos.tp, 'target', new Date(t * 1000).toISOString(), true)); break; }
        }
      }
      return closed;
    }

    // Segna "ultimo momento in cui il prezzo e' stato controllato": da qui parte il recupero alla riapertura.
    touch(ms = Date.now()) { this.state.last_seen = ms; this._save(); }

    // prices: {SIMBOLO: [bid, ask]}. Ritorna le posizioni chiuse da stop o target (priorita' allo stop).
    onPrices(prices) {
      const closed = [];
      for (const pos of [...this.state.positions]) {
        const px = prices[pos.symbol];
        if (!px) continue;
        const [bid, ask] = px, long = pos.side === 'long', mark = long ? bid : ask;
        const slHit = pos.sl !== null && (long ? mark <= pos.sl : mark >= pos.sl);
        const tpHit = pos.tp !== null && (long ? mark >= pos.tp : mark <= pos.tp);
        if (slHit) closed.push(this.close(pos.id, bid, ask, 'stop'));
        else if (tpHit) closed.push(this.close(pos.id, bid, ask, 'target'));
      }
      return closed;
    }

    snapshot(prices) {
      let floating = 0;
      const positions = this.state.positions.map((p) => {
        const px = prices[p.symbol];
        let pnl = null;
        if (px) {
          const mark = p.side === 'long' ? px[0] : px[1];
          pnl = (mark - p.entry) * p.qty * (p.side === 'long' ? 1 : -1);
          floating += pnl;
        }
        return { ...p, floating: pnl };
      });
      const hist = this.state.history, rs = hist.filter((h) => h.r !== null && h.r !== undefined).map((h) => h.r);
      const wins = hist.filter((h) => h.pnl > 0);
      return {
        start_balance: this.state.start_balance, balance: this.state.balance, equity: this.state.balance + floating, floating,
        positions, history: hist.slice(-200).reverse(),
        stats: { trades: hist.length, win_rate: hist.length ? wins.length / hist.length : null, total_pnl: hist.reduce((a, h) => a + h.pnl, 0),
          avg_r: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, n_r: rs.length },
        fee_pct: this.feePct,
      };
    }
  }

  // --- Candele passate per il recupero (Kraken, pubbliche, raggiungibili dal browser) ---
  const KRAKEN_PAIR = { BTCUSDT: 'XBTUSD', ETHUSDT: 'ETHUSD', SOLUSDT: 'SOLUSD' };
  const KRAKEN_INTERVALS = [1, 5, 15, 60, 240, 1440];          // minuti; Kraken restituisce al massimo 720 candele
  // La risoluzione piu' fine che copre tutto il periodo di assenza (con un po' di margine).
  function pickInterval(spanSeconds) {
    for (const m of KRAKEN_INTERVALS) if (spanSeconds <= 700 * m * 60) return m;
    return null;                                               // assenza troppo lunga: oltre ~2 anni
  }
  // Risposta Kraken -> [[tempoSec, open, high, low, close], ...]
  function parseKraken(json) {
    if (!json || (json.error && json.error.length) || !json.result) throw new Error('risposta non valida');
    const key = Object.keys(json.result).find((k) => k !== 'last');
    return (json.result[key] || []).map((c) => [c[0], parseFloat(c[1]), parseFloat(c[2]), parseFloat(c[3]), parseFloat(c[4])]);
  }
  function krakenUrl(symbol, intervalMin, sinceSec) {
    return `https://api.kraken.com/0/public/OHLC?pair=${KRAKEN_PAIR[symbol]}&interval=${intervalMin}&since=${Math.floor(sinceSec - intervalMin * 60)}`;
  }

  // Feed prezzi via WebSocket pubblico di Binance (solo dati di mercato). Le richieste HTTP normali sono bloccate
  // dal browser (CORS), i WebSocket no. Si prova prima la porta 443 (di solito aperta anche nelle reti scolastiche).
  const FEED_URLS = [
    'wss://data-stream.binance.vision/stream?streams=' + SYMBOLS.map((s) => s.toLowerCase() + '@bookTicker').join('/'),
    'wss://stream.binance.com:443/stream?streams=' + SYMBOLS.map((s) => s.toLowerCase() + '@bookTicker').join('/'),
  ];
  function startFeed(onTick, onStatus) {
    const prices = {};
    let ws = null, idx = 0, retry = 0, stopped = false;
    const connect = () => {
      if (stopped) return;
      try { ws = new WebSocket(FEED_URLS[idx % FEED_URLS.length]); } catch (e) { onStatus && onStatus('errore'); return; }
      ws.onopen = () => { retry = 0; onStatus && onStatus('connesso'); };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data).data;
          prices[d.s] = [parseFloat(d.b), parseFloat(d.a)];
          onTick && onTick(d.s, prices);
        } catch (err) { /* messaggio non valido: ignorato */ }
      };
      ws.onerror = () => { onStatus && onStatus('errore'); };
      ws.onclose = () => {
        onStatus && onStatus('disconnesso');
        idx++; retry++;
        setTimeout(connect, Math.min(1000 * retry, 10000));       // riprova con attesa crescente, alternando i due indirizzi
      };
    };
    connect();
    return { prices: () => ({ ...prices }), stop: () => { stopped = true; if (ws) ws.close(); } };
  }

  const api = { DemoAccount, DemoError, SYMBOLS, START_BALANCE, FEE_PCT, startFeed, pickInterval, parseKraken, krakenUrl, KRAKEN_PAIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DEMO_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
// Scheda "Demo": conto con soldi virtuali. Prezzi pubblici, ordini simulati dal server locale (lab/demo.py).
// Nessun ordine esce dal computer. Nella versione statica (artefatto) non c'e' server: la scheda lo spiega.
(function () {
  const T = window.TOOLS;
  const root = document.getElementById('demo-root');
  // Due modi di funzionare, stessa interfaccia:
  //  - SERVER (python -m lab.app): ordini e prezzi passano dal server locale, che controlla stop/target anche a pagina chiusa.
  //  - BROWSER (versione statica, es. GitHub Pages): conto salvato nel browser, prezzi dal WebSocket pubblico di Binance;
  //    stop e target sono controllati solo mentre la pagina e' aperta.
  const LOCAL = !!window.__DATA__;
  const num = (v) => (v === null || v === undefined || v === '' ? null : parseFloat(String(v).replace(',', '.')));
  let api, feedStatus = '', noticeHtml = '';
  if (LOCAL) {
    const E = window.DEMO_ENGINE;
    const storage = {
      get() { try { const v = localStorage.getItem('tl_demo_v1'); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
      set(o) {
        if (window.__importing) return;                  // durante un ripristino da backup non si riscrive lo stato vecchio
        try { localStorage.setItem('tl_demo_v1', JSON.stringify(o)); } catch (e) { /* senza storage il conto vive solo a pagina aperta */ }
      },
    };
    const engine = new E.DemoAccount(storage);
    let lastCheck = 0, lastTouch = 0, ready = false;
    const feed = E.startFeed((sym, prices) => {          // a ogni quotazione: controllo di stop e target
      if (!ready) return;                                // prima va fatto il recupero dell'assenza
      const now = Date.now();
      if (now - lastCheck > 500 && engine.state.positions.length) { lastCheck = now; engine.onPrices(prices); }
      if (now - lastTouch > 5000) { lastTouch = now; engine.touch(now); }       // "ultimo momento in cui ho visto il prezzo"
    }, (s) => { feedStatus = s; });
    const saveSeen = () => { if (ready) engine.touch(); };
    window.addEventListener('pagehide', saveSeen);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveSeen(); });

    // RECUPERO: se c'erano posizioni aperte quando la pagina e' stata chiusa, si rileggono le candele passate (Kraken)
    // e si applicano stop e target al loro livello. Vedi DemoAccount.recover per le regole e i limiti.
    const noteEl = () => document.getElementById('d-notice');
    const note = (html, cls = 'info') => { noticeHtml = `<div class="adv ${cls}"><div class="b">${html}</div></div>`; if (noteEl()) noteEl().innerHTML = noticeHtml; };
    (async function recoverAbsence() {
      try {
        const st = engine.state, now = Date.now(), seen = st.last_seen || 0;
        if (!st.positions.length) return;
        const since = Math.min(...st.positions.map((p) => Math.max(Date.parse(p.opened), seen)));
        if (now - since < 60000) return;                                         // assenza breve: non serve
        const interval = E.pickInterval((now - since) / 1000);
        if (!interval) { note('Sei stato via troppo a lungo per ricostruire cosa è successo: le posizioni vengono controllate con il prezzo di adesso.', 'warn'); return; }
        const symbols = [...new Set(st.positions.map((p) => p.symbol))], cands = {};
        for (const s of symbols) {
          const r = await fetch(E.krakenUrl(s, interval, since / 1000));
          cands[s] = E.parseKraken(await r.json());
        }
        const closed = engine.recover(cands, seen);
        const label = interval >= 60 ? `${interval / 60} ora/e` : `${interval} minuto/i`;
        note(closed.length ? `Mentre eri via, ${closed.length} posizione/i si sono chiuse (stop o target) al loro livello. Controllo fatto con candele da ${label}: è un\'approssimazione (spread ignorato, fonte diversa da Binance).`
          : `Controllato cosa è successo mentre eri via (candele da ${label}): nessuno stop o target è scattato.`);
      } catch (e) {
        note('Non sono riuscito a leggere le candele passate (la fonte potrebbe essere bloccata dalla tua rete). Le posizioni vengono controllate con il prezzo di adesso, che può essere peggio dello stop.', 'warn');
      } finally { ready = true; engine.touch(); }
    })();
    const wrap = (fn) => async (...a) => { try { return fn(...a); } catch (e) { throw new Error(e.message); } };
    api = {
      state: async (sym) => {
        const prices = feed.prices();
        if (ready) engine.onPrices(prices);
        return { ...engine.snapshot(prices), symbol: sym, symbols: E.SYMBOLS, price: prices[sym] || null, price_ok: !!prices[sym] };
      },
      order: wrap((b) => {
        const p = feed.prices()[b.symbol];
        if (!p) throw new Error('Prezzi non disponibili in questo momento: riprova tra qualche secondo.');
        return engine.open(b.symbol, b.side, num(b.qty) || 0, p[0], p[1], num(b.sl), num(b.tp));
      }),
      close: wrap((id) => {
        const pos = engine._find(id), p = feed.prices()[pos.symbol];
        if (!p) throw new Error('Prezzi non disponibili: impossibile chiudere ora.');
        return engine.close(id, p[0], p[1], 'manuale');
      }),
      modify: wrap((id, sl, tp) => engine.modify(id, num(sl), num(tp))),
      reset: wrap(() => engine.reset()),
    };
  } else {
    const post = async (url, body) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Errore del server');
      return j;
    };
    api = {
      state: async (sym) => { const r = await fetch('/api/demo/state?symbol=' + sym); if (!r.ok) throw new Error('stato non disponibile'); return r.json(); },
      order: (b) => post('/api/demo/order', b), close: (id) => post('/api/demo/close', { id }),
      modify: (id, sl, tp) => post('/api/demo/modify', { id, sl, tp }), reset: () => post('/api/demo/reset'),
    };
  }
  const fmt = (x, d = 2) => (x === null || x === undefined ? '-' : Number(x).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const px = (x) => (x === null || x === undefined ? '-' : Number(x).toLocaleString('it-IT', { maximumFractionDigits: x < 10 ? 4 : 2 }));
  const sgn = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
  let state = null, symbol = 'BTCUSDT', timer = null, resetArmed = null, lastError = '';

  root.innerHTML = `
    <div id="d-notice" aria-live="polite"></div>
    <div class="cards" id="d-cards"></div>
    <div class="two">
      <section>
        <h2>Nuovo ordine ${H('demo_check')}</h2>
        <div class="form">
          <label for="o-symbol">Strumento<select id="o-symbol" class="tfield"></select></label>
          <label for="o-qty">Quantità ${H('demo_qty')}<input id="o-qty" inputmode="decimal" value="0.01"></label>
          <label for="o-sl">Stop loss ${H('stop_loss')}<input id="o-sl" inputmode="decimal"></label>
          <label for="o-tp">Take profit ${H('take_profit')}<input id="o-tp" inputmode="decimal"></label>
        </div>
        <div id="o-price" aria-live="polite" style="margin:6px 0"></div>
        <div id="o-check" aria-live="polite"></div>
        <div id="o-checklist" class="note" style="margin:6px 0"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="pbtn" id="o-long">Apri LONG (demo)</button>
          <button type="button" class="pbtn ghost" id="o-short">Apri SHORT (demo)</button>
        </div>
        <div id="o-msg" aria-live="polite" style="margin-top:8px"></div>
        <p class="note">Il conto demo non usa la leva. Il server controlla stop e target ogni 5 secondi mentre è acceso.</p>
      </section>
      <section>
        <h2>Posizioni aperte ${H('demo_positions')}</h2>
        <div class="scroll"><table id="d-pos"></table></div>
      </section>
    </div>
    <h2>Storico delle operazioni demo ${H('demo_history')}</h2>
    <div id="d-stats" style="margin-bottom:6px"></div>
    <div class="scroll" style="max-height:40vh;overflow:auto"><table id="d-hist"></table></div>
    <div style="margin-top:12px"><button type="button" class="pbtn ghost" id="d-reset">Azzera il conto demo</button>${H('demo_reset')}</div>`;

  const sel = document.getElementById('o-symbol');
  sel.addEventListener('change', () => { symbol = sel.value; refresh(); });

  function currentOrder(sideName) {
    const p = state && state.price;
    return { side: sideName, qty: document.getElementById('o-qty').value, sl: document.getElementById('o-sl').value, tp: document.getElementById('o-tp').value,
      price: p ? (sideName === 'long' ? p[1] : p[0]) : NaN };
  }
  function renderCheck() {
    const el = document.getElementById('o-check');
    if (!state) { el.innerHTML = ''; return; }
    const parts = [];
    for (const s of ['long', 'short']) {
      const c = T.demoCheck(currentOrder(s), state.equity, state.fee_pct);
      if (s === 'long') {
        parts.push(c.errors.length ? `<div class="adv warn"><div class="b">${esc(c.errors[0])}</div></div>` :
          `<div class="res"><div><b>${fmt(c.notional)}</b><span>Importo (${c.notionalPct.toFixed(1).replace('.', ',')}% dell'equity)</span></div>` +
          `<div><b>${c.maxLoss === undefined ? '-' : fmt(c.maxLoss)}</b><span>Perdita massima${c.maxLossPct === undefined ? '' : ` (${c.maxLossPct.toFixed(2).replace('.', ',')}%)`}</span></div>` +
          `<div><b>${c.rr === undefined ? '-' : '1:' + c.rr.toFixed(2).replace('.', ',')}</b><span>Rischio/rendimento ${H('rr_ratio')}</span></div>` +
          `<div><b>${fmt(c.feeRoundTrip)}</b><span>Commissioni stimate (entrata+uscita) ${H('costi')}</span></div></div>` +
          c.warnings.filter((w) => !w.startsWith('Short')).map((w) => `<div class="adv warn"><div class="b">${esc(w)}</div></div>`).join(''));
      } else if (!c.errors.length) {
        const w = c.warnings.find((x) => x.startsWith('Short'));
        if (w) parts.push(`<div class="note">Se apri uno short: ${esc(w)}</div>`);
      }
    }
    el.innerHTML = parts.join('');
    labelHelpButtons(el);
    let done = 0;
    try { done = (JSON.parse(localStorage.getItem('tl_checklist_v1') || '[]') || []).filter(Boolean).length; } catch (e) { /* senza storage */ }
    document.getElementById('o-checklist').textContent = `Checklist (scheda Strumenti): ${done} su 10 spuntate. Prima di ogni operazione il PDF consiglia di completarla.`;
  }
  ['o-qty', 'o-sl', 'o-tp'].forEach((id) => document.getElementById(id).addEventListener('input', renderCheck));

  async function openOrder(sideName) {
    const msg = document.getElementById('o-msg');
    try {
      const o = currentOrder(sideName);
      await api.order({ symbol, side: sideName, qty: o.qty, sl: o.sl, tp: o.tp });
      msg.innerHTML = `<div class="adv info"><div class="b">Ordine demo aperto (${sideName}). Ricorda di riportarlo nel diario.</div></div>`;
      await refresh();
    } catch (e) { msg.innerHTML = `<div class="adv alert"><div class="b">${esc(e.message)}</div></div>`; }
  }
  document.getElementById('o-long').onclick = () => openOrder('long');
  document.getElementById('o-short').onclick = () => openOrder('short');

  function render() {
    if (!state) return;
    sel.innerHTML = state.symbols.map((s) => `<option ${s === state.symbol ? 'selected' : ''}>${s}</option>`).join('');
    const st = state.stats;
    document.getElementById('d-cards').innerHTML =
      card('Saldo (liquidità)', fmt(state.balance), `partenza ${fmt(state.start_balance, 0)}`, 'demo_saldo') +
      card('Equity', fmt(state.equity), '', 'demo_equity') +
      card('P&L aperto', `<span class="${sgn(state.floating)}">${fmt(state.floating)}</span>`, `${state.positions.length} posizioni`, 'demo_floating') +
      card('P&L chiuso', `<span class="${sgn(st.total_pnl)}">${fmt(st.total_pnl)}</span>`, `${st.trades} operazioni`, 'demo_chiuso');
    const p = state.price;
    document.getElementById('o-price').innerHTML = p ? `Bid <b>${px(p[0])}</b> · Ask <b>${px(p[1])}</b> · spread ${px(p[1] - p[0])} ${H('demo_bid_ask')}` :
      '<span class="neg">Prezzi non disponibili in questo momento.</span>';
    document.getElementById('d-pos').innerHTML = state.positions.length ?
      '<thead><tr><th>#</th><th>Strumento</th><th>Dir.</th><th>Qtà</th><th>Ingresso</th><th>Stop</th><th>Target</th><th>P&L</th><th></th></tr></thead><tbody>' +
      state.positions.map((q) => `<tr><td>${q.id}</td><td>${q.symbol}</td><td>${q.side}</td><td>${q.qty}</td><td>${px(q.entry)}</td>` +
        `<td><input class="tfield" style="width:90px" data-sl="${q.id}" value="${q.sl ?? ''}" aria-label="Stop loss posizione ${q.id}"></td>` +
        `<td><input class="tfield" style="width:90px" data-tp="${q.id}" value="${q.tp ?? ''}" aria-label="Take profit posizione ${q.id}"></td>` +
        `<td class="${sgn(q.floating)}">${fmt(q.floating)}</td>` +
        `<td style="white-space:nowrap"><button type="button" class="pbtn ghost" data-save="${q.id}">Salva SL/TP</button> <button type="button" class="pbtn" data-close="${q.id}">Chiudi</button></td></tr>`).join('') + '</tbody>' :
      '<caption style="text-align:left;color:var(--mut);padding:8px">Nessuna posizione aperta.</caption>';
    document.getElementById('d-stats').innerHTML = st.trades ?
      `Operazioni chiuse: <b>${st.trades}</b> · win rate ${(st.win_rate * 100).toFixed(0)}% · ` +
      (st.avg_r === null ? 'R medio non calcolabile (servono operazioni con stop)' : `R medio ${fmt(st.avg_r, 2)} su ${st.n_r}`) +
      (st.trades < 30 ? ' <span class="note">· con meno di 30 operazioni può essere solo fortuna</span>' : '') : '<span class="note">Ancora nessuna operazione chiusa.</span>';
    document.getElementById('d-hist').innerHTML = state.history.length ?
      '<thead><tr><th>Chiusa (UTC)</th><th>Strumento</th><th>Dir.</th><th>Qtà</th><th>Ingresso</th><th>Uscita</th><th>Motivo</th><th>P&L netto</th><th>R</th></tr></thead><tbody>' +
      state.history.map((h) => `<tr><td>${h.closed.replace('T', ' ').slice(0, 16)}</td><td>${h.symbol}</td><td>${h.side}</td><td>${h.qty}</td><td>${px(h.entry)}</td><td>${px(h.exit)}</td>` +
        `<td>${h.reason}${h.recovered ? ' (recuperato)' : ''}</td><td class="${sgn(h.pnl)}">${fmt(h.pnl)}</td><td>${h.r === null ? '-' : fmt(h.r, 2)}</td></tr>`).join('') + '</tbody>' : '';
    document.getElementById('d-notice').innerHTML = noticeHtml;
    labelHelpButtons(root);
    renderCheck();
  }

  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-close]'), s = e.target.closest('[data-save]');
    try {
      if (c) { await api.close(+c.dataset.close); await refresh(); }
      if (s) {
        const id = +s.dataset.save;
        await api.modify(id, root.querySelector(`[data-sl="${id}"]`).value, root.querySelector(`[data-tp="${id}"]`).value);
        await refresh();
      }
    } catch (err) { document.getElementById('o-msg').innerHTML = `<div class="adv alert"><div class="b">${esc(err.message)}</div></div>`; }
  });
  document.getElementById('d-reset').onclick = async (e) => {            // conferma in due passaggi (niente finestre di dialogo)
    const b = e.currentTarget;
    if (!resetArmed) { b.textContent = 'Conferma: azzera tutto'; resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Azzera il conto demo'; }, 4000); return; }
    clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Azzera il conto demo';
    await api.reset(); await refresh();
  };

  async function refresh() {
    try {
      state = await api.state(symbol); symbol = state.symbol; lastError = '';
      if (window.markMilestone) {                                   // tappe del percorso: prima operazione e numero di operazioni chiuse
        if (state.positions.length || state.stats.trades) window.markMilestone('first_demo');
        window.markMilestone('demoMax', state.stats.trades);
      }
      if (document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('input,select')) {
        // non riscrivere la tabella mentre l'utente sta digitando negli stop/target delle posizioni
        if (document.activeElement.dataset.sl || document.activeElement.dataset.tp) { renderTopOnly(); return; }
      }
      render();
    } catch (e) {
      lastError = e.message;
      if (!LOCAL) document.getElementById('o-price').innerHTML = '<span class="neg">Server non raggiungibile: la demo funziona solo con <code>python -m lab.app</code> acceso.</span>';
    }
    if (LOCAL && state && !state.price_ok) {
      document.getElementById('o-price').innerHTML = feedStatus === 'connesso' ? 'In attesa dei prezzi...' :
        '<span class="neg">Prezzi non raggiungibili da qui (' + (feedStatus || 'connessione in corso') + '). Se stai usando l\'artefatto di Claude, blocca le connessioni esterne: apri la versione su GitHub Pages oppure il server locale. Alcune reti (scuola, uffici) bloccano Binance.</span>';
    }
  }
  function renderTopOnly() {   // aggiorna solo prezzi e carte, non le tabelle
    const p = state.price;
    document.getElementById('o-price').innerHTML = p ? `Bid <b>${px(p[0])}</b> · Ask <b>${px(p[1])}</b> · spread ${px(p[1] - p[0])} ${H('demo_bid_ask')}` : '';
    labelHelpButtons(document.getElementById('o-price'));
  }

  // Aggiorna ogni 3 secondi, ma solo mentre la scheda Demo e' visibile.
  window.tabListeners.push((name) => {
    clearInterval(timer);
    if (name === 'demo') { refresh(); timer = setInterval(refresh, 3000); }
  });
})();

;
// Scheda "Allenati": replay del mercato, simulazione della fortuna e calcolatori di risparmio.
// Solo per imparare: nessun ordine, nessun conto. La logica pura sta in train_core.js (con test).
(function () {
  const T = window.TRAIN;
  const tab = document.getElementById('allenati-tab');
  const KEY_STATS = 'tl_replay_v1';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* senza storage: non si salva */ } };
  const fmt = (x, d = 2) => Number(x).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (x) => fmt(x, 2);
  const px = (x) => Number(x).toLocaleString('it-IT', { maximumFractionDigits: x < 10 ? 4 : 2 });
  const sgn = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
  const mark = (k) => { if (window.markMilestone) window.markMilestone(k); };

  tab.innerHTML = `
    <div class="banner">Palestra di allenamento: esercizi per imparare, senza soldi veri e senza conti. Materiale educativo, non è consulenza finanziaria. Chi fa trading può perdere tutto il capitale.<button type="button" class="qm" data-help="tab_allenati" aria-expanded="false">?</button></div>
    <div class="subtabs" role="tablist" aria-label="Esercizi">
      <button type="button" role="tab" id="sub-replay" data-sub="replay" class="subtab active" aria-selected="true">Replay del mercato</button><button type="button" class="qm" data-help="tr_replay" aria-expanded="false">?</button>
      <button type="button" role="tab" id="sub-fortuna" data-sub="fortuna" class="subtab" aria-selected="false">Quanto conta la fortuna</button><button type="button" class="qm" data-help="tr_fortuna" aria-expanded="false">?</button>
      <button type="button" role="tab" id="sub-calc" data-sub="calc" class="subtab" aria-selected="false">Calcolatori</button><button type="button" class="qm" data-help="tr_calc" aria-expanded="false">?</button>
      <button type="button" role="tab" id="sub-glossario" data-sub="glossario" class="subtab" aria-selected="false">Glossario e ripasso</button><button type="button" class="qm" data-help="tr_glossario" aria-expanded="false">?</button>
    </div>
    <div id="tr-replay" class="subpanel"></div>
    <div id="tr-fortuna" class="subpanel" hidden></div>
    <div id="tr-calc" class="subpanel" hidden></div>
    <div id="tr-glossario" class="subpanel" hidden></div>`;

  // ---------------------------------------------------------------- sotto-schede
  let current = 'replay', replayStarted = false, luckStarted = false;
  function showSub(name) {
    current = name;
    tab.querySelectorAll('.subtab').forEach((b) => { const on = b.dataset.sub === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    ['replay', 'fortuna', 'calc', 'glossario'].forEach((n) => { document.getElementById('tr-' + n).hidden = n !== name; });
    if (name === 'glossario') buildGlossary();
    if (name === 'replay') { if (!replayStarted) { replayStarted = true; newExercise(); } else if (RP.chart) RP.chart.applyOptions({}); }
    if (name === 'fortuna') { if (!luckStarted) { luckStarted = true; runLuck(true); } else drawLuck(); }
    if (name === 'calc') drawCompound();
  }
  tab.querySelectorAll('.subtab').forEach((b) => (b.onclick = () => showSub(b.dataset.sub)));
  window.tabListeners.push((name) => { if (name === 'allenati') showSub(current); });
  window.themeListeners = window.themeListeners || [];

  // ================================================================ 1. REPLAY
  const TF_SEC = { '1h': 3600, '4h': 14400, '1d': 86400 };
  const RP = { sym: 'BTCUSDT', tf: '4h', cache: {}, all: [], start: 0, idx: 0, trade: null, result: null, chart: null, series: null, lines: [], markers: [], busy: false, side: 'long', skipped: false };

  document.getElementById('tr-replay').innerHTML = `
    <p class="note" style="max-width:85ch">Il grafico si ferma in un punto del passato e <b>non vedi cosa succede dopo</b>. Decidi tu: apri un ordine con stop e target, poi fai avanzare le candele e guarda come va. Le date sono nascoste, così non puoi barare con la memoria; alla fine ti dico di che periodo si trattava. ${H('rp_hidden')}</p>
    <div class="toolbar">
      <label>Strumento <select id="rp-sym"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
      <label>Candela <select id="rp-tf"><option value="4h">4 ore</option><option value="1h">1 ora</option><option value="1d">1 giorno</option></select></label>
      <button type="button" class="pbtn" id="rp-new">Nuovo esercizio</button>
      <span id="rp-status" class="note" aria-live="polite"></span>
    </div>
    <div class="rp-grid">
      <div>
        <div id="rp-chart" class="rp-chart"></div>
        <div class="rp-moves" id="rp-moves">
          <button type="button" class="pbtn ghost" data-adv="1">Avanti 1 candela</button>
          <button type="button" class="pbtn ghost" data-adv="5">Avanti 5</button>
          <button type="button" class="pbtn ghost" data-adv="20">Avanti 20</button>
          <button type="button" class="pbtn ghost" id="rp-end">Fino alla fine dell'operazione</button>
          <button type="button" class="pbtn ghost" id="rp-closenow">Chiudi adesso</button>
        </div>
      </div>
      <div>
        <h3 class="rp-h">Il tuo ordine ${H('rp_order')}</h3>
        <div class="rp-side" role="radiogroup" aria-label="Direzione">
          <label><input type="radio" name="rp-side" value="long" checked> Long (sale)</label>
          <label><input type="radio" name="rp-side" value="short"> Short (scende)</label>
        </div>
        <div class="form">
          <label for="rp-stop">Stop loss ${H('stop_loss')}<input id="rp-stop" inputmode="decimal"></label>
          <label for="rp-target">Take profit ${H('take_profit')}<input id="rp-target" inputmode="decimal"></label>
        </div>
        <div class="note" id="rp-sugg"></div>
        <div id="rp-check" aria-live="polite" style="margin:8px 0"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="pbtn" id="rp-open">Apri ordine</button>
          <button type="button" class="pbtn ghost" id="rp-skip">Non entro: mostra cosa succede ${H('rp_skip')}</button>
        </div>
        <div id="rp-result" aria-live="polite"></div>
        <h3 class="rp-h">Le tue statistiche ${H('rp_stats')}</h3>
        <div id="rp-stats"></div>
        <button type="button" class="pbtn ghost" id="rp-reset" style="margin-top:6px">Azzera le statistiche</button>
      </div>
    </div>`;
  const $r = (id) => document.getElementById(id);

  async function loadCandles(sym, tf) {
    const key = sym + tf;
    if (RP.cache[key]) return RP.cache[key];
    const r = await fetch(`/api/chart?from=0&to=4102444800&tf=${tf}&symbol=${sym}`);
    const j = await r.json();
    if (!r.ok || !j.candles || j.candles.length < 300) throw new Error(j.error || 'dati non disponibili');
    RP.cache[key] = j.candles;
    return j.candles;
  }
  // Tempi finti e regolari: si nasconde la data vera (e il grafico non mostra l'asse del tempo).
  const cc = (i) => { const c = RP.all[i]; return { time: 946684800 + i * TF_SEC[RP.tf], open: c.open, high: c.high, low: c.low, close: c.close }; };
  const dateOf = (i) => new Date(RP.all[i].time * 1000).toISOString().slice(0, 10);

  function ensureChart() {
    if (RP.chart) return;
    const el = $r('rp-chart');
    RP.chart = LightweightCharts.createChart(el, { autoSize: true, layout: { background: { color: css('--bg') }, textColor: css('--mut') },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, timeScale: { visible: false, borderColor: css('--line') },
      rightPriceScale: { borderColor: css('--line') }, crosshair: { mode: 0 }, handleScale: { axisPressedMouseMove: true } });
    RP.series = RP.chart.addCandlestickSeries({ upColor: css('--green'), downColor: css('--red'), wickUpColor: css('--green'), wickDownColor: css('--red'), borderVisible: false });
    window.themeListeners.push(() => {
      RP.chart.applyOptions({ layout: { background: { color: css('--bg') }, textColor: css('--mut') }, grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
        timeScale: { borderColor: css('--line') }, rightPriceScale: { borderColor: css('--line') } });
      RP.series.applyOptions({ upColor: css('--green'), downColor: css('--red'), wickUpColor: css('--green'), wickDownColor: css('--red') });
      drawLuck(); drawCompound();
    });
  }
  function clearLines() { RP.lines.forEach((l) => RP.series.removePriceLine(l)); RP.lines = []; RP.markers = []; RP.series.setMarkers([]); }

  async function newExercise() {
    if (RP.busy) return;
    RP.busy = true;
    RP.sym = $r('rp-sym').value; RP.tf = $r('rp-tf').value;
    $r('rp-status').textContent = 'Carico i dati... (la prima volta può richiedere qualche secondo)';
    try {
      RP.all = await loadCandles(RP.sym, RP.tf);
    } catch (e) { $r('rp-status').textContent = 'Impossibile caricare i dati: ' + e.message; RP.busy = false; return; }
    ensureChart(); clearLines();
    RP.start = T.pickStart(RP.all.length, Math.random); RP.idx = RP.start; RP.trade = null; RP.result = null; RP.skipped = false;
    RP.series.setData(RP.all.slice(Math.max(0, RP.start - 119), RP.start + 1).map((_, k) => cc(Math.max(0, RP.start - 119) + k)));
    RP.chart.timeScale().fitContent();
    $r('rp-result').innerHTML = '';
    setSuggestion();
    RP.busy = false;
    renderReplay();
  }

  function setSuggestion() {
    const s = T.suggestOrder(RP.all, RP.idx, RP.side, 2);
    $r('rp-stop').value = px(s.stop).replace(/\./g, '').replace(',', '.');
    $r('rp-target').value = px(s.target).replace(/\./g, '').replace(',', '.');
    $r('rp-sugg').innerHTML = `Valori suggeriti: stop a 1,5 volte l'<b>ATR</b> (${px(s.atr)}, la distanza media che il prezzo percorre in una candela) e target a 2 volte lo stop. Puoi cambiarli. ${H('rp_atr')}`;
    labelHelpButtons($r('rp-sugg'));
  }
  const num = (v) => parseFloat(String(v).replace(',', '.'));
  const orderFromForm = () => ({ side: RP.side, entry: RP.all[RP.idx].close, stop: num($r('rp-stop').value), target: num($r('rp-target').value) });

  function renderCheck() {
    const el = $r('rp-check');
    if (RP.trade || RP.result || !RP.all.length) { el.innerHTML = ''; return; }
    const c = T.checkOrder(orderFromForm());
    el.innerHTML = !c.ok ? `<div class="adv warn"><div class="b">${esc(c.errors[0])}</div></div>` :
      `<div class="res"><div><b>1:${fmt(c.rr, 2)}</b><span>Rischio/rendimento ${H('rr_ratio')}</span></div><div><b>${fmt(c.riskPct, 2)}%</b><span>Perdita se scatta lo stop</span></div><div><b>${fmt(c.costR, 2)} R</b><span>Costi stimati ${H('costi')}</span></div></div>` +
      c.warnings.map((w) => `<div class="adv warn"><div class="b">${esc(w)}</div></div>`).join('');
    labelHelpButtons(el);
  }

  function renderReplay() {
    const done = !!RP.result, open = !!RP.trade && !done, idle = !RP.trade && !done;
    $r('rp-open').disabled = !idle || RP.skipped; $r('rp-skip').disabled = !idle || RP.skipped;
    document.querySelectorAll('input[name="rp-side"]').forEach((i) => { i.disabled = !idle; });
    $r('rp-stop').disabled = $r('rp-target').disabled = !idle;
    $r('rp-end').hidden = !open; $r('rp-closenow').hidden = !open;
    document.querySelectorAll('[data-adv]').forEach((b) => { b.disabled = RP.idx >= RP.all.length - 2 || done; });
    $r('rp-status').textContent = RP.all.length ? `${RP.sym} ${RP.tf} · candela ${RP.idx - RP.start + 1} dall'inizio dell'esercizio` + (open ? ' · operazione aperta' : done ? ' · operazione chiusa' : '') : '';
    renderCheck(); renderStats();
  }

  function renderStats() {
    const s = { ...T.emptyStats(), ...lsGet(KEY_STATS, {}) };
    const avg = s.n ? s.totalR / s.n : 0;
    $r('rp-stats').innerHTML = s.n || s.skips ? `Esercizi con ordine: <b>${s.n}</b> · vinti ${s.n ? Math.round(s.wins / s.n * 100) : 0}% · R totale <span class="${sgn(s.totalR)}">${fmt(s.totalR, 1)}</span> · R medio <span class="${sgn(avg)}">${fmt(avg, 2)}</span> · «non entro»: ${s.skips}` +
      (s.last.length ? `<div class="rp-last">${s.last.slice(-30).map((x) => `<i class="${x.r > 0 ? 'w' : 'l'}" title="${fmt(x.r, 2)} R (${esc(x.reason)})"></i>`).join('')}</div>` : '') +
      (s.n && s.n < 30 ? '<div class="note">Con meno di 30 esercizi il risultato può essere solo fortuna.</div>' : '') : '<span class="note">Ancora nessun esercizio completato.</span>';
  }

  function advance(n, force = false) {                    // force: continua a mostrare candele anche a operazione chiusa
    const closed = !!RP.result;
    for (let k = 0; k < n; k++) {
      if (RP.idx >= RP.all.length - 2 || (closed && !force)) break;
      RP.idx++;
      RP.series.update(cc(RP.idx));
      if (RP.trade && !closed) {
        const res = T.stepTrade(RP.trade, RP.all[RP.idx], RP.idx);
        if (res) { finishTrade(res); break; }
      }
    }
    renderReplay();
  }

  function addLine(price, color, title, style = 2) { RP.lines.push(RP.series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); }

  function openOrder() {
    const o = orderFromForm(), c = T.checkOrder(o);
    if (!c.ok) { renderCheck(); return; }
    RP.trade = T.openTrade(o, RP.idx);
    addLine(RP.trade.entry, css('--blue'), 'ingresso', 0); addLine(o.stop, css('--red'), 'stop'); addLine(o.target, css('--green'), 'target');
    RP.markers.push({ time: cc(RP.idx).time, position: o.side === 'long' ? 'belowBar' : 'aboveBar', color: css('--blue'), shape: o.side === 'long' ? 'arrowUp' : 'arrowDown', text: o.side === 'long' ? 'LONG' : 'SHORT' });
    RP.series.setMarkers(RP.markers);
    $r('rp-result').innerHTML = '<div class="adv info"><div class="b">Ordine aperto al prezzo dell\'ultima candela. Ora fai avanzare il grafico: stop e target scattano da soli.</div></div>';
    renderReplay();
  }

  function finishTrade(res) {
    RP.result = res;
    RP.markers.push({ time: cc(res.idx).time, position: 'aboveBar', color: res.r > 0 ? css('--green') : css('--red'), shape: 'circle', text: `${res.r > 0 ? '+' : ''}${fmt(res.r, 1)}R` });
    RP.series.setMarkers(RP.markers);
    lsSet(KEY_STATS, T.recordResult(lsGet(KEY_STATS, T.emptyStats()), res));
    mark('replay_done');
    const why = res.reason === 'target' ? 'Il prezzo ha toccato il target: guadagno.' : res.reason === 'stop' ? 'Il prezzo ha toccato lo stop: perdita limitata, come previsto.' : res.reason === 'chiusa a mano' ? 'Hai chiuso tu l\'operazione.' : 'L\'operazione è rimasta aperta troppo a lungo ed è stata chiusa.';
    $r('rp-result').innerHTML = `<div class="adv ${res.r > 0 ? 'info' : 'warn'}"><span class="t">Operazione chiusa: ${res.r > 0 ? '+' : ''}${fmt(res.r, 2)} R</span><div class="b">${esc(why)} È durata ${res.bars} candele. Nel risultato ci sono commissioni e slippage, come nel backtest (e per questo anche un target pieno vale un po' meno di 2 R). ` +
      `Periodo reale: ${dateOf(RP.start)} → ${dateOf(res.idx)}.</div></div>` +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button type="button" class="pbtn" id="rp-again">Nuovo esercizio</button><button type="button" class="pbtn ghost" id="rp-more">Mostra le 30 candele dopo</button></div>';
    $r('rp-again').onclick = newExercise; $r('rp-more').onclick = () => advance(30, true);
  }

  function hypo(side) {                                    // cosa sarebbe successo con gli ordini suggeriti (solo per la spiegazione)
    const s = T.suggestOrder(RP.all, RP.idx, side, 2);
    const tr = T.openTrade({ side, entry: s.entry, stop: s.stop, target: s.target }, RP.idx);
    for (let i = RP.idx + 1; i < Math.min(RP.all.length, RP.idx + 1 + T.MAX_BARS); i++) { const r = T.stepTrade(tr, RP.all[i], i); if (r) return r; }
    return null;
  }
  function skipEntry() {
    const long = hypo('long'), short = hypo('short');
    RP.skipped = true;
    lsSet(KEY_STATS, T.recordResult(lsGet(KEY_STATS, T.emptyStats()), { skipped: true }));
    const line = (n, r) => `${n}: ${r ? `${r.reason === 'target' ? 'target' : r.reason}, ${r.r > 0 ? '+' : ''}${fmt(r.r, 1)} R` : 'ancora aperto'}`;
    const reveal = () => advance(30);
    reveal();
    $r('rp-result').innerHTML = `<div class="adv info"><span class="t">Non entrare è una decisione valida</span><div class="b">Ecco le 30 candele successive. Con i valori suggeriti sarebbe finita così: ${esc(line('long', long))} · ${esc(line('short', short))}. ` +
      `Un trader serio salta molte occasioni: conta entrare solo quando il piano lo dice. Periodo reale: ${dateOf(RP.start)}.</div></div>` +
      '<div style="margin-top:6px"><button type="button" class="pbtn" id="rp-again2">Nuovo esercizio</button></div>';
    $r('rp-again2').onclick = newExercise;
  }

  $r('rp-new').onclick = newExercise;
  $r('rp-sym').onchange = newExercise; $r('rp-tf').onchange = newExercise;
  document.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => advance(+b.dataset.adv)));
  $r('rp-end').onclick = () => { let guard = 0; while (RP.trade && !RP.result && RP.idx < RP.all.length - 2 && guard++ < 2000) advance(1); };
  $r('rp-closenow').onclick = () => { if (RP.trade && !RP.result) finishTrade(T.closeNow(RP.trade, RP.all[RP.idx].close, RP.idx)); renderReplay(); };
  $r('rp-open').onclick = openOrder; $r('rp-skip').onclick = skipEntry;
  document.querySelectorAll('input[name="rp-side"]').forEach((i) => i.addEventListener('change', () => { RP.side = i.value; setSuggestion(); renderCheck(); }));
  ['rp-stop', 'rp-target'].forEach((id) => $r(id).addEventListener('input', renderCheck));
  let resetArmed = null;
  $r('rp-reset').onclick = (e) => {
    const b = e.currentTarget;
    if (!resetArmed) { b.textContent = 'Conferma: azzera'; resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Azzera le statistiche'; }, 4000); return; }
    clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Azzera le statistiche'; lsSet(KEY_STATS, T.emptyStats()); renderStats();
  };

  // ================================================================ 2. FORTUNA
  const LK = { seed: 0, res: null };
  document.getElementById('tr-fortuna').innerHTML = `
    <p class="note" style="max-width:85ch">Immagina tanti trader che decidono <b>a testa o croce</b>: nessuno ha un vantaggio. Ognuno fa molte operazioni rischiando una piccola parte del capitale e pagando i costi. Guarda come finiscono: pochi restano in alto, e il migliore sembra un genio. È solo fortuna. ${H('lk_params')}</p>
    <div class="form lk-form">
      <label for="lk-traders">Trader (10-200)<input id="lk-traders" type="number" min="10" max="200" value="40"></label>
      <label for="lk-ops">Operazioni a testa (50-500)<input id="lk-ops" type="number" min="50" max="500" value="200"></label>
      <label for="lk-win">Probabilità di vincere (%)<input id="lk-win" type="number" min="20" max="80" step="1" value="50"></label>
      <label for="lk-risk">Rischio per operazione (% capitale)<input id="lk-risk" type="number" min="0.1" max="5" step="0.1" value="1"></label>
      <label for="lk-cost">Costi (% del rischio)<input id="lk-cost" type="number" min="0" max="50" step="1" value="8"></label>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><button type="button" class="pbtn" id="lk-run">Simula di nuovo</button><button type="button" class="pbtn ghost" id="lk-same">Stessi numeri casuali, altri parametri</button><span class="note" id="lk-seed"></span></div>
    <canvas id="lk-canvas" class="lk-canvas" role="img" aria-label="Andamento del capitale di tutti i trader simulati"></canvas>
    <div class="legend toolbar" style="margin-top:6px"><span><i style="background:var(--green)"></i>il migliore</span><span><i style="background:var(--red)"></i>il peggiore</span><span><i style="background:var(--mut)"></i>gli altri</span><span>linea tratteggiata: il capitale di partenza (100)</span></div>
    <div id="lk-out" aria-live="polite"></div>`;
  const $l = (id) => document.getElementById(id);

  function runLuck(newSeed) {
    if (newSeed) LK.seed = Math.floor(Math.random() * 1e9);
    const g = (id, d, lo, hi) => { const v = parseFloat($l(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    LK.res = T.simulateLuck({ traders: g('lk-traders', 40, 10, 200), ops: g('lk-ops', 200, 50, 500), winRate: g('lk-win', 50, 20, 80) / 100,
      riskPct: g('lk-risk', 1, 0.1, 5), costPctOfRisk: g('lk-cost', 8, 0, 50), seed: LK.seed });
    $l('lk-seed').textContent = `Numero casuale n. ${LK.seed}`;
    mark('luck_used');
    drawLuck(); renderLuck();
  }
  function renderLuck() {
    const r = LK.res; if (!r) return;
    const edge = r.edgePerOp;
    $l('lk-out').innerHTML = `<div class="res"><div><b>${r.above} su ${r.traders}</b><span>chiudono sopra il capitale di partenza</span></div><div><b>${fmt(r.median, 1)}</b><span>risultato mediano (partenza 100)</span></div>` +
      `<div><b class="pos">${fmt(r.bestValue, 1)}</b><span>il migliore</span></div><div><b class="neg">${fmt(r.worstValue, 1)}</b><span>il peggiore</span></div>` +
      `<div><b class="${sgn(edge)}">${edge > 0 ? '+' : ''}${fmt(edge, 3)}%</b><span>valore medio di ogni operazione, in % del capitale ${H('aspettativa')}</span></div></div>` +
      `<div class="adv ${edge > 0 ? 'info' : 'warn'}"><div class="b">${edge > 0 ? 'Qui il vantaggio per operazione è positivo, quindi in media si guadagna: ma anche così qualcuno finisce sotto, e serve tempo perché il vantaggio emerga.' :
        `In media ogni operazione perde un pochino (${fmt(Math.abs(edge), 3)}% del capitale) a causa dei costi. Eppure ${r.above} trader su ${r.traders} chiudono sopra 100 e il migliore arriva a ${fmt(r.bestValue, 1)}: sembra un genio, ma è solo fortuna. È quello che finisce nei video; il peggiore non fa nessun video.`}</div></div>` +
      `<p class="note">Con pochi trader o poche operazioni i risultati cambiano molto da una simulazione all'altra: è proprio il punto. ${H('fortuna_campione')}</p>`;
    labelHelpButtons($l('lk-out'));
  }
  function canvasSetup(cv, h) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth || 600;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx2 = cv.getContext('2d'); ctx2.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2.clearRect(0, 0, w, h);
    return { ctx2, w, h };
  }
  function drawLuck() {
    const cv = $l('lk-canvas'), r = LK.res;
    if (!cv || !r || document.getElementById('tr-fortuna').hidden) return;
    const { ctx2, w, h } = canvasSetup(cv, 300), padL = 40, padR = 8, padT = 10, padB = 20;
    let lo = Infinity, hi = -Infinity;
    r.curves.forEach((c) => c.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; }));
    lo = Math.min(lo, 100) * 0.97; hi = Math.max(hi, 100) * 1.03;
    const X = (i) => padL + (i / r.ops) * (w - padL - padR), Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
    ctx2.font = '11px system-ui'; ctx2.fillStyle = css('--mut'); ctx2.strokeStyle = css('--line'); ctx2.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, y = Y(v); ctx2.beginPath(); ctx2.moveTo(padL, y); ctx2.lineTo(w - padR, y); ctx2.stroke(); ctx2.fillText(v.toFixed(0), 4, y + 4); }
    ctx2.fillText('operazioni →', w - 80, h - 4);
    const line = (c, color, width) => { ctx2.strokeStyle = color; ctx2.lineWidth = width; ctx2.beginPath(); c.forEach((v, i) => (i ? ctx2.lineTo(X(i), Y(v)) : ctx2.moveTo(X(i), Y(v)))); ctx2.stroke(); };
    ctx2.globalAlpha = 0.45; r.curves.forEach((c, i) => { if (i !== r.best && i !== r.worst) line(c, css('--mut'), 1); }); ctx2.globalAlpha = 1;
    ctx2.setLineDash([5, 4]); line([100, 100], css('--amber'), 1); ctx2.beginPath(); ctx2.strokeStyle = css('--amber'); ctx2.moveTo(padL, Y(100)); ctx2.lineTo(w - padR, Y(100)); ctx2.stroke(); ctx2.setLineDash([]);
    line(r.curves[r.worst], css('--red'), 2.2); line(r.curves[r.best], css('--green'), 2.2);
  }
  $l('lk-run').onclick = () => runLuck(true);
  $l('lk-same').onclick = () => runLuck(false);
  ['lk-traders', 'lk-ops', 'lk-win', 'lk-risk', 'lk-cost'].forEach((id) => $l(id).addEventListener('change', () => runLuck(false)));
  window.addEventListener('resize', () => { drawLuck(); drawCompound(); });

  // ================================================================ 3. CALCOLATORI
  document.getElementById('tr-calc').innerHTML = `
    <div class="two">
      <section class="calc-card"><h3>L'inflazione mangia i soldi fermi ${H('calc_infl')}</h3>
        <div class="form"><label for="ci-amount">Somma (euro)<input id="ci-amount" inputmode="decimal" value="1000"></label><label for="ci-rate">Inflazione annua (%)<input id="ci-rate" inputmode="decimal" value="3"></label><label for="ci-years">Anni<input id="ci-years" inputmode="decimal" value="10"></label></div>
        <div id="ci-out" aria-live="polite"></div></section>
      <section class="calc-card"><h3>Quanto crescono i risparmi (interesse composto) ${H('calc_comp')}</h3>
        <div class="form"><label for="cc-init">Somma iniziale (euro)<input id="cc-init" inputmode="decimal" value="1000"></label><label for="cc-month">Versamento mensile (euro)<input id="cc-month" inputmode="decimal" value="100"></label><label for="cc-rate">Rendimento annuo (%)<input id="cc-rate" inputmode="decimal" value="5"></label><label for="cc-years">Anni<input id="cc-years" inputmode="decimal" value="20"></label></div>
        <div id="cc-out" aria-live="polite"></div><canvas id="cc-canvas" class="lk-canvas" role="img" aria-label="Crescita dei risparmi nel tempo"></canvas></section>
    </div>
    <div class="two">
      <section class="calc-card"><h3>Regola del 72: in quanti anni raddoppiano? ${H('calc_72')}</h3>
        <div class="form"><label for="c7-rate">Rendimento annuo (%)<input id="c7-rate" inputmode="decimal" value="6"></label></div><div id="c7-out" aria-live="polite"></div></section>
      <section class="calc-card"><h3>I costi mangiano i guadagni ${H('calc_costi')}</h3>
        <div class="form"><label for="cs-notional">Somma per operazione (euro)<input id="cs-notional" inputmode="decimal" value="500"></label><label for="cs-fee">Commissione per lato (euro)<input id="cs-fee" inputmode="decimal" value="1"></label><label for="cs-spread">Spread (% giro completo)<input id="cs-spread" inputmode="decimal" value="0.1"></label><label for="cs-ops">Operazioni al mese<input id="cs-ops" inputmode="decimal" value="20"></label></div>
        <div id="cs-out" aria-live="polite"></div></section>
    </div>
    <p class="note">Sono ipotesi e calcoli didattici (esempi dal PDF, Parte 1 cap. 2 e Parte 2 cap. 4): i rendimenti reali cambiano ogni anno e possono essere negativi. Non sono previsioni né consigli.</p>`;
  const $c = (id) => document.getElementById(id);
  const bad = (m) => `<div class="adv warn"><div class="b">${esc(m)}</div></div>`;
  const cell = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const used = () => mark('savings_used');

  function calcInfl() {
    const r = T.inflation($c('ci-amount').value, $c('ci-rate').value, $c('ci-years').value);
    $c('ci-out').innerHTML = !r.ok ? bad(r.error) : `<div class="res">${cell(eur(r.real) + ' €', `potere d'acquisto tra ${r.years} anni`)}${cell(fmt(r.lostPct, 1) + '%', 'valore perso')}</div>` +
      `<div class="note">${r.table.map((x) => `${x.years} anni: ${eur(x.real)} €`).join(' · ')}</div><div class="note">I soldi restano gli stessi sulla carta, ma con quella somma compri meno cose.</div>`;
    used();
  }
  let ccLast = null;
  function calcComp() {
    const r = T.compound({ initial: $c('cc-init').value, monthly: $c('cc-month').value, ratePct: $c('cc-rate').value, years: $c('cc-years').value });
    ccLast = r.ok ? r : null;
    $c('cc-out').innerHTML = !r.ok ? bad(r.error) : `<div class="res">${cell(eur(r.final) + ' €', 'valore finale (ipotesi)')}${cell(eur(r.deposited) + ' €', 'versato da te')}${cell(eur(r.interest) + ' €', 'guadagnato con gli interessi')}</div>`;
    drawCompound(); used();
  }
  function drawCompound() {
    const cv = $c('cc-canvas');
    if (!cv || !ccLast || document.getElementById('tr-calc').hidden) return;
    const { ctx2, w, h } = canvasSetup(cv, 200), padL = 46, padR = 8, padT = 8, padB = 20, s = ccLast.series, hi = s[s.length - 1].total * 1.05;
    const X = (i) => padL + (i / (s.length - 1)) * (w - padL - padR), Y = (v) => padT + (1 - v / hi) * (h - padT - padB);
    ctx2.font = '11px system-ui'; ctx2.fillStyle = css('--mut'); ctx2.strokeStyle = css('--line'); ctx2.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const v = (hi * k) / 3, y = Y(v); ctx2.beginPath(); ctx2.moveTo(padL, y); ctx2.lineTo(w - padR, y); ctx2.stroke(); ctx2.fillText(Math.round(v).toLocaleString('it-IT'), 2, y + 4); }
    ctx2.fillText('anni →', w - 44, h - 4);
    const line = (key, color) => { ctx2.strokeStyle = color; ctx2.lineWidth = 2.2; ctx2.beginPath(); s.forEach((p, i) => (i ? ctx2.lineTo(X(i), Y(p[key])) : ctx2.moveTo(X(i), Y(p[key])))); ctx2.stroke(); };
    line('deposited', css('--mut')); line('total', css('--green'));
    ctx2.fillStyle = css('--green'); ctx2.fillText('totale', padL + 6, padT + 12); ctx2.fillStyle = css('--mut'); ctx2.fillText('versato', padL + 56, padT + 12);
  }
  function calc72() {
    const r = T.rule72($c('c7-rate').value);
    $c('c7-out').innerHTML = !r.ok ? bad(r.error) : `<div class="res">${cell(fmt(r.approx, 1) + ' anni', 'stima rapida: 72 / rendimento')}${cell(fmt(r.exact, 1) + ' anni', 'valore esatto')}</div>`;
    used();
  }
  function calcCosts() {
    const r = T.costDrag({ notional: $c('cs-notional').value, feePerSide: $c('cs-fee').value, spreadPct: $c('cs-spread').value, opsPerMonth: $c('cs-ops').value });
    $c('cs-out').innerHTML = !r.ok ? bad(r.error) : `<div class="res">${cell(eur(r.perOp) + ' €', `costo di ogni operazione (${fmt(r.perOpPct, 2)}%)`)}${cell(eur(r.perMonth) + ' €', 'costi in un mese')}${cell(fmt(r.perMonthPct, 1) + '%', 'da guadagnare ogni mese solo per andare in pari')}</div>` +
      `<div class="note">Più operi, più è difficile vincere: in un anno i costi valgono il ${fmt(r.perYearPct, 0)}% della somma.</div>`;
    used();
  }
  [['ci-amount', 'ci-rate', 'ci-years'], ['cc-init', 'cc-month', 'cc-rate', 'cc-years'], ['c7-rate'], ['cs-notional', 'cs-fee', 'cs-spread', 'cs-ops']].forEach((ids, k) =>
    ids.forEach((id) => $c(id).addEventListener('input', [calcInfl, calcComp, calc72, calcCosts][k])));
  const quiet = (f) => { const m = window.markMilestone; window.markMilestone = () => {}; f(); window.markMilestone = m; };   // il primo calcolo automatico non conta come "uso"
  quiet(() => { calcInfl(); calcComp(); calc72(); calcCosts(); });

  // ================================================================ 4. GLOSSARIO E RIPASSO
  // I termini sono quelli dei capitoli della Guida (le voci dei "?"). Ripasso a flashcard con scatole di Leitner.
  const KEY_CARDS = 'tl_cards_v1';
  const GL = { built: false, ids: [], cur: null, shown: false, last: null };
  const EXCLUDE = /^(tab_|demo_|tool_|profile_|backup_)/, EXCLUDE_IDS = new Set(['percorso', 'autotest', 'fonti_ufficiali', 'glossario_base', 'glossario_trading']);
  const $g = (id) => document.getElementById(id);

  function buildGlossary() {
    if (GL.built) { renderCard(); return; }
    const terms = (window.guideTerms ? window.guideTerms() : []).filter((id) => !EXCLUDE.test(id) && !EXCLUDE_IDS.has(id) && HELP[id]);
    if (!terms.length) { $g('tr-glossario').innerHTML = '<p class="note">Il glossario si carica con la Guida: riprova tra un attimo.</p>'; return; }
    GL.built = true;
    GL.ids = [...new Set(terms)].sort((a, b) => HELP[a].titolo.localeCompare(HELP[b].titolo, 'it'));
    $g('tr-glossario').innerHTML = `
      <p class="note" style="max-width:85ch">Ripassa i termini della Guida come con le flashcard: leggi la parola, prova a spiegarla a voce, poi controlla. Quelle che sai passano a scatole più alte e escono meno spesso; quelle che sbagli tornano più spesso. Sotto trovi il glossario A-Z con ricerca. ${H('cards_howto')}</p>
      <div class="two">
        <section class="calc-card" id="cards-box"><h3>Ripasso a flashcard</h3>
          <div class="flash" id="fc-card" aria-live="polite"></div>
          <div class="fc-actions" id="fc-actions"></div>
          <div id="fc-progress" class="note" style="margin-top:8px"></div>
          <button type="button" class="pbtn ghost" id="fc-reset" style="margin-top:6px">Azzera il ripasso</button></section>
        <section class="calc-card"><h3>Glossario A-Z (${GL.ids.length} termini)</h3>
          <label class="note" for="gl-search">Cerca un termine</label><input id="gl-search" class="tfield" type="search" placeholder="es. stop, leva, spread" autocomplete="off">
          <div id="gl-letters" class="gl-letters"></div><div id="gl-list" class="gl-list"></div></section>
      </div>`;
    $g('fc-reset').onclick = (e) => {
      const b = e.currentTarget;
      if (!resetCards) { b.textContent = 'Conferma: azzera'; resetCards = setTimeout(() => { resetCards = null; b.textContent = 'Azzera il ripasso'; }, 4000); return; }
      clearTimeout(resetCards); resetCards = null; b.textContent = 'Azzera il ripasso'; lsSet(KEY_CARDS, T.emptyCards()); GL.cur = null; renderCard();
    };
    $g('gl-search').addEventListener('input', renderList);
    $g('gl-letters').addEventListener('click', (e) => { const b = e.target.closest('[data-letter]'); if (b) { const t = document.getElementById('gl-' + b.dataset.letter); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } });
    renderList(); renderCard();
    labelHelpButtons($g('tr-glossario'));
  }
  let resetCards = null;
  const firstLetter = (t) => (norm(t).charAt(0) || '#').toUpperCase().replace(/[^A-Z]/, '#');

  function renderList() {
    const q = norm($g('gl-search').value.trim());
    const items = GL.ids.filter((id) => !q || norm(HELP[id].titolo + ' ' + HELP[id].semplice).includes(q));
    const letters = [...new Set(items.map((id) => firstLetter(HELP[id].titolo)))];
    $g('gl-letters').innerHTML = letters.map((l) => `<button type="button" class="linkbtn" data-letter="${l}" aria-label="Vai alla lettera ${l}">${l}</button>`).join('');
    let last = '';
    $g('gl-list').innerHTML = items.length ? items.map((id) => {
      const e = HELP[id], l = firstLetter(e.titolo), head = l !== last ? `<h4 id="gl-${l}" class="gl-letter">${l}</h4>` : ''; last = l;
      return `${head}<details class="gl-item"><summary>${esc(e.titolo)}</summary><p>${esc(e.semplice)}</p><p><b>Esempio:</b> ${esc(e.esempio)}</p><p><b>Cosa fare:</b> ${esc(e.cosa_fare)}</p><p class="note">Fonte: ${esc(e.fonte)}</p></details>`;
    }).join('') : '<p class="note">Nessun termine trovato.</p>';
  }

  function renderCard() {
    if (!GL.built) return;
    const state = lsGet(KEY_CARDS, T.emptyCards());
    if (!GL.cur) { GL.cur = T.pickCard(GL.ids, state, Math.random, GL.last); GL.shown = false; }
    const e = HELP[GL.cur], p = T.cardProgress(state, GL.ids), box = (state.cards[GL.cur] || { box: 0 }).box;
    $g('fc-card').innerHTML = GL.shown ?
      `<div class="fc-term">${esc(e.titolo)}</div><p>${esc(e.semplice)}</p><p class="note"><b>Esempio:</b> ${esc(e.esempio)}</p><p class="note">Spiegazione completa ${H(GL.cur)}</p>` :
      `<div class="fc-term">${esc(e.titolo)}</div><p class="note">Prova a spiegarlo con parole tue, poi controlla.</p><span class="note">Scatola ${box + 1} di 5</span>`;
    $g('fc-actions').innerHTML = GL.shown ?
      '<button type="button" class="pbtn" data-fc="1">Lo sapevo</button><button type="button" class="pbtn ghost" data-fc="0">Da ripassare</button>' :
      '<button type="button" class="pbtn" id="fc-show">Mostra la risposta</button>';
    $g('fc-progress').textContent = `Imparati (scatola 4 o 5): ${p.mastered} su ${p.total} · visti: ${p.seen} · risposte date: ${p.reviews}`;
    labelHelpButtons($g('cards-box'));
    const show = $g('fc-show'); if (show) show.onclick = () => { GL.shown = true; renderCard(); };
    $g('fc-actions').querySelectorAll('[data-fc]').forEach((b) => (b.onclick = () => {
      lsSet(KEY_CARDS, T.answerCard(lsGet(KEY_CARDS, T.emptyCards()), GL.cur, b.dataset.fc === '1'));
      GL.last = GL.cur; GL.cur = null; if (window.renderPercorso) window.renderPercorso(); renderCard();
    }));
  }
  labelHelpButtons(tab);
})();

;
// Finestra "Privacy e dati": cosa salva il sito, con chi comunica, e un pulsante per cancellare tutto.
// Il sito non ha account, cookie, pubblicita' ne' strumenti di tracciamento. Tutto resta sul dispositivo (localStorage).
(function () {
  const T = window.TOOLS;
  const btn = document.getElementById('privacy-btn');
  if (!btn) return;
  let box = null, prev = null, armed = null;

  const sizeOf = (k) => { try { const v = localStorage.getItem(k); return v === null ? null : v.length; } catch (e) { return null; } };
  const fmtSize = (n) => (n < 1024 ? `${n} byte` : `${(n / 1024).toFixed(1).replace('.', ',')} KB`);

  function open() {
    if (box) return;
    prev = document.activeElement;
    const rows = T.PRIVACY_KEYS.map(([k, label]) => ({ k, label, n: sizeOf(k) }));
    const saved = rows.filter((r) => r.n !== null);
    box = document.createElement('div');
    box.id = 'privacybox';
    box.innerHTML = `<div class="tour-block" aria-hidden="true"></div>
      <div class="tour-card privacy-card" role="dialog" aria-modal="true" aria-labelledby="pv-title" tabindex="-1">
        <h3 id="pv-title">Privacy e dati</h3>
        <p><b>Nessun account, nessun cookie, nessuna pubblicità, nessun tracciamento.</b> Quello che fai nel sito resta sul tuo dispositivo e non viene inviato a nessuno.</p>
        <h4>Cosa è salvato sul tuo dispositivo</h4>
        ${saved.length ? '<ul class="pv-list">' + saved.map((r) => `<li>${esc(r.label)} <span class="note">(${fmtSize(r.n)})</span></li>`).join('') + '</ul>' : '<p class="note">Al momento non c\'è niente di salvato.</p>'}
        <h4>Con chi comunica il sito</h4>
        <ul class="pv-list">
          <li><b>Prezzi in diretta (Demo):</b> si collega ai prezzi pubblici di Binance. Come ogni sito, Binance vede il tuo indirizzo IP; non gli viene inviato nient'altro.</li>
          <li><b>Candele passate (Demo):</b> se avevi posizioni aperte e riapri la pagina, legge i prezzi passati pubblici di Kraken, per applicare stop e target.</li>
          <li><b>Hosting:</b> chi ospita il sito (per esempio Vercel o GitHub) può registrare gli indirizzi IP nei suoi log, come ogni hosting.</li>
          <li>Font e librerie sono ospitati dal sito stesso: nessuna richiesta a Google o ad altri servizi per caricarli.</li>
        </ul>
        <p class="note">Con il server locale (<code>python -m lab.app</code>) il conto demo è invece un file sul tuo computer (<code>data/demo_account.json</code>).</p>
        <p class="note">Materiale educativo, non è consulenza finanziaria. Chi fa trading può perdere tutto il capitale.</p>
        <div class="tour-nav"><button type="button" class="pbtn ghost" id="pv-wipe">Cancella tutti i miei dati</button><button type="button" class="pbtn" id="pv-close">Chiudi</button></div>
        <div id="pv-msg" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(box);
    box.querySelector('#pv-close').onclick = close;
    box.querySelector('#pv-wipe').onclick = wipe;
    document.addEventListener('keydown', onKey, true);
    box.querySelector('#pv-close').focus();
  }
  function close() {
    if (!box) return;
    clearTimeout(armed); armed = null;
    document.removeEventListener('keydown', onKey, true);
    box.remove(); box = null;
    if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!box) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
    }
  }
  function wipe(e) {                                              // conferma in due passaggi (niente finestre di dialogo)
    const b = e.currentTarget;
    if (!armed) {
      b.textContent = 'Conferma: cancella tutto';
      box.querySelector('#pv-msg').innerHTML = '<div class="adv warn"><div class="b">Verranno cancellati nome, diario, conto demo (versione browser), progressi e impostazioni di questo dispositivo. Non si può annullare: se vuoi tenerli, prima salva un backup dalla scheda Strumenti. Clicca di nuovo per confermare.</div></div>';
      armed = setTimeout(() => { armed = null; if (box) { b.textContent = 'Cancella tutti i miei dati'; } }, 7000);
      return;
    }
    clearTimeout(armed); armed = null;
    window.__importing = true;                                    // blocca i salvataggi automatici fino al ricaricamento
    try { T.PRIVACY_KEYS.forEach(([k]) => localStorage.removeItem(k)); } catch (err) { /* senza storage non c'e' niente da cancellare */ }
    box.querySelector('#pv-msg').innerHTML = '<div class="adv info"><div class="b">Dati cancellati. Ricarico la pagina...</div></div>';
    setTimeout(() => location.reload(), 700);
  }
  btn.onclick = open;
  window.openPrivacy = open;
})();

;
// "Il mio percorso": tappe da completare, barra di avanzamento e livello. Nella pagina Inizio.
// Le tappe si calcolano da dati salvati nel browser (nome, diario, checklist, capitoli letti, demo...).
// Nessun account e nessun invio di dati: la logica pura sta in tools_core.js (computeMilestones, con test).
(function () {
  const T = window.TOOLS;
  const KEY = 'tl_milestones_v1';
  const mem = {};
  const rd = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return mem[k] !== undefined ? mem[k] : def; } };
  const wr = (k, v) => { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* senza storage: vale solo per questa visita */ } };
  const box = document.getElementById('percorso-box');
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // Segna un traguardo (es. 'trade_viewed') oppure aggiorna il massimo di operazioni demo: markMilestone('demoMax', n).
  window.markMilestone = (key, value = true) => {
    const m = rd(KEY, {});
    if (key === 'demoMax') {
      const n = Number(value) || 0;
      if (n <= (m.demoMax || 0)) return;
      m.demoMax = n;
    } else {
      m.flags = m.flags || {};
      if (m.flags[key] === true) return;
      m.flags[key] = true;
    }
    wr(KEY, m);
    render();
  };

  function context() {
    const m = rd(KEY, {});
    const diary = rd('tl_diary_v1', []);
    let tut = null;
    try { tut = localStorage.getItem('tl_tutorial_v1'); } catch (e) { /* ignorato */ }
    return {
      name: (rd('tl_profile_v1', {}).name || ''), tutorialDone: tut === 'completed',
      guideRead: rd('tl_guide_read_v1', []), guideParts: (window.guideParts && window.guideParts()) || {}, quiz: rd('tl_quiz_v1', {}),
      calcUsed: localStorage.getItem ? (() => { try { return !!localStorage.getItem('tl_calc_v1'); } catch (e) { return false; } })() : false,
      flags: m.flags || {}, demoMax: m.demoMax || 0, diaryCount: Array.isArray(diary) ? diary.length : 0, replayN: Number(rd('tl_replay_v1', {}).n) || 0, cardsN: Number(rd('tl_cards_v1', {}).reviews) || 0,
    };
  }

  function render() {
    const ctx = context();
    const title = document.getElementById('hero-title');
    if (title) {
      const n = (ctx.name || '').trim();
      title.textContent = n ? `Ciao ${n}! Impara come funzionano i mercati, senza rischiare un euro` : 'Impara come funzionano i mercati, senza rischiare un euro';
    }
    if (!box) return;
    const r = T.computeMilestones(ctx);
    let html = `<div class="pc-head"><div><div class="pc-level">Livello: ${esc(r.level)}</div><span class="note">${r.done} tappe su ${r.total}</span></div>` +
      `<div class="pc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.percent}" aria-label="Avanzamento del percorso"><i style="width:${r.percent}%"></i></div>` +
      `<span class="pc-badge">${r.percent}%</span></div>`;
    if (r.next) html += `<p class="note" style="margin:0 0 4px">Prossima tappa: <b>${esc(r.next.titolo)}</b></p>`;
    else html += '<p class="note" style="margin:0 0 4px">Hai completato tutte le tappe. Il percorso non finisce qui: continua a fare pratica in demo e a rileggere la Guida.</p>';
    for (const g of r.groups) {
      const its = r.items.filter((i) => i.group === g);
      html += `<div class="pc-group">${esc(g)} · ${its.filter((i) => i.done).length}/${its.length}</div>`;
      html += its.map((i) => `<div class="tappa ${i.done ? 'done' : ''}"><span class="st">${CHECK}</span>` +
        `<div class="tx"><b>${esc(i.titolo)}</b><span>${esc(i.desc)}</span></div>` +
        (i.progress ? `<span class="pg">${esc(i.progress)}</span>` : '') +
        (i.id === 'tutorial' ? `<button type="button" class="linkbtn" data-tutorial="1">${i.done ? 'Rivedi' : 'Avvia'}</button>` : `<button type="button" class="linkbtn" data-gotab="${i.tab}">${i.done ? 'Apri' : 'Vai'}</button>`) +
        '</div>').join('');
    }
    box.innerHTML = html;
  }
  window.renderPercorso = render;

  // Pulsanti con data-gotab (anche quelli grandi della pagina Inizio) e il pulsante del tutorial.
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-gotab]');
    if (g) { window.showTab(g.dataset.gotab); window.scrollTo(0, 0); return; }
    if (e.target.closest('[data-tutorial]') && window.startTutorial) window.startTutorial();
  });
  window.addEventListener('playerchange', render);
  window.tabListeners.push((name) => { if (name === 'inizio') render(); });
  window.addEventListener('storage', render);
  render();
})();

;
// App installabile e uso offline: registra il service worker (solo nella versione statica servita via http/https).
// Dopo la prima visita le parti del sito restano disponibili anche senza rete; i prezzi in diretta della Demo servono la rete.
(function () {
  if (!window.__DATA__ || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* senza service worker il sito funziona uguale, solo online */ });
  });
})();

;
// Tutorial guidato: riquadri che evidenziano ogni parte del sito, per chi parte da zero.
// - parte da solo la prima volta; il pulsante "Tutorial" lo fa ricominciare da capo ogni volta;
// - "Salta il tutorial" lo chiude subito (e non riparte da solo); "Salta questa scheda" passa alla scheda dopo;
// - tastiera: frecce o Invio per avanzare, Esc per saltare; il focus resta dentro il riquadro.
// I passi stanno in web/tutorial.json (modificabili a mano).
(function () {
  const KEY = 'tl_tutorial_v1';
  let steps = [], idx = 0, active = false, building = false;
  let root, hole, card, lastFocus = null, memDone = false;

  // 'done' = visto o saltato (non riparte da solo); 'completed' = arrivato in fondo (conta per il percorso).
  const isDone = () => { try { return localStorage.getItem(KEY) !== null; } catch (e) { return memDone; } };
  const markDone = (completed) => {
    memDone = true;
    try { if (completed || localStorage.getItem(KEY) !== 'completed') localStorage.setItem(KEY, completed ? 'completed' : 'done'); }
    catch (e) { /* senza storage: solo per questa visita */ }
    if (window.renderPercorso) window.renderPercorso();
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'tour'; root.hidden = true;
    root.innerHTML = `<div class="tour-block" aria-hidden="true"></div><div class="tour-hole" aria-hidden="true"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1">
        <div class="tour-top"><span id="tour-sec" class="tour-sec"></span><span id="tour-count" class="tour-count"></span>
          <button type="button" id="tour-skip" class="tour-skip">Salta il tutorial</button></div>
        <div class="tour-bar"><i id="tour-bar-i"></i></div>
        <h3 id="tour-title"></h3><p id="tour-text"></p>
        <div class="tour-nav">
          <button type="button" id="tour-back" class="pbtn ghost">Indietro</button>
          <button type="button" id="tour-skiptab" class="pbtn ghost">Salta questa scheda</button>
          <button type="button" id="tour-next" class="pbtn">Avanti</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    hole = root.querySelector('.tour-hole'); card = root.querySelector('.tour-card');
    root.querySelector('#tour-skip').onclick = () => end(true);
    root.querySelector('#tour-next').onclick = () => next();
    root.querySelector('#tour-back').onclick = () => go(idx - 1);
    root.querySelector('#tour-skiptab').onclick = skipTab;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => active && place());
    window.addEventListener('scroll', () => active && place(), true);
  }

  function onKey(e) {
    if (!active) return;
    const inInput = e.target && e.target.tagName === 'INPUT';
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(true); }
    else if (e.key === 'ArrowRight' && !inInput) { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' && !inInput) { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Enter' && inInput) { e.preventDefault(); next(); }
    else if (e.key === 'Tab') {                                       // il focus non esce dal riquadro
      const f = [...card.querySelectorAll('button:not([hidden]):not([disabled]), input')].filter(visible);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }

  async function go(i) {
    if (building) return;
    if (i < 0) i = 0;
    if (i >= steps.length) { end(true); return; }
    building = true;
    idx = i;
    const s = steps[idx];
    if (s.tab) {
      const changed = !document.getElementById({ inizio: 'inizio', overview: 'overview', chart: 'chart-tab', trades: 'trades', guida: 'guida-tab', allenati: 'allenati-tab', strumenti: 'strumenti-tab', demo: 'demo-tab' }[s.tab]).classList.contains('active');
      window.showTab(s.tab);
      if (changed) await wait(s.tab === 'chart' ? 900 : 350);       // il grafico e la demo hanno bisogno di un attimo
    }
    if (s.apri) {                                                       // es. aprire la sotto-scheda giusta prima di evidenziare
      const el = document.querySelector(s.apri);
      if (el) { el.click(); await wait(700); }
    }
    render(s);
    const t = s.target ? document.querySelector(s.target) : null;
    if (visible(t)) {
      const tall = t.getBoundingClientRect().height > innerHeight * 0.6;
      t.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'instant' });
      await wait(60);
    }
    building = false;
    place();
    setTimeout(() => { if (active && steps[idx] === s) place(); }, 380);   // dopo l'animazione di cambio scheda la posizione puo' variare di qualche pixel
    const first = card.querySelector('input') || card.querySelector('#tour-next');
    (first || card).focus({ preventScroll: true });
  }

  function render(s) {
    const total = steps.length;
    root.querySelector('#tour-sec').textContent = s.sezione || '';
    root.querySelector('#tour-count').textContent = `${idx + 1} / ${total}`;
    root.querySelector('#tour-bar-i').style.width = `${((idx + 1) / total) * 100}%`;
    root.querySelector('#tour-title').textContent = s.titolo;
    root.querySelector('#tour-text').textContent = s.testo;
    const last = idx === total - 1;
    root.querySelector('#tour-back').hidden = idx === 0;
    root.querySelector('#tour-next').textContent = last ? 'Fine' : (idx === 0 ? 'Iniziamo' : 'Avanti');
    root.querySelector('#tour-skiptab').hidden = !(s.tab && steps.slice(idx + 1).some((x) => x.tab !== s.tab));
    root.querySelector('#tour-skip').hidden = last;
  }

  // Evidenzia l'elemento e mette il riquadro dove c'e' spazio (sotto, sopra o fisso in basso).
  function place() {
    if (!active) return;
    const s = steps[idx], t = s.target ? document.querySelector(s.target) : null;
    const mobile = window.matchMedia('(max-width:700px)').matches;
    card.style.left = card.style.top = card.style.bottom = card.style.right = card.style.transform = '';
    root.classList.toggle('tour-nohole', !visible(t));
    if (!visible(t)) {                                                  // nessun elemento: riquadro al centro
      hole.style.display = 'none';
      card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%,-50%)';
      return;
    }
    const r = t.getBoundingClientRect(), pad = 6;
    const top = Math.max(r.top - pad, 0), bottom = Math.min(r.bottom + pad, innerHeight);
    const left = Math.max(r.left - pad, 0), right = Math.min(r.right + pad, innerWidth);
    Object.assign(hole.style, { display: 'block', top: top + 'px', left: left + 'px', width: Math.max(right - left, 0) + 'px', height: Math.max(bottom - top, 0) + 'px' });
    const ch = card.offsetHeight, cw = card.offsetWidth;
    if (mobile) { card.style.left = '8px'; card.style.right = '8px'; card.style.bottom = '8px'; return; }
    let y;
    if (bottom + ch + 14 <= innerHeight) y = bottom + 12;              // sotto l'elemento
    else if (top - ch - 14 >= 0) y = top - ch - 12;                    // sopra l'elemento
    else { card.style.bottom = '14px'; card.style.left = Math.max(8, Math.min(r.left, innerWidth - cw - 8)) + 'px'; return; }   // elemento molto alto: riquadro fisso in basso
    card.style.top = y + 'px';
    card.style.left = Math.max(8, Math.min(r.left, innerWidth - cw - 8)) + 'px';
  }

  function next() { if (idx >= steps.length - 1) { end(true, true); } else go(idx + 1); }
  function skipTab() {
    const cur = steps[idx].tab;
    const j = steps.findIndex((x, k) => k > idx && x.tab !== cur);
    go(j === -1 ? steps.length - 1 : j);
  }

  function end(done, completed) {
    if (!active) return;
    active = false; building = false;
    root.hidden = true; document.body.classList.remove('tour-on');
    if (done) markDone(!!completed);
    window.showTab('inizio');
    window.scrollTo(0, 0);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function start() {
    if (!steps.length) return;
    build();
    lastFocus = document.activeElement;
    if (window.closeHelp) window.closeHelp(false);
    active = true; idx = 0;
    root.hidden = false; document.body.classList.add('tour-on');
    go(0);
  }

  // --- Nome utente: si chiede UNA volta, appena si apre il sito (prima del tutorial) ---
  // Non e' un account: e' solo un nome (qualsiasi testo, massimo 24 caratteri) che resta su questo dispositivo.
  const NAME_ASKED = 'tl_name_asked_v1';
  let nameAskedMem = false;
  const nameAsked = () => { try { return localStorage.getItem(NAME_ASKED) !== null; } catch (e) { return nameAskedMem; } };
  const nameKnown = () => { try { return ((JSON.parse(localStorage.getItem('tl_profile_v1') || '{}').name) || '').trim().length > 0; } catch (e) { return false; } };

  function askName() {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.id = 'namebox';
      box.innerHTML = `<div class="tour-block" aria-hidden="true"></div>
        <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="nb-title" aria-describedby="nb-text" tabindex="-1">
          <h3 id="nb-title">Benvenuto nel Trading Lab</h3>
          <p id="nb-text">Come vuoi chiamarti? Scegli il nome utente che preferisci (massimo 24 caratteri): puoi usare anche un soprannome. Non è un account e non c'è nessuna password: il nome resta solo su questo dispositivo e puoi cambiarlo quando vuoi dalla scheda Strumenti.</p>
          <label class="tour-label" for="nb-name">Il tuo nome utente</label>
          <input id="nb-name" maxlength="24" autocomplete="off" placeholder="es. Mario, Luna98, Il Trader...">
          <div class="tour-nav"><button type="button" id="nb-skip" class="pbtn ghost">Salta, uso il sito senza nome</button><button type="button" id="nb-ok" class="pbtn">Continua</button></div>
        </div>`;
      document.body.appendChild(box);
      const input = box.querySelector('#nb-name'), prev = document.activeElement;
      const finish = (save) => {
        const name = input.value.trim().slice(0, 24);
        if (save && name && window.setPlayerName) window.setPlayerName(name);
        nameAskedMem = true;
        try { localStorage.setItem(NAME_ASKED, '1'); } catch (e) { /* senza storage: chiede solo una volta per visita */ }
        document.removeEventListener('keydown', onKeyName, true);
        box.remove();
        if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
        resolve();
      };
      function onKeyName(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); finish(true); }
        else if (e.key === 'Tab') {
          const f = [input, box.querySelector('#nb-skip'), box.querySelector('#nb-ok')];
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[2].focus(); }
          else if (!e.shiftKey && i === 2) { e.preventDefault(); f[0].focus(); }
        }
      }
      document.addEventListener('keydown', onKeyName, true);
      box.querySelector('#nb-ok').onclick = () => finish(true);
      box.querySelector('#nb-skip').onclick = () => finish(false);
      input.focus();
    });
  }

  async function init() {
    let tut = {};
    try { tut = await (await fetch('/web/tutorial.json')).json(); } catch (e) { return; }
    steps = tut.passi || [];
    const btn = document.getElementById('tour-btn');
    if (btn) btn.onclick = () => { if (active) end(false); start(); };   // sempre da capo
    window.startTutorial = start;
    window.askUserName = askName;
    await wait(700);                                                     // lascia disegnare la pagina
    if (!nameAsked() && !nameKnown()) await askName();                   // prima il nome, poi (se serve) il tutorial
    if (!isDone()) setTimeout(start, 400);                               // prima visita: il tutorial parte da solo
  }
  window.addEventListener('load', init);
})();
