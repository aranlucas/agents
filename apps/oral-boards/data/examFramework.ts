export interface Domain {
  id: string;
  name: string;
  weight: string;
  description: string;
  keyComponents: string[];
  clinicalTasks: string[];
  proficiencyDescriptors: string[];
}

export interface ExamPhase {
  phase: string;
  title: string;
  description: string;
  keyFocus: string[];
}

export interface TimelineMilestone {
  timeframe: string;
  milestone: string;
  detail: string;
}

export interface NeedToKnowSection {
  title: string;
  details: string[];
}

export interface ScoringCriterion {
  score: "3" | "2" | "1";
  descriptor: string;
}

export const examOverview = {
  title: "ABPD Oral Clinical Examination (OCE)",
  description:
    "The OCE is the second examination in ABPD initial certification and is designed to assess specialized knowledge, clinical reasoning, communication, and professionalism.",
  structure: {
    format: "Oral format using clinical vignettes presented for discussion",
    sessions: "Two successive one-hour sessions administered by two examiners",
    timing:
      "Candidates should plan for about four total hours including check-in, identification procedures, pre-exam orientation, and breaks",
    language: "Examination is conducted in English",
  },
  sourceNote:
    "Source: ABPD A Guide to the Oral Clinical Examination (OCE), updated February 2026, pp. 7, 18, 20",
};

export const examTimeline: TimelineMilestone[] = [
  {
    timeframe: "January",
    milestone: "OCE application opens",
    detail:
      "Application for the Oral Clinical Examination opens annually in January.",
  },
  {
    timeframe: "Fall",
    milestone: "OCE administration",
    detail: "OCE is administered in the fall at designated testing centers.",
  },
  {
    timeframe: "6 months before OCE",
    milestone: "Date assignment and logistics",
    detail:
      "ABPD assigns each candidate an exam date and sends registration, location, and schedule information by email.",
  },
  {
    timeframe: "Examination day",
    milestone: "Check-in and orientation",
    detail:
      "Candidates report to registration with government-issued photo ID and complete a short orientation before starting.",
  },
];

export const examPhases: ExamPhase[] = [
  {
    phase: "Before the Test",
    title: "Application, Eligibility, and Blueprint Review",
    description:
      "Before applying, candidates must complete board candidacy and have successfully completed the QE with an active dental license.",
    keyFocus: [
      "Complete board candidacy before OCE application",
      "Confirm active license and required supporting documentation",
      "Review the OCE blueprint domains and weighted emphasis",
      "Prepare for open-ended vignette-based oral questioning",
    ],
  },
  {
    phase: "Need to Know",
    title: "Format, Timing, and Examination Integrity",
    description:
      "Understand examination operations and strict security/integrity expectations before test day.",
    keyFocus: [
      "Two one-hour sessions with two examiners and clinical vignette discussion",
      "Approximately four hours total at the center including orientation/check-in",
      "No unauthorized personal items in the exam room",
      "No communication with anyone during the examination",
    ],
  },
  {
    phase: "After the Test",
    title: "Scoring, Results, and Policies",
    description:
      "ABPD reports pass/fail outcomes and provides post-exam processes for score verification and re-examination.",
    keyFocus: [
      "Each skillset is independently scored by examiners",
      "Results are reported within 8 weeks of exam administration",
      "Score verification request windows and constraints apply",
      "Re-examination policy is governed by eligibility-period requirements",
    ],
  },
];

export const needToKnowInfo: NeedToKnowSection[] = [
  {
    title: "Format",
    details: [
      "Administered at a facility designed for professional specialty board oral examinations.",
      "Two one-hour sessions, each with clinical vignettes and open-ended questioning.",
    ],
  },
  {
    title: "Timing",
    details: [
      "Examination content time is two hours total.",
      "With check-in, ID procedures, orientation, and breaks, candidates should expect around four hours at the testing center.",
    ],
  },
  {
    title: "Integrity",
    details: [
      "No personal items (phones, smartwatches, computers, notes, bags, or reference materials) are allowed in the exam room.",
      "Presence of prohibited items can cause immediate dismissal and automatic failure.",
      "No communication with anyone is allowed during the examination.",
    ],
  },
  {
    title: "Monitoring",
    details: [
      "Candidate examinations are monitored for examiner training and calibration activities.",
      "Examinations are not recorded.",
    ],
  },
];

