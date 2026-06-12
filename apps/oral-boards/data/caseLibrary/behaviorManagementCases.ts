import type { Case } from "@/types/case";

export const behaviorManagementCases: Case[] = [
  {
    id: "5",
    title: "Autism Spectrum Disorder with Urgent Restorative Needs",
    category: "Behavior Management",
    presentation:
      "A 6-year-old with autism spectrum disorder presents after two unsuccessful prior dental visits. Parent reports sensory triggers (sound/touch), transition difficulty, and escalating avoidance behaviors. Multiple untreated carious lesions are visible.",
    clinicalFindings: [
      "Limited exam tolerance with escalating distress",
      "Visible untreated carious lesions",
      "Sound and tactile defensiveness",
      "Parent reports failed prior attempts at treatment",
    ],
    questions: [
      "How do you structure the first visit to reduce risk of retraumatization?",
      "Which nonpharmacologic techniques are highest-yield here?",
      "When is pharmacologic support appropriate?",
      "How do you obtain informed consent for advanced behavior/sedation pathways?",
    ],
    modelResponse: {
      diagnosis:
        "Dental disease requiring treatment in a child with special health care needs and significant situational anxiety/sensory dysregulation",
      treatmentPlan: [
        "Create an individualized behavior support plan with caregiver input before treatment",
        "Use structured desensitization, visual supports, and predictable visit sequencing",
        "Modify sensory environment and keep visits short with clear endpoints",
        "Prioritize urgent disease control while preserving trust and safety",
        "Escalate to nitrous/sedation/GA when disease burden and cooperative capacity make office treatment unsafe or ineffective",
        "Document informed consent, alternatives, and follow-up prevention strategy",
      ],
      rationale:
        "The treatment plan must address both disease burden and neurobehavioral context. Repeated failed restraint-based attempts can worsen outcomes; individualized planning and timely escalation improve safety and completion rates.",
      keyPoints: [
        "Caregiver-guided sensory planning should happen before instrumentation.",
        "Behavior guidance is dynamic and reassessed every visit.",
        "Use pharmacologic options when clinically indicated, not as first-line reflex.",
        "Document risk-benefit discussions and contingency planning clearly.",
      ],
    },
    references: [
      {
        title: "AAPD Behavior Guidance for the Pediatric Dental Patient",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/behavior-guidance-for-the-pediatric-dental-patient/",
        type: "guideline",
      },
      {
        title: "AAPD Management of Dental Patients with Special Health Care Needs",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/management-of-dental-patients-with-special-health-care-needs/",
        type: "guideline",
      },
      {
        title:
          "AAPD Monitoring and Management of Pediatric Patients Before, During, and After Sedation",
        url: "https://www.aapd.org/research/oral-health-policies--recommendations/monitoring-and-management-of-pediatric-patients-before-during-and-after-sedation-for-diagnostic-and-therapeutic-procedures/",
        type: "guideline",
      },
      {
        title: "Behavioral Guidance for Improving Dental Care in ASD (PMC 2023)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10682214/",
        type: "article",
      },
    ],
    difficulty: "advanced",
    estimatedTime: 30,
  },
];
