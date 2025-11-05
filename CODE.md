# PROJECT_OVERVIEW.md

## 1) Назначение документа

Этот файл — **единый контекст** для модели *GPT‑5 Codex* (и для вас) при пошаговой генерации бэкенда и интеграции его с уже готовым фронтендом.
Прочитав документ, Codex должен **полностью понимать архитектуру, требования, API‑контракты, схемы данных, окружение и последовательность шагов**, а также уметь **отмечать выполненные шаги**.

> **Важно:**
>
> * Мы работаем **локально** (без облака).
> * База данных — **Convex (local dev)**.
> * LLM — локальный сервис **KazLLM** (FastAPI + Transformers).
> * Фронтенд — **React + TypeScript + Vite + React Router + Tailwind + shadcn/ui + ECharts** (уже готов).
> * Все комментарии в коде — **на русском языке**.
> * Каждый шаг завершается коммитом.
> * Каждый шаг выполняется **в новом чате** с Codex, и Codex **отмечает его галочкой**.

---

## 2) Краткое описание приложения

**Название:** *AI Agent for Public Transit Complaint Analysis (Astana)*
**Суть:** Веб‑приложение принимает жалобы граждан на казахском/русском, **дособирает недостающие детали** через пошаговые уточнения (slot‑filling), **классифицирует приоритет**, извлекает **кортежи (объект–время–место–аспект)** и формирует **карточку жалобы**. После подтверждения — сохраняет в БД.
**Админ‑панель** визуализирует агрегаты (ECharts): проблемные маршруты, распределение по уровням, частоты аспектов и тепловую карту по времени.

**Источники жалоб:** веб‑лендинг и (опционально) Телеграм‑бот (один общий бэкенд).

---

## 3) Архитектура (локально)

### 3.1 Сервисы и порты

* **Frontend (Vite)**: `http://localhost:8080`
* **Backend API (Node + Express)**: `http://localhost:8787`

  * Эндпоинты `/api/*` (Vite proxy на dev)
* **LLM сервис (Python + FastAPI)**: `http://127.0.0.1:8000`

  * Эндпоинт `/analyze`
* **Convex (local dev)**: URL выдаёт `npx convex dev` (переменная окружения для клиента)

### 3.2 Поток данных

1. Пользователь вводит текст и медиа → фронтенд вызывает `POST /api/analyze`.
2. Backend API проксирует к LLM (`http://127.0.0.1:8000/analyze`) → получает **строгий JSON**: найденные поля + `need_clarification`.
3. Если нужны уточнения — фронт показывает короткие вопросы и повторно вызывает `POST /api/analyze` с накопленными слотами.
4. На шаге «Карточка» пользователь подтверждает → фронт шлёт `POST /api/submit`.
5. Backend API записывает жалобу в **Convex (local)**, а файлы — в локальную папку `./storage/media/...`.
6. Админ‑панель вызывает `/api/analytics/summary` → Backend API агрегирует данные из Convex для графиков.

---

## 4) Техническая спецификация

### 4.1 Frontend (уже готов)

* **Технологии:** React + TS + Vite, Tailwind, shadcn/ui, React Router, ECharts (клиентский), React Query.
* **Страницы:**

  * `/` — Мастер подачи жалобы (Шаг 1: текст+медиа → Шаг 2: уточнения → Шаг 3: карточка → Шаг 4: подтверждение).
  * `/success` — Успешная отправка с reference number.
  * `/admin` — Фильтры + графики (ECharts) + таблица жалоб.
* **i18n:** KZ (по умолчанию) / RU.

**Переключатель мок‑режима:** `.env` → `VITE_MOCK_API=true|false`
При интеграции бэкенда выставляем `VITE_MOCK_API=false`.

### 4.2 Backend API (Node + Express)

**Назначение:** связать фронтенд с LLM‑сервисом и Convex, а также принять медиа.
**Минимальные эндпоинты:**

* `POST /api/analyze` — проксирует текст/частично известные слоты в LLM; возвращает **строгий JSON** (см. 4.4).
* `POST /api/media/upload` — `multipart/form-data`; сохраняет локально, возвращает `{ id, path, type, size, mime }`.
* `POST /api/submit` — принимает финальную карточку; пишет в Convex; возвращает `{ id | referenceNumber }`.
* `GET /api/analytics/summary` — агрегированные данные для графиков админ‑панели.

