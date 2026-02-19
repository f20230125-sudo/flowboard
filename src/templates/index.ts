import { defaultConfig } from "@/flow/catalog";
import { FLOW_VERSION, type ConfigOf, type FlowDocument, type FlowEdge, type FlowNode, type NodeType } from "@/flow/schema";

// Ready-made flows. Each one runs as it is, with no key and no account: the
// APIs they call are free and accept calls from a browser, and the AI steps
// carry a sample reply for when no key is set.

export type Template = {
  id: string;
  name: string;
  description: string;
  /** What the template shows off, for the gallery. */
  tags: string[];
  flow: FlowDocument;
};

export type TemplateSummary = Omit<Template, "flow"> & { blockCount: number };

const COLUMN = 280;
const ROW = 140;

function block<T extends NodeType>(
  type: T,
  name: string,
  column: number,
  row: number,
  config: Partial<ConfigOf<T>> = {},
): FlowNode {
  return {
    id: name,
    type,
    name,
    position: { x: column * COLUMN, y: row * ROW },
    config: { ...defaultConfig(type), ...config },
  } as unknown as FlowNode;
}

/** "a>b", or "a:true>b" to leave from one side of a Condition. */
function links(...texts: string[]): FlowEdge[] {
  return texts.map((text) => {
    const [from, target] = text.split(">");
    const [source, sourceHandle = "out"] = from.split(":");
    return { id: text, source, sourceHandle, target };
  });
}

function template(
  id: string,
  name: string,
  description: string,
  tags: string[],
  nodes: FlowNode[],
  edges: FlowEdge[],
): Template {
  return {
    id,
    name,
    description,
    tags,
    flow: { version: FLOW_VERSION, id, name, description, updatedAt: "2026-10-05T00:00:00.000Z", nodes, edges },
  };
}

const heatCheck = template(
  "heat-check",
  "Heat check",
  "Looks up the current temperature for a place and decides whether it is too hot to go out.",
  ["HTTP request", "Condition"],
  [
    block("trigger", "start", 0, 1, {
      payload: JSON.stringify({ city: "Dubai", latitude: 25.2, longitude: 55.27, limit: 35 }, null, 2),
    }),
    block("http", "getWeather", 1, 1, {
      url: "https://api.open-meteo.com/v1/forecast",
      query: [
        { key: "latitude", value: "{{ trigger.latitude }}" },
        { key: "longitude", value: "{{ trigger.longitude }}" },
        { key: "current", value: "temperature_2m,wind_speed_10m" },
      ],
    }),
    block("condition", "isTooHot", 2, 1, {
      left: "{{ steps.getWeather.body.current.temperature_2m }}",
      operator: "greaterThan",
      right: "{{ trigger.limit }}",
    }),
    block("set", "stayIn", 3, 0, {
      fields: [
        { key: "city", value: "{{ trigger.city }}" },
        { key: "temperature", value: "{{ steps.getWeather.body.current.temperature_2m }}" },
        { key: "advice", value: "Too hot. Stay inside until the evening." },
      ],
    }),
    block("set", "goOut", 3, 2, {
      fields: [
        { key: "city", value: "{{ trigger.city }}" },
        { key: "temperature", value: "{{ steps.getWeather.body.current.temperature_2m }}" },
        { key: "advice", value: "Fine to go out." },
      ],
    }),
    block("output", "result", 4, 1),
  ],
  links("start>getWeather", "getWeather>isTooHot", "isTooHot:true>stayIn", "isTooHot:false>goOut", "stayIn>result", "goOut>result"),
);

const dirhamRate = template(
  "dirham-rate",
  "Dirham rate watch",
  "Checks today's dirham to rupee rate and says whether it has reached the rate you are waiting for.",
  ["HTTP request", "Condition", "Set fields"],
  [
    block("trigger", "start", 0, 1, { payload: JSON.stringify({ target: 23 }, null, 2) }),
    block("http", "getRates", 1, 1, { url: "https://open.er-api.com/v6/latest/AED" }),
    block("condition", "reachedTarget", 2, 1, {
      left: "{{ steps.getRates.body.rates.INR }}",
      operator: "greaterOrEqual",
      right: "{{ trigger.target }}",
    }),
    block("set", "sendNow", 3, 0, {
      fields: [
        { key: "rate", value: "{{ steps.getRates.body.rates.INR }}" },
        { key: "message", value: "1 AED is {{ steps.getRates.body.rates.INR }} INR. That is at or above your target." },
      ],
    }),
    block("set", "keepWaiting", 3, 2, {
      fields: [
        { key: "rate", value: "{{ steps.getRates.body.rates.INR }}" },
        { key: "message", value: "1 AED is {{ steps.getRates.body.rates.INR }} INR. Still below {{ trigger.target }}." },
      ],
    }),
    block("output", "result", 4, 1),
  ],
  links(
    "start>getRates",
    "getRates>reachedTarget",
    "reachedTarget:true>sendNow",
    "reachedTarget:false>keepWaiting",
    "sendNow>result",
    "keepWaiting>result",
  ),
);

