import type { Case } from "@/types/case";

export const cariesManagementCases: Case[] = [
  {
    id: "1",
    title: "Early Childhood Caries in a 3-Year-Old",
    category: "Caries Management",
    presentation:
      "A 3-year-old presents with extensive cavitated lesions on maxillary incisors and primary molars. The parent reports night-time bottle use, frequent carbohydrate snacks, and pain during meals. Medical history is noncontributory.",
    clinicalFindings: [
      "Multiple cavitated lesions on maxillary anterior teeth",
      "Active cavitated lesions on primary molars",
      "Visible plaque and gingival inflammation",
      "Cooperative but fearful behavior",
    ],
    radiographicFindings: [
      "Multi-surface caries in primary incisors and molars",
      "Lesions approaching the pulp on select molars",
      "No acute periapical pathology",
    ],
    questions: [
      "What is your diagnosis and caries-risk designation?",
      "How would you phase treatment and behavior guidance?",
      "Which teeth need pulp therapy versus definitive restorations?",
      "What prevention plan will you give the caregiver?",
    ],
    modelResponse: {
      diagnosis: "Severe early childhood caries (high caries risk)",
      differentialDiagnosis: [
        "Developmental enamel defects contributing to rapid progression",
        "Diet- and hygiene-mediated multifocal caries process",
      ],
      treatmentPlan: [
        "Complete comprehensive exam, risk assessment, and pain triage",
        "Prioritize infection and pain control for symptomatic teeth first",
        "Provide pulp therapy/restorative care based on pulpal diagnosis and restorability",
        "Use full-coverage restorations for heavily involved primary molars when indicated",
        "Restore esthetic/functionally important anterior teeth when feasible",
        "Apply fluoride varnish and establish a high-risk recall interval",
        "Deliver caregiver-centered diet counseling, bottle-weaning plan, and home-care coaching",
        "Consider sedation or general anesthesia when treatment needs exceed safe chairside cooperation",
      ],
      rationale:
        "This pattern represents a high-risk disease process requiring definitive treatment plus intensive prevention. Isolated restoration without behavior and risk-factor change has a high likelihood of relapse.",
      keyPoints: [
        "State disease severity and risk level up front to frame urgency.",
        "Treatment planning should be pulpal-diagnosis driven, not lesion-depth alone.",
        "Caries control fails without caregiver behavior change and close recall.",
        "Use age-appropriate behavior guidance and realistic visit sequencing.",
      ],
    },
    references: [
      {
        title:
          "AAPD Policy on Early Childhood Caries: Classifications, Consequences, and Preventive Strategies",
        url: "https://www.aapd.org/media/policies_guidelines/p_eccclassifications.pdf",
        type: "guideline",
      },
      {
        title:
          "AAPD Policy: Early Childhood Caries - Unique Challenges and Treatment Options",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/early-childhood-caries-unique-challenges-and-treatment-options/",
        type: "guideline",
      },
      {
        title:
          "AAPD Caries-Risk Assessment and Management for Infants, Children, and Adolescents",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/caries-risk-assessment-and-management-for-infants-children-and-adolescents/",
        type: "guideline",
      },
      {
        title: "AAPD Fluoride Therapy",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/fluoride-therapy/",
        type: "guideline",
      },
      {
        title:
          "McDonald and Avery's Dentistry for the Child and Adolescent, 11th Edition",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
        type: "textbook",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 20,
  },
];
