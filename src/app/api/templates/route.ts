import { TEMPLATES, summarise } from "@/templates";

// The templates never change between deployments, so this can be built once.
export const dynamic = "force-static";

/** GET /api/templates: the ready-made flows, without their blocks. */
export async function GET() {
  return Response.json({ templates: TEMPLATES.map(summarise) });
}
