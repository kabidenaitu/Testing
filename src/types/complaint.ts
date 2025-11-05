export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface MediaFile {
  id: string;
  file: File;
  preview: string;
  size: number;
  type: 'image' | 'video' | 'audio';
}

export interface Tuple {
  route?: string;
  plate?: string;
  location?: string;
  time?: string;
  aspect?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  field: string;
  answered?: boolean;
  answer?: string;
}

export interface Complaint {
  id?: string;
  description: string;
  priority: Priority;
  tuples: Tuple[];
  media: MediaFile[];
  isAnonymous: boolean;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  recommendation?: string;
  submittedAt?: string;
  extractedTime?: string;
}

export interface AnalyzeResponse {
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  extractedFields: Partial<Complaint>;
  priority: Priority;
}

export interface SubmitResponse {
  success: boolean;
  referenceNumber: string;
}
