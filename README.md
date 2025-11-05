# QalaVoice Platform

## О проекте
- Многоступенчатый веб-мастер жалоб (ru/kk) с подсказками LLM, отслеживанием статуса и предварительным просмотром.
- Админ-панель с аналитикой по обращениям, графиками Convex и ручным управлением статусами.
- TypeScript API-шлюз на Express: валидация входа, хранение медиа, прокси к Convex и LLM.
- FastAPI-сервис KazLLM (PyTorch, Transformers) для разбора текста, приоритетов, аспектов и уточняющих вопросов.
- Telegram-бот (python-telegram-bot) повторяет сценарий приёма жалобы и шлёт данные в общий backend.

## Стек
- Frontend: Vite + React 18 + TypeScript, shadcn/ui, TanStack Query, Tailwind.
- Backend: Express, Convex cloud, Multer + Sharp для медиа, Zod для схем.
- AI: FastAPI, PyTorch, BitsAndBytes (опционально), KazLLM 8B.
- Bot: python-telegram-bot, httpx; общие `.env`-переменные через dotenv.

## Запуск
1. Создайте `.env`/`.env.local` с ключами `VITE_*`, `PORT`, `LLM_URL`, `CONVEX_URL`, `ADMIN_*`, `BOT_TOKEN`, путями хранилища и лимитами медиа.
2. Установите зависимости:
   ```bash
   npm install
   pip install -r llm_service/requirements.txt
   pip install -r telegram_bot/requirements.txt
   ```
3. Запустите сервисы (отдельные терминалы):
   ```bash
   npm run dev          # фронтенд
   npm run server:dev   # Express API
   npx convex dev       # локальный Convex (или настройте production URL)
   uvicorn llm_service.main:app --reload
   python -m telegram_bot.bot
   ```
4. Медиа складываются в `storage/media`; очистка выполняется вручную.
