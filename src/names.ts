const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function fail(message: string): never {
  throw new Error(message);
}

export function checkName(kind: string, name: unknown): asserts name is string {
  if (typeof name !== "string" || !KEBAB.test(name)) {
    fail(
      `${kind} name ${JSON.stringify(name)} must be kebab-case: lowercase words joined by hyphens`,
    );
  }
}

export function checkText(where: string, field: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") fail(`${where} needs a non-empty ${field}`);
}

export function checkSemver(where: string, version: unknown): asserts version is string {
  if (typeof version !== "string" || !SEMVER.test(version)) {
    fail(`${where} version ${JSON.stringify(version)} must be semver, like "1.0.0"`);
  }
}

export function checkUnique(where: string, kind: string, names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) fail(`${where} has two ${kind}s named ${name}`);
    seen.add(name);
  }
}