const repoDigest = template(
  "repo-digest",
  "Repository digest",
  "Fetches an account's recent GitHub repositories, keeps the popular ones, and asks a model to sum them up.",
  ["HTTP request", "Filter list", "AI step"],
  [
    block("trigger", "start", 0, 0, { payload: JSON.stringify({ account: "vercel", minimumStars: 1000 }, null, 2) }),
    block("http", "getRepos", 1, 0, {
      url: "https://api.github.com/users/{{ trigger.account }}/repos",
      query: [
        { key: "sort", value: "updated" },
        { key: "per_page", value: "10" },
      ],
    }),
    block("filter", "popular", 2, 0, {
      list: "{{ steps.getRepos.body }}",
      left: "{{ item.stargazers_count }}",
      operator: "greaterThan",
      right: "{{ trigger.minimumStars }}",
    }),
    block("ai", "summarise", 3, 0, {
      system: "You write short, plain summaries for a weekly engineering digest.",
      prompt:
        "In two sentences, say what {{ trigger.account }} has been working on, judging by these repositories:\n{{ steps.popular }}",
      sample:
        "This is a sample summary: the account's most active popular repositories centre on its web framework and the tooling around it. Add a key in Settings to get a real summary of the repositories fetched above.",
    }),
    block("set", "digest", 4, 0, {
      fields: [
        { key: "account", value: "{{ trigger.account }}" },
        { key: "popularRepositories", value: "{{ steps.popular.length }}" },
        { key: "summary", value: "{{ steps.summarise.text }}" },
      ],
    }),
    block("output", "result", 5, 0),
  ],
  links("start>getRepos", "getRepos>popular", "popular>summarise", "summarise>digest", "digest>result"),
);

const ticketTriage = template(
  "ticket-triage",
  "Support ticket triage",
  "A model reads a support ticket and rates its urgency. Urgent ones are escalated through an API; the rest are queued.",
  ["AI step", "Condition", "POST request"],
  [
    block("trigger", "start", 0, 1, {
      payload: JSON.stringify(
        { customer: "Amal", ticket: "Our checkout page has been down for an hour and customers cannot pay." },
        null,
        2,
      ),
    }),
    block("ai", "classify", 1, 1, {
      system:
        'You sort support tickets. Reply with JSON only, in this shape: {"urgency": "high" or "normal", "reason": "one short sentence"}',
      prompt: "{{ trigger.ticket }}",
      json: true,
      sample: '{"urgency": "high", "reason": "Payments are failing, which stops all sales."}',
    }),
    block("condition", "isUrgent", 2, 1, {
      left: "{{ steps.classify.json.urgency }}",
      operator: "equals",
      right: "high",
    }),
    block("http", "escalate", 3, 0, {
      method: "POST",
      url: "https://jsonplaceholder.typicode.com/posts",
      body: JSON.stringify(
        { title: "URGENT ticket from {{ trigger.customer }}", body: "{{ steps.classify.json.reason }}", userId: 1 },
        null,
        2,
      ),
    }),
    block("set", "escalated", 4, 0, {
      fields: [
        { key: "status", value: "escalated" },
        { key: "reference", value: "{{ steps.escalate.body.id }}" },
        { key: "reason", value: "{{ steps.classify.json.reason }}" },
      ],
    }),
    block("set", "queued", 3, 2, {
      fields: [
        { key: "status", value: "queued" },
        { key: "reason", value: "{{ steps.classify.json.reason }}" },
      ],
    }),
    block("output", "result", 5, 1),
  ],
  links(
    "start>classify",
    "classify>isUrgent",
    "isUrgent:true>escalate",
    "escalate>escalated",
    "isUrgent:false>queued",
    "escalated>result",
    "queued>result",
  ),
);

export const TEMPLATES: readonly Template[] = [heatCheck, ticketTriage, repoDigest, dirhamRate];

export function summarise(template: Template): TemplateSummary {
  const { flow, ...rest } = template;
  return { ...rest, blockCount: flow.nodes.length };
}

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((candidate) => candidate.id === id);
}
