# Analiza przepływu webhooków WooCommerce → Google Apps Script

Data: 2026-03-20

## 1) Problem biznesowo-techniczny

Na podstawie dostarczonych danych i kodu:

- WooCommerce (Action Scheduler) oznacza część zadań `woocommerce_deliver_webhook_async` jako `Failed` po **300 sekundach**.
- Jednocześnie rekordy zamówień pojawiają się poprawnie w arkuszu, co oznacza, że logika przetwarzania działa, ale odpowiedź HTTP dla webhooka bywa zbyt wolna.
- Główną przyczyną jest ciężkie przetwarzanie wewnątrz `doPost(e)` przed zwróceniem `OK`.

## 2) Jak aktualnie działa kod (stan obecny)

## 2.1 Wejście webhooka

`doPost(e)`:

1. Pobiera lock skryptu (`waitLock(20000)`).
2. Odczytuje nagłówki i mapę kolumn z arkusza głównego.
3. Parsuje payload WooCommerce.
4. Dla każdego `line_item`:
   - parsuje meta (rola, imię, nazwisko, tel, email, dieta, nocleg, zadatek itd.),
   - szuka istniejących wierszy po `item id` + rola + email,
   - aktualizuje istniejące wiersze,
   - dodaje brakujące wiersze,
   - zbiera „dotknięte” wiersze do delta-sync.
5. Odpala `_upsertRowsDelta_` do zakładek produktowych.
6. Ustawia kolory i checkboxy.
7. Czyści fragmenty tekstu przez `TextFinder`.
8. Dopiero na końcu zwraca `OK`.

To jest poprawne biznesowo, ale czasowo ryzykowne przy większym obciążeniu.

## 2.2 Dlaczego timeout pojawia się mimo poprawnego zapisu

Jeżeli Apps Script nie odpowie HTTP odpowiednio szybko, WooCommerce nie ma pewności czy webhook został doręczony i oznacza zadanie jako `Failed`, nawet jeśli po stronie arkusza część operacji zakończyła się sukcesem.

## 3) Mapowanie pól (z dostarczonych przykładów 7655 i 7656)

## 3.1 Klucze z payloadu i ich rola

### Zamówienie (order-level)
- `id` → kolumna `ID`
- `number` → `ID zamówienia`
- `status` → `Status zamówienia`
- `total` → `Wartość zamówienia`
- `payment_method_title` → `Sposób płatności`
- `order_key` → `Klucz zamówienia`
- `date_created` → `Data zamowienia`
- `date_modified` → `Data modyfikacji`
- `customer_note` → `Notka klienta`
- `discount_total` + `coupon_lines` → `Rabat/kupon`

### Pozycja zamówienia (line-item-level)
- `line_items[].id` → `item id`
- `line_items[].product_id` → `ID produktu`
- `line_items[].quantity` → `Ilość sztuk produktu`
- `line_items[].total` → `Wartość pozycji` (z uwzględnieniem logiki zadatku)
- `line_items[].name` i `parent_name` → `Nazwa produktu` / `Nazwa produktu z wariantem`

### Dane osoby (meta_data pozycji)
- `Imię`, `Nazwisko`, `Email`, `Telefon`
- `Rola uczestnika/czki` → `Pan/Pani`

### Billing/shipping
- `billing.first_name`, `billing.last_name` → `Imie płatnika`, `Nazwisko płatnika`
- `billing.city`, `billing.postcode`, `billing.address_1 + address_2`, `billing.company`

## 3.2 Co potwierdzają Twoje dwa przykłady

Dla order `7655` i `7656`:
- `status = completed` trafia do kolumny statusu,
- `payment_method_title = BLIK` trafia do metody płatności,
- `line_items[0].id = 1844/1845` trafia do `item id`,
- dane uczestnika z `line_items[].meta_data` trafiają poprawnie do osoby/roli,
- `Rabat/kupon` jest poprawnie „Zniżka: 0 PLN”.

Wniosek: mapowanie merytoryczne działa poprawnie, problemem jest model wykonania (czas + współbieżność), a nie sama transformacja danych.

## 4) Docelowy model odporności (proponowany)

## 4.1 Faza A — szybkie potwierdzenie webhooka (ACK)

`doPost(e)` ma robić tylko:

1. wygenerowanie `request_id`,
2. zapis surowego JSON do arkusza `WebhookQueue` (1 wiersz = 1 event),
3. zapis logu „received + queued”,
4. natychmiastowe `200 OK`.

Efekt: WooCommerce dostaje szybką odpowiedź i nie oznacza zadania jako fail z powodu timeoutu.

## 4.2 Faza B — worker asynchroniczny

Oddzielna funkcja (trigger czasowy, np. co 1 min):

1. pobiera batch rekordów z `WebhookQueue` o statusie `NEW`,
2. wykonuje obecną logikę mapowania i zapisów do bazy + zakładek,
3. oznacza event jako `DONE` albo `ERROR`,
4. zapisuje szczegółowy log etapów i czasu.

## 4.3 Idempotencja (ważne przy retry)

Klucz deduplikacji rekomendowany:

- `order_id` + `item_id` + `status` + `date_modified`.

Dodatkowo przechowywać `event_hash` (skrót payloadu) — jeżeli taki już był przetworzony, worker powinien pominąć duplikat (`SKIPPED_DUPLICATE`).

## 5) Logowanie operacyjne (observability)

Dodać 2 zakładki:

1. `WebhookQueue`
   - `request_id`
   - `received_at`
   - `source_event` (np. order.updated/order.created)
   - `order_id`
   - `payload_json`
   - `state` (`NEW`, `PROCESSING`, `DONE`, `ERROR`, `SKIPPED_DUPLICATE`)
   - `attempt_count`
   - `last_error`
   - `processed_at`

2. `WebhookLogs`
   - `ts`
   - `request_id`
   - `order_id`
   - `stage` (`received`, `queued`, `processing_start`, `sheet_write_done`, `done`, `error`)
   - `duration_ms`
   - `message`

## 6) Odpowiedzi na ustalenia z rozmowy

- Timeout 300s potwierdza, że to problem ścieżki HTTP, nie samej logiki danych.
- Włączenie `order.create` i `order.update` będzie bezpieczne tylko przy deduplikacji i kolejce.
- Jedna baza + wiele zakładek jest OK dla modelu queue + worker.
- Pełny JSON warto przechowywać (u Ciebie ma to sens analityczno-diagnostyczny), ale należy ustalić retencję (np. 30/90 dni) i ewentualną anonimizację po czasie.

## 7) Plan wdrożenia (kolejny krok)

1. Dodać `WebhookQueue` i `WebhookLogs`.
2. Przebudować `doPost(e)` na lekki ACK + enqueue.
3. Przenieść aktualne ciężkie przetwarzanie do `processWebhookQueueBatch()`.
4. Dodać deduplikację i retry z limitem prób.
5. Dodać dashboard prostych metryk (ile `DONE/ERROR`, mediany czasu).

## 8) Ryzyka i uwagi

- Bez idempotencji włączenie `order.create` + `order.update` może dublować wpisy.
- Operacje kolorowania i checkboxów nadal są kosztowne; powinny być wykonywane poza krytyczną ścieżką ACK.
- Należy uważać na maksymalny rozmiar pojedynczej komórki przy trzymaniu pełnego JSON; przy dużych payloadach można zapisywać JSON do Drive i w arkuszu trzymać link/ID pliku.

