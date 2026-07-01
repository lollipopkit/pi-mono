/**
 * AI Approval Extension
 *
 * A Codex-style approval cascade for tool calls. For every non-read-only tool call
 * (bash / edit / write / configured custom tools) it decides, in order:
 *
 *   1. deny rule match       -> reject (deny always wins)
 *   2. known-safe command    -> auto-approve (bash read-only allowlist, ported from codex)
 *   3. allow rule match       -> auto-approve
 *   4. AI approval (opt-in)  -> LLM returns allow / deny
 *   5. fallback              -> prompt the user (auto-reject when there is no UI)
 *
 * Config (merged, project takes precedence):
 * - ~/.pi/agent/extensions/approval.json  (global)
 * - <cwd>/.pi/approval.json                (project-local)
 *
 * Usage:
 *   pi -e ./approval                 approval enabled (config-driven)
 *   pi -e ./approval --ai-approval   force-enable the AI approval layer
 *   pi -e ./approval --no-approval   disable the extension for this run
 *   /approval                        show current configuration
 *   /approval ai on|off              toggle the AI approval layer
 *   /approval on|off                 enable/disable approval
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { aiJudge } from "./ai-judge.ts";
import { type ApprovalConfig, loadConfig } from "./config.ts";
import { classify, describeCommand, isInScope, SessionApprovalCache } from "./engine.ts";

export default function approvalExtension(pi: ExtensionAPI): void {
	let config: ApprovalConfig = {
		enabled: true,
		aiApproval: false,
		aiModel: null,
		tools: ["bash", "edit", "write"],
		allow: [],
		deny: [],
		rememberForSession: true,
	};
	const sessionCache = new SessionApprovalCache();

	pi.registerFlag("no-approval", {
		description: "Disable the AI approval extension for this run",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("ai-approval", {
		description: "Force-enable the AI approval layer (LLM allow/deny)",
		type: "boolean",
		default: false,
	});

	function statusText(): string | undefined {
		if (!config.enabled) return undefined;
		const layer = config.aiApproval ? "ai" : "rules";
		return `🔐 approval:${layer}`;
	}

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus("approval", statusText());
	}

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig(ctx.cwd);

		if (pi.getFlag("no-approval") === true) config.enabled = false;
		if (pi.getFlag("ai-approval") === true) config.aiApproval = true;

		updateStatus(ctx);
		if (!config.enabled) {
			ctx.ui.notify("Approval extension disabled", "warning");
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!config.enabled) return undefined;

		const toolName = event.toolName;
		if (!isInScope(toolName, config)) return undefined; // read-only / out of scope

		const command = describeCommand(toolName, event.input as Record<string, unknown>);

		// 1. deny wins over everything, including a prior session approval.
		const verdict = classify(toolName, command, config);
		if (verdict === "deny") {
			return { block: true, reason: `Blocked by approval deny-rule: ${command}` };
		}

		// Session approval cache (checked after deny).
		if (sessionCache.has(toolName, command)) return undefined;

		// 2/3. known-safe command or allow-rule match.
		if (verdict === "safe" || verdict === "allow") return undefined;

		// 4. AI approval layer (binary allow/deny; errors fall through to the prompt).
		if (config.aiApproval) {
			const ai = await aiJudge(ctx, config, toolName, command);
			if (ai.decision === "allow") return undefined;
			if (ai.decision === "deny") {
				return { block: true, reason: `Blocked by AI approval${ai.reason ? `: ${ai.reason}` : ""}` };
			}
			// ai.decision === "error": fall through to the user prompt / no-UI deny.
		}

		// 5. Fallback: ask the user (or reject when non-interactive).
		if (!ctx.hasUI) {
			return { block: true, reason: "Approval required, but no interactive UI is available" };
		}

		const options = config.rememberForSession ? ["Approve", "Approve for session", "Reject"] : ["Approve", "Reject"];
		const choice = await ctx.ui.select(`⚠️ Approve ${toolName}?\n\n  ${command}`, options);

		if (choice === "Approve") return undefined;
		if (choice === "Approve for session") {
			sessionCache.add(toolName, command);
			return undefined;
		}
		return { block: true, reason: "Rejected by user" };
	});

	pi.registerCommand("approval", {
		description: "Show or toggle AI approval (/approval [on|off|ai on|off])",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);

			if (parts[0] === "on" || parts[0] === "off") {
				config.enabled = parts[0] === "on";
				updateStatus(ctx);
				ctx.ui.notify(`Approval ${config.enabled ? "enabled" : "disabled"}`, "info");
				return;
			}
			if (parts[0] === "ai" && (parts[1] === "on" || parts[1] === "off")) {
				config.aiApproval = parts[1] === "on";
				updateStatus(ctx);
				ctx.ui.notify(`AI approval ${config.aiApproval ? "enabled" : "disabled"}`, "info");
				return;
			}

			const lines = [
				"Approval configuration:",
				`  enabled:      ${config.enabled}`,
				`  ai approval:  ${config.aiApproval}`,
				`  ai model:     ${config.aiModel ?? "(code-auto-review → session model)"}`,
				`  tools:        ${config.tools.join(", ") || "(none)"}`,
				`  allow rules:  ${config.allow.length}`,
				`  deny rules:   ${config.deny.length}`,
				`  session approvals: ${sessionCache.size}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
