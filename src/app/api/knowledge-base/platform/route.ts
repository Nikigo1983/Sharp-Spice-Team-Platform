import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createClientKnowledgeArticle,
  createClientKnowledgeFolder,
  getClientKnowledgeArticle,
  listClientKnowledgeFolder,
  updateClientKnowledgeArticle,
  deleteClientKnowledgeArticle,
} from "@/lib/knowledge-base/service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  if (articleId) {
    const article = await getClientKnowledgeArticle(articleId);
    if (!article) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ article });
  }

  const folderId = searchParams.get("folderId");
  const listing = await listClientKnowledgeFolder(folderId || null);
  return NextResponse.json(listing);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    kind?: "folder" | "article";
    name?: string;
    title?: string;
    body?: string;
    folderId?: string | null;
    parentId?: string | null;
  };

  try {
    if (body.kind === "folder") {
      const folder = await createClientKnowledgeFolder({
        name: body.name ?? "",
        parentId: body.parentId ?? null,
      });
      return NextResponse.json({ folder });
    }

    if (body.kind === "article") {
      const article = await createClientKnowledgeArticle({
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
    id?: string;
    title?: string;
    body?: string;
    folderId?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const article = await updateClientKnowledgeArticle({
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
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    await deleteClientKnowledgeArticle(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "NOT_FOUND" ? 404 : 400 },
    );
  }
}
