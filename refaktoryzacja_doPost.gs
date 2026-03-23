/**
 * Refaktoryzacja – pełna obsługa webhooka WooCommerce
 * Nazwy funkcji/zmiennych po polskich znakach usunięte (kompatybilnie)
 * @OnlyCurrentDoc
 */

/* ========== KONFIGURACJA ========== */
const NAZWA_ARKUSZA_GLOWNEGO = 'Baza zamowien z organicflow';

/* === kolory i reguly (identyczne jak w oryginale) === */
const K = { // skrot
  niebieskiPlec:  '#9aa3f5',
  fioletPlec:     '#e99af5',
  zoltStatus:     '#f7de8b',
  czerwonyStatus: '#f7755c',
  zielonySlaby:   '#d9fc81',
  zielony:        '#b0fc81',
  czerwonyMocny:  '#eb4034',
  zielonyCiemny:  '#6aa84f',
  fioletStatus:   '#f7cef3',
  bialy:          '#ffffff',
  zielonyMetoda:  '#b6d7a8',
  bezowyMetoda:   '#fff2cc',
  mailCzerwony:   '#f9dddd',
  mailZielony:    '#ebffcb'
};

const REGULY_FORMATU = {
  'Mezczyzna': {kolor: K.niebieskiPlec, zakres: 'D2:D'}, // kompatybilnosc
  'Mężczyzna':  {kolor: K.niebieskiPlec, zakres: 'D2:D'},
  'Leader':     {kolor: K.niebieskiPlec, zakres: 'D2:D'},
  'Kobieta':    {kolor: K.fioletPlec,   zakres: 'D2:D'},
  'Follower':   {kolor: K.fioletPlec,   zakres: 'D2:D'},
  'on-hold':    {kolor: K.zoltStatus,   zakres: 'J2:J'},
  'cancelled':  {kolor: K.czerwonyStatus,  zakres: 'J2:J'},
  'pending':    {kolor: K.zielonySlaby, zakres: 'J2:J'},
  'processing': {kolor: K.zielony,      zakres: 'J2:J'},
  'completed':  {kolor: K.zielony,      zakres: 'J2:J'},
  'failed':     {kolor: K.czerwonyStatus,  zakres: 'J2:J'},
  'refunded':   {kolor: K.fioletStatus, zakres: 'J2:J'},
  'Przelewy24':      {kolor: K.zielonyMetoda, zakres: 'H2:H'},
  'Przelew bankowy': {kolor: K.bezowyMetoda,  zakres: 'H2:H'}
};

/* ========== LOGOWANIE ========== */
function wewnetrznyLogger(poziom, miejsce, tresc) {
  const ss = SpreadsheetApp.getActive();
  const NAME = 'Logi bledow';
  let sh = ss.getSheetByName(NAME);
  if (!sh) {
    sh = ss.insertSheet(NAME);
    sh.appendRow(['Data', 'Poziom', 'Miejsce', 'Tresc']);
  }
  sh.appendRow([new Date(), poziom, miejsce, tresc]);
}
function logujInfo(miejsce, wiad) { wewnetrznyLogger('INFO',  miejsce, wiad); }
function logujBlad(miejsce, err)  {
  const msg = err && err.stack ? err.stack : String(err);
  wewnetrznyLogger('BLAD', miejsce, msg);
  Logger.log(`${miejsce}: ${msg}`);
}

/* ========== NARZEDZIA ARKUSZA ========== */
function pobierzIndeksyKolumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(NAZWA_ARKUSZA_GLOWNEGO);
  if (!sh) throw new Error('Nie znaleziono arkusza glownego!');
  const headers = sh.getDataRange().getValues()[0];
  const map = {};
  headers.forEach((h, i) => { map[h] = i; });
  return { ss, sh, map, headerLen: headers.length };
}

