export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ComplaintSource = 'web' | 'telegram';
export type ComplaintStatus = 'pending' | 'approved' | 'resolved' | 'rejected';
export type TupleObjectType = 'route' | 'bus_plate';
export type TuplePlaceKind = 'stop' | 'street' | 'crossroad';
export type ComplaintAspect =
  | 'punctuality'
  | 'crowding'
  | 'safety'
  | 'staff'
  | 'condition'
  | 'payment'
  | 'other';
export type ClarificationLanguage = 'kk' | 'ru';

export interface MediaFile {
  id: string;
  file: File;
  preview: string;
  size: number;
  type: 'image' | 'video' | 'audio';
  uploaded?: UploadedMedia;
}

export interface UploadedMedia {
  id: string;
  type: 'image' | 'video' | 'audio';
  path: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
  durationSec?: number;
  originalName?: string;
  uploadedAt?: string;
}

export interface TupleObject {
  type: TupleObjectType;
  value: string;
}

export interface TuplePlace {
  kind: TuplePlaceKind;
  value: string;
}

export interface ComplaintTuple {
  objects: TupleObject[];
  time: string;
  place: TuplePlace;
  aspects: ComplaintAspect[];
}

export interface AspectsCount {
  punctuality: number;
  crowding: number;
  safety: number;
  staff: number;
  condition: number;
  payment: number;
  other: number;
}

export interface ExtractedFields {
  routeNumbers: string[];
  busPlates: string[];
  places: string[];
}

export interface ClarificationPrompt {
  slot: string;
  language: ClarificationLanguage;
  question: string;
}

export interface AnalyzeResponse {
  needClarification: boolean;
  missingSlots: string[];
  priority: Priority;
  tuples: ComplaintTuple[];
  aspectsCount: AspectsCount;
  recommendationKk: string;
  recommendationRu: string;
  language: ClarificationLanguage;
  extractedFields: ExtractedFields;
  clarifyingQuestionKk?: string;
  clarifyingQuestionRu?: string;
}

export interface ComplaintContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface ComplaintDraft {
  description: string;
  priority: Priority;
  tuples: ComplaintTuple[];
  analysis: AnalyzeResponse | null;
  media: UploadedMedia[];
  isAnonymous: boolean;
  contact?: ComplaintContact;
  source: ComplaintSource;
  submissionTime?: string;
  reportedTime?: string;
  status?: ComplaintStatus;
  adminComment?: string;
}

export interface ComplaintPreview {
  description: string;
  priority: Priority;
  tuples: ComplaintTuple[];
  mediaFiles: MediaFile[];
  isAnonymous: boolean;
  contact?: ComplaintContact;
  recommendation?: string;
  submissionTime?: string;
}

export interface ClarificationHistoryItem {
  slot: string;
  question: string;
  answer?: string;
}

export interface SubmitResponse {
  success: boolean;
  id: string;
  referenceNumber: string;
}

export interface AnalyticsSummary {
  topRoutes: Array<{ route: string; count: number }>;
  priorityDistribution: Record<Priority, number>;
  aspectFrequency: Array<{ aspect: string; count: number }>;
  timeOfDayHeatmap: Array<{ day: number; hour: number; count: number }>;
}

export interface ComplaintRecord {
  id: string;
  referenceNumber: string | null;
  priority: Priority | null;
  status: ComplaintStatus | null;
  source: ComplaintSource | null;
  submissionTime: string | null;
  reportedTime: string | null;
  rawText: string | null;
  tuples: ComplaintTuple[];
  analysis: unknown;
  media: UploadedMedia[];
  isAnonymous: boolean | null;
  contact?: ComplaintContact | null;
  adminComment: string | null;
  statusUpdatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ComplaintsListResponse {
  items: ComplaintRecord[];
  nextCursor: string | null;
}

export interface ComplaintStatusInfo {
  referenceNumber: string;
  status: ComplaintStatus | null;
  priority: Priority | null;
  submissionTime: string | null;
  reportedTime: string | null;
  statusUpdatedAt: string | null;
  adminComment: string | null;
}
