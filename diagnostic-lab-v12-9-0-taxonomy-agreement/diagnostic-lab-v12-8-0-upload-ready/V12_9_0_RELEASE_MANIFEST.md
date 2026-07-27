# V12.9.0 — Diagnostic Accuracy (SVA + Outweigh) & Admin Security

Status: **all corrections wired into production code and verified end-to-end.** No dormant module.
Do not deploy automatically.

## 1. Starting version
package.json / appVersion **12.8.3 → 12.9.0**. `rubricVersion` unchanged (scoring criteria unchanged).
`grammarValidatorVersion` → `syntactic-head-agreement-v12.9.0` (grammar logic changed).
`routeClassifierVersion` unchanged (`task2RouteModel.js` untouched).

## 2. Diagnostic accuracy

### FATAL fixed — subject–verb agreement false positive (§7)
Root cause: the quantifier rule matched `a number of` only when "number" sat at token index 1, so
`an **increasing** number of residents have` fell through and was treated as singular — producing the
harmful "correction" `have → has`.

Fix (`domain/agreementValidator.js`): quantifier-construction-aware analysis.
- `a/an [adjective]* number|percentage|proportion|majority|minority of + plural noun` → **plural verb**
- `the [adjective]* <same heads> of + plural noun` → **singular verb**
- `range / variety / amount / couple / handful / series / total` → both agreements occur in accepted
  usage → **never asserted**

Verified on 13 cases: every "must not flag" case passes, and the genuine defect
`the promotion of ... shops **are** vital` is still detected with correction `is`.

### Outweigh is a prompt subtype, never a top-level essay type (§1)
`domain/task2Safety.js` now returns `promptSubtype: "outweigh"`, `outweighDirection:
"disadvantages" | "advantages" | "unspecified"` and `comparisonRequired: true`, while `essayType`
stays `advantages-disadvantages` / "Advantages & Disadvantages". The subtype label changed from
"Advantages Outweigh Disadvantages" to "Advantages & Disadvantages (Outweigh)" so it can never read as
a separate type. A plain A&D prompt carries no subtype and `comparisonRequired: false`.

### Eva fixture through the REAL pipeline
`essayType: Advantages & Disadvantages` · false `have → has`: **false** · genuine `promotion…are`
detected · Student View `taskSubtype: "Advantages & Disadvantages"`.
Artifacts: `eva-pipeline-canonical.json`, `eva-pipeline-student-view.json`.

## 3. Admin security (§16–§21)
- **`/admin` access**: anonymous → **302 redirect to `/?next=/admin`** (login page; no admin data is
  rendered); signed-in non-admin → **403 JSON** `ADMIN_REQUIRED`; admin → allowed. Decided server-side
  from the session cookie only. The redirect target is a fixed internal path (no open redirect).
- **Every `/api/admin/*` route** goes through `requireAdmin`: anonymous **401**, non-admin **403**,
  always JSON, error code `ADMIN_REQUIRED`. Browser-supplied role headers cannot escalate.