**Локальное хранение медиа:**
Пути вида `./storage/media/<image|video|audio>/<YYYY>/<MM>/<hash>.<ext>`

* Ограничения: **image ≤ 10 MB**, **video/audio ≤ 30 MB**.
* Генерация превью (thumb) для изображений (по возможности).
* В Convex храним **метаданные** (путь, размер, mime, длительность для аудио/видео при наличии).

**Vite proxy (dev):** проксируем `/api` → `http://localhost:8787`, чтобы избежать CORS.

### 4.3 База данных (Convex, local dev)

**Коллекции (минимум):**

* `complaints`

  * `source: "web" | "telegram"`
  * `rawText: string`
  * `analysis: object` (строгий JSON от LLM)
  * `tuples: Array<{objects:Array<{type:"route"|"bus_plate", value:string}>, time:string, place:{kind:"stop"|"street"|"crossroad", value:string}, aspects:string[]}>`
  * `priority: "low" | "medium" | "high" | "critical"`
  * `submissionTime: string (ISO)`
  * `reportedTime: string (ISO | "submission_time")`
  * `media: Array<{id:string, type:"image"|"video"|"audio", path:string, size:number, mime:string, width?:number, height?:number, durationSec?:number}>`
  * `isAnonymous: boolean`
  * `contact?: {name?:string, phone?:string, email?:string}`
  * `status: "new" | "in_review" | "forwarded" | "closed"`
* `dict_values` (самонакапливающиеся словари):

  * `{kind:"route"|"place"|"stop"|"plate", value:string, freq:number, lastSeen: ISO}`

**Запросы/мутации (минимум):**

* `complaints.create` (mutation) — сохранить жалобу + вернуть id.
* `complaints.list` (query) — список с пагинацией/фильтрами (для таблицы).
* `analytics.summary` (query) — агрегаты:

  * `topRoutes` (бар),
  * `priorityDistribution` (stacked),
  * `aspectFrequency` (бар),
  * `timeOfDayHeatmap` (ячейки: день/час).

> В Node‑коде можно вызывать Convex через **ConvexHttpClient** по HTTP (удобно для Express). См. оф. доки: HTTP Actions и ConvexHttpClient. ([docs.convex.dev][1])

### 4.4 LLM‑сервис (FastAPI + Transformers + KazLLM)

**POST `/analyze` (request):**

```json
{
  "description": "string",
  "knownFields": { /* частично известные слоты */ },
  "submission_time_iso": "2025-11-05T10:00:00+06:00"
}
```

**Response (строгая схема):**

```json
{
  "need_clarification": false,
  "missing_slots": [],
  "priority": "low|medium|high|critical",
  "tuples": [
    {
      "objects": [
        {"type":"route","value":"12"},
        {"type":"bus_plate","value":"01-AB-123"}
      ],
      "time": "2025-11-05T09:12:00+06:00|submission_time",
      "place": {"kind":"stop|street|crossroad","value":"..."},
      "aspects": ["punctuality","crowding","safety","staff","condition","payment","other"]
    }
  ],
  "aspects_count": {"punctuality":0,"crowding":0,"safety":0,"staff":0,"condition":0,"payment":0,"other":0},
  "recommendation_kk":"Қысқа нақты іс‑шара ұсынысы",
  "language":"kk|ru",
  "extracted_fields": {
    "route_numbers":["..."],
    "bus_plates":["..."],
    "places":["..."]
  },
  "clarifying_question_kk": "Егер қажет...",
  "clarifying_question_ru": "Если необходимо..."
}
```

**Правила приоритета (простые):**

* `critical` — угроза безопасности/здоровью (ДТП, «қауіпті», «өрт», «мас жүргізуші», «тежегіш істемейді»).
* `high` — системные/массовые сбои (не соблюдается маршрут, переполненность, массовые отказы оплаты, двери не открываются).
* `medium` — повторяемые, но локальные (частые задержки, кондиционер сломан, грязь неоднократно).
* `low` — единичное неудобство/предложение.

**Техника генерации:**

* `apply_chat_template(...)` для формирования промпта,
* `temperature=0`, `do_sample=false`, `max_new_tokens≈400`,
* По возможности 4‑битная квантизация (опция) для экономии VRAM.

> Codex должен добавить **валидацию JSON** и «reformat‑retry» (одна попытка короткой ремарки, если ответ невалиден).

