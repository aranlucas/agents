export interface StudyResource {
  name: string;
  url?: string;
}

export interface StudyMonth {
  month: string;
  monthNumber: number;
  focus: string;
  topics: string[];
  goals: string[];
  activities: string[];
  resources: StudyResource[];
}

export const studyPlan: StudyMonth[] = [
  {
    month: "January",
    monthNumber: 1,
    focus: "Foundation & Assessment",
    topics: [
      "Review exam format and expectations",
      "Growth and development milestones",
      "Oral anatomy and histology",
      "Caries risk assessment",
    ],
    goals: [
      "Understand the oral boards format and grading criteria",
      "Complete baseline knowledge assessment",
      "Establish study routine and schedule",
      "Organize study materials and resources",
    ],
    activities: [
      "Review AAPD exam guidelines",
      "Take practice baseline assessment",
      "Join or form study group",
      "Set up daily case review routine (use this app!)",
      "Review 2-3 cases per week in depth",
    ],
    resources: [
      {
        name: "AAPD Oral Health Policies & Recommendations",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/",
      },
      {
        name: "AAPD Reference Manual (Digital Edition)",
        url: "https://digitaleditions.walsworth.com/publication/?i=835077",
      },
      {
        name: "ABPD Certification Resources",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination",
      },
      {
        name: "ABPD 2026 Oral Clinical Examination Guide (PDF)",
        url: "https://www.abpd.org/download_file/view/951/276",
      },
      {
        name: "McDonald and Avery's Dentistry for the Child and Adolescent",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
      },
    ],
  },
  {
    month: "February",
    monthNumber: 2,
    focus: "Caries Management & Prevention",
    topics: [
      "Early Childhood Caries (ECC)",
      "Caries risk assessment tools (CAT, CAMBRA)",
      "Fluoride therapy protocols",
      "Dietary counseling",
      "Sealants and preventive resin restorations",
    ],
    goals: [
      "Master ECC diagnosis and management",
      "Understand evidence-based prevention strategies",
      "Memorize fluoride dosing and varnish protocols",
    ],
    activities: [
      "Daily case reviews focusing on caries management",
      "Create flashcards for fluoride protocols",
      'Practice explaining prevention to "parents" (role-play)',
      "Review 3-4 cases per week",
    ],
    resources: [
      {
        name: "AAPD Caries-risk Assessment and Management Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/caries-risk-assessment-and-management-for-infants-children-and-adolescents/",
      },
      {
        name: "AAPD Fluoride Therapy Best Practices",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/fluoride-therapy/",
      },
      {
        name: "AAPD Early Childhood Caries Resources",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/early-childhood-caries-unique-challenges-and-treatment-options/",
      },
      {
        name: "CDC Community Water Fluoridation",
        url: "https://www.cdc.gov/fluoridation/",
      },
    ],
  },
  {
    month: "March",
    monthNumber: 3,
    focus: "Pulp Therapy & Restorative Dentistry",
    topics: [
      "Pulp therapy for primary teeth (pulpotomy, pulpectomy)",
      "Pulp therapy for young permanent teeth",
      "Direct and indirect pulp capping",
      "Stainless steel crowns",
      "Composite and amalgam restorations",
    ],
    goals: [
      "Differentiate indications for various pulp therapies",
      "Understand success/failure criteria",
      "Master material selection rationale",
    ],
    activities: [
      "Create decision trees for pulp therapy selection",
      "Review radiographic interpretation",
      "Daily case reviews - pulp therapy focus",
      "Review 4-5 cases per week",
    ],
    resources: [
      {
        name: "AAPD Pulp Therapy Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/pulp-therapy-for-primary-and-immature-permanent-teeth/",
      },
      {
        name: "AAPD Vital Pulp Therapy in Primary Teeth",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/vital_pulp_therapies_in_primary_teeth_with_deep_caries_lesions/",
      },
      {
        name: "AAPD Vital Pulp Therapy in Permanent Teeth",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/use-of-vital-pulp-therapies-in-permanent-teeth/",
      },
    ],
  },
  {
    month: "April",
    monthNumber: 4,
    focus: "Trauma & Emergency Management",
    topics: [
      "Primary tooth trauma protocols",
      "Permanent tooth trauma (IADT guidelines)",
      "Avulsion management",
      "Crown fractures",
      "Root fractures and luxation injuries",
      "Follow-up protocols",
    ],
    goals: [
      "Memorize IADT guidelines for all trauma types",
      "Understand splinting techniques and duration",
      "Master follow-up timelines",
    ],
    activities: [
      "Create trauma flow charts",
      "Practice trauma case presentations",
      "Memorize extra-oral times and prognosis factors",
      "Review 4-5 trauma cases per week",
    ],
    resources: [
      {
        name: "IADT Treatment Guidelines",
        url: "https://dentaltraumaguide.org/iadt-treatment-guidelines/",
      },
      {
        name: "Dental Trauma Guide",
        url: "https://dentaltraumaguide.org/",
      },
      {
        name: "AAPD Traumatic Dental Injuries Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/guidelines-for-the-management-of-traumatic-dental-injuries-1-fracture-and-luxations-or-permanent-teeth/",
      },
    ],
  },
  {
    month: "May",
    monthNumber: 5,
    focus: "Development & Anomalies",
    topics: [
      "Dental development and eruption patterns",
      "Developmental anomalies (MIH, AI, DI)",
      "Ectopic eruption",
      "Supernumerary teeth",
      "Congenitally missing teeth",
      "Ankylosis",
    ],
    goals: [
      "Recognize and diagnose developmental anomalies",
      "Understand management of eruption disturbances",
      "Differentiate similar-appearing conditions",
    ],
    activities: [
      "Study radiographic features of anomalies",
      "Create comparison charts for similar conditions",
      "Daily case reviews - development focus",
      "Review 3-4 cases per week",
    ],
    resources: [
      {
        name: "AAPD Molar-Incisor Hypomineralization (MIH) Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/molar-incisor-hypomineralization/",
      },
      {
        name: "EAPD Best Clinical Practice Guidance for MIH",
        url: "https://www.eapd.eu/uploads/files/MIH_Best_Practice.pdf",
      },
      {
        name: "AAPD Developing Dentition Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-the-developing-dentition-and-occlusion-in-pediatric-dentistry/",
      },
    ],
  },
  {
    month: "June",
    monthNumber: 6,
    focus: "Behavior Guidance & Sedation",
    topics: [
      "Behavior guidance techniques",
      "Pharmacological management",
      "Nitrous oxide sedation",
      "Oral sedation protocols",
      "General anesthesia indications",
      "Special needs patients",
    ],
    goals: [
      "Master AAPD behavior guidance guidelines",
      "Understand sedation dosing and monitoring",
      "Know contraindications and complications",
    ],
    activities: [
      "Review sedation drug dosing calculations",
      "Study ASA classification",
      "Practice behavior management scenarios",
      "Review 3-4 cases per week including special needs",
    ],
    resources: [
      {
        name: "AAPD Behavior Guidance Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/behavior-guidance-for-the-pediatric-dental-patient/",
      },
      {
        name: "AAPD Sedation Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/monitoring-and-management-of-pediatric-patients-before-during-and-after-sedation-for-diagnostic-and-therapeutic-procedures/",
      },
      {
        name: "AAPD Special Health Care Needs Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-dental-patients-with-special-health-care-needs/",
      },
    ],
  },
  {
    month: "July",
    monthNumber: 7,
    focus: "Orthodontics & Space Management",
    topics: [
      "Early orthodontic assessment",
      "Space analysis",
      "Space maintainers",
      "Habit appliances",
      "Interceptive orthodontics",
      "Timing for orthodontic referral",
    ],
    goals: [
      "Understand space analysis methods",
      "Know indications for space maintenance",
      "Master timing for intervention",
    ],
    activities: [
      "Practice space analysis calculations",
      "Review appliance designs",
      "Study growth and development patterns",
      "Review 3-4 orthodontic cases per week",
    ],
    resources: [
      {
        name: "AAPD Developing Dentition and Occlusion Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-the-developing-dentition-and-occlusion-in-pediatric-dentistry/",
      },
      {
        name: "AAPD Acquired Temporomandibular Disorders Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/acquired-temporomandibular-disorders-in-infants-children-and-adolescents/",
      },
    ],
  },
  {
    month: "August",
    monthNumber: 8,
    focus: "Oral Pathology & Medicine",
    topics: [
      "Soft tissue lesions",
      "Oral manifestations of systemic disease",
      "Mucosal lesions",
      "Salivary gland disorders",
      "Odontogenic infections",
      "Antibiotic prescribing",
    ],
    goals: [
      "Recognize common pediatric oral pathology",
      "Understand when to refer vs. manage",
      "Master antibiotic selection and dosing",
    ],
    activities: [
      "Create pathology image reference guide",
      "Review antibiotic dosing by weight",
      "Study systemic disease manifestations",
      "Review 4-5 pathology cases per week",
    ],
    resources: [
      {
        name: "AAPD Antibiotic Prophylaxis Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/antibiotic-prophylaxis-for-dental-patients-at-risk-for-infection/",
      },
      {
        name: "AAPD Use of Antibiotic Therapy Guidelines",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/use-of-antibiotic-therapy-for-pediatric-dental-patients/",
      },
      {
        name: "AAPD Oral Health Policies Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/overview/",
      },
    ],
  },
  {
    month: "September",
    monthNumber: 9,
    focus: "Integration & Practice Cases",
    topics: [
      "Complex multi-disciplinary cases",
      "Treatment sequencing",
      "Risk-benefit analysis",
      "Evidence-based decision making",
      "Case presentation skills",
    ],
    goals: [
      "Integrate all knowledge areas",
      "Practice comprehensive case presentations",
      "Refine communication skills",
    ],
    activities: [
      "Daily comprehensive case presentations",
      "Timed practice presentations (10-15 min)",
      "Mock oral board sessions with study group",
      "Review 5-7 complex cases per week",
      "Record and review your presentations",
    ],
    resources: [
      {
        name: "AAPD All Guidelines & Best Practices",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/overview/",
      },
      {
        name: "AAPD Reference Manual (Digital Edition)",
        url: "https://digitaleditions.walsworth.com/publication/?i=835077",
      },
      {
        name: "ABPD OCE Study Tips",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination/Oral-Clinical-Examination-Study-Tips",
      },
    ],
  },
  {
    month: "October",
    monthNumber: 10,
    focus: "Final Preparation & Fall OCE Window",
    topics: [
      "High-yield topic review",
      "Weak area reinforcement",
      "Exam logistics and strategy",
      "Stress management",
    ],
    goals: [
      "Complete final review of all topics",
      "Achieve confidence in case presentations",
      "Prepare mentally and physically for your assigned exam date",
    ],
    activities: [
      "Focus on weak areas identified in practice",
      "Light review - avoid cramming new information",
      "Practice stress management techniques",
      "Final mock board sessions",
      "Review key guidelines and protocols",
      "Confirm ABPD logistics email details, identification requirements, and travel plan",
      "Get adequate rest and maintain health",
    ],
    resources: [
      {
        name: "ABPD 2026 Oral Clinical Examination Guide (PDF)",
        url: "https://www.abpd.org/download_file/view/951/276",
      },
      {
        name: "AAPD Oral Health Policies Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/overview/",
      },
      {
        name: "ABPD Preparing for the OCE",
        url: "https://www.abpd.org/about-abpd/blog/preparing-oce",
      },
      {
        name: "Quick reference cards and notes created during study",
      },
    ],
  },
];
