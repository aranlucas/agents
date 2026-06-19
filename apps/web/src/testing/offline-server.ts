import { setupServer } from "msw/node";

import { offlineApiHandlers } from "./msw-handlers";

export const offlineApiMockServer = setupServer(...offlineApiHandlers);
