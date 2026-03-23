// ===== funkcje i zmienne pomocnicze zadeklarowane globalnie =========
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName("Baza zamowien z organicflow");
var rng = sheet.getRange;
var caleDaneArkusza = sheet.getDataRange().getValues(); // pierwszy [nr wiersza - 2] drugi[ index_col -1 ]
var naglowki = caleDaneArkusza.shift(); //wyciety wiersz nagłówków

function spr(n){Logger.log(n)} // skrócenie funkcji logera
function index_col(nazwa_col){ return naglowki.indexOf(nazwa_col) }  // szukanie indeksu w tablicy po nazwie (główna baza)
function dane_col_glowne(nazwaKolumnySzukanej){return nazwaKolumnySzukanej = caleDaneArkusza.map(e => e[index_col(nazwaKolumnySzukanej)])}


// deklaracja numerów kolumn (na bazie statycznego nagłówka z głównego arkusza)
var col_nazwisko = index_col("Nazwisko");       
var col_imie = index_col("Imię");
var col_status = index_col("Status zamówienia");
var col_itemId = index_col("item id");
var col_zaplaconeCalosc = index_col("Zapłacone całość");
var col_podzielonaWplata = index_col("Podzielona wpłata");
var col_zgodaNews = index_col("Zgoda na newsletter");
var col_zadatek = index_col("Zadatek");
var col_drWpl = index_col("Druga wpłata");
var col_uniAjdi = index_col("UnikalnyID");
var col_KtoPrzGot = index_col("Kto przyjął gotówke");
var col_warPoz = index_col("Wartość pozycji");
var col_warZam = index_col("Wartość zamówienia");
var col_dodDzien = index_col("Dodatkowy dzień");
var col_cenSpec = index_col("Cena specjalna");
var col_podziekowanieZaCalosc = index_col("Wysłane Podziekowania za wpłate całości");
var col_sposobPlatnosci = index_col("Sposób płatności");

// deklaracja zakresów i kolorów do funkcji w kodzie, zależnościach i makrach
var kolumnaStatusu_J2 ="J2:J";
var kolumnaPlec_D2 ="D2:D";
var kolumnaMetoda_H2 = "H2:H";

var jasnyNiebieski_plec = "#9aa3f5";
var jasnyFiolet_plec = "#e99af5";
var jasnyZolty_status = "#f7de8b";
var jasnyCzerwony_status = "#f7755c";
var slabszyZielony_status ="#d9fc81"
var zielony_status = "#b0fc81";
var mocnyCzerwony_status = "#eb4034";
var ciemnoZielony = "#6aa84f"
var jasnyFiolet_status = "#f7cef3";
var bialy = "#ffffff";
var zielony_Metoda = "#b6d7a8"
var bezowy_Metoda = "#fff2cc"

var jasnoCzerwony_mail = "#f9dddd";
var jasnoZielony_mail = "#ebffcb";

var reguly = {
  "Mężczyzna": {kolor: jasnyNiebieski_plec, zakres: kolumnaPlec_D2},
  "Leader": {kolor: jasnyNiebieski_plec, zakres: kolumnaPlec_D2},
  "Kobieta": {kolor: jasnyFiolet_plec, zakres: kolumnaPlec_D2},
  "Follower": {kolor: jasnyFiolet_plec, zakres: kolumnaPlec_D2},
  "on-hold": {kolor: jasnyZolty_status, zakres: kolumnaStatusu_J2},
  "cancelled": {kolor: jasnyCzerwony_status, zakres: kolumnaStatusu_J2},
  "pending": {kolor: slabszyZielony_status, zakres: kolumnaStatusu_J2},
  "processing": {kolor: zielony_status, zakres: kolumnaStatusu_J2},
  "Przelewy24": {kolor: zielony_Metoda, zakres: kolumnaMetoda_H2},
  "Przelew bankowy": {kolor: bezowy_Metoda, zakres: kolumnaMetoda_H2},
  "refunded": {kolor: jasnyFiolet_status, zakres: kolumnaStatusu_J2},
  "completed": {kolor: zielony_status, zakres: kolumnaStatusu_J2},
  "failed": {kolor: jasnyCzerwony_status, zakres: kolumnaStatusu_J2}
};

// ======================= TRIGGER PRZY OTWARCIU (odchudzony) =======================
function trigOnOpen() {
  dodajMenu();                 // lekkie
  // ustaw_Kolor_i_blokowanie(); // opcjonalnie, lekkie
  
}


