package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// ── Paths ──────────────────────────────────────────────────────────

func getPiDir() string {
	if d := os.Getenv("PI_CODING_AGENT_DIR"); d != "" {
		return expandTilde(d)
	}
	return path.Join(os.Getenv("HOME"), ".pi", "agent")
}

func getProjectDir() string {
	cwd, _ := os.Getwd()
	return cwd
}

func getProjectPiDir() string {
	return path.Join(getProjectDir(), ".pi")
}

func settingsPath(scope string) string {
	if scope == "project" {
		return path.Join(getProjectPiDir(), "settings.json")
	}
	return path.Join(getPiDir(), "settings.json")
}

func authPath() string   { return path.Join(getPiDir(), "auth.json") }
func modelsPath() string  { return path.Join(getPiDir(), "models.json") }

func expandTilde(p string) string {
	if strings.HasPrefix(p, "~") {
		return path.Join(os.Getenv("HOME"), p[1:])
	}
	return p
}

// ── JSON helpers ──────────────────────────────────────────────────

func readJSON(filePath string) map[string]interface{} {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return map[string]interface{}{}
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return map[string]interface{}{}
	}
	return result
}

func writeJSON(filePath string, data map[string]interface{}) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, append(bytes, '\n'), 0644)
}

func deepMerge(target, source map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range target {
		result[k] = v
	}
	for k, sv := range source {
		if tv, ok := result[k]; ok {
			tvMap, tvIsMap := tv.(map[string]interface{})
			svMap, svIsMap := sv.(map[string]interface{})
			if tvIsMap && svIsMap {
				result[k] = deepMerge(tvMap, svMap)
				continue
			}
		}
		result[k] = sv
	}
	return result
}

// ── Skills scanning ──────────────────────────────────────────────

type Skill struct {
	Name                   string                 `json:"name"`
	Description            string                 `json:"description"`
	FilePath               string                 `json:"filePath"`
	BaseDir                string                 `json:"baseDir"`
	SourceInfo             map[string]string      `json:"sourceInfo"`
	DisableModelInvocation bool                   `json:"disableModelInvocation"`
	Content                string                 `json:"content"`
}

var frontmatterRe = regexp.MustCompile(`(?s)^---\n(.*?)\n---\n(.*)$`)

func parseSkillFile(filePath, baseDir, scope string) Skill {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return Skill{FilePath: filePath, BaseDir: baseDir, SourceInfo: map[string]string{"scope": scope}}
	}
	content := string(data)
	name := filepath.Base(filepath.Dir(filePath))
	description := ""
	disableModelInvocation := false

	matches := frontmatterRe.FindStringSubmatch(content)
	if len(matches) == 3 {
		fm := matches[1]
		body := strings.TrimSpace(matches[2])
		for _, line := range strings.Split(fm, "\n") {
			if strings.HasPrefix(line, "name:") {
				name = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
			} else if strings.HasPrefix(line, "description:") {
				description = strings.TrimSpace(strings.TrimPrefix(line, "description:"))
				description = strings.Trim(description, "\"'")
			} else if strings.HasPrefix(line, "disable-model-invocation:") {
				if strings.TrimSpace(strings.TrimPrefix(line, "disable-model-invocation:")) == "true" {
					disableModelInvocation = true
				}
			}
		}
		if len(body) > 2000 {
			body = body[:2000] + "..."
		}
		return Skill{name, description, filePath, baseDir, map[string]string{"scope": scope}, disableModelInvocation, body}
	}

	body := strings.TrimSpace(content)
	if len(body) > 2000 {
		body = body[:2000] + "..."
	}
	return Skill{name, description, filePath, baseDir, map[string]string{"scope": scope}, false, body}
}

func scanSkills(dir, scope string) []Skill {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var skills []Skill
	for _, entry := range entries {
		fullPath := path.Join(dir, entry.Name())
		if entry.IsDir() {
			skillFile := path.Join(fullPath, "SKILL.md")
			if _, err := os.Stat(skillFile); err == nil {
				skills = append(skills, parseSkillFile(skillFile, fullPath, scope))
			} else {
				skills = append(skills, scanSkills(fullPath, scope)...)
			}
		} else if strings.HasSuffix(entry.Name(), ".md") {
			skills = append(skills, parseSkillFile(fullPath, fullPath, scope))
		}
	}
	return skills
}

// ── Extensions scanning ──────────────────────────────────────────

type Extension struct {
	Path         string                 `json:"path"`
	ResolvedPath string                 `json:"resolvedPath"`
	SourceInfo   map[string]string      `json:"sourceInfo"`
	Tools        map[string]interface{} `json:"tools"`
	Commands     map[string]interface{} `json:"commands"`
	Flags        map[string]interface{} `json:"flags"`
	Shortcuts    map[string]interface{} `json:"shortcuts"`
}

