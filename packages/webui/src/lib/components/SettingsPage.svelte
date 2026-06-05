<script>
  import { getSettings, updateSettings } from '../api.js';

  let scope = 'global';
  let settings = null;
  let loading = true;
  let saving = false;
  let saveMsg = '';
  let dirty = false;
  let original = {};

  const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  const transports = ['auto', 'sse', 'websocket', 'websocket-cached'];
  const steeringModes = ['all', 'one-at-a-time'];
  const doubleEscapeActions = ['fork', 'tree', 'none'];
  const treeFilterModes = ['default', 'no-tools', 'user-only', 'labeled-only', 'all'];

  const sections = [
    {
      title: 'General', iconClass: 'text-blue-400', fields: [
        { key: 'defaultProvider', label: 'Default Provider', type: 'text' },
        { key: 'defaultModel', label: 'Default Model', type: 'text' },
        { key: 'defaultThinkingLevel', label: 'Thinking Level', type: 'select', options: thinkingLevels },
        { key: 'theme', label: 'Theme', type: 'text' },
        { key: 'transport', label: 'Transport', type: 'select', options: transports },
        { key: 'steeringMode', label: 'Steering Mode', type: 'select', options: steeringModes },
        { key: 'followUpMode', label: 'Follow-up Mode', type: 'select', options: steeringModes },
      ]
    },
    {
      title: 'Appearance', iconClass: 'text-purple-400', fields: [
        { key: 'hideThinkingBlock', label: 'Hide Thinking Block', type: 'boolean' },
        { key: 'editorPaddingX', label: 'Editor Padding X', type: 'number', min: 0, max: 3 },
        { key: 'autocompleteMaxVisible', label: 'Autocomplete Max Visible', type: 'number', min: 3, max: 20 },
        { key: 'showHardwareCursor', label: 'Show Hardware Cursor', type: 'boolean' },
        { key: 'collapseChangelog', label: 'Collapse Changelog', type: 'boolean' },
      ]
    },
    {
      title: 'Terminal', iconClass: 'text-green-400', fields: [
        { key: 'shellPath', label: 'Shell Path', type: 'text' },
        { key: 'shellCommandPrefix', label: 'Shell Command Prefix', type: 'text' },
        { key: 'npmCommand', label: 'NPM Command', type: 'array' },
        { key: 'terminal_showImages', label: 'Show Images', type: 'boolean', parent: 'terminal', jsonKey: 'showImages' },
        { key: 'terminal_imageWidthCells', label: 'Image Width (cells)', type: 'number', parent: 'terminal', jsonKey: 'imageWidthCells' },
      ]
    },
    {
      title: 'Performance', iconClass: 'text-amber-400', fields: [
        { key: 'compaction_enabled', label: 'Compaction', type: 'boolean', parent: 'compaction', jsonKey: 'enabled' },
        { key: 'compaction_reserveTokens', label: 'Reserve Tokens', type: 'number', parent: 'compaction', jsonKey: 'reserveTokens' },
        { key: 'retry_enabled', label: 'Retry Enabled', type: 'boolean', parent: 'retry', jsonKey: 'enabled' },
        { key: 'retry_maxRetries', label: 'Max Retries', type: 'number', parent: 'retry', jsonKey: 'maxRetries' },
      ]
    },
    {
      title: 'Resources', iconClass: 'text-cyan-400', fields: [
        { key: 'packages', label: 'Packages', type: 'array' },
        { key: 'extensions', label: 'Extensions', type: 'array' },
        { key: 'skills', label: 'Skills', type: 'array' },
        { key: 'prompts', label: 'Prompts', type: 'array' },
        { key: 'themes', label: 'Themes', type: 'array' },
      ]
    },
    {
      title: 'Advanced', iconClass: 'text-red-400', fields: [
        { key: 'doubleEscapeAction', label: 'Double Escape Action', type: 'select', options: doubleEscapeActions },
        { key: 'treeFilterMode', label: 'Tree Filter Mode', type: 'select', options: treeFilterModes },
        { key: 'enableSkillCommands', label: 'Skill Commands', type: 'boolean' },
        { key: 'enableInstallTelemetry', label: 'Install Telemetry', type: 'boolean' },
        { key: 'quietStartup', label: 'Quiet Startup', type: 'boolean' },
        { key: 'httpIdleTimeoutMs', label: 'HTTP Idle Timeout (ms)', type: 'number' },
        { key: 'sessionDir', label: 'Session Directory', type: 'text' },
      ]
    },
  ];

  let expandedSections = sections.map(s => s.title);

  function toggleSection(title) {
    if (expandedSections.includes(title)) {
      expandedSections = expandedSections.filter(t => t !== title);
    } else {
      expandedSections = [...expandedSections, title];
    }
  }

  function getValue(field) {
    if (!settings) return undefined;
    if (field.parent) {
      const parent = settings[field.parent];
      if (!parent) return undefined;
      return parent[field.jsonKey || field.key];
    }
    return settings[field.key];
  }

  function setValue(field, value) {
    if (!settings) return;
    if (field.parent) {
      if (!settings[field.parent]) settings[field.parent] = {};
      settings[field.parent][field.jsonKey || field.key] = value;
    } else {
      settings[field.key] = value;
    }
    settings = settings; // trigger reactivity
    dirty = true;
  }

  function handleArrayAdd(field) {
    const current = getValue(field) || [];
    const val = prompt(`Add value for ${field.label}:`);
    if (val !== null && val.trim()) {
      setValue(field, [...current, val.trim()]);
    }
  }

  function handleArrayRemove(field, index) {
    const current = getValue(field) || [];
    setValue(field, current.filter((_, i) => i !== index));
  }

  async function loadSettings() {
    loading = true;
    try {
      const data = await getSettings(scope);
      settings = data.settings || {};
      original = JSON.parse(JSON.stringify(settings));
      dirty = false;
    } catch (e) {
      settings = {};
    }
    loading = false;
  }

  async function save() {
    saving = true;
    saveMsg = '';
    try {
      const diff = {};
      for (const key of Object.keys(settings)) {
        if (JSON.stringify(settings[key]) !== JSON.stringify(original[key])) {
          diff[key] = settings[key];
        }
      }
      await updateSettings(scope, diff);
      original = JSON.parse(JSON.stringify(settings));
      dirty = false;
      saveMsg = 'Saved ✓';
    } catch (e) {
      saveMsg = 'Save failed';
    }
    saving = false;
    setTimeout(() => { saveMsg = ''; }, 2000);
  }

  $: if (scope) loadSettings();
