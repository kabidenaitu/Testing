import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from textwrap import dedent
from typing import Any, Dict, Iterable, List, Literal, Optional, Set, Tuple

import torch
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from dotenv import load_dotenv
from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig

try:
    from transformers import BitsAndBytesConfig
except ImportError:  # pragma: no cover
    BitsAndBytesConfig = None  # type: ignore

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=False)
load_dotenv(BASE_DIR / ".env.local", override=False)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

DEFAULT_MODEL_ID = "issai/LLama-3.1-KazLLM-1.0-8B"
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "400"))
LLM_DISABLED = os.getenv("LLM_DISABLED", "1").lower() in {"1", "true", "yes"}
PRIORITY_VALUES: Tuple[Literal["low", "medium", "high", "critical"], ...] = (
    "low",
    "medium",
    "high",
    "critical",
)
ASPECT_NAMES: Tuple[
    Literal["punctuality", "crowding", "safety", "staff", "condition", "payment", "other"],
    ...
] = (
    "punctuality",
    "crowding",
    "safety",
    "staff",
    "condition",
    "payment",
    "other",
)
TUPLE_OBJECT_TYPES = {"route", "bus_plate"}
SCHEMA_EXAMPLE = dedent(
    """\
    {
      "need_clarification": false,
      "missing_slots": ["reported_time"],
      "priority": "medium",
      "tuples": [
        {
          "objects": [
            {"type": "route", "value": "12"}
          ],
          "time": "2024-03-18T12:30:00+00:00",
          "place": {"kind": "stop", "value": "Астана, Толе би 12"},
          "aspects": ["condition", "crowding"]
        }
      ],
      "aspects_count": {
        "punctuality": 0,
        "crowding": 1,
        "safety": 0,
        "staff": 0,
        "condition": 1,
        "payment": 0,
        "other": 0
      },
      "recommendation_kk": "Қызмет көрсетушіге техникалық жағдайды тексеруді тапсырыңыз.",
      "recommendation_ru": "Передайте оператору маршрута необходимость проверки состояния автобуса.",
      "language": "ru",
      "extracted_fields": {
        "route_numbers": ["12"],
        "bus_plates": [],
        "places": ["Астана, Толе би 12"]
      },
      "clarifying_question_kk": null,
      "clarifying_question_ru": "Укажите, во сколько произошла ситуация?"
    }
    """
).strip()

MANDATORY_SLOTS = ("route_numbers", "places", "reported_time")
CLARIFICATION_TEMPLATES = {
    "route_numbers": {
        "kk": (
            "Маршрут нөмірін немесе автобустың мемлекеттік нөмірін көрсетіңіз. "
            "Егер ол мәтінде болмаған болса, шағымды осы дерекпен толықтырыңыз."
        ),
        "ru": (
            "Укажите номер маршрута или госномер автобуса. Если его не было, "
            "отправьте краткое уточнение с этим номером."
        ),
    },
    "places": {
        "kk": (
            "Оқиға болған орынды (аялдама, көше атауы) нақты жазыңыз және "
            "шағымыңызға осы мәліметті қосып қайта жіберіңіз."
        ),
        "ru": (
            "Укажите точное место происшествия (остановка, улица). Добавьте это "
            "уточнение к жалобе и отправьте снова."
        ),
    },
    "reported_time": {
        "kk": (
            "Оқиға болған күн мен уақытты көрсетіңіз (мысалы, 2024-04-18 08:30). "
            "Осы мәліметпен шағымды қайта жіберіңіз."
        ),
        "ru": (
            "Укажите дату и время происшествия (например, 2024-04-18 08:30). "
            "Добавьте это уточнение и отправьте жалобу повторно."
        ),
    },
}


class AnalyzeRequest(BaseModel):
    description: str = Field(..., min_length=1)
    known_fields: Dict[str, Any] = Field(default_factory=dict, alias="knownFields")
    submission_time_iso: Optional[str] = Field(None, alias="submission_time_iso")

    model_config = ConfigDict(populate_by_name=True)


