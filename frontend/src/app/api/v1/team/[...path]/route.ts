import { type NextRequest, NextResponse } from "next/server";

const UPSTREAM = "https://team-tasks-api-440762463436.me-west1.run.app/api/v1";

async function proxy(req: NextRequest, path: string[]) {
  const url = `${UPSTREAM}/team/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const devEmail = req.headers.get("x-dev-email");
  const auth = req.headers.get("authorization");
  const contentType = req.headers.get("content-type");
  if (devEmail) headers.set("x-dev-email", devEmail);
  if (auth) headers.set("authorization", auth);
  if (contentType) headers.set("content-type", contentType);

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();

  const res = await fetch(url, { method: req.method, headers, body });

  const resBody = await res.arrayBuffer();
  const resHeaders = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) resHeaders.set("content-type", ct);

  return new NextResponse(resBody, { status: res.status, headers: resHeaders });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
