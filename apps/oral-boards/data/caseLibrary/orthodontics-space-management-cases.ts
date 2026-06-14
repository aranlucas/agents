import type { Case } from "@/types/case";

export const orthodonticsSpaceManagementCases: Case[] = [
  {
    id: "6",
    title: "Premature Loss of Primary Second Molar - Space Maintenance Strategy",
    category: "Orthodontics & Space Management",
    presentation:
      "A 6-year-old had extraction of tooth T two weeks ago due to non-restorable caries. The parent asks if treatment is needed now because the area is asymptomatic.",
    clinicalFindings: [
      "Healed extraction site at T",
      "No active infection",
      "Mixed dentition stage with early eruption changes",
    ],
    radiographicFindings: [
      "Unerupted #30 with incomplete eruption path",
      "Mild mesial drift tendency of adjacent teeth",
      "No local pathology around successor",
    ],
    questions: [
      "Is space maintenance indicated?",
      "Which appliance type is most appropriate in this eruption stage?",
      "What are contraindications or cautions for your plan?",
      "How will you monitor and transition once the permanent molar erupts?",
    ],
    modelResponse: {
      diagnosis: "Premature loss of a primary second molar with risk of arch-length loss",
      treatmentPlan: [
        "Assess eruption status and quantify space-loss risk before appliance selection",
        "Select a distal shoe or alternative space-maintenance approach based on first permanent molar eruption status",
        "Review oral hygiene, compliance, and medical considerations before placing subgingival components",
        "Provide periodic clinical/radiographic checks for appliance integrity and eruption progress",
        "Convert to a conventional maintenance approach once eruption milestones are reached",
      ],
      rationale:
        "Premature primary molar loss can create rapid space changes that complicate later occlusion. Timely, eruption-stage-specific intervention preserves options for future alignment and reduces comprehensive orthodontic burden.",
      keyPoints: [
        "Appliance choice depends on eruption stage, not a one-size-fits-all rule.",
        "Distal shoe decisions require strict follow-up and appropriate case selection.",
        "Space maintenance without hygiene/compliance planning has high failure risk.",
        "Document transition timing as permanent molars erupt.",
      ],
    },
    references: [
      {
        title: "AAPD Management of the Developing Dentition and Occlusion in Pediatric Dentistry",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-the-developing-dentition-and-occlusion-in-pediatric-dentistry/",
        type: "guideline",
      },
      {
        title: "AAPD Oral Health Policies and Recommendations Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/overview/",
        type: "guideline",
      },
      {
        title: "McDonald and Avery's Dentistry for the Child and Adolescent, 11th Edition",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
        type: "textbook",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 18,
  },
  {
    id: "7",
    title: "Anterior Crossbite in Mixed Dentition",
    category: "Orthodontics & Space Management",
    presentation:
      "A 9-year-old presents with a single-tooth anterior crossbite involving #9. Parent is concerned about esthetics and potential trauma to lower incisors.",
    clinicalFindings: [
      "Anterior crossbite of #9",
      "Mild incisal wear on opposing mandibular incisors",
      "No TMJ symptoms reported",
      "Cooperative patient with good hygiene",
    ],
    radiographicFindings: [
      "No supernumerary obstruction",
      "Adequate root development of involved incisors",
      "No obvious pathology affecting eruption path",
    ],
    questions: [
      "What diagnostic steps distinguish dental from skeletal etiology?",
      "When should interceptive treatment be initiated?",
      "Which appliance options are appropriate for this case?",
      "What findings would prompt referral to orthodontics instead of office interceptive care?",
    ],
    modelResponse: {
      diagnosis: "Mixed-dentition anterior crossbite requiring interceptive orthodontic evaluation",
      differentialDiagnosis: [
        "Pseudo-Class III functional shift",
        "Skeletal Class III pattern needing specialty management",
      ],
      treatmentPlan: [
        "Perform comprehensive occlusal/facial analysis and identify any functional shift",
        "Confirm absence of pathologic eruption barriers",
        "Initiate timely interceptive correction when dental etiology and favorable conditions are present",
        "Use simple, controlled appliance therapy with retention planning",
        "Refer early for specialty management if skeletal discrepancy or complex malocclusion is suspected",
      ],
      rationale:
        "Early mixed-dentition intervention can prevent traumatic occlusion and asymmetric adaptation, but only after etiology is correctly identified. Misclassifying skeletal cases as simple dental crossbite delays definitive treatment.",
      keyPoints: [
        "Define etiology before selecting appliance mechanics.",
        "Timing matters: delayed correction increases wear and functional adaptation.",
        "Include retention and relapse risk in the initial plan.",
        "Know referral thresholds and state them explicitly to examiners.",
      ],
    },
    references: [
      {
        title: "AAPD Management of the Developing Dentition and Occlusion in Pediatric Dentistry",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-the-developing-dentition-and-occlusion-in-pediatric-dentistry/",
        type: "guideline",
      },
      {
        title: "AAPD Acquired Temporomandibular Disorders in Infants, Children, and Adolescents",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/acquired-temporomandibular-disorders-in-infants-children-and-adolescents/",
        type: "guideline",
      },
      {
        title: "McDonald and Avery's Dentistry for the Child and Adolescent, 11th Edition",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
        type: "textbook",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 18,
  },
];