export const scoringCriteria: ScoringCriterion[] = [
  {
    score: "3",
    descriptor:
      "Full understanding/application or analysis/evaluation of required knowledge and skills, clinical reasoning, communication, and professionalism for the assessed task.",
  },
  {
    score: "2",
    descriptor:
      "Less than full understanding/application or analysis/evaluation of required knowledge and skills, clinical reasoning, communication, and professionalism.",
  },
  {
    score: "1",
    descriptor:
      "Did not show accurate understanding/application or analysis/evaluation of required knowledge and skills, clinical reasoning, communication, and professionalism.",
  },
];

export const afterTestPolicies = [
  "Results are available within 8 weeks and reported as Pass/Fail.",
  "Score verification requests must be submitted within 30 days of receiving results.",
  "Candidates requesting score verification must contact ABPD within 6 weeks of the official release date to access forms.",
  "A candidate who fails may retake the OCE annually during the eligibility period; if OCE is not completed in that period, the QE score is forfeited and the process restarts as a registrant.",
];

export const preparationStrategies = [
  "Use pediatric dentistry textbooks and contemporary journals.",
  "Participate in continuing education.",
  "Use role-playing with colleagues for oral case response practice.",
  "Build clinical judgment for open-ended vignette discussion rather than memorizing scripts.",
];

