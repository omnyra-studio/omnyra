import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  // Guard: require ADMIN_SECRET in production; block entirely if missing
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.headers.get("x-admin-secret");
  if (!secret || !provided || provided !== secret) {
    return new Response(null, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 100,
      messages:   [{ role: "user", content: 'Reply with exactly: {"test": true}' }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "NO TEXT";

    return Response.json({ raw: text, model: response.model });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
