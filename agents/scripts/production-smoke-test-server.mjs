import { createServer } from "node:http";

const response = (res, status, body, contentType = "application/json") => {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

  if (path.endsWith("/ready")) {
    response(res, 200, JSON.stringify({ status: "ok", checks: { d1: "ok", r2: "ok" } }));
    return;
  }

  if (/^\/[^/]+\/health$/.test(path)) {
    response(res, 200, JSON.stringify({ status: "ok" }));
    return;
  }

  if (/^\/[^/]+\/agui\/capabilities$/.test(path)) {
    response(
      res,
      200,
      JSON.stringify({
        transport: { streaming: true },
        state: { persistentState: true },
        tools: { clientProvided: true },
      }),
    );
    return;
  }

  if (path === "/travel/agents/state") {
    if (!req.headers.authorization) {
      response(res, 401, JSON.stringify({ error: "unauthorized" }));
      return;
    }
    response(res, 200, JSON.stringify({ threadId: "smoke-protected" }));
    return;
  }

  if (path === "/resume/agents/state") {
    const body = JSON.parse(await readBody(req));
    response(res, 200, JSON.stringify({ threadId: body.threadId, messages: [{}] }));
    return;
  }

  if (path.endsWith("/agui")) {
    const body = await readBody(req);
    const events = body.includes("highlight_resume_section")
      ? "TOOL_CALL_START\n"
      : "RUN_STARTED\nRUN_FINISHED\n";
    response(res, 200, events, "text/event-stream");
    return;
  }

  response(res, 404, JSON.stringify({ error: "not found" }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub server did not bind");
  console.log(`http://127.0.0.1:${address.port}`);
});