export const domains: Domain[] = [
  {
    id: "behavior-guidance",
    name: "Behavior Guidance",
    weight: "14%",
    description:
      "Evaluate development, temperament, communication, and behavior guidance planning including pharmacologic and non-pharmacologic approaches.",
    keyComponents: [
      "Developmental and psychosocial assessment",
      "Communication with patients and guardians",
      "Behavior guidance selection and delivery",
      "Pain prevention and management",
    ],
    clinicalTasks: [
      "Assess physical, psychological, and social development.",
      "Assess temperament and cooperation potential.",
      "Recommend behavior guidance approach based on assessment.",
      "Evaluate pharmacologic options and contraindications.",
      "Communicate risks/benefits of pharmacologic behavior guidance.",
      "Administer nitrous oxide and manage adverse events.",
      "Provide care for moderate/deep sedation and manage follow-up.",
      "Prevent, assess, and manage patient pain.",
    ],
    proficiencyDescriptors: [
      "Match behavior guidance approach to patient-specific findings.",
      "Explain behavior guidance plans clearly to guardians.",
      "Demonstrate safe pharmacologic decision making.",
      "Integrate pain management throughout treatment planning.",
    ],
  },
  {
    id: "oral-facial-injury-emergency-oral-surgery",
    name: "Oral Facial Injury, Emergency Care & Oral Surgery",
    weight: "16%",
    description:
      "Assess and manage oral-facial injuries, dental emergencies, oral surgery scenarios, and related urgent care issues.",
    keyComponents: [
      "Trauma diagnosis and treatment",
      "Emergency pain and infection management",
      "Oral surgery procedures",
      "Medical emergency response",
    ],
    clinicalTasks: [
      "Assess oral facial injuries, dental pain, and infections.",
      "Manage dentoalveolar trauma and jaw fractures.",
      "Manage pulpal/periodontal tissue injuries after trauma.",
      "Recognize and manage soft tissue lesions.",
      "Extract teeth and suture soft tissue as indicated.",
      "Manage supernumerary teeth and missing teeth in mixed dentition.",
      "Recognize indications for autotransplantation and decoronation.",
      "Manage adverse events and medical emergencies.",
    ],
    proficiencyDescriptors: [
      "Prioritize urgent findings and stabilize appropriately.",
      "Select trauma/oral surgery treatment paths based on diagnosis.",
      "Communicate prognosis and potential sequelae clearly.",
      "Demonstrate safe emergency management judgment.",
    ],
  },
  {
    id: "growth-development",
    name: "Growth & Development",
    weight: "8%",
    description:
      "Identify growth patterns, functional/skeletal abnormalities, and orthodontic implications in developing dentitions.",
    keyComponents: [
      "Dentofacial growth pattern recognition",
      "Developing dentition diagnosis and management",
      "Orthodontic/interceptive planning",
      "Cephalometric and occlusal analysis",
    ],
    clinicalTasks: [
      "Identify dentofacial growth patterns.",
      "Determine presence of dental, skeletal, or functional abnormalities.",
      "Interpret panoramic and cephalometric findings for growth assessment.",
      "Diagnose and manage developing dentition issues.",
      "Determine need for and provide space maintenance.",
      "Identify indications/mechanisms of interceptive appliances.",
      "Provide early or interceptive orthodontic treatment (Phase 1).",
      "Perform facial and occlusal analysis.",
    ],
    proficiencyDescriptors: [
      "Integrate growth records into treatment planning.",
      "Identify when referral to other specialties is needed.",
      "Select interceptive strategies based on developmental stage.",
      "Interpret orthodontic diagnostic records accurately.",
    ],
  },
  {
    id: "prevention-health-promotion",
    name: "Prevention & Health Promotion",
    weight: "10%",
    description:
      "Apply risk-based prevention, communication, and longitudinal recall planning for pediatric oral health.",
    keyComponents: [
      "Comprehensive oral examination and history review",
      "Risk assessment and individualized prevention planning",
      "Behavior change counseling",
      "Recall and preventive treatment planning",
    ],
    clinicalTasks: [
      "Evaluate patient medical history and conduct comprehensive oral exam.",
      "Evaluate risk for caries, periodontal disease, and trauma.",
      "Formulate individual preventive plans based on findings.",
      "Explain findings, risks, and recommendations to guardians.",
      "Provide oral hygiene and diet counseling.",
      "Recommend fluoride type and treatment modality.",
      "Establish recall/recare visits based on patient needs.",
      "Identify enamel erosion and determine etiology.",
    ],
    proficiencyDescriptors: [
      "Translate risk profiles into actionable prevention plans.",
      "Use communication strategies that support behavior change.",
      "Recommend preventive therapies matched to risk and age.",
      "Define recall intervals with clinical rationale.",
    ],
  },
  {
    id: "diagnosis-pathology-radiology-medicine",
    name: "Diagnosis, Oral Pathology, Oral Radiology, and Oral Medicine",
    weight: "10%",
    description:
      "Recognize normal and abnormal oral findings, interpret radiographs, and manage medical-pathologic issues within pediatric practice.",
    keyComponents: [
      "Normal oral appearance across development stages",
      "Pathology/anomaly diagnosis and management",
      "Radiographic planning and interpretation",
      "Medical referral and antibiotic decision making",
    ],
    clinicalTasks: [
      "Recognize normal oral appearance in predentate, primary, mixed, and permanent dentitions.",
      "Diagnose/manage common pediatric oral/facial anomalies and pathologic conditions.",
      "Evaluate and manage dental attrition and periodontal conditions.",
      "Develop radiographic survey plans based on patient assessment.",
      "Interpret radiographic images and identify/correct errors.",
      "Identify need for antibiotic therapy and prescribe appropriately.",
      "Evaluate referral indications and communicate reasons/risks.",
      "Evaluate and diagnose TMJ disorders and determine referral needs.",
    ],
    proficiencyDescriptors: [
      "Differentiate developmental variation from pathology.",
      "Select radiographs based on indication, not routine only.",
      "Use findings to build coherent differential and management plans.",
      "Coordinate referral and interprofessional communication effectively.",
    ],
  },
  {
    id: "caries-management-restorative",
    name: "Dental Caries Diagnosis, Non-Restorative Caries Management and Restorative Treatment",
    weight: "17%",
    description:
      "Diagnose caries activity and implement non-operative and restorative treatment strategies across primary and permanent dentitions.",
    keyComponents: [
      "Caries lesion detection/diagnosis",
      "Progression/arrest/remineralization assessment",
      "Non-operative caries management",
      "Restorative material/procedure selection",
    ],
    clinicalTasks: [
      "Detect caries lesions and determine diagnostic techniques.",
      "Diagnose caries using visual, tactile, and radiographic methods.",
      "Develop systematic plans to assess progression/arrest/remineralization.",
      "Perform non-operative caries management for primary/permanent teeth.",
      "Apply sealant indications and treatment planning.",
      "Manage minimally invasive restorative treatment and follow-up.",
      "Excavate deep caries and determine indirect pulp treatment needs.",
      "Restore with composite, glass ionomer, stainless steel crown, zirconia crown, and amalgam when indicated.",
    ],
    proficiencyDescriptors: [
      "Correlate lesion activity with treatment intensity.",
      "Choose restorative approach based on risk, tooth, and patient factors.",
      "Balance non-operative and operative options appropriately.",
      "Define follow-up reassessment strategy after treatment.",
    ],
  },
  {
    id: "pulp-therapy",
    name: "Pulp Therapy",
    weight: "8%",
    description:
      "Recognize pulpal pathology and select vital, non-vital, and regenerative strategies for primary and permanent teeth.",
    keyComponents: [
      "Pulpal diagnosis and prognosis",
      "Vital pulp therapy indications",
      "Non-vital pulp therapy indications",
      "Apexogenesis/apexification/regenerative considerations",
    ],
    clinicalTasks: [
      "Recognize and explain pulpal pathology in primary and permanent teeth.",
      "Perform/plan vital pulp therapy in primary anterior teeth and molars.",
      "Perform/plan non-vital pulp therapy in primary anterior teeth and molars.",
      "Perform/plan vital and non-vital pulp therapy in permanent teeth.",
      "Recognize indications and techniques for apexogenesis.",
      "Recognize indications and techniques for apexification.",
      "Recognize indications and concepts for regenerative endodontics.",
    ],
    proficiencyDescriptors: [
      "Differentiate irreversible and reversible pulpal conditions clinically.",
      "Select procedure by tooth type, root status, and pulpal diagnosis.",
      "Explain biologic goals and expected outcomes of pulp procedures.",
      "Plan follow-up and radiographic reassessment intervals.",
    ],
  },
  {
    id: "special-health-care-needs",
    name: "Special Health Care Needs",
    weight: "8%",
    description:
      "Recognize congenital/acquired special health care needs and adapt care planning, communication, and interprofessional coordination.",
    keyComponents: [
      "Oral manifestations linked to special health care needs",
      "Modification of treatment modalities",
      "Oral-systemic health counseling",
      "Interdisciplinary coordination of care",
    ],
    clinicalTasks: [
      "Recognize patients with special health care needs and care challenges.",
      "Identify/manage common oral manifestations associated with SHCN.",
      "Explain oral-general health relationships to families/providers.",
      "Modify treatment modality based on SHCN needs.",
      "Discuss SHCN impact on oral health and growth/development.",
      "Provide prevention guidance to minimize oral disease burden.",
      "Identify when interdisciplinary care coordination is required.",
    ],
    proficiencyDescriptors: [
      "Adjust standard protocols to patient-specific functional and medical needs.",
      "Communicate modified goals and alternatives clearly to families.",
      "Balance access, safety, and disease control in treatment plans.",
      "Escalate to interdisciplinary care when complexity requires it.",
    ],
  },
  {
    id: "advocacy-education",
    name: "Advocacy and Education",
    weight: "4%",
    description:
      "Demonstrate advocacy for children and families through patient education, community resource linkage, and public health engagement.",
    keyComponents: [
      "Social and cultural awareness in care",
      "Dental home and early care advocacy",
      "Community resource and care opportunity referrals",
      "Public policy/professional advocacy participation",
    ],
    clinicalTasks: [
      "Maintain social and cultural awareness during patient care.",
      "Explain importance of the dental home and early pediatric care.",
      "Advocate for patient access to social support and community oral health resources.",
      "Participate in organized dentistry advocacy at local/state/national levels.",
    ],
    proficiencyDescriptors: [
      "Integrate social context into treatment recommendations.",
      "Promote early prevention through family-centered education.",
      "Connect families with practical community resources.",
      "Frame advocacy actions that improve child oral health access.",
    ],
  },
  {
    id: "elements-of-practice",
    name: "Elements of Pediatric Dental Practice",
    weight: "5%",
    description:
      "Apply ethical, legal, safety, and quality principles in daily pediatric dental practice operations.",
    keyComponents: [
      "Professional/ethical conduct",
      "Infection control and patient safety systems",
      "Practice workflow/privacy/compliance",
      "Evidence-based quality improvement",
    ],
    clinicalTasks: [
      "Practice in a professional and ethical manner.",
      "Use infection control and safety practices per professional guidance and regulations.",
      "Develop office protocols for safety, privacy, licensing, malpractice, billing, and security.",
      "Develop teledentistry protocols for safety, privacy, licensing, malpractice, billing, and security.",
      "Maintain privacy of protected health information according to HIPAA.",
      "Evaluate practice for adherence to professional standards and evidence-based principles.",
      "Evaluate research articles for clinical application.",
    ],
    proficiencyDescriptors: [
      "Demonstrate ethical and regulatory decision making in scenarios.",
      "Operationalize patient safety and privacy requirements consistently.",
      "Use evidence appraisal to support clinical policy decisions.",
      "Maintain quality improvement mindset in case discussions.",
    ],
  },
];