// ======================= MENU =======================
function dodajMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Własne operacje')
    .addItem('Ustaw zamrożenia i formatowanie', 'ustaw_Kolor_i_blokowanie')
    .addSeparator()
    .addItem('Odśwież statusy w TEJ zakładce (z bazy)', 'updateProductsInBase')
    .addItem('Zsynchronizuj NOWE rekordy (puste UnikalnyID) → zakładki', 'addProductToLocalBase')
    .addItem('Uruchom synchronizację teraz (jak CRON)', 'cronSyncZakladek')
    .addSeparator()
    .addItem('Utwórz CRON: sync co 6 h', 'utworzTriggerCo6h')
    .addItem('Usuń CRON: sync', 'usunTriggerySync')
    .addToUi();
}


// ======================= FORMATOWANIE / BLOKOWANIE =======================
function ustaw_Kolor_i_blokowanie(){
  ustawienieBlokowania();
  ustawFormatowanieWarunkowe(reguly);
}
function ustawienieBlokowania() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  spreadsheet.setFrozenRows(1);
  spreadsheet.setFrozenColumns(3);
}
function ustawFormatowanieWarunkowe(reguly) {
  var sht = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(); 
  var wszystkieReguly = sht.getConditionalFormatRules();
  var istniejaceKryteria = [];
  wszystkieReguly.forEach(function(el) {
    try {
      var kryterium = el.getBooleanCondition().getCriteriaValues();
      istniejaceKryteria.push(kryterium);
    } catch(e) {}
  });
  istniejaceKryteria = istniejaceKryteria.flat();

  for (var nazwaReguly in reguly) {
    var regula = reguly[nazwaReguly];
    if (istniejaceKryteria.indexOf(nazwaReguly) == -1) {
      var nowaRegula = SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(nazwaReguly)
        .setBackground(regula.kolor)
        .setRanges([sht.getRange(regula.zakres)])
        .build();
      wszystkieReguly.push(nowaRegula);
    }
  }
  sht.setConditionalFormatRules(wszystkieReguly);
}
function dodajRegulyDlaWiersza_i_Arkusza(numerWiersza, nazwaArkusza) {
  var arkusz = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nazwaArkusza);
  var zakres1 = arkusz.getRange("L" + numerWiersza + ":L" + numerWiersza);
  var zakres2 = arkusz.getRange("Q" + numerWiersza + ":Q" + numerWiersza);
  var zakres3 = arkusz.getRange("AV" + numerWiersza + ":AV" + numerWiersza);
  var zakres4 = arkusz.getRange("I" + numerWiersza + ":I" + numerWiersza);
  var opcjeMenu = ["Pati", "Słoń"];
  var regulaCheckboxa = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  var regulaMenu = SpreadsheetApp.newDataValidation().requireValueInList(opcjeMenu).build();
  zakres1.setDataValidation(regulaCheckboxa);
  zakres2.setDataValidation(regulaCheckboxa);
  zakres3.setDataValidation(regulaCheckboxa);
  zakres4.setDataValidation(regulaMenu);
}

