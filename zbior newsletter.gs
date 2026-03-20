/**
 * KONFIGURACJA - Dostosuj do swoich potrzeb
 */
const CONFIG = {
  // Nazwy arkuszy źródłowych
  arkuszZamowien: "Baza zamowien z organicflow",
  arkuszStareRekordy: "Baza stare rekordy",
  
  // Nazwa arkusza docelowego (baza newslettera)
  arkuszBazaNewslettera: "Baza Newsletter",
  
  // Ustawienia kolumn dla OBU arkuszy
  kolonaNazwisko: "B",        // Nazwisko
  kolonaImie: "C",            // Imię
  kolonaEmail: "E",           // E-mail
  kolonaTelefon: "F",         // Telefon
  kolonaNewslettera: "AV",    // Zgoda na newsletter (TRUE/FALSE)
  pierwszyWiersz: 2,          // Pierwszy wiersz z danymi (pomijamy nagłówki)
};

/**
 * FUNKCJA GŁÓWNA - Uruchamia aktualizację bazy newslettera
 */
function aktualizujBazeNewslettera() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Pobierz lub utwórz arkusz bazy newslettera
  let arkuszBaza = ss.getSheetByName(CONFIG.arkuszBazaNewslettera);
  if (!arkuszBaza) {
    arkuszBaza = utworzArkuszBazy(ss);
  }
  
  // Pobierz aktualną bazę mailingową (maile z zgodą)
  const aktualnaBaza = pobierzAktualnaBaze(arkuszBaza);
  
  // Przetwórz oba arkusze źródłowe
  const noweKontakty1 = przetworzArkusz(ss, CONFIG.arkuszZamowien, aktualnaBaza);
  const noweKontakty2 = przetworzArkusz(ss, CONFIG.arkuszStareRekordy, aktualnaBaza);
  
  // Połącz nowe kontakty z obu źródeł
  const wszystkieNoweKontakty = { ...noweKontakty1, ...noweKontakty2 };
  
  // Dodaj nowe kontakty do bazy
  if (Object.keys(wszystkieNoweKontakty).length > 0) {
    dodajNoweKontaktyDoBazy(arkuszBaza, wszystkieNoweKontakty);
    Logger.log(`✅ Dodano ${Object.keys(wszystkieNoweKontakty).length} nowych kontaktów do bazy`);
  } else {
    Logger.log("ℹ️ Brak nowych kontaktów do dodania");
  }
  
  // Podsumowanie
  const iloscKontaktow = arkuszBaza.getLastRow() - 1; // -1 bo nagłówek
  Logger.log(`📊 Aktualna baza zawiera: ${iloscKontaktow} unikalnych kontaktów z zgodą`);
}

/**
 * Tworzy nowy arkusz dla bazy newslettera
 */
function utworzArkuszBazy(ss) {
  const arkusz = ss.insertSheet(CONFIG.arkuszBazaNewslettera);
  
  // Dodaj nagłówki
  arkusz.getRange("A1:F1").setValues([
    ["Nazwisko", "Imię", "E-mail", "Telefon", "Data dodania", "Źródło"]
  ]);
  
  // Formatowanie nagłówków
  arkusz.getRange("A1:F1")
    .setFontWeight("bold")
    .setBackground("#4285f4")
    .setFontColor("white");
  
  // Zamroź pierwszy wiersz
  arkusz.setFrozenRows(1);
  
  // Ustaw szerokości kolumn dla lepszej czytelności
  arkusz.setColumnWidth(1, 120); // Nazwisko
  arkusz.setColumnWidth(2, 100); // Imię
  arkusz.setColumnWidth(3, 200); // E-mail
  arkusz.setColumnWidth(4, 120); // Telefon
  arkusz.setColumnWidth(5, 150); // Data dodania
  arkusz.setColumnWidth(6, 200); // Źródło
  
  Logger.log("✨ Utworzono nowy arkusz: " + CONFIG.arkuszBazaNewslettera);
  return arkusz;
}

/**
 * Pobiera aktualną bazę mailingową do obiektu (dla szybkiego wyszukiwania)
 */
function pobierzAktualnaBaze(arkuszBaza) {
  const baza = {};
  const lastRow = arkuszBaza.getLastRow();
  
  if (lastRow < 2) return baza; // Brak danych poza nagłówkiem
  
  const dane = arkuszBaza.getRange(2, 3, lastRow - 1, 1).getValues(); // Kolumna C (E-mail)
  
  dane.forEach(row => {
    const email = row[0].toString().trim().toLowerCase();
    if (email) {
      baza[email] = true;
    }
  });
  
  Logger.log(`📖 Wczytano bazę: ${Object.keys(baza).length} kontaktów`);
  return baza;
}

/**
 * Przetwarza pojedynczy arkusz i zwraca nowe kontakty ze zgodą
 */