### 4.5 Телеграм‑бот (опционально)

* Отдельный Python‑скрипт (отдельный терминал).
* Поток как на вебе: текст → уточнения (через `/api/analyze`) → превью карточки → подтверждение → `/api/submit`.
* Команда `/lang` для KZ/RU.

---

## 5) Окружение и переменные

### 5.1 Frontend (.env)

```
VITE_MOCK_API=false
# при dev Vite проксирует /api на http://localhost:8787, отдельная BASE_URL не нужна
```

### 5.2 Backend API (.env)

```
PORT=8787
LLM_URL=http://127.0.0.1:8000
STORAGE_DIR=./storage/media
MAX_IMAGE_BYTES=10485760         # 10 MB
MAX_VIDEO_BYTES=31457280         # 30 MB
CONVEX_URL=...                   # взять из `npx convex dev`
```

### 5.3 LLM (.env либо constants)

```
MODEL_ID=issai/LLama-3.1-KazLLM-1.0-8B
USE_4BIT=1                       # опционально
```

### 5.4 Telegram Bot (.env) — опционально

```
BOT_TOKEN=...
API_BASE=http://localhost:8787
```

---

## 6) API‑контракты (финальные)

### 6.1 `POST /api/analyze`

**Req:** `{ description, knownFields?, submission_time_iso }`
**Res:** см. **4.4** (строгая схема).

### 6.2 `POST /api/media/upload` (multipart)

Поля: `file` (обяз.), необяз.: `kind=image|video|audio`
**Res:** `{ id, path, type, size, mime, width?, height?, durationSec? }`

### 6.3 `POST /api/submit`

**Req (пример):**

```json
{
  "description": "string",
  "priority": "high",
  "tuples": [...],
  "analysis": {...},
  "media": [{ "id":"...", "path":"...", "type":"image", "size":12345, "mime":"image/png" }],
  "isAnonymous": true,
  "contact": { "name":"...", "phone":"...", "email":"..." },
  "source": "web",
  "submissionTime": "2025-11-05T10:00:00+06:00",
  "reportedTime": "submission_time"
}
```

**Res:** `{ success:true, id:"...", referenceNumber:"..." }`

### 6.4 `GET /api/analytics/summary`

**Res (пример):**

```json
{
  "topRoutes": [{ "route":"12", "count":34 }, ...],
  "priorityDistribution": { "low":10, "medium":25, "high":12, "critical":3 },
  "aspectFrequency": [{ "aspect":"safety", "count":15 }, ...],
  "timeOfDayHeatmap": [
    { "day":1, "hour":8, "count":5 }, ...
  ]
}
```

---

## 7) Как Codex должен вести работу

* В каждом новом чате с Codex указывайте:
  **«Мы работаем по PROJECT_OVERVIEW.md, выполняем Шаг N. Соблюдай лимит ≤20 файлов. Все комментарии — на русском. В конце — коммит и отметка шага.»**
* После каждого шага Codex:

  1. Отмечает шаг как **[x]**.
  2. Печатает краткий отчёт «что изменено и почему».
  3. Делает коммит с сообщением вида: `git add -A && git commit -m "step(N): <кратко>"`.

---

## 8) Пошаговый план (минимум шагов, атомарно)

> ⚠️ Генерируем код **только в рамках указанного шага**, не превышая **20 файлов** (сгенерированные Convex `_generated` можно не считать).
> Все комментарии в коде — **на русском**.

### [x] **Шаг 1: Отключить mock, настроить Vite proxy и .env**

**Task:**

* Выключить мок‑режим фронтенда (`VITE_MOCK_API=false`).
* В `vite.config.ts` настроить **proxy** для `'/api' → 'http://localhost:8787'`.
* Проверить, что фронтенд собирается и обращается к `/api/*`.

**Files:** `.env`, `.env.example`, `vite.config.ts`, при необходимости `src/services/api.ts` (убрать заглушки если есть).

**Step Dependencies:** —

**User Instructions:**

1. Обновите `.env` и `.env.example`.
2. Добавьте proxy в `vite.config.ts` (`server.proxy`).
3. Запустите: `npm run dev` и убедитесь, что запросы на `/api/*` проксируются (пока сервер не поднят — допустимы 502/404).
4. Коммит: `git add -A && git commit -m "step(1): disable mock, setup vite proxy"`.

