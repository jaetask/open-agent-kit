import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export function nodeListener(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
      method: req.method ?? "GET",
      headers,
      ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" } : {}),
    } as RequestInit);
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  };
}
