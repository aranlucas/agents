import type { Case } from "@/types/case";

export const pulpTherapyCases: Case[] = [
  {
    id: "4",
    title: "Deep Caries in a Primary Molar - Vital Pulp Therapy Decision",
    category: "Pulp Therapy",
    presentation:
      "A 6-year-old has deep dentinal caries on tooth L with provoked pain to cold/sweets that resolves quickly. No spontaneous/night pain, swelling, or sinus tract. Tooth is restorable.",
    clinicalFindings: [
      "Deep cavitated lesion on tooth L",
      "No swelling or fistula",
      "No pathologic mobility",
      "Pain only with stimulus, no lingering spontaneous pain",
    ],
    radiographicFindings: [
      "Deep caries approximating pulp",
      "No furcation/periapical radiolucency",
      "Physiologic root resorption only",
    ],
    questions: [
      "What pulpal diagnosis is most likely?",
      "Would you choose indirect pulp treatment or pulpotomy, and why?",
      "What restorative endpoint is preferred for longevity?",
      "Which follow-up findings define success versus failure?",
    ],
    modelResponse: {
      diagnosis:
        "Deep caries with signs consistent with reversible pulpitis in a vital primary molar",
      differentialDiagnosis: [
        "Early irreversible pulpitis",
        "Asymptomatic pulpal necrosis (less likely with current findings)",
      ],
      treatmentPlan: [
        "Use local anesthesia and rubber dam isolation",
        "Perform selective caries removal while preserving pulpal vitality",
        "Proceed with indirect pulp treatment when no uncontrolled exposure occurs",
        "If exposure occurs and hemostasis is achievable with vital radicular pulp, perform pulpotomy with a calcium-silicate material",
        "Place definitive full-coverage restoration (typically stainless steel crown) for multi-surface deep lesions",
        "Reassess clinically and radiographically at periodic intervals",
      ],
      rationale:
        "For a restorable tooth with vital pulp signs and no radiographic pathosis, biologically based vital pulp therapy can preserve function until normal exfoliation while minimizing overtreatment.",
      keyPoints: [
        "Diagnosis drives therapy: symptoms + exam + radiographs together.",
        "Do not default to pulpectomy when reversible pulp signs are present.",
        "Definitive coronal seal is critical for pulpal outcome.",
        "Failure signs include spontaneous pain, swelling/fistula, pathologic mobility, or new furcation pathosis.",
      ],
    },
    references: [
      {
        title: "AAPD Pulp Therapy for Primary and Immature Permanent Teeth",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/pulp-therapy-for-primary-and-immature-permanent-teeth/",
        type: "guideline",
      },
      {
        title: "AAPD Use of Vital Pulp Therapies in Primary Teeth",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/vital_pulp_therapies_in_primary_teeth_with_deep_caries_lesions/",
        type: "guideline",
      },
      {
        title: "AAPD Use of Vital Pulp Therapies in Permanent Teeth",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/g_vpt-permanentteeth.pdf",
        type: "guideline",
      },
      {
        title: "Use of Vital Pulp Therapies in Primary Teeth (PubMed)",
        url: "https://pubmed.ncbi.nlm.nih.gov/38449041/",
        type: "article",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 20,
  },
];