---

### [ ] **Шаг 2: LLM‑сервис (Python FastAPI + KazLLM)**

**Task:**

* Создать папку `llm_service/` с `main.py` (FastAPI), реализовать `POST /analyze`.
* Использовать Transformers + KazLLM, `apply_chat_template`, `temperature=0`, парсинг **строгого JSON**.
* Параметры: `MODEL_ID`, `USE_4BIT`, порт `8000`.

**Files:** `llm_service/main.py`, `llm_service/requirements.txt`, `llm_service/.env.example` (необязательно).

**Step Dependencies:** Шаг 1.

**User Instructions:**

1. Создать venv: `python -m venv .venv && source .venv/bin/activate` (Windows: `.\.venv\Scripts\activate`).
2. Установить зависимости: `pip install fastapi uvicorn transformers accelerate bitsandbytes pydantic` (+ при необходимости `torch`).
3. Запустить: `uvicorn llm_service.main:app --reload --port 8000`.
4. Проверить `http://127.0.0.1:8000/docs` и пробный `POST /analyze`.
5. Коммит: `git add -A && git commit -m "step(2): add FastAPI LLM service with strict JSON"`.

---

### [ ] **Шаг 3: Backend API (Node + Express) — /analyze и /media/upload**

**Task:**

* Создать `server/index.ts` (или `.js`), поднять Express на `:8787`.
* Реализовать:

  * `POST /api/analyze` — форвард на `LLM_URL/analyze` (из `.env`), возврат ответа как есть.
  * `POST /api/media/upload` — приём `multipart/form-data` (Multer), валидация размера/типа, сохранение в `./storage/media/...`, ответ с `{ id, path, type, size, mime, ... }`.
* Добавить `npm`‑скрипт `"server:dev"` (через `tsx`/`nodemon`).

**Files:** `server/index.ts`, `package.json` (скрипты), `.env` (переменные сервера), возможно `server/utils/*` (не более 2 файлов).

**Step Dependencies:** Шаг 2.

**User Instructions:**

1. Установить пакеты: `npm i express multer cors mime-types sharp zod dotenv` и (dev) `npm i -D tsx` (если TS).
2. Создать структуру директорий `./storage/media/{image,video,audio}` при первом запуске автоматически.
3. Запустить: `npm run server:dev` (порт 8787).
4. Из фронта проверить загрузку файла (предпросмотр/путь), `analyze` — возвращает JSON от LLM.
5. Коммит: `git add -A && git commit -m "step(3): express api + analyze proxy + local media upload"`.

---

### [ ] **Шаг 4: Convex (local dev) — схема и функции + /api/submit, /api/analytics/summary**

**Task:**

* Инициализировать Convex (local dev), добавить схему и функции.
* Реализовать:

  * `complaints.create` (mutation) — сохранить жалобу и вернуть `id`.
  * `complaints.list` (query) — для таблицы (пригодится позже).
  * `analytics.summary` (query) — агрегаты для графиков.
* В Express добавить:

  * `POST /api/submit` — валидировать тело, вызвать `complaints.create`, вернуть `{ id, referenceNumber }`.
  * `GET /api/analytics/summary` — вызвать `analytics.summary`, вернуть клиенту.

**Files:**

* `convex/schema.ts`, `convex/complaints.ts`, `convex/analytics.ts`, `convex.json`
* Обновление `server/index.ts` (добавить эндпоинты)
* *Сгенерированные* `convex/_generated/*` (можно не учитывать в лимите файлов).

**Step Dependencies:** Шаг 3.

**User Instructions:**

1. Установить клиент: `npm i convex` (если не установлен).
2. Запустить локально: `npx convex dev` → он выдаст `CONVEX_URL`.
3. Прописать `CONVEX_URL` в `.env` сервера.
4. Подключить в `server/index.ts` **ConvexHttpClient** и вызывать функции (HTTP‑клиент).
5. Проверить `POST /api/submit` из фронта (после «Подтвердить»), и `GET /api/analytics/summary` в админ‑панели (вручную через браузер/React Query).
6. Коммит: `git add -A && git commit -m "step(4): convex schema + mutations/queries + submit & analytics endpoints"`.

> Примечание: Convex HTTP клиент подходит для вызовов из серверного кода; также существуют **HTTP Actions**, но они не обязательны для нашего сценария. ([docs.convex.dev][2])

