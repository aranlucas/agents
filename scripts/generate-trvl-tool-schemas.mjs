import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const referencePath = resolve(root, "docs/reference/trvl-mcp-tools-raw.json");
const outputPath = resolve(
  root,
  "src/components/mcp-tool-call/generated-tool-schemas.ts",
);
const rendererOutputPath = resolve(
  root,
  "src/components/mcp-tool-call/generated-tool-renderers.tsx",
);

const raw = JSON.parse(readFileSync(referencePath, "utf8"));
const tools = raw.result?.tools ?? raw.tools ?? [];

// Maps tool name -> { componentName, importPath relative to the renderers output file }
const DEDICATED_COMPONENTS = {
  search_flights:          { name: "SearchFlightsToolCall",          path: "../tool-calls/search-flights" },
  search_hotels:           { name: "SearchHotelsToolCall",           path: "../tool-calls/search-hotels" },
  hotel_prices:            { name: "HotelPricesToolCall",            path: "../tool-calls/hotel-prices" },
  search_hotel_by_name:    { name: "SearchHotelByNameToolCall",      path: "../tool-calls/search-hotel-by-name" },
  hotel_rooms:             { name: "HotelRoomsToolCall",             path: "../tool-calls/hotel-rooms" },
  search_route:            { name: "SearchRouteToolCall",            path: "../tool-calls/search-route" },
  search_ground:           { name: "SearchGroundToolCall",           path: "../tool-calls/search-ground" },
  search_airport_transfers:{ name: "SearchAirportTransfersToolCall", path: "../tool-calls/search-airport-transfers" },
  search_awards:           { name: "SearchAwardsToolCall",           path: "../tool-calls/search-awards" },
  search_deals:            { name: "SearchDealsToolCall",            path: "../tool-calls/search-deals" },
  explore_destinations:    { name: "ExploreDestinationsToolCall",    path: "../tool-calls/explore-destinations" },
  local_events:            { name: "LocalEventsToolCall",            path: "../tool-calls/local-events" },
  search_restaurants:      { name: "SearchRestaurantsToolCall",      path: "../tool-calls/search-restaurants" },
  weekend_getaway:         { name: "WeekendGetawayToolCall",         path: "../tool-calls/weekend-getaway" },
  plan_flight_bundle:      { name: "PlanFlightBundleToolCall",       path: "../tool-calls/plan-flight-bundle" },
  assess_trip:             { name: "AssessTripToolCall",             path: "../tool-calls/assess-trip" },
  check_visa:              { name: "CheckVisaToolCall",              path: "../tool-calls/check-visa" },
  plan_trip:               { name: "PlanTripToolCall",               path: "../tool-calls/plan-trip" },
};

const lines = [
  "import { z } from \"zod\";",
  "",
];

for (const tool of tools) {
  lines.push(
    `export const ${schemaExportName(tool.name)} = ${schemaToZod(tool.inputSchema)};`,
    "",
  );
}

writeFileSync(outputPath, lines.join("\n"));
writeFileSync(rendererOutputPath, renderersToSource(tools));

function schemaToZod(schema) {
  if (!schema || typeof schema !== "object") return "z.unknown()";

  const types = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  const nullable = types.includes("null");
  const nonNullType = types.find((type) => type !== "null");

  let expr = schema.enum ? enumToZod(schema.enum) : schemaForType(nonNullType, schema);

  if (schema.description) expr += `.describe(${JSON.stringify(schema.description)})`;
  if (nullable) expr += ".nullable()";
  return expr;
}

function schemaForType(type, schema) {
  switch (type) {
    case "object":
      return objectToZod(schema);
    case "array":
      return `z.array(${schemaToZod(schema.items)})`;
    case "string":
      return "z.string()";
    case "number":
      return numericToZod("z.number()", schema);
    case "integer":
      return numericToZod("z.number().int()", schema);
    case "boolean":
      return "z.boolean()";
    case "null":
      return "z.null()";
    default:
      return "z.unknown()";
  }
}

function objectToZod(schema) {
  const required = new Set(schema.required ?? []);
  const properties = Object.entries(schema.properties ?? {});
  const shape = properties
    .map(([key, child]) => {
      const childExpr = required.has(key) ? schemaToZod(child) : `${schemaToZod(child)}.optional()`;
      return `    ${JSON.stringify(key)}: ${childExpr}`;
    })
    .join(",\n");

  let expr = properties.length > 0 ? `z.object({\n${shape}\n  })` : "z.object({})";

  if (schema.additionalProperties === false) return `${expr}.strict()`;
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    return `${expr}.catchall(${schemaToZod(schema.additionalProperties)})`;
  }
  return `${expr}.passthrough()`;
}

function numericToZod(base, schema) {
  let expr = base;
  if (typeof schema.minimum === "number") expr += `.min(${schema.minimum})`;
  if (typeof schema.maximum === "number") expr += `.max(${schema.maximum})`;
  return expr;
}

function enumToZod(values) {
  const stringValues = values.filter((value) => typeof value === "string");
  if (stringValues.length === values.length && stringValues.length > 0) {
    return `z.enum([${stringValues.map((value) => JSON.stringify(value)).join(", ")}])`;
  }
  if (values.length === 1) return `z.literal(${JSON.stringify(values[0])})`;
  if (values.length > 1) {
    return `z.union([${values.map((value) => `z.literal(${JSON.stringify(value)})`).join(", ")}])`;
  }
  return "z.never()";
}

function renderersToSource(tools) {
  const schemaNames = tools.map((tool) => schemaExportName(tool.name));

  // Collect deduplicated dedicated imports
  const dedicatedImports = [];
  const seenPaths = new Set();
  for (const tool of tools) {
    const dedicated = DEDICATED_COMPONENTS[tool.name];
    if (dedicated && !seenPaths.has(dedicated.path)) {
      seenPaths.add(dedicated.path);
      dedicatedImports.push(`import { ${dedicated.name} } from "${dedicated.path}";`);
    }
  }

  const rendererLines = [
    "\"use client\";",
    "",
    "import { useRenderTool } from \"@copilotkit/react-core/v2\";",
    "import McpToolCall from \"../mcp-tool-call\";",
    ...dedicatedImports,
    "import {",
    ...schemaNames.map((name) => `  ${name},`),
    "} from \"./generated-tool-schemas\";",
    "",
    "export function TrvlToolRenderRegistrations() {",
  ];

  for (const tool of tools) {
    const schemaName = schemaExportName(tool.name);
    const dedicated = DEDICATED_COMPONENTS[tool.name];
    const componentName = dedicated ? dedicated.name : "McpToolCall";
    rendererLines.push(
      `  useRenderTool({`,
      `    name: ${JSON.stringify(tool.name)},`,
      `    parameters: ${schemaName},`,
      `    render: ({ status, parameters, result }) => (`,
      `      <${componentName} status={status} name=${JSON.stringify(tool.name)} args={parameters} result={result} />`,
      `    ),`,
      `  }, []);`,
      "",
    );
  }

  rendererLines.push("  return null;", "}", "");

  return rendererLines.join("\n");
}

function schemaExportName(toolName) {
  return `${camelCase(toolName)}Schema`;
}

function camelCase(value) {
  return value.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}
