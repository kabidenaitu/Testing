import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
# Загружаем переменные сначала из корневого .env, затем из локального, чтобы было удобно.
load_dotenv(Path.cwd() / ".env", override=False)
load_dotenv(BASE_DIR / ".env", override=False)

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
api_base_raw = os.getenv("API_BASE", "http://localhost:8787").strip()
API_BASE = (api_base_raw or "http://localhost:8787").rstrip("/")
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "kk").strip().lower()
if DEFAULT_LANGUAGE not in {"kk", "ru"}:
    DEFAULT_LANGUAGE = "kk"

LOCAL_TIMEZONE_NAME = os.getenv("LOCAL_TIMEZONE", "Asia/Almaty").strip() or "Asia/Almaty"
try:
    LOCAL_TIMEZONE = ZoneInfo(LOCAL_TIMEZONE_NAME)
except ZoneInfoNotFoundError:
    logger.warning(
        "Не удалось загрузить временную зону %s, используем UTC по умолчанию.",
        LOCAL_TIMEZONE_NAME,
    )
    LOCAL_TIMEZONE = timezone.utc

TRACKING_URL_TEMPLATE = os.getenv("TRACKING_URL_TEMPLATE", "https://qalavoice.kz/#status").strip()


def _read_timeout(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Переменная %s=%r некорректна, используем %.0f", name, raw, default)
        return default
    if value <= 0:
        logger.warning("Переменная %s должна быть положительной, используем %.0f", name, default)
        return default
    return value


API_TIMEOUT_SECONDS = _read_timeout("API_TIMEOUT_SECONDS", 30.0)
ANALYZE_TIMEOUT_SECONDS = _read_timeout(
    "ANALYZE_TIMEOUT_SECONDS",
    max(API_TIMEOUT_SECONDS, 120.0),
)
MEDIA_TIMEOUT_SECONDS = _read_timeout("MEDIA_TIMEOUT_SECONDS", 90.0)
SUBMIT_TIMEOUT_SECONDS = _read_timeout("SUBMIT_TIMEOUT_SECONDS", max(API_TIMEOUT_SECONDS, 45.0))


class BackendError(Exception):
    """Исключение для ошибок при обращении к backend."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status = status


class AnalyzeResponse(TypedDict, total=False):
    needClarification: bool
    missingSlots: List[str]
    priority: Literal["low", "medium", "high", "critical"]
    tuples: List[Dict[str, Any]]
    aspectsCount: Dict[str, int]
    recommendationKk: str
    recommendationRu: str
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
    reanalysis_in_progress: bool = False
    last_answer_slot: Optional[str] = None


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
        "tracking_prompt": "🔎 Статусты бақылау үшін сілтемені пайдаланыңыз:",
        "tracking_button": "Статусты тексеру",
        "submit_ok": (
          "✅ Шағым жіберілді! Рақмет.\n"
          "Анықтамалық нөмірі: {reference}"
        ),
        "submit_fail": "Қате шықты. Шағымды кейінірек қайтадан жіберіп көріңіз.",
        "reset_hint": "Жаңа шағым үшін мәтінді қайта жіберіңіз.",
        "media_saved": "Медиа файл алынды және сақталды.",
        "media_error": "Файлды сақтау мүмкін болмады. Тағы бір рет байқап көріңіз.",
        "lang_switched": "Интерфейс тілі қазір қазақша.",
        "lang_prompt": "Тілді /lang kk немесе /lang ru арқылы, не төмендегі батырмалармен таңдаңыз.",
        "lang_unknown": "Тілді түсінбедім. kk немесе ru деп жазыңыз немесе батырмаларды пайдаланыңыз.",
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
        "tracking_prompt": "🔎 Проверьте статус вашей жалобы по ссылке:",
        "tracking_button": "Проверить статус",
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
        "lang_prompt": "Выберите язык командами /lang kk или /lang ru, либо кнопками ниже.",
        "lang_unknown": "Не понял язык. Укажите kk или ru или нажмите кнопку ниже.",
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

LANGUAGE_BUTTON_LABELS: Dict[Literal["kk", "ru"], str] = {"kk": "Қазақша", "ru": "Русский"}

PLACE_LABELS = {
    "kk": {
        "stop": "Аялдама",
        "street": "Көше",
        "crossroad": "Қиылыс",
    },
    "ru": {
        "stop": "Остановка",
        "street": "Улица",
        "crossroad": "Перекрёсток",
    },
}

PREVIEW_FIELD_LABELS = {
    "kk": {
        "priority": "Приоритет",
        "submitted_at": "Өтініш берілген уақыт",
        "routes": "Бағыттар",
        "plates": "Мемнөмірлер",
        "place": "Оқиға орны",
        "time": "Оқиға уақыты",
        "aspects": "Негізгі аспектілер",
        "recommendation": "Ұсыныс",
        "description": "Сипаттама",
        "attachments": "Файлдар",
        "tuples": "Қосымша мәліметтер",
    },
    "ru": {
        "priority": "Приоритет",
        "submitted_at": "Время обращения",
        "routes": "Маршруты",
        "plates": "Госномера",
        "place": "Место",
        "time": "Время происшествия",
        "aspects": "Ключевые аспекты",
        "recommendation": "Рекомендация",
        "description": "Описание",
        "attachments": "Вложения",
        "tuples": "Дополнительные детали",
    },
}

PREVIEW_ICONS = {
    "priority": "🔴",
    "submitted_at": "🕒",
    "routes": "🚌",
    "plates": "🚐",
    "place": "📍",
    "time": "⏰",
    "aspects": "⚠️",
    "recommendation": "💡",
    "description": "📝",
    "attachments": "📎",
    "tuples": "🗂",
}


def build_language_keyboard(current: Literal["kk", "ru"]) -> InlineKeyboardMarkup:
    buttons = []
    for code, label in LANGUAGE_BUTTON_LABELS.items():
        prefix = "✅ " if code == current else ""
        buttons.append(
            InlineKeyboardButton(f"{prefix}{label}", callback_data=f"lang:{code}")
        )
    return InlineKeyboardMarkup([buttons])


def apply_language(session: SessionState, context: ContextTypes.DEFAULT_TYPE, new_lang: Literal["kk", "ru"]) -> None:
    session.language = new_lang
    context.user_data["language"] = new_lang


def extract_backend_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        data = None

    if isinstance(data, dict):
        for key in ("message", "detail", "error", "code"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    text = response.text.strip()
    if text:
        return text
    return f"Backend error (HTTP {response.status_code})"


async def request_json(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    json_payload: Optional[Dict[str, Any]] = None,
    files: Optional[Dict[str, Any]] = None,
    timeout: Optional[float] = None,
) -> Any:
    try:
        response = await client.request(
            method,
            path,
            json=json_payload,
            files=files,
            timeout=timeout,
        )
        response.raise_for_status()
        if response.content:
            return response.json()
        return {}
    except httpx.TimeoutException as error:
        raise BackendError("Превышено время ожидания ответа backend API.") from error
    except httpx.HTTPStatusError as error:
        message = extract_backend_message(error.response)
        raise BackendError(message, status=error.response.status_code) from error
    except httpx.RequestError as error:
        raise BackendError("Не удалось подключиться к backend API.") from error


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
    session.reanalysis_in_progress = False
    session.last_answer_slot = None


def choose_text(session: SessionState, key: str) -> str:
    return TEXTS[session.language][key]


def build_tracking_url(reference: str) -> Optional[str]:
    if not reference or reference == "-" or not TRACKING_URL_TEMPLATE:
        return None

    template = TRACKING_URL_TEMPLATE
    if "{reference}" in template:
        return template.replace("{reference}", reference)

    if "#" in template:
        base, anchor = template.split("#", 1)
        anchor_part = f"#{anchor}"
    else:
        base, anchor_part = template, ""

    base = base.rstrip()
    if not base:
        return None

    if base.endswith(("?", "&")):
        url = f"{base}ref={reference}{anchor_part}"
    elif "?" in base:
        url = f"{base}&ref={reference}{anchor_part}"
    else:
        separator = "?"
        url = f"{base}{separator}ref={reference}{anchor_part}"
    return url


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def format_submission_timestamp(session: SessionState) -> Optional[str]:
    dt = parse_iso_datetime(session.submission_time)
    if not dt:
        return None
    local_dt = dt.astimezone(LOCAL_TIMEZONE)
    date_part = local_dt.strftime("%d.%m.%Y")
    time_part = local_dt.strftime("%H:%M")
    return f"{date_part} · {time_part}"


def format_incident_time_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = value.strip()
    if not raw or raw.lower() == "unspecified":
        return None
    dt = parse_iso_datetime(raw)
    if dt:
        return dt.astimezone(LOCAL_TIMEZONE).strftime("%H:%M")

    match = re.match(r"^(?P<hour>\d{1,2}):(?P<minute>\d{2})", raw)
    if match:
        hour = int(match.group("hour")) % 24
        minute = match.group("minute")
        return f"{hour:02d}:{minute}"

    return raw


def gather_tuple_highlights(analysis: AnalyzeResponse, language: Literal["kk", "ru"]) -> Dict[str, Optional[str]]:
    tuples = analysis.get("tuples") or []

    routes: List[str] = []
    plates: List[str] = []
    places: List[str] = []
    times: List[str] = []

    place_labels = PLACE_LABELS[language]

    for item in tuples:
        objects = item.get("objects") or []
        for obj in objects:
            value = str(obj.get("value", "")).strip()
            if not value:
                continue
            if obj.get("type") == "route":
                routes.append(escape(value))
            elif obj.get("type") == "bus_plate":
                plates.append(escape(value))

        place = item.get("place") or {}
        kind = place.get("kind")
        place_value = str(place.get("value", "")).strip()
        if kind in place_labels and place_value:
            label = place_labels[kind]
            places.append(f"{label} «{escape(place_value)}»")
        elif place_value:
            places.append(escape(place_value))

        formatted_time = format_incident_time_value(item.get("time"))
        if formatted_time:
            times.append(escape(formatted_time))

    extracted = analysis.get("extractedFields") or {}

    if not routes:
        routes = [
            escape(str(route).strip())
            for route in extracted.get("routeNumbers", [])
            if str(route).strip()
        ]

    if not plates:
        plates = [
            escape(str(plate).strip())
            for plate in extracted.get("busPlates", [])
            if str(plate).strip()
        ]

    if not places:
        places = [
            escape(str(place).strip())
            for place in extracted.get("places", [])
            if str(place).strip()
        ]

    def unique(values: List[str]) -> Optional[str]:
        seen = set()
        ordered: List[str] = []
        for val in values:
            if val and val not in seen:
                seen.add(val)
                ordered.append(val)
        if not ordered:
            return None
        return ", ".join(ordered)

    return {
        "routes": unique(routes),
        "plates": unique(plates),
        "place": unique(places),
        "time": unique(times),
    }


def escape_multiline(text: str) -> str:
    escaped = escape(text)
    return escaped.replace("\r\n", "\n").replace("\r", "\n")


def combine_clarification(existing: Optional[str], addition: str) -> str:
    addition = addition.strip()
    if not addition:
        return existing or ""
    if not existing:
        return addition
    if addition in existing:
        return existing
    return f"{existing}\n{addition}"


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = get_session(context)
    reset_session(session)
    if update.message:
        text = f"{choose_text(session, 'greeting')}\n\n{choose_text(session, 'lang_prompt')}"
        await update.message.reply_text(
            text,
            disable_web_page_preview=True,
            reply_markup=build_language_keyboard(session.language),
        )


async def cmd_lang(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = get_session(context)
    message = update.message
    if not context.args:
        if message:
            await message.reply_text(
                choose_text(session, "lang_prompt"),
                reply_markup=build_language_keyboard(session.language),
            )
        return

    raw = context.args[0].lower()
    if raw in {"kk", "kz"}:
        new_lang: Literal["kk", "ru"] = "kk"
    elif raw == "ru":
        new_lang = "ru"
    else:
        if message:
            await message.reply_text(
                choose_text(session, "lang_unknown"),
                reply_markup=build_language_keyboard(session.language),
            )
        return

    if new_lang != session.language:
        apply_language(session, context, new_lang)

    if message:
        await message.reply_text(
            choose_text(session, "lang_switched"),
            reply_markup=build_language_keyboard(session.language),
        )


async def handle_language_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return

    session = get_session(context)
    data = (query.data or "").split(":")
    target_raw = data[1] if len(data) > 1 else ""

    if target_raw in {"kk", "kz"}:
        target: Literal["kk", "ru"] = "kk"
    elif target_raw == "ru":
        target = "ru"
    else:
        await query.answer()
        return

    changed = target != session.language
    if changed:
        apply_language(session, context, target)

    prompt_text = f"{choose_text(session, 'greeting')}\n\n{choose_text(session, 'lang_prompt')}"

    if query.message:
        await query.edit_message_text(
            prompt_text,
            disable_web_page_preview=True,
            reply_markup=build_language_keyboard(session.language),
        )

    feedback = choose_text(session, "lang_switched") if changed else choose_text(session, "lang_prompt")
    await query.answer(feedback)


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
        slot = session.pending_slot or session.last_answer_slot
        if not slot:
            session.stage = "description"
            await message.reply_text(choose_text(session, "ask_description"))
            return

        combined_value = combine_clarification(session.known_fields.get(slot), text)
        session.known_fields[slot] = combined_value
        session.clarifications[slot] = combined_value
        session.last_answer_slot = slot

        if session.reanalysis_in_progress:
            await message.reply_text(choose_text(session, "clarification_saved"))
            return

        session.reanalysis_in_progress = True
        await message.reply_text(choose_text(session, "clarification_saved"))
        try:
            await run_analysis(update, context, session)
        finally:
            session.reanalysis_in_progress = False

        if session.stage != "clarification":
            session.pending_slot = None
            session.last_answer_slot = None
        else:
            session.last_answer_slot = session.pending_slot
        return


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
        data = await request_json(
            client,
            "POST",
            "/api/analyze",
            json_payload=payload,
            timeout=ANALYZE_TIMEOUT_SECONDS,
        )
    except BackendError as error:
        logger.warning("Analyze backend error: %s", error.message)
        await update.message.reply_text(error.message or choose_text(session, "analyze_error"))
        session.stage = "description"
        return
    except Exception as error:  # noqa: BLE001
        logger.exception("Analyze request failed: %s", error)
        await update.message.reply_text(choose_text(session, "analyze_error"))
        session.stage = "description"
        return

    if not isinstance(data, dict):
        logger.error("Analyze response имеет неожиданный формат: %r", data)
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

    await show_preview(update, context, session)
    session.stage = "confirmation"


def normalize_analysis(payload: Dict[str, Any]) -> AnalyzeResponse:
    return AnalyzeResponse(
        needClarification=payload.get("need_clarification", False),
        missingSlots=payload.get("missing_slots", []) or [],
        priority=payload.get("priority", "medium"),
        tuples=payload.get("tuples", []) or [],
        aspectsCount=payload.get("aspects_count", {}) or {},
        recommendationKk=payload.get("recommendation_kk", ""),
        recommendationRu=payload.get("recommendation_ru", ""),
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


async def show_preview(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    session: SessionState,
) -> None:
    analysis = session.analysis
    if not analysis:
        await update.message.reply_text(choose_text(session, "analyze_error"))
        return

    summary_body = render_preview_summary(session)
    summary = (
        f"{choose_text(session, 'preview_title')}\n\n"
        f"{summary_body}\n\n"
        f"{choose_text(session, 'confirm')}"
    )

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

    await send_html_message(update, context, summary, reply_markup=keyboard)


def choose_recommendation_text(analysis: AnalyzeResponse, session: SessionState) -> str:
    if session.language == "ru":
        rec_ru = analysis.get("recommendationRu")
        if isinstance(rec_ru, str) and rec_ru.strip():
            return rec_ru.strip()
    rec_kk = analysis.get("recommendationKk")
    if isinstance(rec_kk, str) and rec_kk.strip():
        return rec_kk.strip()
    return "-"


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
        objects = item.get("objects") or []
        routes = [
            escape(str(obj.get("value", "")).strip())
            for obj in objects
            if obj.get("type") == "route" and str(obj.get("value", "")).strip()
        ]
        plates = [
            escape(str(obj.get("value", "")).strip())
            for obj in objects
            if obj.get("type") == "bus_plate" and str(obj.get("value", "")).strip()
        ]

        place = item.get("place") or {}
        place_kind = place.get("kind")
        place_value = escape(str(place.get("value", "")).strip())

        parts: List[str] = []
        if routes:
            parts.append(
                f"{PREVIEW_ICONS['routes']} <b>{PREVIEW_FIELD_LABELS[language]['routes']}:</b> {', '.join(routes)}"
            )
        if plates:
            parts.append(
                f"{PREVIEW_ICONS['plates']} <b>{PREVIEW_FIELD_LABELS[language]['plates']}:</b> {', '.join(plates)}"
            )
        if place_kind in PLACE_LABELS[language] and place_value:
            parts.append(
                f"{PREVIEW_ICONS['place']} <b>{PLACE_LABELS[language][place_kind]}:</b> {place_value}"
            )
        elif place_value:
            parts.append(f"{PREVIEW_ICONS['place']} {place_value}")

        time_value = format_incident_time_value(item.get("time"))
        if time_value:
            parts.append(
                f"{PREVIEW_ICONS['time']} <b>{PREVIEW_FIELD_LABELS[language]['time']}:</b> {escape(time_value)}"
            )

        aspects = item.get("aspects") or []
        if aspects:
            label_map = ASPECT_LABELS[language]
            mapped = ", ".join(label_map.get(a, a) for a in aspects)
            parts.append(
                f"{PREVIEW_ICONS['aspects']} <b>{PREVIEW_FIELD_LABELS[language]['aspects']}:</b> {escape(mapped)}"
            )

        content = "\n".join(parts) if parts else "—"
        lines.append(f"<b>{idx}.</b> {content}")
    return "\n".join(lines)


def render_preview_summary(session: SessionState) -> str:
    analysis = session.analysis or AnalyzeResponse()
    language = session.language
    labels = PREVIEW_FIELD_LABELS[language]
    icons = PREVIEW_ICONS

    priority_raw = analysis.get("priority", "medium")
    priority_label = PRIORITY_LABELS[language].get(priority_raw, priority_raw)

    highlights = gather_tuple_highlights(analysis, language)
    aspects_value = format_aspects(analysis.get("aspectsCount") or {}, language)
    tuples_section = format_tuples(analysis.get("tuples") or [], language, session)
    recommendation_text = choose_recommendation_text(analysis, session)

    fields: List[str] = []

    def add_field(key: str, value: Optional[str]) -> None:
        if value is None:
            return
        icon = icons.get(key, "•")
        label = labels[key]
        fields.append(f"{icon} <b>{label}:</b> {value}")

    add_field("priority", escape(priority_label))

    submitted_at = format_submission_timestamp(session)
    if submitted_at:
        add_field("submitted_at", escape(submitted_at))

    add_field("place", highlights.get("place") or "—")
    add_field("time", highlights.get("time") or "—")
    add_field("routes", highlights.get("routes") or "—")
    add_field("plates", highlights.get("plates") or "—")
    add_field("aspects", escape(aspects_value))

    attachments_value = str(len(session.media)) if session.media else "—"
    add_field("attachments", attachments_value)

    sections: List[str] = ["\n".join(fields)]

    description_text = (session.description or "").strip()
    if description_text:
        sections.append(
            f"{icons['description']} <b>{labels['description']}:</b>\n{escape_multiline(description_text)}"
        )

    if tuples_section:
        sections.append(f"{icons['tuples']} <b>{labels['tuples']}:</b>\n{tuples_section}")

    if recommendation_text.strip() and recommendation_text.strip() != "-":
        sections.append(
            f"{icons['recommendation']} <b>{labels['recommendation']}:</b> {escape_multiline(recommendation_text)}"
        )

    return "\n\n".join(section for section in sections if section)


async def send_html_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
) -> None:
    chat = update.effective_chat
    if update.message:
        await update.message.reply_text(
            text,
            parse_mode=ParseMode.HTML,
            reply_markup=reply_markup,
            disable_web_page_preview=True,
        )
    elif chat:
        await context.bot.send_message(
            chat_id=chat.id,
            text=text,
            parse_mode=ParseMode.HTML,
            reply_markup=reply_markup,
            disable_web_page_preview=True,
        )
    else:
        logger.warning("Не удалось отправить сообщение предпросмотра: отсутствует контекст чата.")


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

    payload: Dict[str, Any] = {
        "description": session.description,
        "priority": analysis["priority"],
        "tuples": analysis.get("tuples") or [],
        "analysis": serialize_analysis(analysis),
        "media": session.media,
        "isAnonymous": True,
        "source": "telegram",
        "submissionTime": session.submission_time
    }

    contact_data = session.known_fields.get("contact") if session.known_fields else None
    if isinstance(contact_data, dict) and any(contact_data.values()):
        payload["contact"] = contact_data

    client: httpx.AsyncClient = context.application.bot_data["http_client"]
    try:
        data = await request_json(
            client,
            "POST",
            "/api/submit",
            json_payload=payload,
            timeout=SUBMIT_TIMEOUT_SECONDS,
        )
    except BackendError as error:
        logger.warning("Submit backend error: %s", error.message)
        await query.edit_message_text(error.message or choose_text(session, "submit_fail"))
        reset_session(session)
        return
    except Exception as error:  # noqa: BLE001
        logger.exception("Submit failed: %s", error)
        await query.edit_message_text(choose_text(session, "submit_fail"))
        reset_session(session)
        return

    if not isinstance(data, dict):
        logger.error("Submit response имеет неожиданный формат: %r", data)
        await query.edit_message_text(choose_text(session, "submit_fail"))
        reset_session(session)
        return

    reference = data.get("referenceNumber") or "-"
    await query.edit_message_text(
      choose_text(session, "submit_ok").format(reference=reference)
    )

    tracking_url = build_tracking_url(reference)
    if tracking_url and query.message:
        keyboard = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        choose_text(session, "tracking_button"),
                        url=tracking_url,
                    )
                ]
            ]
        )
        await query.message.reply_text(
            choose_text(session, "tracking_prompt"),
            reply_markup=keyboard,
            disable_web_page_preview=True,
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
        "recommendation_ru": analysis.get("recommendationRu"),
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
    except BackendError as error:
        logger.warning("Media upload failed with backend error: %s", error.message)
        await message.reply_text(error.message or choose_text(session, "media_error"))
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
    try:
        data = await request_json(
            client,
            "POST",
            "/api/media/upload",
            files=files,
            timeout=MEDIA_TIMEOUT_SECONDS,
        )
    except BackendError as error:
        logger.warning("Media upload backend error: %s", error.message)
        raise
    if not isinstance(data, dict):
        raise BackendError("Некорректный ответ сервера при загрузке медиа.")
    return data


async def post_init(application: Application) -> None:
    application.bot_data["http_client"] = httpx.AsyncClient(
        base_url=API_BASE,
        timeout=API_TIMEOUT_SECONDS,
    )
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
    application.add_handler(CallbackQueryHandler(handle_language_callback, pattern="^lang:"))
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


def main() -> None:
    application = build_application()
    application.run_polling()


if __name__ == "__main__":
    main()
