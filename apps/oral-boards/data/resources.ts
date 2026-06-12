export interface ResourceItem {
  title: string;
  url: string;
  type: "guideline" | "article" | "textbook" | "video" | "website";
  description: string;
  isPdf?: boolean;
}

export interface ResourceCategory {
  name: string;
  description: string;
  resources: ResourceItem[];
}

export const resourceCategories: ResourceCategory[] = [
  {
    name: "Core Reference Materials",
    description: "Essential resources for pediatric dentistry board preparation",
    resources: [
      {
        title: "AAPD Reference Manual 2024-2025",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/",
        type: "guideline",
        description:
          "The comprehensive reference manual containing all AAPD policies, guidelines, and best practices. Essential reading for board certification.",
      },
      {
        title: "AAPD Reference Manual 2024-2025 (Digital Edition)",
        url: "https://digitaleditions.walsworth.com/publication/?i=835077",
        type: "guideline",
        description:
          "Digital searchable version of the complete AAPD Reference Manual with all current policies and guidelines.",
      },
      {
        title: "McDonald and Avery's Dentistry for the Child and Adolescent, 11th Edition",
        url: "https://shop.elsevier.com/books/mcdonald-and-averys-dentistry-for-the-child-and-adolescent/dean/978-0-323-69820-7",
        type: "textbook",
        description:
          "The definitive textbook for pediatric dentistry. Covers all aspects from examination to treatment, includes new sections on sleep apnea, COVID-19, and updated pulp recommendations.",
      },
    ],
  },
  {
    name: "ABPD Certification Resources",
    description: "Official American Board of Pediatric Dentistry OCE and certification resources",
    resources: [
      {
        title: "ABPD 2026 Oral Clinical Examination Guide (PDF)",
        url: "https://www.abpd.org/download_file/view/951/276",
        type: "guideline",
        description:
          "Official ABPD candidate guide covering OCE format, eligibility, blueprint, timeline, scoring, and post-exam policies.",
        isPdf: true,
      },
      {
        title: "ABPD Oral Clinical Examination Overview",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination",
        type: "website",
        description:
          "Official ABPD page describing the Oral Clinical Examination format, requirements, and what to expect.",
      },
      {
        title: "OCE Study Tips and Examination Blueprint",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination/Oral-Clinical-Examination-Study-Tips",
        type: "guideline",
        description:
          "ABPD-provided study tips and examination blueprint outlining domains and content areas covered.",
      },
      {
        title: "OCE Blueprint and Scoring",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination/oce-blueprint",
        type: "guideline",
        description: "Official ABPD OCE blueprint domain content and scoring overview.",
      },
      {
        title: "Examination Day - OCE",
        url: "https://www.abpd.org/become-certified/oral-clinical-examination/examination-day-oce",
        type: "website",
        description:
          "Official ABPD examination day logistics and candidate expectations for OCE administration.",
      },
      {
        title: "Preparing for the OCE - ABPD Blog",
        url: "https://www.abpd.org/about-abpd/blog/preparing-oce",
        type: "article",
        description: "Official ABPD guidance on how to prepare for the Oral Clinical Examination.",
      },
      {
        title: "ABPD Certification Process Overview",
        url: "https://www.abpd.org/become-certified/certification-process",
        type: "website",
        description:
          "Complete overview of the two-part certification process including timelines and requirements.",
      },
    ],
  },
  {
    name: "Caries Management",
    description: "Guidelines and resources for caries prevention and treatment",
    resources: [
      {
        title:
          "AAPD Policy on Early Childhood Caries (ECC): Classifications, Consequences, and Preventive Strategies",
        url: "https://www.aapd.org/media/policies_guidelines/p_eccclassifications.pdf",
        type: "guideline",
        description:
          "Official AAPD policy on ECC definitions, classification system, and evidence-based prevention strategies.",
        isPdf: true,
      },
      {
        title: "AAPD Policy on ECC: Unique Challenges and Treatment Options",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/early-childhood-caries-unique-challenges-and-treatment-options/",
        type: "guideline",
        description: "Comprehensive treatment approaches for managing early childhood caries.",
      },
      {
        title: "AAPD Guideline on Caries-risk Assessment and Management",
        url: "https://www.aapd.org/assets/1/7/G_CariesRiskAssessment1.PDF",
        type: "guideline",
        description:
          "Evidence-based guideline for assessing caries risk and implementing appropriate preventive measures.",
        isPdf: true,
      },
      {
        title: "AAPD Best Practices: Fluoride Therapy",
        url: "https://www.aapd.org/media/Policies_Guidelines/BP_FluorideTherapy.pdf",
        type: "guideline",
        description:
          "Comprehensive fluoride recommendations including systemic fluoride, topical applications, and home-use products.",
        isPdf: true,
      },
      {
        title: "AAPD Policy on Use of Fluoride",
        url: "https://www.aapd.org/media/policies_guidelines/p_fluorideuse.pdf",
        type: "guideline",
        description: "Current AAPD position on fluoride safety and efficacy in caries prevention.",
        isPdf: true,
      },
      {
        title: "AAPD Policy on Silver Diamine Fluoride",
        url: "https://www.aapd.org/media/Policies_Guidelines/P_SilverDiamine.pdf",
        type: "guideline",
        description:
          "Guidelines for the use of silver diamine fluoride for caries arrest and prevention.",
        isPdf: true,
      },
    ],
  },
  {
    name: "Dental Trauma",
    description: "Guidelines for management of traumatic dental injuries",
    resources: [
      {
        title: "IADT Guidelines for Management of Traumatic Dental Injuries",
        url: "https://dentaltraumaguide.org/iadt-treatment-guidelines/",
        type: "guideline",
        description:
          "Complete 2020 IADT guidelines covering avulsion, luxation, and fractures in permanent and primary teeth.",
      },
      {
        title: "Dental Trauma Guide - Clinical Decision Support",
        url: "https://dentaltraumaguide.org/",
        type: "website",
        description:
          "Interactive clinical decision support tool for managing dental trauma cases, with prognosis data.",
      },
      {
        title: "IADT Guidelines: 1. Fractures and Luxations of Permanent Teeth (2020)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32475015/",
        type: "article",
        description:
          "Detailed guidelines on management of crown fractures, root fractures, and luxation injuries.",
      },
      {
        title: "IADT Guidelines: 2. Avulsion of Permanent Teeth",
        url: "https://www.researchgate.net/publication/284725732_International_Association_of_Dental_Traumatology_guidelines_for_the_management_of_traumatic_dental_injuries_2_Avulsion_of_permanent_teeth",
        type: "article",
        description:
          "Evidence-based protocol for managing avulsed permanent teeth including reimplantation procedures.",
      },
      {
        title: "IADT Guidelines: 3. Injuries in the Primary Dentition (2020)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32458553/",
        type: "article",
        description:
          "Special considerations for managing trauma to primary teeth and protecting permanent successors.",
      },
      {
        title: "AAPD Guidelines on Management of Acute Dental Trauma",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/guidelines-for-the-management-of-traumatic-dental-injuries-1-fracture-and-luxations-or-permanent-teeth/",
        type: "guideline",
        description: "AAPD endorsement and recommendations for dental trauma management.",
      },
    ],
  },
  {
    name: "Molar Incisor Hypomineralization (MIH)",
    description: "Guidelines for diagnosis and management of MIH",
    resources: [
      {
        title: "EAPD Best Clinical Practice Guidance for MIH (2022 Update)",
        url: "https://www.eapd.eu/uploads/files/MIH_Best_Practice.pdf",
        type: "guideline",
        description:
          "Updated European Academy of Paediatric Dentistry guidelines with GRADE-assessed treatment recommendations.",
        isPdf: true,
      },
      {
        title: "AAPD Best Practices: Molar-Incisor Hypomineralization (2024)",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_molar-incisor-hypomineralization.pdf",
        type: "guideline",
        description:
          "AAPD best practices for preventive measures, hypersensitivity treatment, and restorative options.",
        isPdf: true,
      },
      {
        title: "AAPD MIH Best Practices Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/molar-incisor-hypomineralization/",
        type: "guideline",
        description: "Web page overview of MIH diagnosis, classification, and treatment approach.",
      },
      {
        title: "Treatment Approaches to MIH: A Systematic Review (PMC 2023)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10671994/",
        type: "article",
        description:
          "Comprehensive systematic review of current treatment modalities for MIH-affected teeth.",
      },
      {
        title: "Update of the Molar Incisor Hypomineralization: Würzburg Concept (PMC 2023)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10657291/",
        type: "article",
        description: "Updated clinical management approach based on severity classification.",
      },
    ],
  },
  {
    name: "Pulp Therapy",
    description: "Guidelines for vital pulp therapy in primary and permanent teeth",
    resources: [
      {
        title: "AAPD Best Practices: Pulp Therapy for Primary and Immature Permanent Teeth",
        url: "https://www.aapd.org/media/Policies_Guidelines/BP_PulpTherapy.pdf",
        type: "guideline",
        description:
          "Comprehensive guidance on pulpotomy, pulpectomy, and vital pulp therapy indications and techniques.",
        isPdf: true,
      },
      {
        title: "AAPD Guideline: Use of Vital Pulp Therapies in Primary Teeth (2024)",
        url: "https://www.aapd.org/media/Policies_Guidelines/G_VPT.pdf",
        type: "guideline",
        description:
          "Updated 2024 clinical practice guideline with GRADE framework recommendations for primary teeth.",
        isPdf: true,
      },
      {
        title: "AAPD Guideline: Vital Pulp Therapy in Permanent Teeth (2024)",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/g_vpt-permanentteeth.pdf",
        type: "guideline",
        description:
          "2024 guideline for permanent tooth VPT based on systematic review through June 2024.",
        isPdf: true,
      },
      {
        title: "Use of Vital Pulp Therapies in Primary Teeth 2024 - PubMed",
        url: "https://pubmed.ncbi.nlm.nih.gov/38449041/",
        type: "article",
        description:
          "Peer-reviewed publication of the 2024 vital pulp therapy guideline for primary teeth.",
      },
      {
        title: "AAPD Pulp Therapy Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/vital_pulp_therapies_in_primary_teeth_with_deep_caries_lesions/",
        type: "guideline",
        description: "Web overview of pulp therapy recommendations and indications.",
      },
    ],
  },
  {
    name: "Behavior Management",
    description: "Guidelines for behavior guidance and management of special needs patients",
    resources: [
      {
        title: "AAPD Best Practices: Behavior Guidance for the Pediatric Dental Patient",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_behavguide.pdf",
        type: "guideline",
        description: "Comprehensive guidance on basic and advanced behavior management techniques.",
        isPdf: true,
      },
      {
        title:
          "AAPD Guideline: Nonpharmacological Behavior Guidance for the Pediatric Dental Patient (2023)",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/g_behaviorguidance.pdf",
        type: "guideline",
        description:
          "Evidence-based recommendations for non-pharmacological behavior guidance techniques.",
        isPdf: true,
      },
      {
        title: "AAPD Best Practices: Management of Dental Patients with Special Health Care Needs",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-dental-patients-with-special-health-care-needs/",
        type: "guideline",
        description:
          "Guidelines for providing dental care to patients with physical, developmental, mental, and behavioral conditions.",
      },
      {
        title: "AAPD Best Practices: Use of Protective Stabilization",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_useprotective.pdf",
        type: "guideline",
        description:
          "Guidelines for the appropriate use of protective stabilization during dental treatment.",
        isPdf: true,
      },
      {
        title: "Behavioral Guidance for Autistic Dental Patients - AAPD Archives",
        url: "https://www.aapd.org/globalassets/media/publications/archives/400-7.pdf",
        type: "article",
        description: "Specific strategies for managing patients with autism spectrum disorders.",
        isPdf: true,
      },
      {
        title: "Behavioral Guidance for Improving Dental Care in ASD (PMC 2023)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10682214/",
        type: "article",
        description: "Recent review of effective behavioral strategies for patients with autism.",
      },
    ],
  },
  {
    name: "Sedation and Anesthesia",
    description: "Guidelines for sedation and general anesthesia in pediatric dentistry",
    resources: [
      {
        title:
          "AAPD: Guidelines for Monitoring and Management of Pediatric Patients During Sedation",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_monitoringsedation.pdf",
        type: "guideline",
        description:
          "Joint AAP/AAPD guidelines for safe sedation delivery including pre-sedation assessment and monitoring requirements.",
        isPdf: true,
      },
      {
        title: "AAPD Best Practices: Use of Anesthesia Providers",
        url: "https://www.aapd.org/media/Policies_Guidelines/BP_AnesthesiaPersonnel.pdf",
        type: "guideline",
        description:
          "Recommendations for using anesthesia providers in office-based deep sedation/general anesthesia.",
        isPdf: true,
      },
      {
        title: "AAPD Guidelines for Monitoring and Management of Pediatric Patients",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/monitoring-and-management-of-pediatric-patients-before-during-and-after-sedation-for-diagnostic-and-therapeutic-procedures/",
        type: "guideline",
        description: "Web page with complete sedation guidelines and resources.",
      },
      {
        title: "AAPD Use of Anesthesia Providers Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/use-of-anesthesia-providers-in-the-administration-of-office-based-deep-sedationgeneral-anesthesia-to-the-pediatric-dental-patient/",
        type: "guideline",
        description:
          "Overview of requirements for using anesthesia providers in pediatric dental settings.",
      },
    ],
  },
  {
    name: "Additional AAPD Guidelines",
    description: "Other important AAPD policies and best practices",
    resources: [
      {
        title: "AAPD Best Practices: Periodicity of Examination and Preventive Dental Services",
        url: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_periodicity.pdf",
        type: "guideline",
        description:
          "Recommendations for timing of examinations, preventive services, and anticipatory guidance.",
        isPdf: true,
      },
      {
        title: "AAPD Reference Manual Overview",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/overview/",
        type: "website",
        description:
          "Main portal to access all AAPD policies, guidelines, best practices, and endorsed statements.",
      },
    ],
  },
];

// Helper function to get all unique PDFs
export function getAllPdfResources(): ResourceItem[] {
  return resourceCategories
    .flatMap((category) => category.resources)
    .filter((resource) => resource.isPdf);
}

// Helper function to get resources by type
export function getResourcesByType(type: ResourceItem["type"]): ResourceItem[] {
  return resourceCategories
    .flatMap((category) => category.resources)
    .filter((resource) => resource.type === type);
}