// ======================= NARZĘDZIA FINANSOWE (jak u Ciebie) =======================
function liczKontoGotowka(){
  sprawdzCzyZaplaconeCaloscIkoloruj();
  var ssA = SpreadsheetApp.getActive().getActiveSheet();
  var daneAktArk = ssA.getDataRange().getValues();
  daneAktArk.shift();
  var rngA = ssA.getRange;
  var lr = ssA.getLastRow();
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    "Potrzebne do prawidłowego działania skryptu",
    "Sprzwdź czy wszystke pola 'Wartość pozycji' i 'Nazwa produktu' są wypełnione?",
    ui.ButtonSet.YES_NO)
  if(result == ui.Button.YES){
    var daneOn = rngA("O2:N"+lr).getValues();
    var daneKto = rngA("I2:I"+lr).getValues();
    var danePodzelonaWplata = rngA(2,col_podzielonaWplata+1,lr-1).getValues().flat();
    var ind_got = []
    var ind_kon =[]
    var tylePowinnoByc = []
    daneAktArk.forEach(function(wiersz,ind_wier){
      if(wiersz[col_cenSpec] != "" && wiersz[col_status] != "refunded" && wiersz[col_status] != "cancelled" && wiersz[col_status] != "failed") {
        tylePowinnoByc.push(wiersz[col_cenSpec])
      } else if ( wiersz[col_status] != "refunded" && wiersz[col_status] != "cancelled" && wiersz[col_status] != "failed"){
        tylePowinnoByc.push(wiersz[col_warPoz])
      }
    })
    tylePowinnoByc =tylePowinnoByc.flat().map(n => n*1).reduce((a,b) => a+b);

    daneKto.forEach((a,i) => { if(a != "") {ind_got.push(i)} else ind_kon.push(i) })

    var daneGot =[];
    var daneKon =[];
    danePodzelonaWplata.forEach(function(wiersz_P,i){
      if (wiersz_P == true) {rngA(i+2, col_podzielonaWplata+1).insertCheckboxes().setValue(true)}
      else {rngA(i+2, col_podzielonaWplata+1).insertCheckboxes().setValue(false)}
    })
    ind_got.forEach(e => {
      if(danePodzelonaWplata[e]== true){
        daneKon.push(daneAktArk[e][col_zadatek])
        daneGot.push(daneAktArk[e][col_drWpl])
      } else {
        daneGot.push(daneOn[e])
      }
    })
    ind_kon.forEach(e => {
      if(danePodzelonaWplata[e]== true){
        daneKon.push(daneAktArk[e][col_zadatek])
        daneGot.push(daneAktArk[e][col_drWpl])
      } else {daneKon.push(daneOn[e])}
    })

    if(daneGot == false){ 
      daneKon = daneKon.flat().map(n => n*1).reduce((a,b) => a+b);
      ui.alert(`Nie ma wpłat gotówka, a na koncie jest równo: ${daneKon} Cebulionów :D\x0A Tyule brakuje: ${tylePowinnoByc-daneKon}PLN\x0A A tyle powinno być: ${tylePowinnoByc}PLN`);
    }
    if (daneKon == false){
      daneGot = daneGot.flat().map(n => n*1).reduce((a,b) => a+b);
      ui.alert(`Nie ma wpłat gotówka, a na koncie jest równo: ${daneGot} Cebulionów :D\x0A Tyule brakuje: ${tylePowinnoByc-daneGot}PLN\x0A A tyle powinno być: ${tylePowinnoByc}PLN`);
    }
    if(daneKon != false && daneGot != false){
      daneKon = daneKon.flat().map(n => n*1).reduce((a,b) => a+b);
      daneGot = daneGot.flat().map(n => n*1).reduce((a,b) => a+b);
      var suma = daneKon+daneGot
      var tylebrakuje = tylePowinnoByc-suma
      ui.alert('Na koncie jest: '+daneKon + " PLN.\x0A Gotówki jest: "+daneGot + " PLN. \x0A W sumie:  "+suma+' Cebulionów :D\x0A\x0A Tyle powinno być: '+tylePowinnoByc+"\x0A A tyle brakuje: "+tylebrakuje);
    }
  }
}
function sprawdzCzyZaplaconeCaloscIkoloruj(){
  var ssA = SpreadsheetApp.getActive().getActiveSheet();
  var rngA = ssA.getRange;
  var daneAktywnegoArkusza = ssA.getDataRange().getValues();
  var naglowkiL = daneAktywnegoArkusza.shift();

  function index_col_local(nazwa_col){ return naglowkiL.indexOf(nazwa_col) }
  function dane_col(nazwaKolumnySzukanej){return nazwaKolumnySzukanej = daneAktywnegoArkusza.map(e => e[index_col_local(nazwaKolumnySzukanej)])}
  function range_do_danychA(nazwaCol){return rngA(2,index_col_local(nazwaCol)+1,daneAktywnegoArkusza.length)}

  rngA(2,col_podziekowanieZaCalosc+1,daneAktywnegoArkusza.length,6).insertCheckboxes()
  range_do_danychA("Zapłacone całość").insertCheckboxes()

  daneAktywnegoArkusza.forEach((wiersz,ind) => {
    if(wiersz[col_cenSpec] == "" && wiersz[col_zadatek] + wiersz[col_drWpl] < wiersz[col_warPoz]) {
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(false);
    }
    if(wiersz[col_cenSpec] != "" && wiersz[col_zadatek] + wiersz[col_drWpl] < wiersz[col_cenSpec]){
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(false);
    }
    if(wiersz[col_status] == "cancelled" || wiersz[col_status] == "failed"){
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(false);
    }
    if( wiersz[col_status] == "completed" && wiersz[col_warPoz] <= wiersz[col_warZam]){ 
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(true)
      rngA(ind+2,index_col_local("Zadatek")+1).setValue(wiersz[col_warPoz]);      
    }
    if( wiersz[col_status] == "completed" && wiersz[col_warPoz] >= wiersz[col_warZam] && wiersz[col_sposobPlatnosci]=="Przelewy24"){ 
      rngA(ind+2,index_col_local("Zadatek")+1).setValue(wiersz[col_warZam]);      
    }
    if( wiersz[col_cenSpec] != "" && wiersz[col_zadatek] + wiersz[col_drWpl] >= wiersz[col_cenSpec]){
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(true);
    }
    else if(wiersz[col_warPoz] != "" && wiersz[col_zadatek] + wiersz[col_drWpl] >= wiersz[col_warPoz]){
      rngA(ind+2,col_zaplaconeCalosc+1).setValue(true);
    }
  });

  var daneTab_ZaplacCalo = dane_col("Zapłacone całość");
  daneTab_ZaplacCalo.forEach((el,ind) => {
    if(el == true){ 
      rngA(ind+2,col_imie+1).setBackground(zielony_status);
      rngA(ind+2,col_nazwisko+1).setBackground(zielony_status);
      rngA(ind+2,col_podziekowanieZaCalosc,1,4).setBackground(jasnoZielony_mail);
      rngA(ind+2,col_podziekowanieZaCalosc+4,1,2).setBackground(jasnoCzerwony_mail)
    }
    if(el == false){
      rngA(ind+2,col_podziekowanieZaCalosc+2,1,4).setBackground(jasnoZielony_mail);
      rngA(ind+2,col_podziekowanieZaCalosc,1,2).setBackground(jasnoCzerwony_mail);
    }
    if((daneAktywnegoArkusza[ind][col_status] == "cancelled" || daneAktywnegoArkusza[ind][col_status] == "failed") && el == false){
      rngA(ind+2,col_imie+1).setBackground(mocnyCzerwony_status);
      rngA(ind+2,col_nazwisko+1).setBackground(mocnyCzerwony_status);
      rngA(ind+2,col_podziekowanieZaCalosc,1,6).setBackground(jasnoCzerwony_mail)
    }
  })
}

