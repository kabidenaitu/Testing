import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, TypedDict

import httpx
from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# Настроим журнал для быстрой диагностики.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("telegram_bot")

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_BASE = os.getenv("API_BASE", "http://localhost:8787").rstrip("/")
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "kk").lower()
if DEFAULT_LANGUAGE not in {"kk", "ru"}:
    DEFAULT_LANGUAGE = "kk"


class AnalyzeResponse(TypedDict, total=False):
    needClarification: bool
    missingSlots: List[str]
    priority: Literal["low", "medium", "high", "critical"]
    tuples: List[Dict[str, Any]]
    aspectsCount: Dict[str, int]
    recommendationKk: str
    language: Literal["kk", "ru"]
    extractedFields: Dict[str, List[str]]
    clarifyingQuestionKk: Optional[str]
    clarifyingQuestionRu: Optional[str]


@dataclass
class SessionState:
    language: Literal["kk", "ru"] = "kk"
    stage: Literal["description", "clarification", "confirmation"] = "description"
    description: Optional[str] = None
    submission_time: Optional[str] = None
    known_fields: Dict[str, Any] = field(default_factory=dict)
    clarifications: Dict[str, str] = field(default_factory=dict)
    pending_slot: Optional[str] = None
    analysis: Optional[AnalyzeResponse] = None
    media: List[Dict[str, Any]] = field(default_factory=list)


# Наборы текстов на двух языках.
TEXTS: Dict[str, Dict[str, str]] = {
    "kk": {
        "greeting": (
          "Сәлеметсіз бе! 🚍\n"
          "Шағымыңызды мәтін түрінде жіберіңіз. Қажет болса, бот қысқа сұрақтар қояды."
        ),
        "ask_description": "Өтінемін, жағдайды мәтін түрінде сипаттаңыз.",
        "clarification": "Қосымша ақпарат қажет: {question}",
        "clarification_saved": "Рақмет! Жауапты ескеріп, қайта талдап көремін…",
        "analyze_error": (
          "Кешіріңіз, талдау сервисі уақытша қолжетімсіз. Кейінірек қайта көріңіз."
        ),
        "preview_title": "📄 Шағым карточкасының алдын ала нұсқасы:",
        "preview_summary": (
          "<b>Приоритет:</b> {priority}\n"
          "<b>Негізгі аспектілер:</b> {aspects}\n"
          "<b>Маршрут/объект:</b>\n{tuples}\n"
          "<b>Ұсыныс:</b> {recommendation}"
        ),
        "no_tuples": "— анықталған маршруттар жоқ",
        "confirm": "Бәрі дұрыс па? Шағымды жіберу керек пе?",
        "confirm_yes": "Жіберу",
        "confirm_no": "Түзету",
        "submit_ok": (
          "✅ Шағым жіберілді! Рақмет.\n"
          "Анықтамалық нөмірі: {reference}"
        ),
        "submit_fail": "Қате шықты. Шағымды кейінірек қайтадан жіберіп көріңіз.",
        "reset_hint": "Жаңа шағым үшін мәтінді қайта жіберіңіз.",
        "media_saved": "Медиа файл алынды және сақталды.",
        "media_error": "Файлды сақтау мүмкін болмады. Тағы бір рет байқап көріңіз.",
        "lang_switched": "Интерфейс тілі қазір қазақша.",
        "lang_prompt": "Қолдау көрсетілетін тілдер: /lang kk немесе /lang ru.",
        "lang_unknown": "Тілді түсінбедім. kk немесе ru деп көрсетіңіз.",
        "cancelled": "Жіберу тоқтатылды. Мәтінді өзгертіп, қайта бастауға болады."
    },
    "ru": {
        "greeting": (
          "Здравствуйте! 🚍\n"
          "Отправьте текст жалобы. При необходимости бот задаст уточняющие вопросы."
        ),
        "ask_description": "Пожалуйста, опишите ситуацию текстом.",
        "clarification": "Нужно уточнение: {question}",
        "clarification_saved": "Спасибо! Учитываю ответ и повторяю анализ…",
        "analyze_error": (
          "Извините, сервис анализа временно недоступен. Попробуйте позже."
        ),
        "preview_title": "📄 Предварительный вид карточки жалобы:",
        "preview_summary": (
          "<b>Приоритет:</b> {priority}\n"
          "<b>Ключевые аспекты:</b> {aspects}\n"
          "<b>Связанные объекты:</b>\n{tuples}\n"
          "<b>Рекомендация:</b> {recommendation}"
        ),
        "no_tuples": "— не удалось определить маршрут",
        "confirm": "Все верно? Отправляем жалобу?",
        "confirm_yes": "Отправить",
        "confirm_no": "Исправить",
        "submit_ok": (
          "✅ Жалоба успешно отправлена! Спасибо.\n"
          "Номер отслеживания: {reference}"
        ),
        "submit_fail": (
          "Не удалось отправить жалобу. Попробуйте повторить позднее."
        ),
        "reset_hint": "Для новой жалобы просто отправьте текст заново.",
        "media_saved": "Медиа-файл получен и сохранён.",
        "media_error": "Не удалось сохранить файл. Повторите попытку.",
        "lang_switched": "Интерфейс теперь на русском языке.",
        "lang_prompt": "Доступные языки: /lang kk или /lang ru.",
        "lang_unknown": "Не понял язык. Укажите kk или ru.",
        "cancelled": "Отправка отменена. Можно изменить текст и начать заново."
    }
}


