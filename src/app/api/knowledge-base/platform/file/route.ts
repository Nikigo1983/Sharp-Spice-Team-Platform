import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getKnowledgeArticle, parseLibrarySlug } from "@/lib/knowledge-base/service";
import { readKnowledgeBaseFile } from "@/lib/knowledge-base/asset-storage";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = parseLibrarySlug(searchParams.get("library"));
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const article = await getKnowledgeArticle(slug, id);
  if (!article?.storagePath) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const file = await readKnowledgeBaseFile(article.storagePath);
  if (!file) {
    return NextResponse.json({ error: "FILE_MISSING" }, { status: 404 });
  }

  const fileName = article.fileName || article.title || "file";
  const contentType =
    article.sourceMimeType || file.contentType || "application/octet-stream";
  const disposition = searchParams.get("download") === "1" ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
