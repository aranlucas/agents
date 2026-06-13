import type { Case } from "@/types/case";

import { cariesManagementCases } from "./cariesManagementCases";
import { dentalTraumaCases } from "./dentalTraumaCases";
import { developmentAndAnomaliesCases } from "./developmentAndAnomaliesCases";
import { pulpTherapyCases } from "./pulpTherapyCases";
import { behaviorManagementCases } from "./behaviorManagementCases";
import { orthodonticsSpaceManagementCases } from "./orthodonticsSpaceManagementCases";
import { oralPathologyMedicineCases } from "./oralPathologyMedicineCases";

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
