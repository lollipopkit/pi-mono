/**
 * Command safety assessment.
 *
 * Ported from codex's read-only allowlist:
 *   references/codex/codex-rs/shell-command/src/command_safety/is_safe_command.rs
 *   references/codex/codex-rs/shell-command/src/command_safety/is_dangerous_command.rs
 *
 * A command is "known safe" only when every sub-command in the pipeline invokes a
 * read-only program with read-only options. Anything involving redirection,
 * command/variable substitution, subshells, or backgrounding is treated as not safe
 * (which just means the cascade asks/AI-checks instead of auto-approving).
 *
 * This module is intentionally dependency-free so it can be unit-tested in isolation.
 */

/** Default deny rules (regex sources, matched case-insensitively against the raw command). */
export const DEFAULT_DENY_RULES: string[] = [
	"\\brm\\s+-[a-z]*[rf]", // rm -rf / rm -f / rm -r / rm -Rf ...
	"\\bsudo\\b",
	"\\bdoas\\b",
	"\\b(chmod|chown)\\s+\\S*\\s*777",
	"\\bmkfs\\b",
	"\\bdd\\s+if=",
	"\\b(shutdown|reboot|halt|poweroff)\\b",
	">\\s*/dev/sd", // writing to a raw disk device
	":\\(\\)\\s*\\{\\s*:\\|:", // classic fork bomb
];

// Read-only executables that are always safe when their options are read-only.
const SAFE_EXECUTABLES = new Set<string>([
	"cat",
	"cd",
	"echo",
	"printf",
	"pwd",
	"ls",
	"dir",
	"vdir",
	"cut",
	"expr",
	"false",
	"true",
	"head",
	"tail",
	"id",
	"nl",
	"paste",
	"rev",
	"seq",
	"stat",
	"tr",
	"uniq",
	"wc",
	"which",
	"whereis",
	"type",
	"uname",
	"hostname",
	"arch",
	"date",
	"cal",
	"uptime",
	"printenv",
	"tree",
	"file",
	"du",
	"df",
	"basename",
	"dirname",
	"realpath",
	"readlink",
	"comm",
	"column",
	"tac",
	"look",
	"cksum",
	"md5sum",
	"sha1sum",
	"sha256sum",
	"sha512sum",
	"jq",
	"yq",
	"rg",
	"fd",
	"fdfind",
	"bat",
	"eza",
	"diff",
	"cmp",
	"less",
	"more",
	"grep",
	"egrep",
	"fgrep",
]);

// Shell wrappers whose `-c` / `-lc` script we can recurse into.
const SHELL_WRAPPERS = new Set<string>(["bash", "sh", "zsh", "dash", "ash"]);
const SHELL_SCRIPT_FLAGS = new Set<string>(["-c", "-lc", "-ic", "-lic", "-il"]);

// git subcommands that only read repository state.
const SAFE_GIT_SUBCOMMANDS = new Set<string>([
	"status",
	"log",
	"diff",
	"show",
	"branch",
	"tag",
	"describe",
	"remote",
	"rev-parse",
	"rev-list",
	"ls-files",
	"ls-tree",
	"ls-remote",
	"cat-file",
	"blame",
	"shortlog",
	"reflog",
	"whatchanged",
	"grep",
	"for-each-ref",
	"symbolic-ref",
	"name-rev",
	"merge-base",
	"show-ref",
	"count-objects",
]);

// find options that can write files or execute commands.
const UNSAFE_FIND_OPTIONS = new Set<string>([
	"-exec",
	"-execdir",
	"-ok",
	"-okdir",
	"-delete",
	"-fprint",
	"-fprint0",
	"-fprintf",
	"-fls",
]);

/** basename without directory, lowercased, for executable lookup. */
function executableKey(cmd: string): string {
	const slash = Math.max(cmd.lastIndexOf("/"), cmd.lastIndexOf("\\"));
	const name = slash >= 0 ? cmd.slice(slash + 1) : cmd;
	return name.toLowerCase();
}

/**
 * Split a shell string into pipeline segments on `&&`, `||`, `;`, `|`, and newlines,
 * respecting single/double quotes. Returns null when the command uses features we
 * cannot reason about safely (redirection, substitution, subshells, backgrounding).
 */
