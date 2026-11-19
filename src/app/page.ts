// Static files for the App's page, from one folder, never outside it.
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export async function staticFile(dir: string, pathname: string): Promise<Response | null> {
  const root = normalize(dir);
  const path = normalize(
    join(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname)),
  );
  const type = TYPES[extname(path)];
  if (!type || !path.startsWith(root + sep)) return null;
  try {
    return new Response(await readFile(path), {
      headers: {
        "content-type": type,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    });
  } catch {
    return null;
  }
}