/* ========== PARSER WEBHOOKA ========== */
function parsujWebhook(e) {
  const d = JSON.parse(e.postData.contents);

  const couponLines = d.coupon_lines || [];

  // 1) Kwota zniżki (pewniak: discount_total z ordera)
  const discountTotal = Number(d.discount_total || 0);

  // 2) Kody kuponów
  const codes = couponLines
    .map(c => String(c.code || '').trim())
    .filter(Boolean);

  // 3) Typy kuponów (discount_type + nominal_amount) -> np. "percent (10%)"
  const types = couponLines
    .map(c => {
      const t = String(c.discount_type || '').trim();   // percent / fixed_cart / fixed_product
      const n = Number(c.nominal_amount || 0);

      if (!t) return '';
      if (t === 'percent') return `percent (${n}%)`;
      // dla kwotowych:
      if (n) return `${t} (${n} PLN)`;
      return t;
    })
    .filter(Boolean);

  // Tekst do kolumny "Rabat/kupon"
  const couponSummary =
    `Zniżka: ${discountTotal} PLN` +
    (codes.length ? ` | Kod kuponu: ${codes.join(', ')}` : '') +
    (types.length ? ` | Typ kuponu: ${types.join(', ')}` : '');

  const order = {
    id: d.id,
    id_number: d.number,
    status: d.status,
    couponSummary: couponSummary, 
    total: parseFloat(d.total),
    discount: parseFloat(d.discount_total),
    customerId: d.customer_id,
    billing:  d.billing,
    shipping: d.shipping,
    payment:  d.payment_method_title,
    note:     d.customer_note,
    orderKey: d.order_key,
    created:  d.date_created,
    modified: d.date_modified,
    shippingLine: d.shipping_lines && d.shipping_lines.length ? d.shipping_lines[0] : {}
  };
  return { order, items: d.line_items, metaData: d.meta_data };
}

/* ========== PARSER META_DATA (1 pozycja) ========== */
function parsujMetaDane(item) {
  const meta = {
    plec: '', rola: '', dodDzien: '', nocleg: '', zkim: '',
    dieta: '', dietaInna: '', dietaD1: '', dietaD2: '',
    // SOLO
    imieU: '', nazwiskoU: '', emailU: '', phoneU: '',
    // COUPLE
    imieL: '', nazwiskoL: '', emailL: '', phoneL: '',
    imieF: '', nazwiskoF: '', emailF: '', phoneF: '',
    rola1: '', rola2: '',
    // platnosci
    placeZadatekFlag: false, kwotaZadatku: 0,
    isCouple: false
  };

  try {
    (item.meta_data || []).forEach(md => {
      const k = String(md.key || md.display_key || '').trim();
      const v = md.value;

      switch (k) {
        case 'pan-czy-pani':
        case 'Pan/Pani':
        case 'pan-pani': meta.plec = v; break;

        case 'Rola uczestnika/czki':
        case 'Rola uczestnika/i':
        case 'rola-uczestnika-czki':
          meta.rola = String(v).trim();
          if (/^couple$/i.test(meta.rola)) meta.isCouple = true;
          break;

        case 'Z kim chcesz być w pokoju?': meta.zkim = v; break;
        case 'Wybierz rodzaj diety':       meta.dieta = v; break;
        case 'Dodatkowe opcje:':
        case 'Dodatkowa opcja Czwartkowa:': meta.dodDzien = v; break;
        case 'Dodatkowa opcja Poniedziałkowa:': meta.dodDzien += v; break;
        case 'Pakiet zajęć masterclass': meta.dodDzien += v; break;
        case 'nocleg':      meta.nocleg = v; break;
        case 'Podaj nazwę specjalnej diety': meta.dietaInna = v; break;
        case 'Jaki rodzaj diety dla dziecka?': meta.dietaD1 = v; break;
        case 'Dodaj kolejne dziecko i wybierz dietę': meta.dietaD2 = v; break;

        // SOLO (4 pola)
        case 'Imię':        meta.imieU = v; break;
        case 'Nazwisko':    meta.nazwiskoU = v; break;
        case 'Email':       meta.emailU = String(v).trim(); break;
        case 'Telefon':     meta.phoneU = String(v).replace(/[+ ]/g,''); break;

        // COUPLE – Leader
        case 'Imię Leader':        meta.imieL = v; meta.isCouple = true; break;
        case 'Nazwisko Leader':    meta.nazwiskoL = v; meta.isCouple = true; break;
        case 'Email Leader':       meta.emailL = String(v).trim(); meta.isCouple = true; break;
        case 'Telefon Leader':     meta.phoneL = String(v).replace(/[+ ]/g,''); meta.isCouple = true; break;

        // COUPLE – Follower
        case 'Imię Follower':      meta.imieF = v; meta.isCouple = true; break;
        case 'Nazwisko Follower':  meta.nazwiskoF = v; meta.isCouple = true; break;
        case 'Email Follower':     meta.emailF = String(v).trim(); meta.isCouple = true; break;
        case 'Telefon Follower':   meta.phoneF = String(v).replace(/[+ ]/g,''); meta.isCouple = true; break;

        // Stare klucze kompatybilnosci
        case 'Imię i nazwisko pierwszego uczestnika/i': {
          const s = String(v).trim().split(/\s+/);
          meta.imieL = meta.imieL || s[0] || '';
          meta.nazwiskoL = meta.nazwiskoL || s.slice(1).join(' ');
          if (!meta.imieU)     meta.imieU     = meta.imieL;
          if (!meta.nazwiskoU) meta.nazwiskoU = meta.nazwiskoL;
          meta.isCouple = true;
        } break;
        case 'Rola pierwszego uczestnika/i': meta.rola1 = v; break;

        case 'Imię i nazwisko drugiego uczestnika/i': {
          const s = String(v).trim().split(/\s+/);
          meta.imieF = meta.imieF || s[0] || '';
          meta.nazwiskoF = meta.nazwiskoF || s.slice(1).join(' ');
          meta.isCouple = true;
        } break;
        case 'Rola drugiego uczestnika/i': meta.rola2 = v; break;

        // Zadatek
        case 'Płace zadatek! Całość później!': {
          meta.placeZadatekFlag = true;
          const m = String(md.display_value).match(/\(([^)]+)\)/);
          if (m && m[1]) {
            meta.kwotaZadatku = Math.abs(parseFloat(
              m[1].replace(/\s/g, '').replace(',', '.')
            )) || 0;
          }
        } break;

        default: break;
      }
    });

    if (meta.dietaD1) {
      meta.dieta += (meta.dieta ? ' + ' : '') + meta.dietaD1;
      if (meta.dietaD2) meta.dieta += ' + ' + meta.dietaD2;
    }

    if (!meta.plec && meta.rola) meta.plec = meta.rola;
    if (!meta.isCouple && /^couple$/i.test(meta.rola || '')) meta.isCouple = true;

  } catch (e) { logujBlad('parsujMetaDane', e); }
  return meta;
}