function splitPipeline(input: string): string[] | null {
	// Command/variable substitution makes the command opaque — never "safe".
	if (input.includes("`") || input.includes("$")) return null;

	const segments: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		const next = input[i + 1];

		if (quote) {
			if (ch === quote) quote = null;
			current += ch;
			continue;
		}

		switch (ch) {
			case '"':
			case "'":
				quote = ch;
				current += ch;
				break;
			case ">":
			case "<":
				return null; // redirection
			case "(":
			case ")":
			case "{":
			case "}":
				return null; // subshell / group
			case "\n":
			case ";":
				segments.push(current);
				current = "";
				break;
			case "&":
				if (next === "&") {
					segments.push(current);
					current = "";
					i++;
				} else {
					return null; // backgrounding
				}
				break;
			case "|":
				if (next === "|") i++;
				segments.push(current);
				current = "";
				break;
			default:
				current += ch;
		}
	}

	if (quote) return null; // unbalanced quotes
	segments.push(current);
	return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Tokenize a single simple command into argv, respecting quotes. Null on unbalanced quotes. */
function tokenize(segment: string): string[] | null {
	const args: string[] = [];
	let current = "";
	let hasWord = false;
	let quote: '"' | "'" | null = null;

	for (const ch of segment) {
		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			hasWord = true;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			hasWord = true;
			continue;
		}
		if (ch === " " || ch === "\t") {
			if (hasWord) {
				args.push(current);
				current = "";
				hasWord = false;
			}
			continue;
		}
		current += ch;
		hasWord = true;
	}
	if (quote) return null;
	if (hasWord) args.push(current);
	return args;
}

/** Find the git subcommand, skipping global options like `-C dir`, `-c k=v`, `--git-dir=`. */
function findGitSubcommand(args: string[]): string | undefined {
	let i = 1;
	while (i < args.length) {
		const arg = args[i];
		if (arg === "-C" || arg === "-c") {
			i += 2; // option takes a value
			continue;
		}
		if (arg.startsWith("--git-dir") || arg.startsWith("--work-tree") || arg.startsWith("--namespace")) {
			i += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			i += 1;
			continue;
		}
		return arg;
	}
	return undefined;
}

/** Whether a fully-tokenized simple command is a read-only invocation. */
function isSafeExec(args: string[]): boolean {
	if (args.length === 0) return false;
	const cmd = executableKey(args[0]);

	// Recurse into `bash -lc "<script>"` style wrappers.
	if (SHELL_WRAPPERS.has(cmd)) {
		const flagIndex = args.findIndex((a) => SHELL_SCRIPT_FLAGS.has(a));
		if (flagIndex >= 0 && args[flagIndex + 1] !== undefined) {
			return isKnownSafeCommand(args[flagIndex + 1]);
		}
		return false;
	}

	if (cmd === "find") {
		return !args.slice(1).some((a) => UNSAFE_FIND_OPTIONS.has(a));
	}

	if (cmd === "git") {
		const sub = findGitSubcommand(args);
		if (!sub) return false;
		if (sub === "config") {
			// Only read-only config access.
			return args.slice(1).some((a) => a === "--get" || a === "--get-all" || a === "--list" || a === "-l");
		}
		return SAFE_GIT_SUBCOMMANDS.has(sub);
	}

	if (cmd === "sort") {
		return !args.slice(1).some((a) => a === "-o" || a === "--output" || a.startsWith("--output="));
	}

	if (cmd === "base64") {
		return !args
			.slice(1)
			.some(
				(a) => a === "-o" || a === "--output" || a.startsWith("--output=") || (a.startsWith("-o") && a !== "-o"),
			);
	}

	if (cmd === "fd" || cmd === "fdfind") {
		// fd can run a command per match (-x/--exec, -X/--exec-batch), like find -exec.
		return !args.slice(1).some((a) => a === "-x" || a === "--exec" || a === "-X" || a === "--exec-batch");
	}

	if (cmd === "yq") {
		// yq -i / --inplace rewrites files. jq has no in-place mode, so it stays safe.
		return !args.slice(1).some((a) => a === "-i" || a === "--inplace");
	}

	return SAFE_EXECUTABLES.has(cmd);
}

/**
 * Whether a raw shell command string is known to be read-only.
 * Every pipeline segment must invoke a read-only program with read-only options.
 */
export function isKnownSafeCommand(command: string): boolean {
	const trimmed = command.trim();
	if (trimmed.length === 0) return false;

	const segments = splitPipeline(trimmed);
	if (!segments || segments.length === 0) return false;

	return segments.every((segment) => {
		const args = tokenize(segment);
		return args !== null && isSafeExec(args);
	});
}