class TupleObject(BaseModel):
    type: str
    value: str


class TuplePlace(BaseModel):
    kind: Literal["stop", "street", "crossroad"]
    value: str


class ComplaintTuple(BaseModel):
    objects: List[TupleObject]
    time: str
    place: Optional[TuplePlace] = None
    aspects: List[
        Literal[
            "punctuality",
            "crowding",
            "safety",
            "staff",
            "condition",
            "payment",
            "other",
        ]
    ]


class AspectsCount(BaseModel):
    punctuality: int
    crowding: int
    safety: int
    staff: int
    condition: int
    payment: int
    other: int


class ExtractedFields(BaseModel):
    route_numbers: List[str] = Field(default_factory=list)
    bus_plates: List[str] = Field(default_factory=list)
    places: List[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    need_clarification: bool
    missing_slots: List[str]
    priority: Literal["low", "medium", "high", "critical"]
    tuples: List[ComplaintTuple]
    aspects_count: AspectsCount
    recommendation_kk: str
    recommendation_ru: str
    language: Literal["kk", "ru"]
    extracted_fields: ExtractedFields
    clarifying_question_kk: Optional[str] = None
    clarifying_question_ru: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


app = FastAPI(title="KazLLM Complaint Analyzer", version="1.0.0")


@lru_cache(maxsize=1)
def _load_tokenizer() -> AutoTokenizer:
    model_id = os.getenv("MODEL_ID", DEFAULT_MODEL_ID)
    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    return tokenizer


@lru_cache(maxsize=1)
def _load_model() -> AutoModelForCausalLM:
    model_id = os.getenv("MODEL_ID", DEFAULT_MODEL_ID)
    use_4bit = os.getenv("USE_4BIT", "0").lower() in {"1", "true", "yes"}
    device_map_setting = os.getenv("DEVICE_MAP", "auto").lower()
    kwargs: Dict[str, Any] = {}

    resolved_device_map: Optional[str] = None
    if device_map_setting != "none":
        candidate = device_map_setting if device_map_setting != "auto" else "auto"
        if candidate == "auto":
            try:
                import accelerate  # noqa: F401
                resolved_device_map = "auto"
            except ImportError:
                logger.warning(
                    "Accelerate не установлен, пропускаем device_map='auto'. "
                    "Модель будет загружена с явным переносом на устройство."
                )
        else:
            resolved_device_map = candidate

    if resolved_device_map:
        kwargs["device_map"] = resolved_device_map

    if use_4bit and BitsAndBytesConfig is not None:
        logger.info("Загружаем модель %s в 4-битном режиме", model_id)
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
        )
    else:
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        kwargs["dtype"] = dtype
        logger.info("Загружаем модель %s в стандартном режиме (dtype=%s)", model_id, dtype)

    model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True, **kwargs)

    if not resolved_device_map:
        if torch.cuda.is_available():
            preferred_device = os.getenv("TORCH_DEVICE", "cuda")
            logger.info("Переносим модель на устройство %s", preferred_device)
            model.to(preferred_device)
        else:
            logger.info("Модель будет работать на CPU")

    return model


