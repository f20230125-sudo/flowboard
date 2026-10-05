import { findTemplate } from "@/templates";

/** GET /api/templates/:id: one ready-made flow, complete. */
export async function GET(_request: Request, context: RouteContext<"/api/templates/[id]">) {
  const { id } = await context.params;
  const template = findTemplate(id);
  if (!template) {
    return Response.json({ error: { code: "not_found", message: `There is no template called "${id}".` } }, { status: 404 });
  }
  return Response.json(template, { headers: { "Cache-Control": "public, max-age=300" } });
}