// ======================= NOWE: helpery do sync/zakładek =======================

function safeAlert(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log('[ALERT] ' + msg);
  }
}


/**
 * Selektywne odświeżenie zakładki z bazy:
 * Dla wspólnych UID:
 *   - aktualizuje Status zamówienia, Zapłacone całość, Podzielona wpłata
 *   - koloruje B:C spójnie jak w bazie
 * NICZEGO więcej nie nadpisuje.
 */
function _syncSheetFromBase_(sheetName){
  if (sheetName === "Baza zamowien z organicflow") return;

  const baseSh = ss.getSheetByName("Baza zamowien z organicflow");
  const prodSh = ss.getSheetByName(sheetName);
  if (!baseSh || !prodSh) return;

  const base = baseSh.getDataRange().getValues();
  const headers = base.shift();
  const width = headers.length;

  const colUID       = headers.indexOf('UnikalnyID');
  const colStatus    = headers.indexOf('Status zamówienia');
  const colZapCalosc = headers.indexOf('Zapłacone całość');
  const colPodzielona= headers.indexOf('Podzielona wpłata');

  if ([colUID, colStatus, colZapCalosc, colPodzielona].some(i => i === -1)) return;

  // indeks z bazy: UID -> [status, zaplacone, podzielona]
  const baseIndex = {};
  base.forEach(r => {
    const uid = String(r[colUID] || '');
    if (!uid) return;
    baseIndex[uid] = {
      status:    r[colStatus],
      zaplacone: r[colZapCalosc],
      podzielona:r[colPodzielona]
    };
  });

  // mapy kolumn w docelowej zakładce
  const prod = prodSh.getDataRange().getValues();
  if (prod.length < 2) return;
  const headersP = prod[0];

  const colUIDp        = headersP.indexOf('UnikalnyID');
  const colStatusP     = headersP.indexOf('Status zamówienia');
  const colZapCaloscP  = headersP.indexOf('Zapłacone całość');
  const colPodzielonaP = headersP.indexOf('Podzielona wpłata');

  if ([colUIDp, colStatusP, colZapCaloscP, colPodzielonaP].some(i => i === -1)) return;

  for (let i = 1; i < prod.length; i++) {
    const uid = String(prod[i][colUIDp] || '');
    if (!uid || !baseIndex[uid]) continue;

    const b = baseIndex[uid];
    const rowNum = i + 1;

    // UPDATE wybranych pól
    prodSh.getRange(rowNum, colStatusP + 1).setValue(b.status);
    prodSh.getRange(rowNum, colZapCaloscP + 1).setValue(b.zaplacone);
    prodSh.getRange(rowNum, colPodzielonaP + 1).setValue(b.podzielona);

    // Kolory spójne z bazą
    _kolorujBC_wZakladce_(prodSh, rowNum, b.status, b.zaplacone);
  }
}



