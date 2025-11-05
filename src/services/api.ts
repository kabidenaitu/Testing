import {
  AnalyzeResponse,
  AnalyticsSummary,
  ComplaintDraft,
  MediaFile,
  SubmitResponse,
  UploadedMedia
} from '@/types/complaint';

interface AnalyzeResponseApi {
  need_clarification: boolean;
  missing_slots: string[];
  priority: AnalyzeResponse['priority'];
  tuples: AnalyzeResponse['tuples'];
  aspects_count: AnalyzeResponse['aspectsCount'];
  recommendation_kk: string;
  language: AnalyzeResponse['language'];
  extracted_fields: {
    route_numbers: string[];
    bus_plates: string[];
    places: string[];
  };
  clarifying_question_kk?: string;
  clarifying_question_ru?: string;
}

interface AnalyzeComplaintParams {
  description: string;
  knownFields?: Record<string, unknown>;
  submissionTimeIso?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export const analyzeComplaint = async ({
  description,
  knownFields = {},
  submissionTimeIso
}: AnalyzeComplaintParams): Promise<AnalyzeResponse> => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      description,
      knownFields,
      submission_time_iso: submissionTimeIso
    })
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось выполнить анализ жалобы.');
  }

  const data = (await response.json()) as AnalyzeResponseApi;
  return mapAnalyzeResponse(data);
};

export const submitComplaint = async (payload: ComplaintDraft): Promise<SubmitResponse> => {
  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(mapSubmitPayload(payload))
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось отправить жалобу.');
  }

  return (await response.json()) as SubmitResponse;
};

export const uploadMedia = async (file: File, kind?: MediaFile['type']): Promise<UploadedMedia> => {
  const formData = new FormData();
  formData.append('file', file);
  if (kind) {
    formData.append('kind', kind);
  }

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось загрузить файл.');
  }

  return (await response.json()) as UploadedMedia;
};

export const fetchAnalyticsSummary = async (): Promise<AnalyticsSummary> => {
  const response = await fetch('/api/analytics/summary', {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось получить аналитические данные.');
  }

  const payload = await response.json();
  return {
    topRoutes: payload.topRoutes ?? [],
    priorityDistribution: payload.priorityDistribution ?? {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    },
    aspectFrequency: payload.aspectFrequency ?? [],
    timeOfDayHeatmap: payload.timeOfDayHeatmap ?? []
  };
};

function mapAnalyzeResponse(data: AnalyzeResponseApi): AnalyzeResponse {
  return {
    needClarification: data.need_clarification,
    missingSlots: data.missing_slots,
    priority: data.priority,
    tuples: data.tuples ?? [],
    aspectsCount: data.aspects_count,
    recommendationKk: data.recommendation_kk,
    language: data.language,
    extractedFields: {
      routeNumbers: data.extracted_fields.route_numbers ?? [],
      busPlates: data.extracted_fields.bus_plates ?? [],
      places: data.extracted_fields.places ?? []
    },
    clarifyingQuestionKk: data.clarifying_question_kk,
    clarifyingQuestionRu: data.clarifying_question_ru
  };
}

function mapSubmitPayload(payload: ComplaintDraft) {
  return {
    description: payload.description,
    priority: payload.priority,
    tuples: payload.tuples ?? [],
    analysis: payload.analysis ? serializeAnalysis(payload.analysis) : null,
    media: payload.media ?? [],
    isAnonymous: payload.isAnonymous,
    contact: payload.contact,
    source: payload.source,
    submissionTime: payload.submissionTime,
    reportedTime: payload.reportedTime,
    status: payload.status
  };
}

function serializeAnalysis(analysis: AnalyzeResponse) {
  return {
    need_clarification: analysis.needClarification,
    missing_slots: analysis.missingSlots,
    priority: analysis.priority,
    tuples: analysis.tuples,
    aspects_count: analysis.aspectsCount,
    recommendation_kk: analysis.recommendationKk,
    language: analysis.language,
    extracted_fields: {
      route_numbers: analysis.extractedFields.routeNumbers,
      bus_plates: analysis.extractedFields.busPlates,
      places: analysis.extractedFields.places
    },
    clarifying_question_kk: analysis.clarifyingQuestionKk,
    clarifying_question_ru: analysis.clarifyingQuestionRu
  };
}

async function buildHttpError(response: Response, fallbackMessage: string) {
  let details: unknown = null;
  try {
    details = await response.json();
  } catch (error) {
    details = await response.text();
  }

  const message =
    (typeof details === 'object' && details && 'message' in details
      ? (details as Record<string, unknown>).message
      : undefined) || fallbackMessage;

  return new Error(`${message} (HTTP ${response.status})`);
}
