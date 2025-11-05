import {
  AnalyzeResponse,
  AnalyticsSummary,
  ComplaintDraft,
  ComplaintRecord,
  ComplaintStatusInfo,
  ComplaintsListResponse,
  ComplaintSource,
  ComplaintStatus,
  MediaFile,
  Priority,
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
  recommendation_ru: string;
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

export const fetchAnalyticsSummary = async (authorization?: string): Promise<AnalyticsSummary> => {
  const response = await fetch('/api/analytics/summary', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {})
    }
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

interface FetchComplaintsParams {
  cursor?: string | null;
  limit?: number;
  priority?: Priority;
  status?: ComplaintStatus;
  source?: ComplaintSource;
  search?: string;
}

export const fetchComplaints = async (
  params: FetchComplaintsParams = {},
  authorization?: string
): Promise<ComplaintsListResponse> => {
  const searchParams = new URLSearchParams();

  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.cursor) {
    searchParams.set('cursor', params.cursor);
  }
  if (params.priority) {
    searchParams.set('priority', params.priority);
  }
  if (params.status) {
    searchParams.set('status', params.status);
  }
  if (params.source) {
    searchParams.set('source', params.source);
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }

  const queryString = searchParams.toString();
  const response = await fetch(`/api/complaints${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {})
    }
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось получить список обращений.');
  }

  const payload = (await response.json()) as ComplaintsListResponse;
  return {
    items: (payload.items ?? []).map((item) => normalizeComplaintRecord(item)),
    nextCursor: payload.nextCursor ?? null
  };
};

interface UpdateComplaintPayload {
  status: ComplaintStatus;
  adminComment?: string | null;
}

export const updateComplaint = async (
  id: string,
  payload: UpdateComplaintPayload,
  authorization?: string
): Promise<ComplaintRecord> => {
  const response = await fetch(`/api/complaints/${id}`, {
    method: 'PATCH',
    headers: {
      ...JSON_HEADERS,
      ...(authorization ? { Authorization: authorization } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось обновить статус обращения.');
  }

  const data = (await response.json()) as ComplaintRecord;
  return normalizeComplaintRecord(data);
};

export const fetchComplaintStatus = async (
  reference: string
): Promise<ComplaintStatusInfo> => {
  const trimmed = reference.trim();
  if (!trimmed) {
    throw new Error('REFERENCE_REQUIRED');
  }

  const response = await fetch(`/api/complaints/status/${encodeURIComponent(trimmed)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw await buildHttpError(response, 'Не удалось получить статус обращения.');
  }

  const payload = await response.json();
  return {
    referenceNumber: payload.referenceNumber ?? trimmed,
    status: payload.status ?? null,
    priority: payload.priority ?? null,
    submissionTime: payload.submissionTime ?? null,
    reportedTime: payload.reportedTime ?? null,
    statusUpdatedAt: payload.statusUpdatedAt ?? null,
    adminComment: payload.adminComment ?? null
  };
};

function normalizeComplaintRecord(record: ComplaintRecord): ComplaintRecord {
  return {
    id: record.id,
    referenceNumber: record.referenceNumber ?? null,
    priority: record.priority ?? null,
    status: record.status ?? null,
    source: record.source ?? null,
    submissionTime: record.submissionTime ?? null,
    reportedTime: record.reportedTime ?? null,
    rawText: record.rawText ?? null,
    tuples: record.tuples ?? [],
    analysis: record.analysis ?? null,
    media: record.media ?? [],
    isAnonymous: record.isAnonymous ?? null,
    contact: record.contact ?? null,
     adminComment: record.adminComment ?? null,
     statusUpdatedAt: record.statusUpdatedAt ?? null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null
  };
}

function mapAnalyzeResponse(data: AnalyzeResponseApi): AnalyzeResponse {
  return {
    needClarification: data.need_clarification,
    missingSlots: data.missing_slots,
    priority: data.priority,
    tuples: data.tuples ?? [],
    aspectsCount: data.aspects_count,
    recommendationKk: data.recommendation_kk,
    recommendationRu: data.recommendation_ru,
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
    recommendation_ru: analysis.recommendationRu,
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
