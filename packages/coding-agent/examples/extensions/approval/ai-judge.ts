/**
 * AI approval layer.
 *
 * When enabled, an LLM makes a binary allow/deny call on a tool invocation that the
 * rule cascade left undecided. On any error (no model/auth, request failure, or an
 * unparseable answer) it returns "error" so the caller can fall back to the user
 * prompt (or deny when there is no UI).
 *
 * The completion call mirrors examples/extensions/qna.ts.
 */

import { type Api, complete, type Model, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ApprovalConfig } from "./config.ts";

export interface AiVerdict {
	decision: "allow" | "deny" | "error";
	reason?: string;
}

const JUDGE_SYSTEM_PROMPT = `You are a strict security reviewer gating a coding agent's tool calls.
Decide whether the proposed action is safe to run automatically in the user's project.

Deny when the action could: delete or corrupt data, exfiltrate secrets/credentials,
run untrusted network payloads, escalate privileges, modify system-level configuration,
or write outside the working directory. Allow ordinary, reversible development actions
(building, testing, reading, editing project files, routine git usage).

Respond with ONLY a compact JSON object, no prose:
{"decision":"allow"|"deny","reason":"<short reason>"}`;

/** Max time to wait for the AI judge before treating it as an error (falls back to prompt/deny). */
const AI_TIMEOUT_MS = 20_000;

/** Resolve a model reference: bare id, "provider/id", or model name. */
function resolveModelRef(ctx: ExtensionContext, ref: string): Model<Api> | undefined {
	const all = ctx.modelRegistry.getAll();
	if (ref.includes("/")) {
		const idx = ref.indexOf("/");
		const provider = ref.slice(0, idx);
		const id = ref.slice(idx + 1);
		return ctx.modelRegistry.find(provider, id) ?? all.find((m) => m.provider === provider && m.id === id);
	}
	return all.find((m) => m.id === ref) ?? all.find((m) => m.name === ref);
}

/** aiModel config -> a model named `code-auto-review` -> current session model. */
export function resolveJudgeModel(ctx: ExtensionContext, config: ApprovalConfig): Model<Api> | undefined {
	if (config.aiModel) {
		const configured = resolveModelRef(ctx, config.aiModel);
		if (configured) return configured;
	}
	const autoReview = resolveModelRef(ctx, "code-auto-review");
	if (autoReview) return autoReview;
	return ctx.model;
}

function extractText(content: { type: string }[]): string {
	return content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => (c as { text: string }).text)
		.join("\n");
}

export function parseVerdict(text: string): AiVerdict {
	const jsonMatch = text.match(/\{[^{}]*"decision"[^{}]*\}/);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[0]) as { decision?: string; reason?: string };
			if (parsed.decision === "allow" || parsed.decision === "deny") {
				return { decision: parsed.decision, reason: parsed.reason };
			}
		} catch {
			// fall through to the conservative token check
		}
	}
	// Conservative fallback: only accept an unambiguous bare token. Prose like
	// "not safe" must NOT be guessed — return error so the caller escalates to the
	// user (or denies with no UI) rather than risk a false auto-approve.
	const token = text
		.trim()
		.toLowerCase()
		.replace(/^["'`]+|["'`.\s]+$/g, "");
	if (token === "allow") return { decision: "allow" };
	if (token === "deny") return { decision: "deny" };
	return { decision: "error", reason: "unparseable AI response" };
}

/** Ask the AI judge for a binary verdict on a tool call. */
export async function aiJudge(
	ctx: ExtensionContext,
	config: ApprovalConfig,
	toolName: string,
	command: string,
): Promise<AiVerdict> {
	const model = resolveJudgeModel(ctx, config);
	if (!model) return { decision: "error", reason: "no model available for AI approval" };

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return { decision: "error", reason: auth.error };

	const userMessage: UserMessage = {
		role: "user",
		content: [
			{
				type: "text",
				text: `Working directory: ${ctx.cwd}\nTool: ${toolName}\nAction:\n${command}`,
			},
		],
		timestamp: Date.now(),
	};

	// Bound the review so a hung request can't block the tool call forever.
	// Combine the agent's abort signal with our own timeout.
	const controller = new AbortController();
	const onParentAbort = () => controller.abort();
	if (ctx.signal?.aborted) controller.abort();
	else ctx.signal?.addEventListener("abort", onParentAbort, { once: true });
	const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

	try {
		const response = await complete(
			model,
			{ systemPrompt: JUDGE_SYSTEM_PROMPT, messages: [userMessage] },
			{ apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: controller.signal },
		);
		if (response.stopReason === "aborted") return { decision: "error", reason: "aborted or timed out" };
		return parseVerdict(extractText(response.content));
	} catch (err) {
		return { decision: "error", reason: err instanceof Error ? err.message : String(err) };
	} finally {
		clearTimeout(timer);
		ctx.signal?.removeEventListener("abort", onParentAbort);
	}
}