/* ========== WYSZUKIWANIE / ANTYDUPLIKACJA ========== */
/** Zwraca wszystkie wiersze (2-indexed), gdzie item id == itemId (gołe) */
function znajdzWierszePoItemIdAll(sh, map, itemId) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const colItem = map['item id'] + 1;
  const vals = sh.getRange(2, colItem, last - 1).getValues().flat().map(v => String(v));
  const target = String(itemId);
  const rows = [];
  vals.forEach((v, i) => { if (v === target) rows.push(i + 2); });
  return rows;
}

/** Z listy wierszy wybiera te z daną rola (Pan/Pani) i e-mailem (trim+lowercase) */
function odfiltrujWgRoliIEmail(sh, map, rows, rola, email) {
  const colRole = map['Pan/Pani'] + 1;
  const colMail = map['E-mail'] + 1;
  const norm = s => String(s || '').trim().toLowerCase();
  const wantRole = String(rola || '').trim();
  const wantEmail = norm(email);

  const hit = [];
  rows.forEach(r => {
    const roleVal = sh.getRange(r, colRole).getValue();
    const mailVal = sh.getRange(r, colMail).getValue();
    if (String(roleVal).trim() === wantRole && norm(mailVal) === wantEmail) {
      hit.push(r);
    }
  });
  return hit;
}

function _toTimestamp_(val) {
  if (val == null || val === '') return null;
  const raw = String(val).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = new Date(normalized).getTime();
  return isNaN(t) ? null : t;
}

/** Aktualizuje status/checkboxy/kolory na przekazanych wierszach (jeśli status się zmienia) */
function aktualizujIstniejaceWiersze(sh, map, rows, newStatus,
                                     linetotalPerRow, orderTotal, meta, newModified,
                                     kolory, checkboxy) {
  const colStatus = map['Status zamówienia'] + 1;
  const colModified = map['Data modyfikacji'] != null ? map['Data modyfikacji'] + 1 : -1;
  const incomingTs = _toTimestamp_(newModified);
  rows.forEach(r => {
    const curr = sh.getRange(r, colStatus).getValue();
    if (colModified !== -1 && incomingTs != null) {
      const currModVal = sh.getRange(r, colModified).getValue();
      const currTs = _toTimestamp_(currModVal);
      // NIE NADPISUJ: starszy event (date_modified) nie może cofnąć statusu
      if (currTs != null && incomingTs < currTs) return;
    }
    if (curr !== newStatus) {
      zaktualizujWiersz(sh, r, {map},
        newStatus, linetotalPerRow, orderTotal, meta, newModified,
        kolory, checkboxy
      );
    }
  });
}

