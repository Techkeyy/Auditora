// Robust JSON extraction — models sometimes wrap the JSON in prose, code fences,
// or (worst case) alongside Solidity snippets whose braces fool a naive scan.

export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;

  // Strip ```json ... ``` fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;

  // 1) Direct parse — the happy path (pure JSON response).
  const direct = tryParse<T>(candidate);
  if (direct !== null) return direct;

  // 2) The model wrapped JSON in prose (and possibly code with its own braces).
  //    Extract every balanced {...} block and pick the one that actually looks
  //    like our payload — a code snippet's braces won't parse as JSON, so a real
  //    findings/headline object wins even when it's buried after prose.
  const blocks = balancedObjects(candidate);
  for (const b of blocks) {
    const p = tryParse<Record<string, unknown>>(b);
    if (p && (Array.isArray(p.findings) || typeof p.headline === "string")) {
      return p as T;
    }
  }
  // 3) Fallback: any parseable object at all.
  for (const b of blocks) {
    const p = tryParse<T>(b);
    if (p !== null) return p;
  }
  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Return the substring of every top-level balanced `{...}` block, tracking JSON
 * string literals so braces inside strings (or embedded code) don't break the
 * matching. Only `"` delimits JSON strings, so that's all we honor.
 */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          out.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return out;
}

/**
 * Last-ditch recovery for a TRUNCATED response: walk the `"findings": [ ... ]`
 * array and collect every complete `{...}` object that closed before the cutoff,
 * discarding the half-written final one. Turns a lost finding into a kept finding
 * when a reasoning model runs out of output budget mid-array.
 */
export function salvageFindings(text: string): Record<string, unknown>[] {
  if (!text) return [];
  const key = text.indexOf('"findings"');
  if (key === -1) return [];
  const arrStart = text.indexOf("[", key);
  if (arrStart === -1) return [];

  const out: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          const obj = tryParse<Record<string, unknown>>(text.slice(start, i + 1));
          if (obj) out.push(obj);
          start = -1;
        }
      }
    } else if (ch === "]" && depth === 0) {
      break; // findings array closed cleanly
    }
  }
  return out;
}

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export function normalizeSeverity(s: unknown): (typeof SEVERITIES)[number] {
  const v = String(s ?? "").toLowerCase().trim();
  return (SEVERITIES as readonly string[]).includes(v)
    ? (v as (typeof SEVERITIES)[number])
    : "info";
}
