import json
import logging
import os
from functools import lru_cache
from typing import Any, Dict, List, Literal, Optional

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
            logger.error("Повторный ответ модели снова невалиден: %s", second_error)
            raise HTTPException(
                status_code=500,
                detail="LLM вернул невалидный JSON дважды",
            ) from second_error


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