/* ========== BUDOWANIE POJEDYNCZEGO WIERSZA OSOBY ========== */
function zbudujWierszOsoby({osoba, rola, linetotalPerRow, item, order,
                            prod_nam, prod_nam_v, metaDodatkowe, kol}) {
  const { map, headerLen } = kol;
  const row = Array(headerLen).fill('');

  row[map['Nazwisko']]  = osoba.nazw || '';
  row[map['Imię']]      = osoba.imie || '';
  row[map['Pan/Pani']]  = rola || '';

  const mail = (osoba.email || order.billing.email || '').replace(/ /g,'');
  const tel  = (osoba.tel   || order.billing.phone || '').replace(/[+ ]/g,'');

  row[map['E-mail']] = mail;
  row[map['Telefon']] = tel;

  row[map['Wartość pozycji']]    = linetotalPerRow;
  row[map['Sposób płatności']]   = order.payment;
  row[map['Status zamówienia']]  = order.status;
  row[map['Wartość zamówienia']] = order.total;

  if (metaDodatkowe) {
    if (map['Dodatkowy dzień'] != null) row[map['Dodatkowy dzień']] = metaDodatkowe.dodDzien || '';
    if (map['Dieta'] != null)           row[map['Dieta']]           = (metaDodatkowe.dieta || '') + (metaDodatkowe.dietaInna || '');
    if (map['Z kim chcesz być w pokoju'] != null) row[map['Z kim chcesz być w pokoju']] = metaDodatkowe.zkim || '';
    if (map['Nocleg'] != null)          row[map['Nocleg']]          = metaDodatkowe.nocleg || '';
  }

  row[map['Notka klienta']]       = order.note;
  row[map['UnikalnyID']]          = '';
  row[map['ID']]                  = order.id;
  row[map['ID zamówienia']]       = order.id_number;
  row[map['ID produktu']]         = item.product_id;
  row[map['ID klienta']]          = order.customerId;
  row[map['Nazwa produktu']]      = prod_nam;
  row[map['Nazwa produktu z wariantem']] = prod_nam_v;

  row[map['Sposób dostawy']]      = (order.shippingLine && order.shippingLine.method_title) || '';
  row[map['Koszt dostawy']]       = (order.shippingLine && order.shippingLine.total) || '';
  row[map['Na kogo wysyłka']]     = (order.shipping.first_name || '') + ' ' + (order.shipping.last_name || '');
  row[map['Adres do wysyłki']]    =
    `${order.shipping.address_1 || ''} ${order.shipping.address_2 || ''}, ${order.shipping.postcode || ''}, ${order.shipping.city || ''} Nazwa firmy: ${order.shipping.company || ''}`;

  row[map['Data zamowienia']]     = order.created;
  row[map['Data modyfikacji']]    = order.modified;
  row[map['Imie płatnika']]       = order.billing.first_name;
  row[map['Nazwisko płatnika']]   = order.billing.last_name;
  row[map['Rabat/kupon']]         = order.couponSummary || '';

  row[map['Ilość sztuk produktu']] = 1;
  row[map['Miasto']]              = order.billing.city;
  row[map['Kod pocztowy']]        = order.billing.postcode;
  row[map['Ulica']]               = `${order.billing.address_1} ${order.billing.address_2}`;
  row[map['Nazwa firmy']]         = order.billing.company;
  row[map['Klucz zamówienia']]    = order.orderKey;

  // KLUCZ: „gołe” item id
  row[map['item id']] = item.id;

  return row;
}