PRIORITY_LABELS = {
    "kk": {
        "low": "Төмен",
        "medium": "Орташа",
        "high": "Жоғары",
        "critical": "Критикалық"
    },
    "ru": {
        "low": "Низкий",
        "medium": "Средний",
        "high": "Высокий",
        "critical": "Критический"
    }
}

ASPECT_LABELS = {
    "kk": {
        "punctuality": "Уақыттылығы",
        "crowding": "Толып кетуі",
        "safety": "Қауіпсіздік",
        "staff": "Қызметкерлер",
        "condition": "Көліктің күйі",
        "payment": "Төлем",
        "other": "Басқа"
    },
    "ru": {
        "punctuality": "Пунктуальность",
        "crowding": "Переполненность",
        "safety": "Безопасность",
        "staff": "Персонал",
        "condition": "Состояние транспорта",
        "payment": "Оплата",
        "other": "Другое"
    }
}


def get_session(context: ContextTypes.DEFAULT_TYPE) -> SessionState:
    session = context.user_data.get("session")
    if not isinstance(session, SessionState):
        session = SessionState(language=context.user_data.get("language", DEFAULT_LANGUAGE))
        context.user_data["session"] = session
    return session


def reset_session(session: SessionState) -> None:
    session.stage = "description"
    session.description = None
    session.submission_time = None
    session.known_fields.clear()
    session.clarifications.clear()
    session.pending_slot = None
    session.analysis = None
    session.media = []


def choose_text(session: SessionState, key: str) -> str:
    return TEXTS[session.language][key]


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = get_session(context)
    reset_session(session)
    if update.message:
        await update.message.reply_text(
            choose_text(session, "greeting"),
            disable_web_page_preview=True,
        )