- **Account lifecycle** (`POST`/`DELETE` only, never GET): `archive` · `restore` · `delete`.
  Permanent delete requires the username typed exactly plus an explicit report mode: `anonymise`
  (default — keeps the analytical record, strips identity and the student's writing) or `delete`. It
  also removes student profiles, deletes the account's QA snapshots, and **revokes the account's
  outstanding sessions immediately**.
- **Safety rails**: an admin can neither archive nor delete the account they are signed in with, and
  the last active admin cannot be removed (`ADMIN_PROTECTED`, HTTP 409).
- **Pagination / search / filter / sort** on `/api/admin/users`: default view is **active accounts
  only**; `status` (active|disabled|archived|expired|all), `role`, `q`, `sort`
  (newest|oldest|last-login|expiry|used), `page`, `pageSize` (max 100). Payload is always bounded and
  reports `total` / `totalPages`.
- **Admin audit log** `/api/admin/audit-log` (paginated, searchable): eventId, timestamp, admin
  account, action, target, result, redacted metadata. Never stores passwords, hashes, cookies, keys or
  student text.
- **Session hardening**: HttpOnly + SameSite=Lax + Secure in production + bounded Max-Age (already
  present, now asserted by test).
- **Login throttling**: per-account failure counter → **429 `RATE_LIMITED`** after repeated failures,
  reset on success, other accounts unaffected. Configurable via `LOGIN_MAX_FAILURES` /
  `LOGIN_LOCKOUT_MS`.
- **Admin UI**: Archive / Restore / Delete… buttons per row, typed-confirmation prompt and an explicit
  reports choice; `archived` added to the status selector.

## 4. Tests — exact commands and results
```
node scripts/check-source.mjs                                       -> 86 JavaScript modules
node scripts/build-static-preview.mjs && node scripts/run-tests.mjs  -> Test suite passed: 32 files
node tests/v12-9-0-taxonomy-agreement.test.mjs                       -> pass
node tests/v12-9-0-admin-security.test.mjs                           -> pass
```
Two pre-existing assertions were updated (not weakened) because §16 mandates 401-for-anonymous and
403-for-non-admin where the older tests asserted 403 for both; they still assert that access is denied.

## 5. Files changed / untouched
**New:** `tests/v12-9-0-taxonomy-agreement.test.mjs`, `tests/v12-9-0-admin-security.test.mjs`.

**Changed:** `domain/agreementValidator.js`, `domain/task2Safety.js`, `services/apiRouter.js`
(requireAdmin codes, user-list pagination/filtering, archive/restore/delete, audit log, session
revocation, login throttle), `services/storage.js` (`archived` status, `deleteUser`), `server.js`
(/admin redirect + access classification), `admin.js` / `styles.css` (lifecycle UI),
`services/analysisVersions.js` + `package.json` + `package-lock.json` (12.9.0).

**Deliberately untouched:** scoring calibration, rubric, prompt and taxonomy versions, route model,
LFC-CPC / SAR / TEEL, Task 1 visual logic, async-render, quotas, ownership, PDF layout, the canonical
integrity wiring (still live: 2 refs in `aiAnalyzer.js`), and **branding, domain and pricing**.

## 6. Deployment
GitHub path `/diagnostic-lab-v12-8-0-upload-ready/package.json` · Render Root Directory
`diagnostic-lab-v12-8-0-upload-ready` · `npm install` / `npm start` · confirm `/api/health` →
`"appVersion":"12.9.0"`.

**Environment (still required — this is what currently breaks production):**
`DIAGNOSTIC_ANALYSIS_MODE=async-render`, `OPENAI_MAX_OUTPUT_TOKENS=16000`,
`OPENAI_TIMEOUT_MS=600000`, `OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000`.

**Rollback:** redeploy the previous commit. `archived` is an additive status and `deleteUser` runs only
on an explicit admin action, so existing data is unaffected by the upgrade itself.

## 7. Remaining limitations (honest)
1. **CSRF tokens not implemented.** Mitigations in place: `SameSite=Lax` cookies and destructive
   actions restricted to POST/DELETE with a JSON body and typed confirmation. A dedicated token should
   still be added before treating the admin console as fully hardened.
2. **Audit log is per-process** (bounded in memory, mirrored into the durable usage-audit trail). A
   restart clears the in-memory view; a dedicated durable audit store is the next step.
3. **§4–§15 diagnostic items not addressed**: route presence vs comparative weighing as separate
   dimensions, Eva TR/CC calibration, Reference Control taxonomy, conclusion function vs language, and
   SAR-vs-development consistency.
4. **No real gpt-5.6-sol run and no PDF regeneration** in this environment (no key; no Chromium and no
   PDF text extractor). Provider and PDF gates remain PENDING.

## 8. Verdict — CONDITIONAL PASS
Both FATAL items in scope are fixed and verified (no false `have → has`; Outweigh is a subtype), admin
authentication and authorization are enforced server-side on every surface with archive/restore,
guarded delete, audit logging and pagination, production wiring is enabled, and 32 test files pass.
**Not a full PASS**: CSRF tokens, durable audit storage, the remaining §4–§15 accuracy items and the
real-provider/PDF gates are outstanding. Do not claim commercial readiness from automated tests alone.


---

# ภาคผนวก: คู่มือติดตั้งภาษาไทย (V12.9.0)

# คู่มือติดตั้ง V12.9.0 (ภาษาไทย)

## 1. แก้ค่า Environment บน Render ก่อน (สำคัญที่สุด — แก้ปัญหา PROVIDER_TIMEOUT)
ตอนนี้ production ยังเป็น `analysisMode: "sync"` + `timeoutMs: 180000` + `maxOutputTokens: 8000`
ทำให้วิเคราะห์ไม่ผ่านทุกครั้ง (และเว็บอยู่หลัง Cloudflare ที่ตัดที่ ~100 วินาที)

ไปที่ Render → Settings → Environment แล้วตั้ง:
```
DIAGNOSTIC_ANALYSIS_MODE=async-render
OPENAI_MAX_OUTPUT_TOKENS=16000
OPENAI_TIMEOUT_MS=600000
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
```
กด Save (restart เอง ~1 นาที)

ตรวจ: `/api/health` ต้องได้ `"analysisMode":"async-render"` และ `"timeoutMs":600000`

## 2. อัปโหลดขึ้น GitHub
- แตก ZIP ลงโฟลเดอร์ว่าง
- อัปเนื้อหาในโฟลเดอร์ `diagnostic-lab-v12-8-0-upload-ready` ทับของเดิม
- ตำแหน่งที่ต้องมี: `/diagnostic-lab-v12-8-0-upload-ready/package.json`
- อย่าสร้างโฟลเดอร์เวอร์ชันซ้อน · อย่าอัปตัว ZIP
- commit เข้า `main`

## 3. Render settings (เดิม ไม่เปลี่ยน)
```
Root Directory : diagnostic-lab-v12-8-0-upload-ready
Build Command  : npm install
Start Command  : npm start
```
ตรวจ: `/api/health` → `"appVersion":"12.9.0"`

## 4. เข้า /admin ไม่ได้?
`/admin` ป้องกันที่ฝั่งเซิร์ฟเวอร์อยู่แล้ว (ต้องมี session ที่ role = admin)
ถ้าขึ้น `{"ok":false,"error":"Admin access is required."}` แปลว่า:
- ยังไม่ได้ล็อกอินในแท็บนั้น → ล็อกอินที่หน้าแรกก่อน แล้วค่อยเปิด /admin
- หรือบัญชีที่ใช้ role ไม่ใช่ `admin` → ต้องตั้ง role เป็น admin ในไฟล์ users

## 5. Rollback
Deploy commit เดิมที่ Render · รายงาน/ประวัติ/เครดิตเดิมไม่ถูกแตะ