// ======================= NOWE: pełny upsert do zakładek + status sync =======================
function addProductToLocalBase() {
  syncUnsyncedRows();
  safeAlert("Zsynchronizowano rekordy z PUSTYM 'UnikalnyID' do odpowiednich zakładek.");
}


function updateProductsInBase() {
  const active = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const name = active.getSheetName();
  if (name === "Baza zamowien z organicflow"){
    SpreadsheetApp.getUi().alert("Jesteś w bazie głównej. Przejdź do zakładki produktu.");
    return;
  }
  _syncSheetFromBase_(name); // selektywne odświeżenie
}


// ======================= NOWE: CRON co 6h =======================
function cronSyncZakladek(){
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    syncUnsyncedRows(); // tylko niesynchro UID
  } catch (err) {
    Logger.log(err);
  } finally {
    lock.releaseLock();
  }
}


function utworzTriggerCo6h(){
  usunTriggerySync();
  ScriptApp.newTrigger('cronSyncZakladek').timeBased().everyHours(6).create();
  safeAlert("Utworzono CRON: synchronizacja rekordów z pustym 'UnikalnyID' co 6 godzin.");
}

function usunTriggerySync(){
  var all = ScriptApp.getProjectTriggers();
  all.forEach(function(t){
    var fn = t.getHandlerFunction();
    if (fn === 'cronSyncZakladek'){
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ======================= (KONIEC helperów sync) =======================

/** ======================= DELTA-SYNC helpery (NOWE) ======================= */

/** Utwórz zakładkę produktu jeśli nie istnieje (z nagłówkiem/formatem) */
function _getOrCreateProductSheet_(name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    rng(1, 1, 1, headers.length).copyFormatToRange(sh, 1, headers.length, 1, 1);
  }
  return sh;
}

function _buildUidIndex(sh, colUID) {
  var last = sh.getLastRow();
  var idx = {};
  if (last > 1) {
    var uids = sh.getRange(2, colUID + 1, last - 1, 1).getValues();
    for (var i = 0; i < uids.length; i++) {
      var v = String(uids[i][0] || '');
      if (v !== '') idx[v] = i + 2;  // numer wiersza 2-indexed
    }
  }
  return idx;
}



/**
 * Hurtowy upsert do zakładek:
 * - INSERT (gdy brak UID w zakładce) -> pełny wiersz + walidacje
 * - UPDATE (gdy UID istnieje) -> aktualizuje TYLKO:
 *     Status zamówienia, Zapłacone całość, Podzielona wpłata
 *   oraz koloruje B:C jak w bazie (spójność wizualna).
 * - NIE aktualizujemy "Zgoda na newsletter".
 */
/**
 * Hurtowy upsert do zakładek:
 * - INSERT (gdy brak UID w zakładce) -> pełny wiersz + walidacje
 * - UPDATE (gdy UID istnieje) -> aktualizuje TYLKO:
 *     Status zamówienia, Zapłacone całość, Podzielona wpłata
 *   oraz koloruje B:C jak w bazie (spójność wizualna).
 * - NIE aktualizujemy "Zgoda na newsletter".
 */
function _upsertRowsDelta_(rows, headers) {
  if (!rows || !rows.length) return;

  const colUID        = headers.indexOf('UnikalnyID');
  const colProd       = headers.indexOf('Nazwa produktu');
  const colStatus     = headers.indexOf('Status zamówienia');
  const colZapCalosc  = headers.indexOf('Zapłacone całość');
  const colPodzielona = headers.indexOf('Podzielona wpłata');

  if ([colUID, colProd, colStatus, colZapCalosc, colPodzielona].some(i => i === -1)) {
    throw new Error('Brakuje wymaganych kolumn (UnikalnyID/Nazwa produktu/Status/Zapłacone/Podzielona).');
  }

  // grupowanie po nazwie produktu
  const byProd = {};
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const prod = String(row[colProd] || '').trim();
    if (!prod) continue;
    if (!byProd[prod]) byProd[prod] = [];
    byProd[prod].push(row);
  }

  const prodNames = Object.keys(byProd);
  for (let p = 0; p < prodNames.length; p++) {
    const prodName = prodNames[p];
    const list = byProd[prodName];

    const sh = _getOrCreateProductSheet_(prodName, headers);
    const headersP = sh.getDataRange().getValues()[0];
    const width = headers.length;

    const colUIDp        = headersP.indexOf('UnikalnyID');
    const colStatusP     = headersP.indexOf('Status zamówienia');
    const colZapCaloscP  = headersP.indexOf('Zapłacone całość');
    const colPodzielonaP = headersP.indexOf('Podzielona wpłata');

    if ([colUIDp, colStatusP, colZapCaloscP, colPodzielonaP].some(i => i === -1)) {
      throw new Error('Brakuje wymaganych kolumn w zakładce: ' + prodName);
    }

    // indeks UID -> nr wiersza (2-indexed)
    const idx = _buildUidIndex(sh, colUIDp);

    for (let i = 0; i < list.length; i++) {
      const newRow = list[i];
      const uid = String(newRow[colUID] || '');

      if (!uid) {
        // INSERT pełnego wiersza
        sh.appendRow(newRow);
        const nr = sh.getLastRow();
        try { dodajRegulyDlaWiersza_i_Arkusza(nr, prodName); } catch (e) {}
        _kolorujBC_wZakladce_(sh, nr, newRow[colStatus], newRow[colZapCalosc]);
        continue;
      }

      const hitRow = idx[uid];
      if (!hitRow) {
        sh.appendRow(newRow);
        const nr = sh.getLastRow();
        try { dodajRegulyDlaWiersza_i_Arkusza(nr, prodName); } catch (e) {}
        _kolorujBC_wZakladce_(sh, nr, newRow[colStatus], newRow[colZapCalosc]);
      } else {
        // UPDATE selektywny – tylko wybrane pola
        sh.getRange(hitRow, colStatusP + 1).setValue(newRow[colStatus]);
        sh.getRange(hitRow, colZapCaloscP + 1).setValue(newRow[colZapCalosc]);
        sh.getRange(hitRow, colPodzielonaP + 1).setValue(newRow[colPodzielona]);
        _kolorujBC_wZakladce_(sh, hitRow, newRow[colStatus], newRow[colZapCalosc]);
      }
    }
  }
}




/** Koloruje B:C w zakładce zgodnie z logiką jak w bazie (używa lokalnych kolorów z Kod.gs). */
function _kolorujBC_wZakladce_(sheet, rowNum, status, zaplaconeC) {
  const paid = (zaplaconeC === true || String(zaplaconeC).toUpperCase() === 'TRUE');
  if (paid) {
    sheet.getRange(`B${rowNum}:C${rowNum}`).setBackground(zielony_status);
    return;
  }
  const st = String(status || '').toLowerCase();
  if (st === 'cancelled') {
    sheet.getRange(`B${rowNum}:C${rowNum}`).setBackground(mocnyCzerwony_status);
  } else if (st === 'on-hold') {
    sheet.getRange(`B${rowNum}:C${rowNum}`).setBackground(bialy);
  } else {
    // opcjonalnie: czyścić kolor
    // sheet.getRange(`B${rowNum}:C${rowNum}`).setBackground(null);
  }
}




/**
 * Synchronizuje WYŁĄCZNIE rekordy z pustym UnikalnyID:
 * - INSERT pełnego wiersza do zakładki (wg "Nazwa produktu"),
 * - po udanym wpisie nadaje nowy UID (max+1) w BAZIE i ZAKŁADCE.
 */
function syncUnsyncedRows() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const baseSh = ss.getSheetByName("Baza zamowien z organicflow");
    if (!baseSh) throw new Error("Brak arkusza głównego");

    const baseAll = baseSh.getDataRange().getValues();
    const headers = baseAll.shift();

    const colUID   = headers.indexOf("UnikalnyID");
    const colProd  = headers.indexOf("Nazwa produktu");
    const colStatus    = headers.indexOf("Status zamówienia");
    const colZapCalosc = headers.indexOf("Zapłacone całość");
    const colItemId    = headers.indexOf("item id");
    if ([colUID, colProd, colStatus, colZapCalosc].some(i => i === -1)) {
      throw new Error("Brak kluczowych kolumn (UnikalnyID/Nazwa produktu/Status/Zapłacone).");
    }

    // max UID
    let maxUID = 0;
    for (let i = 0; i < baseAll.length; i++) {
      const n = Number(baseAll[i][colUID]);
      if (!isNaN(n) && n > maxUID) maxUID = n;
    }

    // tylko puste UID z produktem
    const toMove = [];
    for (let i = 0; i < baseAll.length; i++) {
      const row = baseAll[i];
      if ((row[colUID] === "" || row[colUID] == null) && String(row[colProd] || "").trim() !== "") {
        toMove.push({ baseRowNum: i + 2, values: row.slice(), productName: String(row[colProd]).trim() });
      }
    }
    if (!toMove.length) return;

    // dedupe cache per product sheet (unikamy duplikatów przy sync z pustym UID)
    const dedupeCache = {};
    function makeRowDedupeKey(row) {
      // preferowany klucz: item id + cechy osoby
      if (colItemId !== -1 && String(row[colItemId] || "").trim() !== "") {
        const mail = String(row[headers.indexOf("E-mail")] || "").trim().toLowerCase();
        const rola = String(row[headers.indexOf("Pan/Pani")] || "").trim().toLowerCase();
        const imie = String(row[headers.indexOf("Imię")] || "").trim().toLowerCase();
        const nazw = String(row[headers.indexOf("Nazwisko")] || "").trim().toLowerCase();
        return `item:${String(row[colItemId]).trim()}|${mail}|${rola}|${imie}|${nazw}`;
      }
      // fallback: prawie cały wiersz poza UID
      return row.map((v, idx) => idx === colUID ? "" : String(v || "").trim()).join("||");
    }

    function getSheetDedupeIndex(prodSh) {
      const sheetName = prodSh.getSheetName();
      if (dedupeCache[sheetName]) return dedupeCache[sheetName];

      const idx = {};
      const lr = prodSh.getLastRow();
      if (lr > 1) {
        const data = prodSh.getRange(2, 1, lr - 1, headers.length).getValues();
        data.forEach((r, i) => {
          const key = makeRowDedupeKey(r);
          if (!idx[key]) {
            idx[key] = {
              rowNum: i + 2,
              uid: r[colUID]
            };
          }
        });
      }
      dedupeCache[sheetName] = idx;
      return idx;
    }

    // przenoszenie
    toMove.forEach(it => {
      const prodSh = _getOrCreateProductSheet_(it.productName, headers);
      const idx = getSheetDedupeIndex(prodSh);
      const key = makeRowDedupeKey(it.values);

      // DUPLIKAT: nie dodawaj nowego wiersza; jeśli baza nie ma UID, odziedzicz UID z zakładki
      if (idx[key]) {
        const dupUID = Number(idx[key].uid);
        if (!isNaN(dupUID) && dupUID > 0) {
          baseSh.getRange(it.baseRowNum, colUID + 1).setValue(dupUID);
        } else {
          maxUID += 1;
          baseSh.getRange(it.baseRowNum, colUID + 1).setValue(maxUID);
          prodSh.getRange(idx[key].rowNum, colUID + 1).setValue(maxUID);
          idx[key].uid = maxUID;
        }
        return;
      }

      prodSh.appendRow(it.values);
      const targetRow = prodSh.getLastRow();

      // nadaj nowy UID (max+1) w bazie i zakładce
      maxUID += 1;
      baseSh.getRange(it.baseRowNum, colUID + 1).setValue(maxUID);
      prodSh.getRange(targetRow,    colUID + 1).setValue(maxUID);

      // walidacje
      try { dodajRegulyDlaWiersza_i_Arkusza(targetRow, it.productName); } catch (e) {}

      // spójność wizualna: B:C
      const statusVal = it.values[colStatus];
      const zaplaconeVal = it.values[colZapCalosc];
      _kolorujBC_wZakladce_(prodSh, targetRow, statusVal, zaplaconeVal);

      // aktualizuj indeks dedupe po udanym insercie
      idx[key] = { rowNum: targetRow, uid: maxUID };
    });

  } catch (err) {
    Logger.log(err);
    safeAlert("syncUnsyncedRows błąd: " + err);

  } finally {
    lock.releaseLock();
  }
}
