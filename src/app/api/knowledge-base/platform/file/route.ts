import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createKnowledgeFileArticle,
  getKnowledgeArticle,
  parseLibrarySlug,
} from "@/lib/knowledge-base/service";
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

/** Upload one or more documents into the current KB folder. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const slug = parseLibrarySlug(
    typeof form.get("library") === "string" ? String(form.get("library")) : null,
  );
  const folderRaw = form.get("folderId");
  const folderId =
    typeof folderRaw === "string" && folderRaw.trim() ? folderRaw.trim() : null;

  const files = form
    .getAll("file")
    .filter((item): item is File => typeof File !== "undefined" && item instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "NO_FILES" }, { status: 400 });
  }

  const articles = [];
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const article = await createKnowledgeFileArticle({
        slug,
        folderId,
        fileName: file.name || "document",
        contentType: file.type || "application/octet-stream",
        data: buffer,
        updatedByUserId: session.id,
        updatedByName: session.name,
      });
      articles.push(article);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      errors.push({ fileName: file.name || "document", error: message });
    }
  }

  if (articles.length === 0) {
    const first = errors[0]?.error || "UPLOAD_FAILED";
    const status =
      first === "FILE_TOO_LARGE"
        ? 413
        : first === "FOLDER_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: first, errors }, { status });
  }

  return NextResponse.json({
    articles,
    uploaded: articles.length,
    failed: errors.length,
    errors: errors.length ? errors : undefined,
  });
}
