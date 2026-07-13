import { http, HttpResponse } from "msw";

import {
  OFFLINE_AGENT_HEALTH_RESPONSE,
  OFFLINE_AUTH_CONNECTION_RESPONSE,
  OFFLINE_COPILOTKIT_INFO_RESPONSE,
  OFFLINE_SOURCE_OF_TRUTH_URL,
} from "@/lib/offline-fixtures";

export {
  OFFLINE_AGENT_HEALTH_RESPONSE,
  OFFLINE_AUTH_CONNECTION_RESPONSE,
  OFFLINE_COPILOTKIT_INFO_RESPONSE,
};

export const offlineApiHandlers = [
  http.get(`${OFFLINE_SOURCE_OF_TRUTH_URL}/api/agents/health`, () =>
    HttpResponse.json(OFFLINE_AGENT_HEALTH_RESPONSE),
  ),
  http.get(`${OFFLINE_SOURCE_OF_TRUTH_URL}/api/offline-copilotkit/info`, () =>
    HttpResponse.json(OFFLINE_COPILOTKIT_INFO_RESPONSE),
  ),
];