async def cmd_lang(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = get_session(context)
    if not context.args:
        await update.message.reply_text(choose_text(session, "lang_prompt"))
        return

    raw = context.args[0].lower()
    if raw in {"kk", "kz"}:
        new_lang: Literal["kk", "ru"] = "kk"
    elif raw == "ru":
        new_lang = "ru"
    else:
        await update.message.reply_text(choose_text(session, "lang_unknown"))
        return

    session.language = new_lang
    context.user_data["language"] = new_lang
    await update.message.reply_text(choose_text(session, "lang_switched"))


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message:
        return

    session = get_session(context)
    text = message.text.strip()

    if session.stage == "confirmation":
        reset_session(session)
        # Продолжаем обработку текста как нового описания.

    if session.stage == "description":
        session.description = text
        session.submission_time = datetime.now(tz=timezone.utc).isoformat()
        session.stage = "clarification"
        session.known_fields = {}
        session.clarifications = {}
        session.pending_slot = None
        await run_analysis(update, context, session)
        return

    if session.stage == "clarification":
        if not session.pending_slot:
            session.stage = "description"
            await message.reply_text(choose_text(session, "ask_description"))
            return

        session.known_fields[session.pending_slot] = text
        session.clarifications[session.pending_slot] = text
        session.pending_slot = None
        await message.reply_text(choose_text(session, "clarification_saved"))
        await run_analysis(update, context, session)


async def run_analysis(update: Update, context: ContextTypes.DEFAULT_TYPE, session: SessionState) -> None:
    description = session.description
    if not description:
        await update.message.reply_text(choose_text(session, "ask_description"))
        return

    submission_time = session.submission_time or datetime.now(tz=timezone.utc).isoformat()
    session.submission_time = submission_time

    payload = {
        "description": description,
        "knownFields": session.known_fields,
        "submission_time_iso": submission_time
    }

    client: httpx.AsyncClient = context.application.bot_data["http_client"]
    try:
        response = await client.post("/api/analyze", json=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()
    except Exception as error:  # noqa: BLE001
        logger.exception("Analyze request failed: %s", error)
        await update.message.reply_text(choose_text(session, "analyze_error"))
        session.stage = "description"
        return

    analysis = normalize_analysis(data)
    session.analysis = analysis

    if analysis.get("needClarification") and analysis.get("missingSlots"):
        slot = analysis["missingSlots"][0]
        question = pick_question(analysis, session.language)
        if not question:
            question = choose_text(session, "ask_description")
        session.pending_slot = slot
        session.stage = "clarification"
        await update.message.reply_text(
            choose_text(session, "clarification").format(question=question)
        )
        return

    await show_preview(update, session)
    session.stage = "confirmation"


def normalize_analysis(payload: Dict[str, Any]) -> AnalyzeResponse:
    return AnalyzeResponse(
        needClarification=payload.get("need_clarification", False),
        missingSlots=payload.get("missing_slots", []) or [],
        priority=payload.get("priority", "medium"),
        tuples=payload.get("tuples", []) or [],
        aspectsCount=payload.get("aspects_count", {}) or {},
        recommendationKk=payload.get("recommendation_kk", ""),
        language=payload.get("language", "kk"),
        extractedFields={
            "routeNumbers": payload.get("extracted_fields", {}).get("route_numbers", []) or [],
            "busPlates": payload.get("extracted_fields", {}).get("bus_plates", []) or [],
            "places": payload.get("extracted_fields", {}).get("places", []) or []
        },
        clarifyingQuestionKk=payload.get("clarifying_question_kk"),
        clarifyingQuestionRu=payload.get("clarifying_question_ru")
    )


def pick_question(analysis: AnalyzeResponse, language: Literal["kk", "ru"]) -> str:
    if language == "kk":
        return analysis.get("clarifyingQuestionKk") or analysis.get("clarifyingQuestionRu") or ""
    return analysis.get("clarifyingQuestionRu") or analysis.get("clarifyingQuestionKk") or ""


async def show_preview(update: Update, session: SessionState) -> None:
    analysis = session.analysis
    if not analysis:
        await update.message.reply_text(choose_text(session, "analyze_error"))
        return

    priority = PRIORITY_LABELS[session.language][analysis["priority"]]
    aspects = format_aspects(analysis.get("aspectsCount") or {}, session.language)
    tuples = format_tuples(analysis.get("tuples") or [], session.language, session)
    recommendation = analysis.get("recommendationKk") or "-"

    summary = choose_text(session, "preview_summary").format(
        priority=priority,
        aspects=aspects,
        tuples=tuples,
        recommendation=recommendation
    )
    summary = f"{summary}\n\n{choose_text(session, 'confirm')}"

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    choose_text(session, "confirm_yes"),
                    callback_data="decision:send",
                ),
                InlineKeyboardButton(
                    choose_text(session, "confirm_no"),
                    callback_data="decision:cancel",
                ),
            ]
        ]
    )

    await update.message.reply_text(
        choose_text(session, "preview_title"),
        parse_mode=ParseMode.HTML,
    )
    await update.message.reply_text(
        summary,
        parse_mode=ParseMode.HTML,
        reply_markup=keyboard,
        disable_web_page_preview=True,
    )


def format_aspects(aspects_count: Dict[str, int], language: Literal["kk", "ru"]) -> str:
    labels = ASPECT_LABELS[language]
    non_zero = [
        labels.get(name, name)
        for name, value in aspects_count.items()
        if isinstance(value, int) and value > 0
    ]
    if not non_zero:
        return "—"
    return ", ".join(non_zero)


def format_tuples(
    tuples: List[Dict[str, Any]],
    language: Literal["kk", "ru"],
    session: SessionState,
) -> str:
    if not tuples:
        return choose_text(session, "no_tuples")

    lines: List[str] = []
    for idx, item in enumerate(tuples, start=1):
        parts: List[str] = []
        objects = item.get("objects") or []
        if objects:
            object_values = ", ".join(
                f"{obj.get('type')}: {obj.get('value')}" for obj in objects
            )
            parts.append(object_values)
        place = item.get("place")
        if place:
            parts.append(f"{place.get('kind')}: {place.get('value')}")
        time_value = item.get("time")
        if time_value:
            parts.append(f"уақыты/time: {time_value}")
        aspects = item.get("aspects") or []
        if aspects:
            label_map = ASPECT_LABELS[language]
            mapped = ", ".join(label_map.get(a, a) for a in aspects)
            parts.append(mapped)
        joined = "; ".join(parts)
        lines.append(f"{idx}. {joined}" if joined else f"{idx}. —")
    return "\n".join(lines)


