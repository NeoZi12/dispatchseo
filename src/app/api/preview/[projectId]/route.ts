import { storedShot } from "@/lib/page-screenshot";

// A stored screenshot of a live article (page_screenshots, 0071), for the
// article page's preview: an ordinary image URL, so the page renders at once
// and the browser loads and keeps the picture on its own.
//
// Serves what is stored and nothing else - it never sends a browser anywhere,
// so it can't be used to spend our screenshot quota on arbitrary URLs. Public
// under /api like /api/cover: the picture is of a page anyone can open, keyed
// by the project's uuid and that page's address.

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  const url = new URL(req.url).searchParams.get("u");
  if (!UUID.test(projectId) || !url) return new Response("Not found", { status: 404 });
  const shot = await storedShot(projectId, url);
  if (!shot) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const body = Buffer.from(shot.image, "base64");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      // The address carries the shot's time (?v=), so each version can be
      // kept for good; a re-take gets a new address.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
