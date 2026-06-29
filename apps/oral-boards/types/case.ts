interface Reference {
  title: string;
  url: string;
  type: "guideline" | "article" | "textbook" | "video";
}

export interface Case {
  id: string;
  title: string;
  category: string;
  presentation: string;
  clinicalFindings?: string[];
  radiographicFindings?: string[];
  questions: string[];
  modelResponse: {
    diagnosis: string;
    differentialDiagnosis?: string[];
    treatmentPlan: string[];
    rationale: string;
    keyPoints: string[];
  };
  references: Reference[];
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedTime: number; // in minutes
}