def _build_messages(payload: AnalyzeRequest) -> List[Dict[str, str]]:
    system_prompt = dedent(
        f"""
        Ты — аналитик общественного транспорта Астаны.
        Твоя задача — анализировать жалобы пассажиров и возвращать строго валидный JSON в нижнем регистре полей.
        Требования:
        1. Ответ содержит только один JSON-объект без комментариев или лишнего текста.
        2. Используй имена полей ровно как в схеме, не добавляй новые ключи и не опускай обязательные.
        3. Значения:
           - priority ∈ ["low", "medium", "high", "critical"].
           - language ∈ ["kk", "ru"] и отражает язык жалобы.
           - missing_slots — список строк (оставь пустым список, если нечего уточнять).
           - tuples — список объектов; если данных нет, верни пустой список.
           - aspects_count содержит все семь полей и целые числа >= 0.
           - recommendation_kk и recommendation_ru — текст (может быть пустой, если не применимо).
           - clarifying_question_kk и clarifying_question_ru — строка или null.
        4. Обязательные данные: маршрут (route_numbers или bus_plates), место (place.kind + place.value) и время происшествия (reported_time или tuples[].time).
           - Если их нет ни в жалобе, ни в known_fields, добавь соответствующие ключи ("route_numbers", "places", "reported_time") в missing_slots.
           - Пока обязательные данные не получены, устанавливай need_clarification=true и формулируй вопросы так, чтобы пользователь повторно прислал жалобу с уточнением.
        5. Если данных недостаточно, добавь названия недостающих слотов в missing_slots и сформулируй вопрос на соответствующем языке (kk/ru), требуя дослать информацию.
        Схема и пример ответа:
        {SCHEMA_EXAMPLE}
        Возвращай строго JSON по этой схеме.
        """
    ).strip()
    user_payload = {
        "complaint": payload.description,
        "known_fields": payload.known_fields,
        "submission_time_iso": payload.submission_time_iso,
    }
    message = json.dumps(user_payload, ensure_ascii=False, indent=2)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]


def _generate_response(messages: List[Dict[str, str]]) -> str:
    tokenizer = _load_tokenizer()
    model = _load_model()

    encoded = tokenizer.apply_chat_template(
        messages,
        return_tensors="pt",
        add_generation_prompt=True,
    )

    if isinstance(encoded, torch.Tensor):
        input_ids = encoded.to(model.device)
        attention_mask = torch.ones_like(input_ids, dtype=torch.long, device=model.device)
    else:
        if hasattr(encoded, "to"):
            encoded = encoded.to(model.device)
        input_ids = encoded["input_ids"].to(model.device)
        attention_mask = encoded.get("attention_mask")
        if attention_mask is None:
            attention_mask = torch.ones_like(input_ids, dtype=torch.long, device=model.device)
        else:
            attention_mask = attention_mask.to(model.device)

    generation_config = GenerationConfig(
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        pad_token_id=tokenizer.eos_token_id,
        eos_token_id=tokenizer.eos_token_id,
    )

    with torch.no_grad():
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            generation_config=generation_config,
        )

    prompt_length = input_ids.shape[-1]
    generated_tokens = outputs[0][prompt_length:]
    text = tokenizer.decode(generated_tokens, skip_special_tokens=True)
    return text.strip()


def _extract_json(payload: str) -> Dict[str, Any]:
    candidate = payload.strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("JSON boundaries not found")

    json_text = candidate[start : end + 1]
    return json.loads(json_text)


