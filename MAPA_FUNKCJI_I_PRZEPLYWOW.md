# Mapa funkcji, powiązań i skutków działania skryptów

Dokument opisuje **kolejność działania**, **zależności funkcji** i **skutki uboczne** (zapis/formatowanie/trigger/logi) dla plików:
- `refaktoryzacja_doPost.gs` (webhook queue + worker)
- `Kod.gs` (menu, sync zakładek, narzędzia arkusza)
- `zbior newsletter.gs` (aktualizacja bazy newslettera)

---

## 1) Główny przepływ webhooków (WooCommerce -> Apps Script)

### 1.1 Wejście HTTP
1. `doPost(e)` odbiera webhook.
2. `doPost` zapisuje payload do `WebhookQueue` przez `_enqueueWebhook_`.
3. `doPost` zwraca szybkie `OK`.

**Skutek:** Woo dostaje szybką odpowiedź; ciężkie operacje nie blokują requestu.

### 1.2 Kolejka i worker
1. Trigger czasowy uruchamia `processWebhookQueueBatch(limit)`.
2. Worker czyta rekordy z `WebhookQueue` i bierze stany `NEW/ERROR/PROCESSING`.
3. Dla każdego rekordu:
   - oznacza `PROCESSING`,
   - uruchamia `_processWebhookCore_`,
   - po sukcesie daje `DONE`, po błędzie `ERROR`.
4. Worker ma timebox (`WEBHOOK_BATCH_MAX_MS`) i limit prób (`MAX_QUEUE_ATTEMPTS`).

**Skutek:** przetwarzanie asynchroniczne, odporność na timeouty i retry.

### 1.3 Ciężkie przetwarzanie zamówienia
`_processWebhookCore_`:
1. Parsuje payload (`parsujWebhook`) i metadane pozycji (`parsujMetaDane`).
2. Wyszukuje istniejące wiersze po `item id` (`znajdzWierszePoItemIdAll`) i doprecyzowuje po roli+email (`odfiltrujWgRoliIEmail`).
3. Aktualizuje istniejące rekordy (`aktualizujIstniejaceWiersze` -> `zaktualizujWiersz`) lub dopisuje brakujące (`zbudujWierszOsoby` + `dodajNoweWiersze`).
4. Zbiera dotknięte wiersze i wywołuje `_upsertRowsDelta_` (aktualizacja zakładek produktowych).
5. Nakłada kolory/checkboxy (`ustawKoloryIZnaczenia`) i wykonuje cleanup tekstu (`TextFinder`).

**Skutek:** baza główna + zakładki produktowe są aktualizowane i formatowane.

---

## 2) Funkcje i skutki — `refaktoryzacja_doPost.gs`

### Logowanie
- `wewnetrznyLogger`, `logujInfo`, `logujBlad`
  - zapisują logi do arkusza `Logi bledow`.
  - wykorzystywane przez `doPost` i worker.

### Parsowanie i normalizacja
- `pobierzIndeksyKolumn`
  - pobiera arkusz główny i mapę nagłówków -> indeksy kolumn.
- `parsujWebhook`
  - mapuje order-level dane payloadu, coupon summary, line items.
- `parsujMetaDane`
  - wyciąga pola uczestnika/uczestników (solo/couple), dietę, nocleg, zadatek, role.
- `_toTimestamp_`
  - normalizuje datę do timestampu (obsługa formatów z `T` i ze spacją).

### Szukanie i aktualizacja rekordów
- `znajdzWierszePoItemIdAll`
  - wyszukuje wszystkie wiersze po `item id`.
- `odfiltrujWgRoliIEmail`
  - zawęża rekordy po roli i e-mailu.
- `aktualizujIstniejaceWiersze`
  - aktualizuje rekord tylko jeśli status się zmienił,
  - **nie nadpisuje**, gdy event ma starsze `date_modified` od zapisanej `Data modyfikacji`.
- `zaktualizujWiersz`
  - aktualizuje status, `Data modyfikacji`, checkboxy i kolor B:C.

### Insert nowych rekordów
- `zbudujWierszOsoby`
  - buduje pełny wiersz docelowy na podstawie order/item/meta.
- `dodajNoweWiersze`
  - hurtowy `setValues`, ustawienie checkboxów i kolorów dla nowych rekordów.

### Formatowanie masowe
- `ustawKoloryIZnaczenia`
  - stosuje odłożone operacje koloru i checkboxów.

### Kolejka webhooków
- `_getOrCreateQueueSheet_`
  - tworzy/otwiera zakładkę `WebhookQueue`.
- `_extractOrderId_`
  - odczytuje `order_id` z surowego JSON.
- `_enqueueWebhook_`
  - zapisuje rekord kolejki (`NEW`, payload, metadane).
- `doPost`
  - szybki ACK + enqueue.
- `processWebhookQueueBatch`
  - przetwarza kolejkę z lockiem, limitem prób i timeboxem.
- `_processWebhookCore_`
  - pełna logika biznesowa (dawny „ciężki” doPost).

---

## 3) Funkcje i skutki — `Kod.gs`

### Globalne helpery i konfiguracje
- `spr`, `index_col`, `dane_col_glowne`
  - helpery dostępu do danych i logowania.
