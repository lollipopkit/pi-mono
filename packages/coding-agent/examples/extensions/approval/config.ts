/**
 * Approval extension configuration.
 *
 * Merged from (project takes precedence):
 * - ~/.pi/agent/extensions/approval.json  (global)
 * - <cwd>/.pi/approval.json                (project-local)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { DEFAULT_DENY_RULES } from "./safety.ts";

export interface ApprovalConfig {
	/** Master switch. When false, the extension approves everything (no-op). */
	enabled: boolean;
	/** Enable the AI approval layer (LLM decides allow/deny before falling back to the user). */
	aiApproval: boolean;
	/**
	 * Model reference used by the AI approval layer.
	 * Accepts a bare id ("claude-haiku-4-5") or "provider/id". When null, resolution
	 * falls back to a model named `code-auto-review`, then the current session model.
	 */
	aiModel: string | null;
	/**
	 * Tools that go through the cascade. Read-only tools are never gated.
	 * Use "*" to gate every non-read-only tool (including custom tools).
	 */
	tools: string[];
	/** Regex rules (case-insensitive, whole-string test) that auto-approve a command. */
	allow: string[];
	/** Regex rules that reject a command outright. Checked first — deny always wins. */
	deny: string[];
	/** Offer an "approve for session" option when prompting the user. */
	rememberForSession: boolean;
}

export const DEFAULT_CONFIG: ApprovalConfig = {
	enabled: true,
	aiApproval: false,
	aiModel: null,
	tools: ["bash", "edit", "write"],
	allow: [],
	deny: DEFAULT_DENY_RULES,
	rememberForSession: true,
};

function readJson(path: string): Partial<ApprovalConfig> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Partial<ApprovalConfig>;
	} catch (e) {
		console.error(`Warning: could not parse ${path}: ${e}`);
		return {};
	}
}

function mergeConfig(base: ApprovalConfig, override: Partial<ApprovalConfig>): ApprovalConfig {
	return {
		enabled: override.enabled ?? base.enabled,
		aiApproval: override.aiApproval ?? base.aiApproval,
		aiModel: override.aiModel ?? base.aiModel,
		tools: override.tools ?? base.tools,
		// Rule lists replace wholesale so a project can fully redefine them.
		allow: override.allow ?? base.allow,
		deny: override.deny ?? base.deny,
		rememberForSession: override.rememberForSession ?? base.rememberForSession,
	};
}

/** Load and merge global + project approval config over the defaults. */
export function loadConfig(cwd: string): ApprovalConfig {
	const globalConfig = readJson(join(getAgentDir(), "extensions", "approval.json"));
	const projectConfig = readJson(join(cwd, CONFIG_DIR_NAME, "approval.json"));
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}
