import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createKnowledgeArticle,
  createKnowledgeFolder,
  deleteKnowledgeArticle,
  getKnowledgeArticle,
  listKnowledgeFolder,
  parseLibrarySlug,
  updateKnowledgeArticle,
} from "@/lib/knowledge-base/service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = parseLibrarySlug(searchParams.get("library"));
  const articleId = searchParams.get("articleId");
  if (articleId) {
    const article = await getKnowledgeArticle(slug, articleId);
    if (!article) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ article });
  }

  const folderId = searchParams.get("folderId");
  const listing = await listKnowledgeFolder(slug, folderId || null);
  return NextResponse.json(listing);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    library?: string;
    kind?: "folder" | "article";
    name?: string;
    title?: string;
    body?: string;
    folderId?: string | null;
    parentId?: string | null;
  };
  const slug = parseLibrarySlug(body.library);

  try {
    if (body.kind === "folder") {
      const folder = await createKnowledgeFolder({
        slug,
        name: body.name ?? "",
        parentId: body.parentId ?? null,
      });
      return NextResponse.json({ folder });
    }

    if (body.kind === "article") {
      const article = await createKnowledgeArticle({
        slug,
        title: body.title ?? body.name ?? "",
        body: body.body ?? "",
        folderId: body.folderId ?? null,
        updatedByUserId: session.id,
        updatedByName: session.name,
      });
      return NextResponse.json({ article });
    }

    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    const status =
      message === "FOLDER_NOT_FOUND"
        ? 404
        : message === "INVALID_NAME" || message === "INVALID_TITLE"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    library?: string;
    id?: string;
    title?: string;
    body?: string;
    folderId?: string | null;
  };
  const slug = parseLibrarySlug(body.library);

  if (!body.id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const article = await updateKnowledgeArticle({
      slug,
      id: body.id,
      title: body.title,
      body: body.body,
      folderId: body.folderId,
      updatedByUserId: session.id,
      updatedByName: session.name,
    });
    return NextResponse.json({ article });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      message === "NOT_FOUND" || message === "FOLDER_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
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

  try {
    await deleteKnowledgeArticle(slug, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "NOT_FOUND" ? 404 : 400 },
    );
  }
}
