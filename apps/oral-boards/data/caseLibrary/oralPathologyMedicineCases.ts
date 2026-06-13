import type { Case } from "@/types/case";

export const oralPathologyMedicineCases: Case[] = [
  {
    id: "8",
    title: "Facial Cellulitis from Odontogenic Infection",
    category: "Oral Pathology & Medicine",
    presentation:
      "A 5-year-old presents with progressive right mandibular swelling, fever, and reduced oral intake over 24 hours. Parent reports prior toothache in tooth S and worsening overnight facial swelling.",
    clinicalFindings: [
      "Firm tender submandibular/facial swelling",
      "Carious, likely non-vital primary molar",
      "Mild trismus and discomfort",
      "Fever and malaise",
    ],
    radiographicFindings: [
      "Deep caries with periradicular pathology in affected primary molar",
      "Soft tissue swelling pattern concerning for spreading infection",
    ],
    questions: [
      "What are your immediate priorities and red flags?",
      "When is outpatient oral antibiotic therapy insufficient?",
      "How do you coordinate source control and medical escalation?",
      "What counseling do you provide on warning signs after discharge?",
    ],
    modelResponse: {
      diagnosis:
        "Odontogenic infection with facial cellulitis requiring urgent escalation assessment",
      differentialDiagnosis: [
        "Suppurative lymphadenitis",
        "Non-odontogenic deep neck space infection",
      ],
      treatmentPlan: [
        "Assess airway, hydration, systemic status, and progression risk immediately",
        "Escalate to emergency/hospital care when systemic toxicity, trismus, or rapid progression is present",
        "Coordinate definitive source control of odontogenic origin once medically stabilized",
        "Select antibiotic strategy as adjunctive therapy, not substitute for source control",
        "Provide explicit return precautions for breathing/swallowing issues, worsening swelling, fever persistence, or lethargy",
      ],
      rationale:
        "In pediatric facial cellulitis, delayed escalation can rapidly increase morbidity. Safe management prioritizes systemic risk assessment and definitive control of the dental source with interdisciplinary coordination.",
      keyPoints: [
        "Airway and systemic status outrank tooth-level details in initial triage.",
        "Antibiotics alone are inadequate when source control is deferred.",
        "State clear admission/escalation criteria during oral board responses.",
        "Discharge instructions are part of core management, not an afterthought.",
      ],
    },
    references: [
      {
        title: "AAPD Use of Antibiotic Therapy for Pediatric Dental Patients",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/use-of-antibiotic-therapy-for-pediatric-dental-patients/",
        type: "guideline",
      },
      {
        title: "AAPD Useful Medications for Oral Conditions",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/useful-medications-for-oral-conditions/",
        type: "guideline",
      },
      {
        title:
          "AAPD Oral Surgery in Infants, Children, Adolescents, and Individuals with Special Health Care Needs",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_oralsurgery25.pdf",
        type: "guideline",
      },
    ],
    difficulty: "advanced",
    estimatedTime: 22,
  },
  {
    id: "9",
    title: "Persistent Painless Lower-Lip Swelling",
    category: "Oral Pathology & Medicine",
    presentation:
      "A 10-year-old presents with a recurrent, painless bluish swelling on the lower labial mucosa for two months. Parent reports intermittent enlargement and spontaneous reduction after accidental lip biting.",
    clinicalFindings: [
      "Fluctuant dome-shaped lesion on lower labial mucosa",
      "No ulceration or signs of acute infection",
      "History of repetitive local trauma",
    ],
    questions: [
      "What is your most likely diagnosis and differential?",
      "Which findings support benign versus urgent pathology?",
      "What treatment and pathology workflow do you recommend?",
      "How do you counsel family about recurrence risk?",
    ],
    modelResponse: {
      diagnosis: "Mucocele of the lower lip",
      differentialDiagnosis: [
        "Traumatic fibroma",
        "Hemangioma/vascular lesion",
        "Minor salivary gland neoplasm (rare)",
      ],
      treatmentPlan: [
        "Document lesion size, color, duration, and recurrence pattern",
        "Perform or refer for definitive management with lesion and feeder-gland removal when indicated",
        "Submit tissue for histopathologic confirmation when excised",
        "Address traumatic habit triggers and provide recurrence counseling",
        "Arrange follow-up to evaluate healing and recurrence",
      ],
      rationale:
        "Most pediatric lower-lip mucoceles are benign but recurrent. Definitive treatment requires complete management of the lesion source and confirmation when tissue is removed.",
      keyPoints: [
        "Clinical history pattern is highly informative in oral soft tissue lesions.",
        "Do not skip pathology workflow when excisional specimens are obtained.",
        "Counseling on trauma reduction reduces recurrence risk.",
        "Escalate promptly if lesion behavior deviates from expected benign features.",
      ],
    },
    references: [
      {
        title:
          "AAPD Oral Pathology in Infants, Children, Adolescents, and Individuals with Special Health Care Needs",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_oralpathology25.pdf",
        type: "guideline",
      },
      {
        title:
          "AAPD Oral Surgery in Infants, Children, Adolescents, and Individuals with Special Health Care Needs",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_oralsurgery25.pdf",
        type: "guideline",
      },
      {
        title: "McDonald and Avery's Dentistry for the Child and Adolescent, 11th Edition",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
        type: "textbook",
      },
    ],
    difficulty: "intermediate",
    estimatedTime: 16,
  },
];