func scanExtensions(dir, scope string) []Extension {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var exts []Extension
	for _, entry := range entries {
		fullPath := path.Join(dir, entry.Name())
		if !entry.IsDir() && (strings.HasSuffix(entry.Name(), ".ts") || strings.HasSuffix(entry.Name(), ".js")) {
			exts = append(exts, Extension{
				Path: fullPath, ResolvedPath: fullPath,
				SourceInfo: map[string]string{"scope": scope},
				Tools: map[string]interface{}{}, Commands: map[string]interface{}{},
				Flags: map[string]interface{}{}, Shortcuts: map[string]interface{}{},
			})
		}
	}
	return exts
}

// ── Models ──────────────────────────────────────────────────────

type Model struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	Thinking      bool   `json:"thinking"`
	ContextWindow int    `json:"contextWindow,omitempty"`
	Custom        bool   `json:"custom,omitempty"`
	Description   string `json:"description,omitempty"`
}

func getModelsFromRegistry() []Model {
	var models []Model
	builtIn := map[string][]Model{
		"anthropic": {
			{ID: "claude-sonnet-4-20250514", Name: "Claude Sonnet 4", Provider: "anthropic", Thinking: true, ContextWindow: 200000},
			{ID: "claude-opus-4-20250514", Name: "Claude Opus 4", Provider: "anthropic", Thinking: true, ContextWindow: 200000},
			{ID: "claude-haiku-4-20250514", Name: "Claude Haiku 4", Provider: "anthropic", Thinking: false, ContextWindow: 200000},
		},
		"openai": {
			{ID: "gpt-4.1", Name: "GPT-4.1", Provider: "openai", Thinking: false, ContextWindow: 1047576},
			{ID: "gpt-4.1-mini", Name: "GPT-4.1 mini", Provider: "openai", Thinking: false, ContextWindow: 1047576},
			{ID: "o3", Name: "o3", Provider: "openai", Thinking: true, ContextWindow: 200000},
			{ID: "o4-mini", Name: "o4-mini", Provider: "openai", Thinking: true, ContextWindow: 200000},
		},
		"google": {
			{ID: "gemini-2.5-pro", Name: "Gemini 2.5 Pro", Provider: "google", Thinking: true, ContextWindow: 1048576},
			{ID: "gemini-2.5-flash", Name: "Gemini 2.5 Flash", Provider: "google", Thinking: true, ContextWindow: 1048576},
		},
	}
	for _, ms := range builtIn {
		models = append(models, ms...)
	}
	custom := readJSON(modelsPath())
	if providers, ok := custom["providers"].(map[string]interface{}); ok {
		for prov, cfg := range providers {
			if cfgMap, ok := cfg.(map[string]interface{}); ok {
				if modelList, ok := cfgMap["models"].([]interface{}); ok {
					for _, m := range modelList {
						if mMap, ok := m.(map[string]interface{}); ok {
							model := Model{
								ID:       getStr(mMap, "id"),
								Name:     getStr(mMap, "name"),
								Provider: prov,
								Custom:   true,
							}
							if v, ok := mMap["thinking"].(bool); ok {
								model.Thinking = v
							}
							if v, ok := mMap["contextWindow"].(float64); ok {
								model.ContextWindow = int(v)
							}
							if v, ok := mMap["description"].(string); ok {
								model.Description = v
							}
							models = append(models, model)
						}
					}
				}
			}
		}
	}
	return models
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// ══════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════

func main() {
	port := os.Getenv("PI_WEBUI_PORT")
	if port == "" {
		port = "4444"
	}

	app := fiber.New(fiber.Config{
		AppName:               "Pi WebUI",
		DisableStartupMessage: true,
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders: "Content-Type",
	}))

	// ── Settings ─────────────────────────────────────────────
	app.Get("/api/settings", func(c *fiber.Ctx) error {
		scope := c.Query("scope", "global")
		settings := readJSON(settingsPath(scope))
		return c.JSON(fiber.Map{"settings": settings, "scope": scope})
	})

	app.Patch("/api/settings", func(c *fiber.Ctx) error {
		scope := c.Query("scope", "global")
		var patch map[string]interface{}
		if err := c.BodyParser(&patch); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
		}
		existing := readJSON(settingsPath(scope))
		merged := deepMerge(existing, patch)
		if err := writeJSON(settingsPath(scope), merged); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"ok": true, "settings": merged})
	})

	// ── Skills ──────────────────────────────────────────────
	app.Get("/api/skills", func(c *fiber.Ctx) error {
		piDir := getPiDir()
		projPiDir := getProjectPiDir()
		skills := scanSkills(path.Join(piDir, "skills"), "user")
		skills = append(skills, scanSkills(path.Join(projPiDir, "skills"), "project")...)

		globalSettings := readJSON(settingsPath("global"))
		projectSettings := readJSON(settingsPath("project"))
		merged := deepMerge(globalSettings, projectSettings)
		if skillPaths, ok := merged["skills"].([]interface{}); ok {
			for _, sp := range skillPaths {
				if s, ok := sp.(string); ok {
					resolved := expandTilde(s)
					if info, err := os.Stat(resolved); err == nil {
						if info.IsDir() {
							skills = append(skills, scanSkills(resolved, "settings")...)
						} else if strings.HasSuffix(resolved, ".md") {
							skills = append(skills, parseSkillFile(resolved, resolved, "settings"))
						}
					}
				}
			}
		}

		return c.JSON(fiber.Map{"skills": skills})
	})

	// ── Extensions ───────────────────────────────────────────
	app.Get("/api/extensions", func(c *fiber.Ctx) error {
		piDir := getPiDir()
		projPiDir := getProjectPiDir()
		exts := scanExtensions(path.Join(piDir, "extensions"), "user")
		exts = append(exts, scanExtensions(path.Join(projPiDir, "extensions"), "project")...)

		settings := readJSON(settingsPath("global"))
		if extPaths, ok := settings["extensions"].([]interface{}); ok {
			for _, ep := range extPaths {
				if s, ok := ep.(string); ok {
					resolved := expandTilde(s)
					if info, err := os.Stat(resolved); err == nil && !info.IsDir() {
						exts = append(exts, Extension{
							Path: resolved, ResolvedPath: resolved,
							SourceInfo: map[string]string{"scope": "settings"},
							Tools: map[string]interface{}{}, Commands: map[string]interface{}{},
							Flags: map[string]interface{}{}, Shortcuts: map[string]interface{}{},
						})
					}
				}
			}
		}

		return c.JSON(fiber.Map{"extensions": exts})
	})

	// ── Models ──────────────────────────────────────────────
	app.Get("/api/models", func(c *fiber.Ctx) error {
		models := getModelsFromRegistry()
		return c.JSON(fiber.Map{"models": models})
	})

	// ── Auth ────────────────────────────────────────────────
	app.Get("/api/auth", func(c *fiber.Ctx) error {
		auth := readJSON(authPath())
		masked := make(map[string]interface{})
		for provider, cred := range auth {
			if credMap, ok := cred.(map[string]interface{}); ok {
				if key, ok := credMap["key"].(string); ok && len(key) > 8 {
					masked[provider] = map[string]interface{}{
						"type": credMap["type"],
						"key":  key[:4] + "..." + key[len(key)-4:],
					}
				} else {
					masked[provider] = cred
				}
			} else {
				masked[provider] = cred
			}
		}
		return c.JSON(fiber.Map{"auth": masked})
	})

	app.Put("/api/auth/:provider", func(c *fiber.Ctx) error {
		provider := c.Params("provider")
		var credential map[string]interface{}
		if err := c.BodyParser(&credential); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
		}
		auth := readJSON(authPath())
		auth[provider] = credential
		if err := writeJSON(authPath(), auth); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"ok": true})
	})

	app.Delete("/api/auth/:provider", func(c *fiber.Ctx) error {
		provider := c.Params("provider")
		auth := readJSON(authPath())
		delete(auth, provider)
		if err := writeJSON(authPath(), auth); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"ok": true})
	})

	// ── Serve frontend SPA ──────────────────────────────────
	// Try multiple locations to find the dist directory
	candidates := []string{
		"../dist",                          // running from packages/webui/server/
		path.Join(filepath.Dir(os.Args[0]), "..", "dist"), // relative to binary
		"dist",                             // running from packages/webui/
	}
	distDir := ""
	for _, dir := range candidates {
		absDir, _ := filepath.Abs(dir)
		if _, err := os.Stat(path.Join(absDir, "index.html")); err == nil {
			distDir = absDir
			break
		}
	}
	if _, err := os.Stat(path.Join(distDir, "index.html")); err == nil {
		fmt.Printf("Serving frontend from: %s\n", distDir)
		app.Static("/assets", path.Join(distDir, "assets"))
		app.Static("/favicon.png", path.Join(distDir, "favicon.png"))
		// SPA fallback: serve index.html for all unmatched routes
		app.Use(func(c *fiber.Ctx) error {
			return c.SendFile(path.Join(distDir, "index.html"))
		})
	} else {
		fmt.Println("No dist/ found — run `npm run build` first, or use `npm run dev` for hot reload")
	}

	fmt.Printf("Pi WebUI running on http://localhost:%s\n", port)
	fmt.Printf("Config dir: %s\n", getPiDir())
	if err := app.Listen(":" + port); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
	}
}