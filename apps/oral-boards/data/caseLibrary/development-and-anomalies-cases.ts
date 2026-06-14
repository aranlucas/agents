import type { Case } from "@/types/case";

export const developmentAndAnomaliesCases: Case[] = [
  {
    id: "3",
    title: "Molar Incisor Hypomineralization (MIH)",
    category: "Development and Anomalies",
    presentation:
      "A 7-year-old presents with cold sensitivity and food avoidance. Exam shows demarcated yellow-brown opacities and early posteruptive enamel breakdown on first permanent molars, with mild incisor opacities.",
    clinicalFindings: [
      "Demarcated opacities on first permanent molars",
      "Incisor opacities without cavitation",
      "Hypersensitivity to air/water stimulus",
      "Plaque retention around sensitive teeth",
    ],
    radiographicFindings: [
      "No pulpal pathology",
      "Normal root development for age",
      "No proximal cavitation in affected incisors",
    ],
    questions: [
      "What is the diagnosis and differential?",
      "How do you stage severity and immediate priorities?",
      "What restorative/preventive options are appropriate by severity?",
      "When should extraction and orthodontic coordination be considered?",
    ],
    modelResponse: {
      diagnosis: "Molar-incisor hypomineralization with symptomatic molar involvement",
      differentialDiagnosis: [
        "Fluorosis",
        "Amelogenesis imperfecta",
        "Post-eruptive enamel caries without developmental etiology",
      ],
      treatmentPlan: [
        "Document severity and symptom burden tooth-by-tooth",
        "Initiate sensitivity control and high-risk prevention protocol",
        "Seal or restore molars based on enamel integrity and breakdown extent",
        "Provide esthetic management for incisors only when it benefits function/psychosocial needs",
        "Use frequent recall to monitor breakdown risk and treatment durability",
        "Coordinate orthodontic planning before considering strategic extraction of poor-prognosis first permanent molars",
      ],
      rationale:
        "MIH management is severity-dependent and longitudinal. Early symptom control and durable protection of molars reduce breakdown risk, while extraction decisions require timing and interdisciplinary planning.",
      keyPoints: [
        "Demarcated defects plus hypersensitivity strongly support MIH.",
        "Not every affected tooth needs immediate definitive restorative intervention.",
        "Extraction decisions are growth-stage and orthodontic-context dependent.",
        "Frequent reassessment is core management, not optional follow-up.",
      ],
    },
    references: [
      {
        title: "AAPD Molar-Incisor Hypomineralization",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/molar-incisor-hypomineralization/",
        type: "guideline",
      },
      {
        title: "AAPD Best Practices: Molar-Incisor Hypomineralization (2024)",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_molar-incisor-hypomineralization.pdf",
        type: "guideline",
      },
      {
        title: "EAPD Best Clinical Practice Guidance for MIH (2022)",
        url: "https://www.eapd.eu/uploads/files/MIH_Best_Practice.pdf",
        type: "guideline",
      },
      {
        title: "Treatment Approaches to MIH: Systematic Review",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10671994/",
        type: "article",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 20,
  },
];
