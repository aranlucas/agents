import type { Case } from "@/types/case";

export const dentalTraumaCases: Case[] = [
  {
    id: "2",
    title: "Traumatic Injury - Avulsed Permanent Incisor",
    category: "Dental Trauma",
    presentation:
      "An 8-year-old presents 30 minutes after bicycle trauma with avulsion of tooth #8. The parent stored the tooth in tap water initially before transferring it to milk. The child is alert with minor lip laceration and no loss of consciousness.",
    clinicalFindings: [
      "Empty socket at #8 with mild bleeding",
      "Avulsed tooth crown intact",
      "Minor upper-lip soft tissue injury",
      "No gross mandibular or maxillary fracture signs",
    ],
    radiographicFindings: [
      "Avulsion socket without retained root fragment",
      "No obvious alveolar fracture",
      "Immature root morphology consistent with open apex",
    ],
    questions: [
      "Give your immediate management sequence.",
      "How do storage conditions and extra-oral time affect prognosis?",
      "What adjunctive medications and instructions are indicated?",
      "What follow-up and long-term complications must be discussed?",
    ],
    modelResponse: {
      diagnosis:
        "Avulsion of permanent maxillary central incisor with open apex",
      treatmentPlan: [
        "Perform focused trauma assessment and document baseline findings",
        "Handle tooth by crown only and gently rinse contaminants without scrubbing root surface",
        "Replant as soon as possible if no contraindication is identified",
        "Stabilize with a flexible splint for the recommended interval",
        "Review tetanus status and prescribe systemic antibiotics when indicated",
        "Give chlorhexidine/soft-diet/oral-hygiene instructions and strict return precautions",
        "Schedule serial follow-up visits with clinical and radiographic monitoring for years",
      ],
      rationale:
        "Avulsion outcomes depend heavily on prompt biologically gentle handling, rapid replantation, and disciplined follow-up. Management should explicitly balance immediate tooth survival with long-term risk of resorption and pulpal sequelae.",
      keyPoints: [
        "Time and storage medium are major prognostic determinants.",
        "State splint strategy, medication strategy, and follow-up strategy clearly.",
        "Counsel family early on ankylosis/resorption risk and uncertainty.",
        "Do not provide examiner-style answers as isolated memorized steps; explain why.",
      ],
    },
    references: [
      {
        title: "IADT Guidelines for Management of Traumatic Dental Injuries",
        url: "https://dentaltraumaguide.org/iadt-treatment-guidelines/",
        type: "guideline",
      },
      {
        title:
          "IADT Guidelines: Fractures and Luxations of Permanent Teeth (2020)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32475015/",
        type: "article",
      },
      {
        title: "IADT Guidelines: Injuries in the Primary Dentition (2020)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32458553/",
        type: "article",
      },
      {
        title: "AAPD Guidelines for Management of Acute Dental Trauma",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/guidelines-for-the-management-of-traumatic-dental-injuries-1-fracture-and-luxations-or-permanent-teeth/",
        type: "guideline",
      },
      {
        title: "Dental Trauma Guide",
        url: "https://dentaltraumaguide.org/",
        type: "guideline",
      },
    ],
    difficulty: "advanced",
    estimatedTime: 25,
  },
];