- Stałe kolumn/kolorów/reguł
  - sterują formatowaniem i logiką prezentacji.

### UI i formatowanie
- `trigOnOpen`, `dodajMenu`
  - dodają menu użytkownika.
- `ustaw_Kolor_i_blokowanie`, `ustawienieBlokowania`, `ustawFormatowanieWarunkowe`
  - zamrożenia + reguły formatowania warunkowego.
- `dodajRegulyDlaWiersza_i_Arkusza`
  - walidacje (checkbox/lista) na konkretnym wierszu.

### Narzędzia finansowe
- `liczKontoGotowka`
  - podsumowanie wpłat gotówka/konto z alertami UI.
- `sprawdzCzyZaplaconeCaloscIkoloruj`
  - wylicza i oznacza opłacenie całości.

### Sync statusów z bazy do zakładki produktu
- `_syncSheetFromBase_(sheetName)`
  - dla aktywnej zakładki aktualizuje: `Status zamówienia`, `Zapłacone całość`, `Podzielona wpłata` po UID.
- `updateProductsInBase`
  - uruchamia powyższy sync dla aktywnej zakładki.

### Sync rekordów niesynchronizowanych
- `syncUnsyncedRows`
  - bierze rekordy z pustym `UnikalnyID`, dopisuje je do zakładek produktu, nadaje UID,
  - ma lock i timebox (`SYNC_UNSYNCED_MAX_MS`), by nie przekroczyć limitu czasu.
- `addProductToLocalBase`
  - manualne uruchomienie syncUnsyncedRows.

### Delta-upsert do zakładek
- `_getOrCreateProductSheet_`, `_buildUidIndex`
  - przygotowanie zakładki i indeksu UID.
- `_upsertRowsDelta_`
  - insert nowych rekordów lub update pól statusowych, jeśli UID istnieje.
- `_kolorujBC_wZakladce_`
  - kolorowanie B:C wg statusu/opłacenia.

### CRON/Trigger helpery
- `cronSyncZakladek`
  - lock + syncUnsyncedRows.
- `utworzTriggerCo6h`, `usunTriggerySync`
  - zarządzanie triggerem CRON syncu co 6h.

### Bezpieczne UI
- `safeAlert`
  - alert tylko gdy UI dostępne.

---

## 4) Funkcje i skutki — `zbior newsletter.gs`

### Główny przepływ
- `aktualizujBazeNewslettera`
  - orchestrator: odczyt baz, skan zakładek, wykrycie nowych kontaktów, dopisanie do bazy newslettera.

### Przygotowanie i odczyt
- `utworzArkuszBazy`
  - tworzy zakładkę bazy newslettera z nagłówkami.
- `pobierzAktualnaBaze`
  - buduje set/mapę istniejących kontaktów.

### Przetwarzanie zakładek
- `przetworzArkusz`
  - wyciąga rekordy z jednej zakładki i filtruje po zgodzie.
- `czyZgoda`
  - normalizuje/rozpoznaje wartości zgody.

### Zapis i narzędzia
- `dodajNoweKontaktyDoBazy`
  - hurtowy zapis nowych kontaktów.
- `literaKolumnyNaNumer`
  - helper konwersji litery kolumny na numer.
- `ustawCodzienna_Aktualizacje`
  - tworzy trigger dzienny.
- `testujSkrypt`
  - helper testowy.

---

## 5) Powiązania między plikami (najważniejsze)

1. `refaktoryzacja_doPost.gs::_processWebhookCore_` -> `Kod.gs::_upsertRowsDelta_`
   - to kluczowe połączenie bazy głównej z zakładkami produktowymi po webhooku.

2. `Kod.gs::syncUnsyncedRows` oraz `Kod.gs::_upsertRowsDelta_`
   - oba mogą zapisywać do zakładek produktu, ale służą różnym scenariuszom:
     - `syncUnsyncedRows`: backfill rekordów bez UID,
     - `_upsertRowsDelta_`: bieżące update/inserty po webhooku.

3. `zbior newsletter.gs`
   - działa niezależnie od webhook queue, bazując na danych już zapisanych w arkuszach.

---

## 6) Najważniejsze skutki uboczne (operacyjne)

- Tworzone/aktualizowane zakładki: `WebhookQueue`, `Logi bledow`, zakładki produktowe.
- Tworzone triggery: sync zakładek co 6h (`cronSyncZakladek`) i opcjonalne trigger-y newslettera.
- Operacje lock: `processWebhookQueueBatch`, `syncUnsyncedRows`, `cronSyncZakladek`.
- Ryzyka kontrolowane przez kod:
  - timeouty -> timebox,
  - out-of-order webhooki -> porównanie `date_modified`.

---

## 7) Szybka ściąga „co uruchamiać kiedy”

- Webhook endpoint: `doPost` (automatycznie przez Woo).
- Worker kolejki: `processWebhookQueueBatch` (trigger czasowy).
- Sync ręczny z bazy do zakładek: `addProductToLocalBase`.
- Sync statusów aktywnej zakładki z bazy: `updateProductsInBase`.
- CRON sync zakładek co 6h: `utworzTriggerCo6h`.
- Newsletter aktualizacja: `aktualizujBazeNewslettera`.

