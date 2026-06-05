<script>
  import { getExtensions } from '../api.js';

  let extensions = [];
  let loading = true;
  let expandedExt = null;

  async function load() {
    loading = true;
    try {
      const data = await getExtensions();
      extensions = data.extensions || [];
    } catch (e) {
      extensions = [];
    }
    loading = false;
  }

  load();
</script>

<div>
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-100">Extensions</h1>
    <p class="text-sm text-gray-500 mt-1">{extensions.length} extension{extensions.length !== 1 ? 's' : ''} loaded</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
    </div>
  {:else if extensions.length === 0}
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
      <p class="text-gray-500">No extensions configured</p>
      <p class="text-xs text-gray-600 mt-2">Add extension paths in Settings → Resources → Extensions</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each extensions as ext}
        {@const tools = ext.tools ? Object.entries(ext.tools) : []}
        {@const commands = ext.commands ? Object.entries(ext.commands) : []}
        {@const flags = ext.flags ? Object.entries(ext.flags) : []}
        {@const shortcuts = ext.shortcuts ? Object.entries(ext.shortcuts) : []}
        {@const totalItems = tools.length + commands.length + flags.length + shortcuts.length}

        <div class="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden transition-colors hover:border-gray-700">
          <button
            on:click={() => { expandedExt = expandedExt === ext.path ? null : ext.path; }}
            class="flex w-full items-center gap-3 px-5 py-4 text-left"
          >
            <svg class="h-4 w-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-gray-200">{ext.path.split('/').pop()}</span>
              <p class="truncate text-xs text-gray-500 mt-0.5">{ext.path}</p>
            </div>
            {#if totalItems > 0}
              <span class="rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
            {/if}
            <svg class="h-4 w-4 shrink-0 text-gray-600 transition-transform {expandedExt === ext.path ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedExt === ext.path}
            <div class="border-t border-gray-800 px-5 py-4 space-y-4">
              {#if ext.sourceInfo}
                <div class="text-xs">
                  <span class="text-gray-600">Source:</span>
                  <span class="ml-1 text-gray-400">{ext.sourceInfo.scope || 'unknown'}</span>
                </div>
              {/if}

              {#if tools.length > 0}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Tools ({tools.length})</h3>
                  <div class="space-y-1.5">
                    {#each tools as [name, tool]}
                      <div class="rounded-lg bg-gray-950 px-3 py-2">
                        <div class="text-xs font-medium text-indigo-400">{name}</div>
                        <p class="text-[11px] text-gray-500 mt-0.5">{tool.description || 'No description'}</p>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if commands.length > 0}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Commands ({commands.length})</h3>
                  <div class="space-y-1.5">
                    {#each commands as [name, cmd]}
                      <div class="rounded-lg bg-gray-950 px-3 py-2">
                        <div class="text-xs font-medium text-indigo-400">/{name}</div>
                        <p class="text-[11px] text-gray-500 mt-0.5">{cmd.description || 'No description'}</p>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if flags.length > 0}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Flags ({flags.length})</h3>
                  <div class="flex flex-wrap gap-2">
                    {#each flags as [key, val]}
                      <span class="rounded-md bg-gray-950 px-2 py-1 text-[11px] text-gray-400 border border-gray-800">{key}</span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if shortcuts.length > 0}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Shortcuts ({shortcuts.length})</h3>
                  <div class="flex flex-wrap gap-2">
                    {#each shortcuts as [key, sc]}
                      <kbd class="rounded-md bg-gray-950 px-2 py-1 text-[11px] text-gray-400 border border-gray-800 font-mono">{key}</kbd>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if totalItems === 0}
                <p class="text-xs text-gray-600">No tools, commands, flags, or shortcuts registered.</p>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>