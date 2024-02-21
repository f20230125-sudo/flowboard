/** GET /api/health: answers when the server is up. Used by Docker and Kubernetes. */
export async function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