function zaktualizujWiersz(sh, rowNum, kol, newStatus,
                           linetotal, orderTotal, meta, newModified,
                           kolory, checkboxy) {

  sh.getRange(rowNum, kol.map['Status zamówienia'] + 1).setValue(newStatus);
  if (kol.map['Data modyfikacji'] != null && newModified != null) {
    sh.getRange(rowNum, kol.map['Data modyfikacji'] + 1).setValue(newModified);
  }

  const zaplacone = (newStatus === 'processing' || newStatus === 'completed') &&
                    linetotal <= orderTotal;

  if (zaplacone)
    kolory.push({ rangeA1: `B${rowNum}:C${rowNum}`, color: K.zielony });

  if (newStatus === 'cancelled')
    kolory.push({ rangeA1: `B${rowNum}:C${rowNum}`, color: K.czerwonyMocny });

  if (newStatus === 'on-hold')
    kolory.push({ rangeA1: `B${rowNum}:C${rowNum}`, color: K.bialy });

  // checkboxy płatności – aktualizujemy
  checkboxy.push({
    row:   rowNum,
    col:   kol.map['Zapłacone całość'] + 1,
    value: zaplacone
  });

  checkboxy.push({
    row:   rowNum,
    col:   kol.map['Podzielona wpłata'] + 1,
    value: false
  });

  // UWAGA: NIE dotykamy „Zgoda na newsletter” przy aktualizacji istniejących wierszy.
}


function dodajNoweWiersze(sh, rows, kol,
                          kolory, checkboxy,
                          newStatus, linetotal, orderTotal, meta) {

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, kol.headerLen).setValues(rows);

  rows.forEach((_, idx) => {
    const realRow  = startRow + idx;
    const zaplacone = (newStatus === 'processing' || newStatus === 'completed') &&
                      linetotal <= orderTotal;

    if (zaplacone)
      kolory.push({ rangeA1: `B${realRow}:C${realRow}`, color: K.zielony });

    if (newStatus === 'cancelled')
      kolory.push({ rangeA1: `B${realRow}:C${realRow}`, color: K.czerwonyMocny });

    // checkboxy płatności
    checkboxy.push({
      row:   realRow,
      col:   kol.map['Zapłacone całość'] + 1,
      value: zaplacone
    });

    checkboxy.push({
      row:   realRow,
      col:   kol.map['Podzielona wpłata'] + 1,
      value: false
    });

    // „Zgoda na newsletter” – TYLKO przy tworzeniu nowych wierszy
    checkboxy.push({
      row:   realRow,
      col:   kol.map['Zgoda na newsletter'] + 1,
      value: !!meta.zgodaNews
    });
  });
}


/* ========== MASS-FORMAT ========== */
function ustawKoloryIZnaczenia(sh, kolory, checkboxy) {
  kolory.forEach(k => { sh.getRange(k.rangeA1).setBackground(k.color); });
  checkboxy.forEach(b => {
    const rng = sh.getRange(b.row, b.col);
    rng.insertCheckboxes();
    rng.setValue(b.value);
  });
}

/* ========== WEBHOOK QUEUE (ACK + WORKER) ========== */
const WEBHOOK_QUEUE_SHEET = 'WebhookQueue';
const MAX_QUEUE_ATTEMPTS = 5;
const WEBHOOK_BATCH_MAX_MS = 170000; // ~2m50s bufor przed limitem 6 min Apps Script

function _getOrCreateQueueSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WEBHOOK_QUEUE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WEBHOOK_QUEUE_SHEET);
    sh.appendRow([
      'request_id', 'received_at', 'source_event', 'order_id',
      'state', 'attempt_count', 'payload_json', 'last_error', 'processed_at'
    ]);
  }
  return sh;
}

function _extractOrderId_(rawJson) {
  try {
    return String(JSON.parse(rawJson).id || '');
  } catch (e) {
    return '';
  }
}

function _enqueueWebhook_(requestId, sourceEvent, rawJson) {
  const sh = _getOrCreateQueueSheet_();
  sh.appendRow([
    requestId, new Date(), sourceEvent || '', _extractOrderId_(rawJson),
    'NEW', 0, rawJson, '', ''
  ]);
}

/* ========== GLOWNA FUNKCJA (SZYBKI ACK) ========== */
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw) {
      logujBlad('doPost', 'Brak e.postData.contents');
      return ContentService.createTextOutput('ERROR').setMimeType(ContentService.MimeType.TEXT);
    }

    const requestId = Utilities.getUuid();
    const sourceEvent =
      (e && e.parameter && (e.parameter.topic || e.parameter.event)) || 'woocommerce_webhook';

    _enqueueWebhook_(requestId, sourceEvent, raw);
    logujInfo('doPost', `ACK queued request_id=${requestId}`);

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    logujBlad('doPost', err);
    return ContentService.createTextOutput('ERROR').setMimeType(ContentService.MimeType.TEXT);
  }
}

