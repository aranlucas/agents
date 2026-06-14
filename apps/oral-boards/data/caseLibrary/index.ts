import type { Case } from "@/types/case";

import { cariesManagementCases } from "./caries-management-cases";
import { dentalTraumaCases } from "./dental-trauma-cases";
import { developmentAndAnomaliesCases } from "./development-and-anomalies-cases";
import { pulpTherapyCases } from "./pulp-therapy-cases";
import { behaviorManagementCases } from "./behavior-management-cases";
import { orthodonticsSpaceManagementCases } from "./orthodontics-space-management-cases";
import { oralPathologyMedicineCases } from "./oral-pathology-medicine-cases";

export {
  cariesManagementCases,
  dentalTraumaCases,
  developmentAndAnomaliesCases,
  pulpTherapyCases,
  behaviorManagementCases,
  orthodonticsSpaceManagementCases,
  oralPathologyMedicineCases,
};

export const cases: Case[] = [
  ...cariesManagementCases,
  ...dentalTraumaCases,
  ...developmentAndAnomaliesCases,
  ...pulpTherapyCases,
  ...behaviorManagementCases,
  ...orthodonticsSpaceManagementCases,
  ...oralPathologyMedicineCases,
];
