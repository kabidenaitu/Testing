import { Complaint, AnalyzeResponse, SubmitResponse, MediaFile } from '@/types/complaint';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

// Mock responses for demonstration
const mockAnalyzeResponse: AnalyzeResponse = {
  needsClarification: true,
  questions: [
    {
      id: 'q1',
      question: 'Маршрут нөмірін көрсетіңіз?',
      field: 'route',
      answered: false,
    },
    {
      id: 'q2',
      question: 'Дәл қай уақытта болды?',
      field: 'time',
      answered: false,
    },
  ],
  extractedFields: {
    description: 'Sample extracted description',
    priority: 'medium',
    tuples: [
      {
        aspect: 'Жүргізушінің мәдениетсіздігі',
        location: 'Абай-Розыбакиев аялдамасы',
      },
    ],
  },
  priority: 'medium',
};

const mockSubmitResponse: SubmitResponse = {
  success: true,
  referenceNumber: `REF-${Date.now()}`,
};

export const analyzeComplaint = async (
  description: string,
  knownFields: Partial<Complaint>
): Promise<AnalyzeResponse> => {
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return mockAnalyzeResponse;
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, knownFields }),
  });

  if (!response.ok) {
    throw new Error('Failed to analyze complaint');
  }

  return response.json();
};

export const submitComplaint = async (complaint: Complaint): Promise<SubmitResponse> => {
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return mockSubmitResponse;
  }

  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(complaint),
  });

  if (!response.ok) {
    throw new Error('Failed to submit complaint');
  }

  return response.json();
};

export const uploadMedia = async (file: File): Promise<{ path: string }> => {
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { path: `/local/media/${file.name}` };
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload media');
  }

  return response.json();
};