def _ensure_string(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        candidate = value.strip()
        return candidate if candidate else fallback
    if value is None:
        return fallback
    candidate = str(value).strip()
    return candidate if candidate else fallback


def _ensure_str_list(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    result: List[str] = []
    for item in raw:
        if isinstance(item, str):
            stripped = item.strip()
            if stripped:
                result.append(stripped)
    return result


def _normalize_aspects(raw: Any) -> List[str]:
    aspects = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str) and item in ASPECT_NAMES:
                aspects.append(item)
    if not aspects:
        aspects = ["other"]
    return aspects


def _normalize_aspects_count(raw: Any, aspects: List[str]) -> Dict[str, int]:
    result = {name: 0 for name in ASPECT_NAMES}
    if isinstance(raw, dict):
        for name in ASPECT_NAMES:
            value = raw.get(name)
            if isinstance(value, int) and value >= 0:
                result[name] = value
    if not any(result.values()) and aspects:
        for aspect in aspects:
            result[aspect] += 1
    return result


def _normalize_extracted_fields(raw: Any) -> Dict[str, List[str]]:
    route_numbers: List[str] = []
    bus_plates: List[str] = []
    places: List[str] = []
    if isinstance(raw, dict):
        if isinstance(raw.get("route_numbers"), list):
            route_numbers = [str(item).strip() for item in raw["route_numbers"] if str(item).strip()]
        if isinstance(raw.get("bus_plates"), list):
            bus_plates = [str(item).strip() for item in raw["bus_plates"] if str(item).strip()]
        if isinstance(raw.get("places"), list):
            places = [str(item).strip() for item in raw["places"] if str(item).strip()]
    return {
        "route_numbers": route_numbers,
        "bus_plates": bus_plates,
        "places": places,
    }


def _normalize_known_field_list(raw: Any) -> List[str]:
    if raw is None:
        return []

    if isinstance(raw, str):
        cleaned = raw.strip()
        return [cleaned] if cleaned else []

    result: List[str] = []
    if isinstance(raw, (list, tuple, set)):
        for item in raw:
            cleaned = _ensure_string(item)
            if cleaned:
                result.append(cleaned)
    elif isinstance(raw, dict):
        for value in raw.values():
            cleaned = _ensure_string(value)
            if cleaned:
                result.append(cleaned)

    return result


def _enforce_mandatory_slots(
    normalized: Dict[str, Any],
    payload: AnalyzeRequest,
) -> Dict[str, Any]:
    tuples = normalized.get("tuples") or []
    extracted = normalized.get("extracted_fields") or {}
    existing_missing = [slot for slot in _ensure_str_list(normalized.get("missing_slots")) if slot]

    route_candidates: Set[str] = set()
    for item in tuples:
        if not isinstance(item, dict):
            continue
        for obj in item.get("objects") or []:
            if not isinstance(obj, dict):
                continue
            if obj.get("type") == "route":
                value = _ensure_string(obj.get("value"))
                if value:
                    route_candidates.add(value)
    route_candidates.update(_normalize_known_field_list(payload.known_fields.get("route_numbers")))
    route_candidates.update(_normalize_known_field_list(extracted.get("route_numbers")))

    place_candidates: Set[str] = set()
    for item in tuples:
        if not isinstance(item, dict):
            continue
        place = item.get("place")
        if isinstance(place, dict):
            value = _ensure_string(place.get("value"))
            if value:
                place_candidates.add(value)
    place_candidates.update(_normalize_known_field_list(payload.known_fields.get("places")))
    place_candidates.update(_normalize_known_field_list(extracted.get("places")))

    time_candidates: Set[str] = set()
    for item in tuples:
        if not isinstance(item, dict):
            continue
        value = _ensure_string(item.get("time"))
        if value:
            normalized_value = value.lower()
            if normalized_value not in {"", "unspecified", "unknown", "submission_time"}:
                time_candidates.add(value)
    for key in ("reported_time", "time"):
        candidate = _ensure_string(payload.known_fields.get(key))
        if candidate:
            time_candidates.add(candidate)

    mandatory_missing: List[str] = []
    if not route_candidates:
        mandatory_missing.append("route_numbers")
    if not place_candidates:
        mandatory_missing.append("places")
    if not time_candidates:
        mandatory_missing.append("reported_time")

    filtered_existing: List[str] = []
    for slot in existing_missing:
        if slot in MANDATORY_SLOTS and slot not in mandatory_missing:
            continue
        if slot not in filtered_existing:
            filtered_existing.append(slot)

    missing: List[str] = filtered_existing[:]
    for slot in MANDATORY_SLOTS:
        if slot in mandatory_missing and slot not in missing:
            missing.append(slot)

    if missing:
        normalized["need_clarification"] = True
        normalized["missing_slots"] = missing
        first_slot = missing[0]
        templates = CLARIFICATION_TEMPLATES.get(first_slot, {})
        if not _ensure_string(normalized.get("clarifying_question_ru")):
            normalized["clarifying_question_ru"] = templates.get("ru")
        if not _ensure_string(normalized.get("clarifying_question_kk")):
            normalized["clarifying_question_kk"] = templates.get("kk")
    else:
        normalized["missing_slots"] = []
        if normalized.get("need_clarification") and not normalized["missing_slots"]:
            normalized["need_clarification"] = False
        if not normalized.get("missing_slots"):
            if not normalized.get("clarifying_question_ru"):
                normalized["clarifying_question_ru"] = None
            if not normalized.get("clarifying_question_kk"):
                normalized["clarifying_question_kk"] = None

    return normalized


def _default_time(payload: AnalyzeRequest) -> str:
    for candidate in (
        _ensure_string(payload.submission_time_iso),
        _ensure_string(payload.known_fields.get("reported_time")),
        _ensure_string(payload.known_fields.get("time")),
    ):
        if candidate:
            return candidate
    return "unspecified"


def _normalize_tuples(raw: Any, payload: AnalyzeRequest) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    normalized: List[Dict[str, Any]] = []
    default_time = _default_time(payload)
    for item in raw:
        if not isinstance(item, dict):
            continue
        objects_raw = item.get("objects")
        normalized_objects: List[Dict[str, str]] = []
        if isinstance(objects_raw, list):
            for obj in objects_raw:
                if not isinstance(obj, dict):
                    continue
                obj_type = _ensure_string(obj.get("type"), "route")
                if obj_type not in TUPLE_OBJECT_TYPES:
                    continue
                value = _ensure_string(obj.get("value"))
                if not value:
                    continue
                normalized_objects.append({"type": obj_type, "value": value})

        place_raw = item.get("place")
        normalized_place: Optional[Dict[str, str]] = None
        if isinstance(place_raw, dict):
            kind = _ensure_string(place_raw.get("kind"))
            value = _ensure_string(place_raw.get("value"))
            if kind in {"stop", "street", "crossroad"} and value:
                normalized_place = {"kind": kind, "value": value}
        if not normalized_place:
            known_places = _normalize_known_field_list(payload.known_fields.get("places"))
            if known_places:
                normalized_place = {"kind": "stop", "value": known_places[0]}

        time_value = _ensure_string(item.get("time"), default_time)
        aspects = _normalize_aspects(item.get("aspects"))

        normalized.append(
            {
                "objects": normalized_objects,
                "time": time_value,
                "place": normalized_place,
                "aspects": aspects,
            }
        )
    return normalized


def _normalize_model_payload(data: Dict[str, Any], payload: AnalyzeRequest) -> Dict[str, Any]:
    normalized = dict(data)

    normalized["need_clarification"] = bool(normalized.get("need_clarification", False))
    normalized["missing_slots"] = _ensure_str_list(normalized.get("missing_slots"))

    priority = _ensure_string(normalized.get("priority"), "medium")
    if priority not in PRIORITY_VALUES:
        priority = "medium"
    normalized["priority"] = priority

    normalized_tuples = _normalize_tuples(normalized.get("tuples"), payload)
    normalized["tuples"] = normalized_tuples

    aspects_flat = [aspect for item in normalized_tuples for aspect in item.get("aspects", [])]
    normalized["aspects_count"] = _normalize_aspects_count(
        normalized.get("aspects_count"),
        aspects_flat,
    )

    rec_kk, rec_ru = _build_recommendations(priority)
    normalized["recommendation_kk"] = _ensure_string(
        normalized.get("recommendation_kk"),
        rec_kk,
    )
    normalized["recommendation_ru"] = _ensure_string(
        normalized.get("recommendation_ru"),
        rec_ru,
    )

    language = _ensure_string(normalized.get("language")).lower()
    if language not in {"kk", "ru"}:
        language = _detect_language(payload.description.lower())
    normalized["language"] = language

    normalized["extracted_fields"] = _normalize_extracted_fields(normalized.get("extracted_fields"))

    for key in ("clarifying_question_kk", "clarifying_question_ru"):
        value = normalized.get(key)
        if value is None:
            continue
        normalized[key] = _ensure_string(value)
        if not normalized[key]:
            normalized[key] = None

    return _enforce_mandatory_slots(normalized, payload)


def _call_model(payload: AnalyzeRequest) -> AnalyzeResponse:
    if LLM_DISABLED:
        logger.info("LLM отключён (LLM_DISABLED=1). Используем резервный анализатор.")
        return _fallback_analysis(payload)

    messages = _build_messages(payload)
    raw_output = _generate_response(messages)

    try:
        data = _normalize_model_payload(_extract_json(raw_output), payload)
        return AnalyzeResponse.model_validate(data)
    except Exception as first_error:  # noqa: B902
        logger.warning("Невалидный ответ модели: %s", first_error)

        retry_messages = messages + [
            {"role": "assistant", "content": raw_output},
            {
                "role": "user",
                "content": (
                    "Предыдущий ответ не является корректным JSON. "
                    "Повтори анализ и верни строго один JSON-объект с полями, перечисленными в схеме. "
                    "Не добавляй комментариев. Схема примера:\n"
                    f"{SCHEMA_EXAMPLE}"
                ),
            },
        ]

        retry_output = _generate_response(retry_messages)
        try:
            data = _normalize_model_payload(_extract_json(retry_output), payload)
            return AnalyzeResponse.model_validate(data)
        except Exception as second_error:  # noqa: B902
            logger.error(
                "Повторный ответ модели снова невалиден: %s. "
                "Переходим на резервный анализатор.",
                second_error,
            )
            return _fallback_analysis(payload)


def _fallback_analysis(payload: AnalyzeRequest) -> AnalyzeResponse:
    text = payload.description.strip()
    lower_text = text.lower()

    language = _detect_language(lower_text)
    priority = _detect_priority(lower_text)
    aspects, aspects_count = _detect_aspects(lower_text)

    route_numbers = _collect_routes(payload, lower_text)
    place_candidates = _normalize_known_field_list(payload.known_fields.get("places"))
    tuples: List[ComplaintTuple] = []
    if route_numbers:
        tuple_place: Optional[TuplePlace] = None
        if place_candidates:
            tuple_place = TuplePlace(kind="stop", value=place_candidates[0])
        tuples.append(
            ComplaintTuple(
                objects=[TupleObject(type="route", value=route) for route in route_numbers],
                time=payload.submission_time_iso
                or payload.known_fields.get("reported_time")  # type: ignore[arg-type]
                or "unspecified",
                place=tuple_place,
                aspects=aspects,
            )
        )

    extracted_fields = ExtractedFields(
        route_numbers=route_numbers,
        bus_plates=_collect_bus_plates(payload, lower_text),
        places=_collect_places(payload, lower_text),
    )

    recommendation_kk, recommendation_ru = _build_recommendations(priority)

    response = AnalyzeResponse(
        need_clarification=False,
        missing_slots=[],
        priority=priority,
        tuples=tuples,
        aspects_count=aspects_count,
        recommendation_kk=recommendation_kk,
        recommendation_ru=recommendation_ru,
        language=language,
        extracted_fields=extracted_fields,
        clarifying_question_kk=None,
        clarifying_question_ru=None,
    )

    enforced = _enforce_mandatory_slots(response.model_dump(), payload)
    return AnalyzeResponse.model_validate(enforced)


def _detect_language(lower_text: str) -> Literal["kk", "ru"]:
    kazakh_letters = {"ә", "ө", "ү", "ұ", "қ", "ғ", "ң", "һ", "і"}
    return "kk" if any(letter in lower_text for letter in kazakh_letters) else "ru"


def _detect_priority(lower_text: str) -> Literal["low", "medium", "high", "critical"]:
    critical_keywords = ["авар", "опас", "пожар", "дтп", "угроза", "қатты соқты"]
    if any(word in lower_text for word in critical_keywords):
        return "critical"

    high_keywords = ["мас", "драка", "не работает тормоз", "не остановился", "қатер"]
    if any(word in lower_text for word in high_keywords):
        return "high"

    medium_keywords = ["опозд", "задерж", "жарық жоқ", "гряз", "қатты суық", "кондиц"]
    if any(word in lower_text for word in medium_keywords):
        return "medium"

    return "low"


def _detect_aspects(lower_text: str) -> Tuple[List[str], AspectsCount]:
    aspects_selected: List[str] = []

    def check(words: Iterable[str]) -> bool:
        return any(word in lower_text for word in words)

    punctuality = int(check(["опозд", "опазд", "задерж", "кешікті"]))
    if punctuality:
        aspects_selected.append("punctuality")

    crowding = int(check(["переполн", "толп", "адам көп"]))
    if crowding:
        aspects_selected.append("crowding")

    safety = int(check(["опас", "драка", "қорқынышты", "авар"]))
    if safety:
        aspects_selected.append("safety")

    staff = int(check(["водител", "кондуктор", "жүргізуші", "хам"]))
    if staff:
        aspects_selected.append("staff")

    condition = int(check(["гряз", "грязн", "сын", "жарамсыз", "жыртылған", "холод", "ыстық"]))
    if condition:
        aspects_selected.append("condition")

    payment = int(check(["оплат", "валид", "касса", "төле"]))
    if payment:
        aspects_selected.append("payment")

    if not aspects_selected:
        aspects_selected.append("other")
        other = 1
    else:
        other = 0

    aspects_count = AspectsCount(
        punctuality=punctuality,
        crowding=crowding,
        safety=safety,
        staff=staff,
        condition=condition,
        payment=payment,
        other=other,
    )
    return aspects_selected, aspects_count


def _collect_routes(payload: AnalyzeRequest, lower_text: str) -> List[str]:
    routes = set(_normalize_known_field_list(payload.known_fields.get("route_numbers")))
    for match in re.findall(r"\b\d{1,3}\b", lower_text):
        routes.add(match)
    return sorted(routes)


def _collect_bus_plates(payload: AnalyzeRequest, lower_text: str) -> List[str]:
    plates = {
        value.upper()
        for value in _normalize_known_field_list(payload.known_fields.get("bus_plates"))
    }
    for match in re.findall(r"[a-zа-я]{1,2}\d{3}[a-zа-я]{2}", lower_text):
        plates.add(match.upper())
    return sorted(plates)


def _collect_places(payload: AnalyzeRequest, lower_text: str) -> List[str]:
    places = set(_normalize_known_field_list(payload.known_fields.get("places")))
    places.update(_normalize_known_field_list(payload.known_fields.get("place")))
    places.update(_normalize_known_field_list(payload.known_fields.get("location")))
    stop_keywords = ["остановк", "аялдама", "станция", "вокзал"]
    for word in stop_keywords:
        if word in lower_text:
            places.add(word)
    return sorted(places)


def _build_recommendations(
    priority: Literal["low", "medium", "high", "critical"]
) -> Tuple[str, str]:
    mapping_kk = {
        "critical": "Жауапты қызметтерге дереу хабарласып, қауіпсіздікті қамтамасыз ету қажет.",
        "high": "Маршрут операторы қадағалауды күшейтіп, жүргізушіге ескерту жасауы тиіс.",
        "medium": "Оқиғаға талдау жүргізіп, уақытылы қызмет көрсету үшін қосымша бақылау орнатыңыз.",
        "low": "Өтініш журналға жазылды, қайталанса — маршрут операторы қарастырады.",
    }
    mapping_ru = {
        "critical": "Нужно срочно передать информацию экстренным службам и обеспечить безопасность.",
        "high": "Рекомендуется провести проверку маршрута и уведомить водителя о нарушении.",
        "medium": "Следует усилить контроль за расписанием и условиями поездки на данном маршруте.",
        "low": "Обращение зафиксировано, при повторении ситуация будет передана оператору маршрута.",
    }
    return mapping_kk[priority], mapping_ru[priority]


def _dump_response(response: AnalyzeResponse) -> Dict[str, Any]:
    return response.model_dump()


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> Dict[str, Any]:
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="Поле description не должно быть пустым")

    try:
        response = await run_in_threadpool(_call_model, payload)
    except HTTPException:
        raise
    except Exception as error:  # noqa: B902
        logger.exception("Ошибка при обращении к модели: %s", error)
        raise HTTPException(status_code=500, detail="Ошибка сервиса анализа") from error

    return _dump_response(response)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