</script>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-100">Settings</h1>
      <p class="text-sm text-gray-500 mt-1">Configure pi behavior and preferences</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex rounded-lg bg-gray-800 p-1">
        <button
          on:click={() => { scope = 'global'; dirty = false; }}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {scope === 'global' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}"
        >Global</button>
        <button
          on:click={() => { scope = 'project'; dirty = false; }}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {scope === 'project' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}"
        >Project</button>
      </div>
      {#if dirty}
        <button
          on:click={save}
          disabled={saving}
          class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      {/if}
      {#if saveMsg}
        <span class="text-sm {saveMsg.includes('fail') ? 'text-red-400' : 'text-green-400'}">{saveMsg}</span>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
    </div>
  {:else if settings}
    <div class="space-y-4">
      {#each sections as section}
        <div class="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <button
            on:click={() => toggleSection(section.title)}
            class="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
          >
            <span class="h-2.5 w-2.5 rounded-full {section.iconClass}"></span>
            <span class="text-sm font-semibold text-gray-200">{section.title}</span>
            <svg class="ml-auto h-4 w-4 text-gray-500 transition-transform {expandedSections.includes(section.title) ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedSections.includes(section.title)}
            <div class="border-t border-gray-800 px-5 py-4 space-y-4">
              {#each section.fields as field}
                {@const value = getValue(field)}
                <div class="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  <span class="sm:w-48 sm:shrink-0 text-sm text-gray-400">{field.label}</span>
                  <div class="flex-1">
                    {#if field.type === 'boolean'}
                      <button
                        on:click={() => setValue(field, !value)}
                        aria-label={field.label}
                        class="relative h-6 w-11 rounded-full transition-colors {value ? 'bg-indigo-500' : 'bg-gray-700'}"
                      >
                        <span class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {value ? 'translate-x-5' : ''}"></span>
                      </button>
                    {:else if field.type === 'select'}
                      <select
                        value={value || ''}
                        on:change={(e) => setValue(field, e.target.value || undefined)}
                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">— default —</option>
                        {#each field.options as opt}
                          <option value={opt}>{opt}</option>
                        {/each}
                      </select>
                    {:else if field.type === 'number'}
                      <input
                        type="number"
                        value={value ?? ''}
                        min={field.min}
                        max={field.max}
                        on:change={(e) => setValue(field, e.target.value ? Number(e.target.value) : undefined)}
                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                      />
                    {:else if field.type === 'array'}
                      <div class="space-y-2">
                        {#each (value || []) as item, i}
                          <div class="flex items-center gap-2">
                            <span class="rounded-md bg-gray-800 px-2.5 py-1 text-xs text-gray-300 border border-gray-700">{item}</span>
                            <button on:click={() => handleArrayRemove(field, i)} aria-label="Remove" class="text-gray-600 hover:text-red-400 transition-colors">
                              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        {/each}
                        <button on:click={() => handleArrayAdd(field)} class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">+ Add</button>
                      </div>
                    {:else}
                      <input
                        type="text"
                        value={value ?? ''}
                        on:change={(e) => setValue(field, e.target.value || undefined)}
                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                      />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>