function processWebhookQueueBatch(limit) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sh = _getOrCreateQueueSheet_();
    const last = sh.getLastRow();
    if (last < 2) return;

    const rows = sh.getRange(2, 1, last - 1, 9).getValues();
    const maxToProcess = Math.max(1, Number(limit || 10));
    const startedAt = Date.now();
    let processed = 0;

    for (let i = 0; i < rows.length && processed < maxToProcess; i++) {
      if (Date.now() - startedAt >= WEBHOOK_BATCH_MAX_MS) {
        logujInfo('processWebhookQueueBatch', `STOP timebox reached after ${processed} rekordow`);
        break;
      }

      const rowNum = i + 2;
      const requestId = String(rows[i][0] || '');
      const state = String(rows[i][4] || '');
      const attempts = Number(rows[i][5] || 0);
      const payloadJson = String(rows[i][6] || '');

      if (!payloadJson) continue;
      if (!(state === 'NEW' || state === 'ERROR' || state === 'PROCESSING')) continue;
      if (attempts >= MAX_QUEUE_ATTEMPTS) continue;

      // mark PROCESSING + increment attempts
      sh.getRange(rowNum, 5, 1, 2).setValues([['PROCESSING', attempts + 1]]);

      try {
        _processWebhookCore_({ postData: { contents: payloadJson } });
        sh.getRange(rowNum, 5, 1, 5).setValues([['DONE', attempts + 1, payloadJson, '', new Date()]]);
        logujInfo('processWebhookQueueBatch', `DONE request_id=${requestId}`);
      } catch (err) {
        const msg = err && err.stack ? err.stack : String(err);
        sh.getRange(rowNum, 5, 1, 5).setValues([['ERROR', attempts + 1, payloadJson, msg, '']]);
        logujBlad('processWebhookQueueBatch', `request_id=${requestId} :: ${msg}`);
      }

      processed++;
    }
  } finally {
    lock.releaseLock();
  }
}

