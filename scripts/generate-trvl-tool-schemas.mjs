import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const referencePath = resolve(root, "docs/reference/trvl-mcp-tools-raw.json");
const outputPath = resolve(
  root,
  "src/components/mcp-tool-call/generated-tool-schemas.ts",
);
const rendererOutputPath = resolve(
  root,
  "src/components/tool-renderer.tsx",
);
const oldRendererOutputPath = resolve(
  root,
  "src/components/mcp-tool-call/generated-tool-renderers.tsx",
);
const rendererPartsDir = resolve(
  root,
  "src/components/mcp-tool-call/generated-tool-renderers",
);

const raw = JSON.parse(readFileSync(referencePath, "utf8"));
const tools = raw.result?.tools ?? raw.tools ?? [];

const DEDICATED_COMPONENTS = {
  assess_trip: { name: "AssessTripToolCall", path: "../../tool-calls/assess-trip" },
  check_visa: { name: "CheckVisaToolCall", path: "../../tool-calls/check-visa" },
  explore_destinations: {
    name: "ExploreDestinationsToolCall",
    path: "../../tool-calls/explore-destinations",
  },
  hotel_prices: { name: "HotelPricesToolCall", path: "../../tool-calls/hotel-prices" },
  hotel_rooms: { name: "HotelRoomsToolCall", path: "../../tool-calls/hotel-rooms" },
  local_events: { name: "LocalEventsToolCall", path: "../../tool-calls/local-events" },
  plan_flight_bundle: {
    name: "PlanFlightBundleToolCall",
    path: "../../tool-calls/plan-flight-bundle",
  },
  plan_trip: { name: "PlanTripToolCall", path: "../../tool-calls/plan-trip" },
  search_airport_transfers: {
    name: "SearchAirportTransfersToolCall",
    path: "../../tool-calls/search-airport-transfers",
  },
  search_awards: { name: "SearchAwardsToolCall", path: "../../tool-calls/search-awards" },
  search_deals: { name: "SearchDealsToolCall", path: "../../tool-calls/search-deals" },
  search_flights: { name: "SearchFlightsToolCall", path: "../../tool-calls/search-flights" },
  search_ground: { name: "SearchGroundToolCall", path: "../../tool-calls/search-ground" },
  search_hotel_by_name: {
    name: "SearchHotelByNameToolCall",
    path: "../../tool-calls/search-hotel-by-name",
  },
  search_hotels: { name: "SearchHotelsToolCall", path: "../../tool-calls/search-hotels" },
  search_restaurants: {
    name: "SearchRestaurantsToolCall",
    path: "../../tool-calls/search-restaurants",
  },
  search_route: { name: "SearchRouteToolCall", path: "../../tool-calls/search-route" },
  weekend_getaway: { name: "WeekendGetawayToolCall", path: "../../tool-calls/weekend-getaway" },
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
writeToolRendererFiles(tools);
rmSync(oldRendererOutputPath, { force: true });

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
  const rendererLines = [
    "\"use client\";",
    "",
    ...tools.map((tool) => {
      const componentName = `${pascalCase(tool.name)}ToolRenderRegistration`;
      return `import { ${componentName} } from "./mcp-tool-call/generated-tool-renderers/${tool.name}";`;
    }),
    "",
    "export function ToolRenderer() {",
    "  return (",
    "    <>",
  ];

  for (const tool of tools) {
    const componentName = `${pascalCase(tool.name)}ToolRenderRegistration`;
    rendererLines.push(
      `      <${componentName} />`,
    );
  }

  rendererLines.push("    </>", "  );", "}", "");

  return rendererLines.join("\n");
}

function writeToolRendererFiles(tools) {
  rmSync(rendererPartsDir, { recursive: true, force: true });
  mkdirSync(rendererPartsDir, { recursive: true });

  for (const tool of tools) {
    const componentName = `${pascalCase(tool.name)}ToolRenderRegistration`;
    const schemaName = schemaExportName(tool.name);
    const dedicated = DEDICATED_COMPONENTS[tool.name];
    const toolComponentName = dedicated?.name ?? "McpToolCall";
    const componentImport = dedicated
      ? `import { ${dedicated.name} } from ${JSON.stringify(dedicated.path)};`
      : "import McpToolCall from \"../../mcp-tool-call\";";
    const lines = [
      "\"use client\";",
      "",
      "import { useRenderTool } from \"@copilotkit/react-core/v2\";",
      componentImport,
      `import { ${schemaName} } from "../generated-tool-schemas";`,
      "",
      `export function ${componentName}() {`,
      `  useRenderTool({`,
      `    name: ${JSON.stringify(tool.name)},`,
      `    parameters: ${schemaName},`,
      `    render: ({ status, parameters, result }) => (`,
      `      <${toolComponentName} status={status} name=${JSON.stringify(tool.name)} args={parameters} result={result} />`,
      `    ),`,
      `  }, []);`,
      "",
      "  return null;",
      "}",
      "",
    ];

    writeFileSync(resolve(rendererPartsDir, `${tool.name}.tsx`), lines.join("\n"));
  }
}

function schemaExportName(toolName) {
  return `${camelCase(toolName)}Schema`;
}

function camelCase(value) {
  return value.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function pascalCase(value) {
  const camel = camelCase(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}