function przetworzArkusz(ss, nazwaArkusza, aktualnaBaza) {
  const arkusz = ss.getSheetByName(nazwaArkusza);
  if (!arkusz) {
    Logger.log(`⚠️ Nie znaleziono arkusza: ${nazwaArkusza}`);
    return {};
  }
  
  const lastRow = arkusz.getLastRow();
  if (lastRow < CONFIG.pierwszyWiersz) {
    Logger.log(`ℹ️ Brak danych w arkuszu: ${nazwaArkusza}`);
    return {};
  }
  
  // Pobierz numery kolumn
  const kolNazwisko = literaKolumnyNaNumer(CONFIG.kolonaNazwisko);
  const kolImie = literaKolumnyNaNumer(CONFIG.kolonaImie);
  const kolEmail = literaKolumnyNaNumer(CONFIG.kolonaEmail);
  const kolTelefon = literaKolumnyNaNumer(CONFIG.kolonaTelefon);
  const kolNewsletter = literaKolumnyNaNumer(CONFIG.kolonaNewslettera);
  
  const ileWierszy = lastRow - CONFIG.pierwszyWiersz + 1;
  
  // Pobierz dane z każdej kolumny
  const nazwiska = arkusz.getRange(CONFIG.pierwszyWiersz, kolNazwisko, ileWierszy, 1).getValues();
  const imiona = arkusz.getRange(CONFIG.pierwszyWiersz, kolImie, ileWierszy, 1).getValues();
  const maile = arkusz.getRange(CONFIG.pierwszyWiersz, kolEmail, ileWierszy, 1).getValues();
  const telefony = arkusz.getRange(CONFIG.pierwszyWiersz, kolTelefon, ileWierszy, 1).getValues();
  const zgody = arkusz.getRange(CONFIG.pierwszyWiersz, kolNewsletter, ileWierszy, 1).getValues();
  
  const noweKontakty = {};
  let licznikNowych = 0;
  
  // Przetwarzaj wiersze
  for (let i = 0; i < maile.length; i++) {
    const email = maile[i][0].toString().trim().toLowerCase();
    const zgoda = zgody[i][0];
    
    // Sprawdź czy email jest poprawny i czy jest zgoda
    if (email && email.includes("@") && czyZgoda(zgoda)) {
      // Sprawdź czy mail już NIE jest w bazie
      if (!aktualnaBaza[email]) {
        noweKontakty[email] = {
          nazwisko: nazwiska[i][0].toString().trim(),
          imie: imiona[i][0].toString().trim(),
          email: email,
          telefon: telefony[i][0].toString().trim(),
          dataDodania: new Date(),
          zrodlo: nazwaArkusza
        };
        licznikNowych++;
      }
    }
  }
  
  Logger.log(`📋 ${nazwaArkusza}: znaleziono ${licznikNowych} nowych kontaktów`);
  return noweKontakty;
}

/**
 * Sprawdza czy wartość oznacza zgodę
 */
function czyZgoda(wartosc) {
  if (typeof wartosc === 'boolean') {
    return wartosc === true;
  }
  
  const str = wartosc.toString().trim().toLowerCase();
  return str === 'true' || str === 'tak' || str === 'yes' || str === '1';
}

/**
 * Dodaje nowe kontakty do arkusza bazy
 */
function dodajNoweKontaktyDoBazy(arkuszBaza, noweKontakty) {
  const kontaktyArray = Object.values(noweKontakty);
  
  if (kontaktyArray.length === 0) return;
  
  const dane = kontaktyArray.map(k => [
    k.nazwisko,
    k.imie,
    k.email,
    k.telefon,
    k.dataDodania,
    k.zrodlo
  ]);
  
  const ostatniWiersz = arkuszBaza.getLastRow();
  arkuszBaza.getRange(ostatniWiersz + 1, 1, dane.length, 6).setValues(dane);
  
  Logger.log(`➕ Dodano ${dane.length} nowych kontaktów do bazy`);
}

/**
 * Konwertuje literę kolumny na numer (A=1, B=2, ... AV=48)
 */
function literaKolumnyNaNumer(litera) {
  let numer = 0;
  for (let i = 0; i < litera.length; i++) {
    numer = numer * 26 + (litera.charCodeAt(i) - 64);
  }
  return numer;
}

/**
 * USTAWIENIE AUTOMATYCZNEGO TRIGGERA
 * Uruchom tę funkcję raz, aby ustawić codzienną aktualizację
 */
function ustawCodzienna_Aktualizacje() {
  // Usuń stare triggery (jeśli istnieją)
  const triggery = ScriptApp.getProjectTriggers();
  triggery.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'aktualizujBazeNewslettera') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Utwórz nowy trigger - codziennie o 2:00 w nocy
  ScriptApp.newTrigger('aktualizujBazeNewslettera')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .create();
  
  Logger.log("⏰ Ustawiono codzienną aktualizację o 2:00");
}

/**
 * FUNKCJA TESTOWA - Możesz uruchomić manualnie
 */
function testujSkrypt() {
  Logger.log("🧪 Rozpoczynam test...");
  aktualizujBazeNewslettera();
  Logger.log("✅ Test zakończony");
}