async def handle_decision(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    session = get_session(context)

    if query.data == "decision:send":
        await finalize_submission(query, context, session)
    else:
        reset_session(session)
        await query.edit_message_text(choose_text(session, "cancelled"))


async def finalize_submission(
    query,
    context: ContextTypes.DEFAULT_TYPE,
    session: SessionState,
) -> None:
    analysis = session.analysis
    if not analysis or not session.description:
        await query.edit_message_text(choose_text(session, "analyze_error"))
        return

    payload = {
        "description": session.description,
        "priority": analysis["priority"],
        "tuples": analysis.get("tuples") or [],
        "analysis": serialize_analysis(analysis),
        "media": session.media,
        "isAnonymous": True,
        "contact": None,
        "source": "telegram",
        "submissionTime": session.submission_time
    }

    client: httpx.AsyncClient = context.application.bot_data["http_client"]
    try:
        response = await client.post("/api/submit", json=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()
    except Exception as error:  # noqa: BLE001
        logger.exception("Submit failed: %s", error)
        await query.edit_message_text(choose_text(session, "submit_fail"))
        reset_session(session)
        return

    reference = data.get("referenceNumber") or "-"
    await query.edit_message_text(
        choose_text(session, "submit_ok").format(reference=reference)
    )
    reset_session(session)


def serialize_analysis(analysis: AnalyzeResponse) -> Dict[str, Any]:
    return {
        "need_clarification": analysis.get("needClarification"),
        "missing_slots": analysis.get("missingSlots"),
        "priority": analysis.get("priority"),
        "tuples": analysis.get("tuples"),
        "aspects_count": analysis.get("aspectsCount"),
        "recommendation_kk": analysis.get("recommendationKk"),
        "language": analysis.get("language"),
        "extracted_fields": {
            "route_numbers": analysis.get("extractedFields", {}).get("routeNumbers"),
            "bus_plates": analysis.get("extractedFields", {}).get("busPlates"),
            "places": analysis.get("extractedFields", {}).get("places")
        },
        "clarifying_question_kk": analysis.get("clarifyingQuestionKk"),
        "clarifying_question_ru": analysis.get("clarifyingQuestionRu")
    }


async def handle_media(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message:
        return

    session = get_session(context)

    file = None
    filename = None
    mime_type = None

    if message.photo:
        file = await message.photo[-1].get_file()
        filename = f"{file.file_unique_id}.jpg"
        mime_type = "image/jpeg"
    elif message.video:
        file = await message.video.get_file()
        filename = message.video.file_name or f"{file.file_unique_id}.mp4"
        mime_type = message.video.mime_type or "video/mp4"
    elif message.voice:
        file = await message.voice.get_file()
        filename = f"{file.file_unique_id}.ogg"
        mime_type = message.voice.mime_type or "audio/ogg"
    elif message.audio:
        file = await message.audio.get_file()
        filename = message.audio.file_name or f"{file.file_unique_id}.mp3"
        mime_type = message.audio.mime_type or "audio/mpeg"
    elif message.document:
        file = await message.document.get_file()
        filename = message.document.file_name or f"{file.file_unique_id}"
        mime_type = message.document.mime_type or "application/octet-stream"
    else:
        return

    try:
        file_bytes = await file.download_as_bytearray()
        media = await upload_media(context, filename, mime_type, bytes(file_bytes))
        session.media.append(media)
        await message.reply_text(choose_text(session, "media_saved"))
    except Exception as error:  # noqa: BLE001
        logger.exception("Media upload failed: %s", error)
        await message.reply_text(choose_text(session, "media_error"))


async def upload_media(
    context: ContextTypes.DEFAULT_TYPE,
    filename: str,
    mime_type: str,
    payload: bytes,
) -> Dict[str, Any]:
    client: httpx.AsyncClient = context.application.bot_data["http_client"]
    files = {"file": (filename, payload, mime_type)}
    response = await client.post("/api/media/upload", files=files, timeout=60.0)
    response.raise_for_status()
    return response.json()


async def post_init(application: Application) -> None:
    application.bot_data["http_client"] = httpx.AsyncClient(base_url=API_BASE, timeout=30.0)
    logger.info("HTTP клиент готов (%s)", API_BASE)


async def post_shutdown(application: Application) -> None:
    client: httpx.AsyncClient = application.bot_data.get("http_client")
    if client:
        await client.aclose()
        logger.info("HTTP клиент закрыт")


def build_application() -> Application:
    if not BOT_TOKEN:
        raise RuntimeError("Переменная BOT_TOKEN не задана.")

    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .post_shutdown(post_shutdown)
        .build()
    )

    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("lang", cmd_lang))
    application.add_handler(CallbackQueryHandler(handle_decision, pattern="^decision:"))
    application.add_handler(
        MessageHandler(
            filters.PHOTO
            | filters.VIDEO
            | filters.VOICE
            | filters.AUDIO
            | filters.Document.ALL,
            handle_media,
        )
    )
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    return application


async def main() -> None:
    application = build_application()
    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    try:
        await application.updater.idle()
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
