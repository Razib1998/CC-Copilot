# E2E Test – FUSA → CC Intern → Kalender

## 1. Login

`POST /auth/login`

Body:

```json
{
  "email": "test@cc-cockpit.local",
  "password": "test1234"
}
```

→ `access_token` speichern

---

## 2. Auftrag erstellen

`POST /auftraege`

Headers:

- `Authorization: Bearer <TOKEN>`
- `x-project-id: 1`

Body:

```json
{
  "project_id": "1",
  "firma_id": "<ECHTE_FIRMA_ID>",
  "title": "E2E TEST",
  "ist_entwurf": true,
  "termin": "2026-05-01T10:00:00.000Z",
  "termin_ende": "2026-05-01T14:00:00.000Z",
  "fusa_extra_json": {
    "beklebung_termin": "2026-05-01T10:00:00.000Z"
  }
}
```

**Wichtig:**

- `firma_id` muss existieren (z. B. aus `GET /api/v1/firmen` übernehmen; `"1"` nur verwenden, wenn diese Firma im Stamm wirklich existiert).
- `termin` ist Pflicht für die Kalender-Synchronisation (Hauptfeld auf dem Auftrag).

---

## 3. Freigabe

`POST /api/v1/fusa/auftraege/:id/freigeben`

Headers:

- `Authorization: Bearer <TOKEN>`
- `x-project-id: 1`

→ `ccintern_auftrag_id` muss zurückkommen.

---

## 4. CC Intern prüfen

`GET /api/v1/ccintern/auftraege?firma_id=<FIRMA_ID>`

Headers:

- `Authorization: Bearer <TOKEN>`
- `x-project-id: 1`

→ Auftrag muss sichtbar sein (gleiche `firma_id` wie beim Auftrag).

---

## 5. Kalender prüfen

`GET /api/v1/stammdaten/kalender?firma_id=<FIRMA_ID>`

Headers:

- `Authorization: Bearer <TOKEN>`
- `x-project-id: 1`

→ Termin muss sichtbar sein.

---

## Ergebnis

Login funktioniert: JA / NEIN  
Freigabe funktioniert: JA / NEIN  
CC Intern Auftrag erscheint: JA / NEIN  
Kalender sichtbar: JA / NEIN

---

## Merker

- Kalender nutzt aktuell nur: `auftraege.termin` (Sync-Pfad).
- `fusa_extra_json.beklebung_termin` allein reicht **nicht** für den Kalender.
- `firma_id` muss im Stamm existieren; bei gesetztem `users.company_id` kann die API die Firma aus dem User-Kontext vorziehen — für konsistente Listen dieselbe Firma wie beim Auftrag verwenden.
- `x-project-id` beeinflusst die Sicht bei **SUPER_ADMIN** in diesem Ablauf aktuell **nicht** wie eine harte Projektfilterung.
