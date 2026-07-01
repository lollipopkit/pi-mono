import { describe, expect, it } from "vitest";
import { parseVerdict } from "../examples/extensions/approval/ai-judge.ts";
import type { ApprovalConfig } from "../examples/extensions/approval/config.ts";
import { classify, describeCommand, isInScope, SessionApprovalCache } from "../examples/extensions/approval/engine.ts";
import { DEFAULT_DENY_RULES, isKnownSafeCommand } from "../examples/extensions/approval/safety.ts";

const cfg = (over: Partial<ApprovalConfig> = {}): ApprovalConfig => ({
	enabled: true,
	aiApproval: false,
	aiModel: null,
	tools: ["bash", "edit", "write"],
	allow: [],
	deny: [],
	rememberForSession: true,
	...over,
});

describe("isKnownSafeCommand", () => {
	it("approves read-only commands", () => {
		expect(isKnownSafeCommand("cat file.txt")).toBe(true);
		expect(isKnownSafeCommand("ls -la")).toBe(true);
		expect(isKnownSafeCommand("grep -n foo src")).toBe(true);
		expect(isKnownSafeCommand("git status")).toBe(true);
		expect(isKnownSafeCommand("git log --oneline -5")).toBe(true);
	});

	it("approves additional read-only git subcommands", () => {
		expect(isKnownSafeCommand("git config --get-regexp user")).toBe(true);
		expect(isKnownSafeCommand("git version")).toBe(true);
		expect(isKnownSafeCommand("git diff-index HEAD")).toBe(true);
		expect(isKnownSafeCommand("git config user.email a@b.c")).toBe(false); // config write
	});

	it("approves safe composite pipelines", () => {
		expect(isKnownSafeCommand("ls && grep foo bar.txt")).toBe(true);
		expect(isKnownSafeCommand("cat a.txt | grep x | wc -l")).toBe(true);
		expect(isKnownSafeCommand('bash -lc "ls && rg todo"')).toBe(true);
	});

	it("rejects mutating or opaque commands", () => {
		expect(isKnownSafeCommand("rm -rf build")).toBe(false);
		expect(isKnownSafeCommand("git push origin main")).toBe(false);
		expect(isKnownSafeCommand("find . -name '*.ts' -delete")).toBe(false);
		expect(isKnownSafeCommand("find . -exec rm {} ;")).toBe(false);
		expect(isKnownSafeCommand("sort -o out.txt in.txt")).toBe(false);
		expect(isKnownSafeCommand("echo hi > file.txt")).toBe(false);
		expect(isKnownSafeCommand("cat $SECRET")).toBe(false); // variable expansion is opaque
		expect(isKnownSafeCommand("cat $(which node)")).toBe(false); // command substitution
		expect(isKnownSafeCommand("npm install")).toBe(false);
	});

	it("rejects safe-looking prefix with unsafe pipeline member", () => {
		expect(isKnownSafeCommand("ls && rm -rf /")).toBe(false);
	});

	it("does not treat command/write wrappers as safe", () => {
		expect(isKnownSafeCommand("env rm -rf build")).toBe(false); // env runs a command
		expect(isKnownSafeCommand("env FOO=bar ls")).toBe(false);
		expect(isKnownSafeCommand("fd . -x rm")).toBe(false); // fd -x executes per match
		expect(isKnownSafeCommand("fd --exec rm pattern")).toBe(false);
		expect(isKnownSafeCommand("yq -i '.a=1' file.yaml")).toBe(false); // yq -i writes in place
		// plain read-only usages of the same tools stay safe
		expect(isKnownSafeCommand("fd -e ts src")).toBe(true);
		expect(isKnownSafeCommand("yq '.a' file.yaml")).toBe(true);
		expect(isKnownSafeCommand("printenv PATH")).toBe(true);
	});
});

describe("classify cascade", () => {
	it("denies when a deny rule matches, even for otherwise-safe commands", () => {
		const config = cfg({ deny: ["\\bls\\b"] });
		expect(classify("bash", "ls -la", config)).toBe("deny");
	});

	it("marks known-safe bash commands as safe", () => {
		expect(classify("bash", "cat foo.txt", cfg())).toBe("safe");
	});

	it("honors allow rules for non-safe commands", () => {
		const config = cfg({ allow: ["^npm (run|test)\\b"] });
		expect(classify("bash", "npm run build", config)).toBe("allow");
	});

	it("leaves write tools undecided without rules", () => {
		expect(classify("edit", "edit src/index.ts", cfg())).toBe("undecided");
		expect(classify("write", "write .env", cfg())).toBe("undecided");
	});

	it("default deny rules block dangerous commands", () => {
		const config = cfg({ deny: DEFAULT_DENY_RULES });
		expect(classify("bash", "sudo rm -rf /", config)).toBe("deny");
		expect(classify("bash", "chmod 777 secret", config)).toBe("deny");
	});
});

describe("isInScope", () => {
	it("gates configured tools, ignores read-only tools", () => {
		expect(isInScope("bash", cfg())).toBe(true);
		expect(isInScope("edit", cfg())).toBe(true);
		expect(isInScope("read", cfg())).toBe(false);
		expect(isInScope("grep", cfg())).toBe(false);
	});

	it("wildcard gates every non-read-only tool", () => {
		const config = cfg({ tools: ["*"] });
		expect(isInScope("custom_tool", config)).toBe(true);
		expect(isInScope("bash", config)).toBe(true);
		expect(isInScope("read", config)).toBe(false);
	});
});

describe("describeCommand", () => {
	it("renders stable descriptions per tool", () => {
		expect(describeCommand("bash", { command: "ls -la" })).toBe("ls -la");
		expect(describeCommand("edit", { path: "src/a.ts" })).toBe("edit src/a.ts");
		expect(describeCommand("write", { path: ".env" })).toBe("write .env");
	});
});

describe("SessionApprovalCache", () => {
	it("remembers approvals per tool + command", () => {
		const cache = new SessionApprovalCache();
		expect(cache.has("bash", "make")).toBe(false);
		cache.add("bash", "make");
		expect(cache.has("bash", "make")).toBe(true);
		expect(cache.has("bash", "make test")).toBe(false);
		expect(cache.size).toBe(1);
	});

	it("is whitespace-insensitive", () => {
		const cache = new SessionApprovalCache();
		cache.add("bash", "ls -la");
		expect(cache.has("bash", "ls  -la")).toBe(true);
		expect(cache.has("bash", " ls -la ")).toBe(true);
		expect(cache.has("bash", "ls -l")).toBe(false);
	});
});

describe("parseVerdict", () => {
	it("parses strict JSON verdicts", () => {
		expect(parseVerdict('{"decision":"allow","reason":"ok"}').decision).toBe("allow");
		expect(parseVerdict('here you go: {"decision":"deny","reason":"rm -rf"}').decision).toBe("deny");
	});

	it("accepts an unambiguous bare token", () => {
		expect(parseVerdict("allow").decision).toBe("allow");
		expect(parseVerdict("DENY.").decision).toBe("deny");
	});

	it("never guesses from prose — escalates instead", () => {
		expect(parseVerdict("this is not safe").decision).toBe("error");
		expect(parseVerdict("I think you can allow this").decision).toBe("error");
		expect(parseVerdict("").decision).toBe("error");
	});
});