/* ========== CIĘŻKIE PRZETWARZANIE (worker) ========== */
function _processWebhookCore_(e) {
  // Indeksy kolumn i dostęp do bazy głównej
  const { ss, sh, map, headerLen } = pobierzIndeksyKolumn();

  // >>> DELTA do zakładek – nagłówek bazy i bufor zmienionych wierszy
  const headersAll = sh.getDataRange().getValues()[0];
  const touchedRowsForDelta = [];

  const kolory = [];
  const checkboxy = [];

  // Parsowanie payloadu i porządkowanie danych (bez podwójnego JSON.parse)
  const { order, items, metaData } = parsujWebhook(e);
  const zgodaNews = (metaData || []).some(md => md.key === 'newsletter_zgoda');

  // Pomocnicze: budowa nazw produktu/wariantu
  function resolveProductNames(item) {
    const prod_name = item.name;
    const parent_name = item.parent_name;
    const variant_val = item.meta_data && item.meta_data[0] ? item.meta_data[0].value : '';
    let prod_nam = '', prod_nam_v = '';
    if (prod_name === parent_name) {
      prod_nam = prod_name;
      prod_nam_v = `${prod_name} - ${variant_val}`;
    } else if (!parent_name) {
      prod_nam = prod_name;
      prod_nam_v = prod_name;
    } else {
      prod_nam = parent_name;
      prod_nam_v = `${parent_name} - ${variant_val}`;
    }
    return { prod_nam, prod_nam_v };
  }
  const colUID = headersAll.indexOf('UnikalnyID');

  // Dla każdej pozycji zamówienia aktualizuj/dopisuj tylko to, co trzeba
  items.forEach(item => {
    const meta = parsujMetaDane(item);
    meta.zgodaNews = zgodaNews;

    const { prod_nam, prod_nam_v } = resolveProductNames(item);

    // Kwoty – zachowanie jak w Twojej logice (zadatek dodawany do linetotal; total zamówienia = oryginalny linetotal)
    let linetotal = parseFloat(item.total || 0);
    if (meta.placeZadatekFlag) {
      order.total = linetotal;          // total zamówienia bez zadatku
      linetotal += meta.kwotaZadatku;   // wartość pozycji powiększona o zadatek
    }

    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const perUnit = linetotal / qty;
    const perPerson = meta.isCouple ? (perUnit / 2) : perUnit;

    // Wszystkie istniejące wiersze w bazie dla "gołego" item.id
    const allItemRows = znajdzWierszePoItemIdAll(sh, map, item.id);

    // Funkcja pomocnicza: zapewnij odpowiednią liczbę wierszy dla danej roli+email
    function ensureRowsFor(rola, osoba) {
      const targetEmail = (osoba.email || order.billing.email || '').trim();

      // Znajdź istniejące wiersze (ten sam item id + rola + email)
      const exist = odfiltrujWgRoliIEmail(sh, map, allItemRows, rola, targetEmail);

      // Zaktualizuj status/checkboxy/kolory w istniejących
      aktualizujIstniejaceWiersze(
        sh, map, exist, order.status,
        perPerson, order.total, meta, order.modified,
        kolory, checkboxy
      );

      // DODAJ brakujące (tylko delta)
      const need = qty;
      const have = exist.length;
      if (have < need) {
        const toAdd = need - have;
        const rowsToInsert = [];
        for (let i = 0; i < toAdd; i++) {
          const row = zbudujWierszOsoby({
            osoba: { imie: osoba.imie, nazw: osoba.nazw, email: osoba.email, tel: osoba.tel },
            rola,
            linetotalPerRow: perPerson,
            item, order, prod_nam, prod_nam_v,
            metaDodatkowe: meta,
            kol: { map, headerLen }
          });
          rowsToInsert.push(row);
        }
        if (rowsToInsert.length) {
          dodajNoweWiersze(
            sh, rowsToInsert, { map, headerLen },
            kolory, checkboxy,
            order.status, perPerson, order.total, meta
          );
        }
      }
    }

    if (meta.isCouple) {
      // Leader
      ensureRowsFor('Leader', {
        imie: meta.imieL || meta.imieU || order.billing.first_name || '',
        nazw: meta.nazwiskoL || meta.nazwiskoU || order.billing.last_name || '',
        email: meta.emailL || meta.emailU || order.billing.email || '',
        tel: meta.phoneL || meta.phoneU || order.billing.phone || ''
      });
      // Follower
      ensureRowsFor('Follower', {
        imie: meta.imieF || '',
        nazw: meta.nazwiskoF || '',
        email: meta.emailF || '',
        tel: meta.phoneF || ''
      });
    } else {
      const rolaSolo =
        (/leader/i.test(meta.rola) ? 'Leader' :
          (/follower/i.test(meta.rola) ? 'Follower' : (meta.plec || meta.rola || '')));
      ensureRowsFor(rolaSolo, {
        imie: meta.imieU || order.billing.first_name || '',
        nazw: meta.nazwiskoU || order.billing.last_name || '',
        email: meta.emailU || order.billing.email || '',
        tel: meta.phoneU || order.billing.phone || ''
      });
    }

    // >>> DELTA do zakładek: zbieraj TYLKO wiersze z nadanym UnikalnyID
    (function collectTouchedRows() {
      const allRowsNums = znajdzWierszePoItemIdAll(sh, map, item.id); // 2-indexed
      if (!allRowsNums.length) return;
      const width = headersAll.length;

      allRowsNums.forEach(rn => {
        const rowVals = sh.getRange(rn, 1, 1, width).getValues()[0];
        // do delta-sync dorzucamy tylko te, które mają już UnikalnyID
        if (colUID !== -1 && String(rowVals[colUID] || '').trim() !== '') {
          touchedRowsForDelta.push(rowVals);
        }
      });
    })();
  });

  // >>> DELTA do zakładek: jednorazowy hurtowy upsert tylko dotkniętych wierszy
  _upsertRowsDelta_(touchedRowsForDelta, headersAll);

  // Kolory i checkboxy w bazie (po wszystkich zmianach)
  ustawKoloryIZnaczenia(sh, kolory, checkboxy);

  // Usunięcie „(+30,00&nbsp;&#122;&#322;)” – kompatybilnie z Twoim kodem
  sh.createTextFinder('(\\+30,00&nbsp;&#122;&#322;)')
    .useRegularExpression(true)
    .replaceAllWith(' ');
}
