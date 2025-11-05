import json
import logging
import os
import re
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

import torch
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig

try:
    from transformers import BitsAndBytesConfig
except ImportError:  # pragma: no cover
    BitsAndBytesConfig = None  # type: ignore


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

DEFAULT_MODEL_ID = "issai/LLama-3.1-KazLLM-1.0-8B"
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "400"))
LLM_DISABLED = os.getenv("LLM_DISABLED", "1").lower() in {"1", "true", "yes"}


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
        kwargs["torch_dtype"] = dtype
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
    system_prompt = (
        "Ты — аналитик общественного транспорта Астаны. "
        "Твоя задача — анализировать жалобы пассажиров и возвращать строго валидный JSON "
        "по заданной схеме без дополнительных комментариев. "
        "Не объясняй действия, отвечай только JSON-объектом."
    )
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

    inputs = tokenizer.apply_chat_template(
        messages,
        return_tensors="pt",
        add_generation_prompt=True,
    ).to(model.device)

    generation_config = GenerationConfig(
        max_new_tokens=MAX_NEW_TOKENS,
        temperature=0.0,
        do_sample=False,
        pad_token_id=tokenizer.eos_token_id,
    )

    with torch.no_grad():
        outputs = model.generate(
            inputs,
            generation_config=generation_config,
        )

    generated_tokens = outputs[0][inputs.shape[-1] :]
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


def _call_model(payload: AnalyzeRequest) -> AnalyzeResponse:
    if LLM_DISABLED:
        logger.info("LLM отключён (LLM_DISABLED=1). Используем резервный анализатор.")
        return _fallback_analysis(payload)

    messages = _build_messages(payload)
    raw_output = _generate_response(messages)

    try:
        data = _extract_json(raw_output)
        return AnalyzeResponse.model_validate(data)
    except Exception as first_error:  # noqa: B902
        logger.warning("Невалидный ответ модели: %s", first_error)

        retry_messages = messages + [
            {"role": "assistant", "content": raw_output},
            {
                "role": "user",
                "content": (
                    "Предыдущий ответ не является корректным JSON. "
                    "Исправь формат и верни строго JSON-объект без пояснений."
                ),
            },
        ]

        retry_output = _generate_response(retry_messages)
        try:
            data = _extract_json(retry_output)
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
    tuples: List[ComplaintTuple] = []
    if route_numbers:
        tuples.append(
            ComplaintTuple(
                objects=[TupleObject(type="route", value=route) for route in route_numbers],
                time=payload.submission_time_iso
                or payload.known_fields.get("reported_time")  # type: ignore[arg-type]
                or "unspecified",
                place=None,
                aspects=aspects,
            )
        )

    extracted_fields = ExtractedFields(
        route_numbers=route_numbers,
        bus_plates=_collect_bus_plates(payload, lower_text),
        places=_collect_places(payload, lower_text),
    )

    recommendation = _build_recommendation(priority, language)

    return AnalyzeResponse(
        need_clarification=False,
        missing_slots=[],
        priority=priority,
        tuples=tuples,
        aspects_count=aspects_count,
        recommendation_kk=recommendation if language == "kk" else "",
        language=language,
        extracted_fields=extracted_fields,
        clarifying_question_kk=None,
        clarifying_question_ru=None,
    )


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
    routes = set()
    routes.update(str(value) for value in payload.known_fields.get("route_numbers", []))
    for match in re.findall(r"\b\d{1,3}\b", lower_text):
        routes.add(match)
    return sorted(routes)


def _collect_bus_plates(payload: AnalyzeRequest, lower_text: str) -> List[str]:
    plates = set()
    plates.update(str(value) for value in payload.known_fields.get("bus_plates", []))
    for match in re.findall(r"[a-zа-я]{1,2}\d{3}[a-zа-я]{2}", lower_text):
        plates.add(match.upper())
    return sorted(plates)


def _collect_places(payload: AnalyzeRequest, lower_text: str) -> List[str]:
    places = set()
    places.update(str(value) for value in payload.known_fields.get("places", []))
    stop_keywords = ["остановк", "аялдама", "станция", "вокзал"]
    for word in stop_keywords:
        if word in lower_text:
            places.add(word)
    return sorted(places)


def _build_recommendation(priority: Literal["low", "medium", "high", "critical"], language: str) -> str:
    if language == "kk":
        mapping = {
            "critical": "Жауапты қызметтерге дереу хабарласып, қауіпсіздікті қамтамасыз ету қажет.",
            "high": "Маршрут операторы қадағалауды күшейтіп, жүргізушіге ескерту жасауы тиіс.",
            "medium": "Оқиғаға талдау жүргізіп, уақытылы қызмет көрсету үшін қосымша бақылау орнатыңыз.",
            "low": "Өтініш журналға жазылды, қайталанса — маршрут операторы қарастырады.",
        }
    else:
        mapping = {
            "critical": "Нужно срочно передать информацию экстренным службам и обеспечить безопасность.",
            "high": "Рекомендуется провести проверку маршрута и уведомить водителя о нарушении.",
            "medium": "Следует усилить контроль за расписанием и условиями поездки на данном маршруте.",
            "low": "Обращение зафиксировано, при повторении ситуация будет передана оператору маршрута.",
        }
    return mapping[priority]


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
