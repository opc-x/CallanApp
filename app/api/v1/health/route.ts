export async function GET() {
  return Response.json({
    ok: true,
    service: "callanapp",
    version: "0.1.0",
  });
}
