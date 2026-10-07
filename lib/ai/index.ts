// S1/A3: OpenAI gateway (Responses API). Signatures fixed by lib/contracts/interfaces.ts.
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import { MODELS, type AiGateway } from "../contracts/interfaces";
import { ROLE_OUTPUT, type RoleOutput, type Slice1Role } from "../contracts/types";

type ModelKey = keyof typeof MODELS;

/** Minimal surface of the OpenAI client we use (lets tests inject a fake). */
export interface ResponsesLike {
  responses: { create(body: any): Promise<{ output_text: string }> };
}

export interface AiGatewayOptions {
  client?: ResponsesLike;
  apiKey?: string;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Reads a local image file and returns a data: URL usable in imageUrls. */
export function imageToDataUrl(path: string): string {
  const mime = MIME[extname(path).toLowerCase()] ?? "image/jpeg";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/**
 * Returns the LAST balanced top-level JSON object in free text, parsed.
 * Handles ```json fences (fences are just text around braces) and braces inside strings.
 * Returns null if none parses.
 */
export function extractLastJson(text: string): unknown | null {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (depth > 0 && inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"' && depth > 0) inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0) {
      depth--;
      if (depth === 0) candidates.push(text.slice(start, i + 1));
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(candidates[i]);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      /* try earlier candidate */
    }
  }
  return null;
}

/** zod -> JSON schema cleaned for OpenAI strict structured outputs. */
function toOpenAiSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$schema" || k === "default" || k === "format") continue;
      if ((k === "minimum" || k === "maximum") && typeof v === "number" && Math.abs(v) >= Number.MAX_SAFE_INTEGER) continue;
      out[k] = clean(v);
    }
    return out;
  };
  return clean(js) as Record<string, unknown>;
}

function zodErrorText(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export function createAiGateway(opts: AiGatewayOptions = {}): AiGateway {
  let client: ResponsesLike | undefined = opts.client;
  const getClient = (): ResponsesLike => {
    if (!client) {
      const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("ai: OPENAI_API_KEY is not set");
      client = new OpenAI({ apiKey }) as unknown as ResponsesLike;
    }
    return client;
  };

  const buildInput = (prompt: string, imageUrls?: string[]) => {
    if (!imageUrls?.length) return prompt;
    return [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageUrls.map((url) => ({ type: "input_image", image_url: url, detail: "auto" })),
        ],
      },
    ];
  };

  async function chat(prompt: string, o: { model?: ModelKey; system?: string } = {}): Promise<string> {
    const res = await getClient().responses.create({
      model: MODELS[o.model ?? "fast"],
      ...(o.system ? { instructions: o.system } : {}),
      input: prompt,
    });
    return res.output_text;
  }

  async function chatJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    o: { model?: ModelKey; system?: string; imageUrls?: string[] } = {},
  ): Promise<T> {
    const jsonSchema = toOpenAiSchema(schema);
    let useStrict = true;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const fullPrompt =
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous reply was invalid: ${lastError}\nReturn ONLY a corrected JSON object matching the schema.`;
      const system = [o.system, useStrict ? "" : `Reply with ONLY a JSON object matching this JSON schema:\n${JSON.stringify(jsonSchema)}`]
        .filter(Boolean)
        .join("\n\n");
      let text: string;
      try {
        const res = await getClient().responses.create({
          model: MODELS[o.model ?? "fast"],
          ...(system ? { instructions: system } : {}),
          input: buildInput(fullPrompt, o.imageUrls),
          text: {
            format: useStrict
              ? { type: "json_schema", name: "output", schema: jsonSchema, strict: true }
              : { type: "json_object" },
          },
        });
        text = res.output_text;
      } catch (e: any) {
        // Schema not accepted by strict mode -> fall back to JSON mode + instructions (does not consume the retry).
        if (useStrict && e?.status === 400 && /schema/i.test(String(e?.message))) {
          useStrict = false;
          attempt--;
          continue;
        }
        throw e;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = extractLastJson(text);
      }
      if (parsed == null) {
        lastError = "reply was not valid JSON";
        continue;
      }
      const r = schema.safeParse(parsed);
      if (r.success) return r.data;
      lastError = zodErrorText(r.error);
    }
    throw new Error(`ai.chatJSON: output failed schema validation after retry: ${lastError}`);
  }

  async function parseAgentOutput<R extends Slice1Role>(role: R, outputText: string): Promise<RoleOutput<R>> {
    const schema = ROLE_OUTPUT[role] as unknown as z.ZodType<RoleOutput<R>>;
    const extracted = extractLastJson(outputText);
    let error: string;
    if (extracted == null) {
      error = "no JSON object found in the agent output";
    } else {
      const r = schema.safeParse(extracted);
      if (r.success) return r.data;
      error = zodErrorText(r.error);
    }
    try {
      return await chatJSON(
        `The "${role}" agent's final reply should end with a JSON object matching the schema, but: ${error}.\n` +
          `Rebuild the JSON object using ONLY facts stated in the reply below. Do not invent values.\n\n--- AGENT REPLY ---\n${outputText}`,
        schema,
        { model: "fast", system: "You repair structured agent outputs. Output only the JSON object." },
      );
    } catch (e) {
      throw new Error(`ai.parseAgentOutput(${role}): ${error}; repair failed: ${(e as Error).message}`);
    }
  }

  return { chat, chatJSON, parseAgentOutput };
}

export const ai: AiGateway = createAiGateway();
