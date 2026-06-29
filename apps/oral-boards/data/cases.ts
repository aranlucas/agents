import type { Case } from "@/types/case";

import { behaviorManagementCases } from "./caseLibrary/behavior-management-cases";
import { cariesManagementCases } from "./caseLibrary/caries-management-cases";
import { dentalTraumaCases } from "./caseLibrary/dental-trauma-cases";
import { developmentAndAnomaliesCases } from "./caseLibrary/development-and-anomalies-cases";
import { oralPathologyMedicineCases } from "./caseLibrary/oral-pathology-medicine-cases";
import { orthodonticsSpaceManagementCases } from "./caseLibrary/orthodontics-space-management-cases";
import { pulpTherapyCases } from "./caseLibrary/pulp-therapy-cases";

export const cases: Case[] = [
  ...cariesManagementCases,
  ...dentalTraumaCases,
  ...developmentAndAnomaliesCases,
  ...pulpTherapyCases,
  ...behaviorManagementCases,
  ...orthodonticsSpaceManagementCases,
  ...oralPathologyMedicineCases,
];