---

### [ ] **Шаг 5: Подключить фронтенд к реальному бэкенду (убрать mock, данные для ECharts)**

**Task:**

* В `src/services/api.ts` окончательно отключить mock‑ветки и использовать реальные `/api/*`.
* В `/admin` заменить заглушки на данные из `GET /api/analytics/summary` (через React Query).
* Убедиться, что графики получают корректные массивы/объекты.

**Files:**

* `src/services/api.ts`
* `src/pages/Admin.tsx` (или компоненты, через которые отрисовываются графики)
* `src/types/analytics.ts` (если нужно)
  *(Стараться ≤6 файлов.)*

**Step Dependencies:** Шаг 4.

**User Instructions:**

1. Переподключить функции извлечения данных для графиков.
2. Проверить: фильтры → запрос `/api/analytics/summary` → графики обновляются.
3. Финальная проверка мастера: текст → уточнения → карточка → подтверждение → success → запись в Convex.
4. Коммит: `git add -A && git commit -m "step(5): wire frontend to real api + analytics data"`.

---

### [ ] **Шаг 6 (опционально): Телеграм‑бот (Python)**

**Task:**

* Создать `telegram_bot/bot.py` на `python-telegram-bot`.
* Команды: `/start`, `/lang`, основная переписка — тот же slot‑filling через `/api/analyze`, превью карточки и подтверждение `/api/submit`.
* Приём медиа: пересылка в `/api/media/upload`.

**Files:** `telegram_bot/bot.py`, `telegram_bot/requirements.txt`, `telegram_bot/.env.example`.

**Step Dependencies:** Шаг 3 (API готов), Шаг 4 (submit/analytics).

**User Instructions:**

1. `pip install python-telegram-bot==20.*`
2. Указать `BOT_TOKEN` в `.env`.
3. Запустить бота в отдельном терминале.
4. Коммит: `git add -A && git commit -m "step(6): telegram bot (optional)"`.

---

## 9) Критерии готовности (Definition of Done)

* Мастер на `/` проходит полностью:
  свободный текст → уточнения (если надо) → карточка → подтверждение → success.
* Медиа загружаются локально, попадают в карточку, отображаются в превью.
* `POST /api/analyze` стабильно возвращает **валидный JSON** (даже при смешанном KZ/RU).
* `POST /api/submit` записывает в Convex; в админке запись видна.
* `/admin` показывает живые графики с данных БД; фильтры работают (минимально).
* Коммиты по шагам, все шаги отмечены **[x]**.

---

## 10) Замечания по устойчивости и производительности

* LLM: `temperature=0`, `do_sample=false`, `max_new_tokens≈400`, по возможности **4‑битная квантизация**.
* JSON‑валидация ответа — обязательно; при неверном формате: короткий «format‑fix» повтор (1 попытка).
* Медиа: проверка размера/типа до записи на диск; фоновые превью (sharp) без блокировок.
* Convex: индексы по `priority`, `source`, `submissionTime`, `tuples.objects.value`, `tuples.place.value`.
* Безопасность: базовая маскировка телефонов/карт, анонимность по чекбоксу.

---

## 11) Как запускать всё локально (в разных терминалах)

1. **LLM сервис:**
   `uvicorn llm_service.main:app --reload --port 8000`

2. **Convex (local dev):**
   `npx convex dev` → взять `CONVEX_URL` и прописать в `.env` бэкенда

3. **Backend API (Express):**
   `npm run server:dev` → `http://localhost:8787`

4. **Frontend (Vite):**
   `npm run dev` → `http://localhost:8080`

5. **(Опционально) Telegram‑бот:**
   `python telegram_bot/bot.py`

---

## 12) Источники (для Codex)

* Convex: HTTP Actions и HTTP‑клиент (**ConvexHttpClient**), local dev. ([docs.convex.dev][1])

---

### Прогресс‑чеклист (отмечайте после каждого шага)

* [x] Шаг 1: Vite proxy + отключить mock
* [ ] Шаг 2: LLM‑сервис (FastAPI)
* [ ] Шаг 3: Express API (/analyze, /media/upload)
* [ ] Шаг 4: Convex + /api/submit + /api/analytics/summary
* [ ] Шаг 5: Фронт подключён к реальному API, графики с БД
* [ ] Шаг 6 (опц.): Телеграм‑бот

---
