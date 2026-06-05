<script>
  import { getSkills } from '../api.js';

  let skills = [];
  let loading = true;
  let expandedSkill = null;
  let searchQuery = '';

  $: filtered = searchQuery
    ? skills.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : skills;

  $: bySource = filtered.reduce((acc, s) => {
    const source = s.sourceInfo?.scope || 'unknown';
    if (!acc[source]) acc[source] = [];
    acc[source].push(s);
    return acc;
  }, {});

  async function load() {
    loading = true;
    try {
      const data = await getSkills();
      skills = data.skills || [];
    } catch (e) {
      skills = [];
    }
    loading = false;
  }

  load();
</script>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-100">Skills</h1>
      <p class="text-sm text-gray-500 mt-1">{skills.length} skill{skills.length !== 1 ? 's' : ''} loaded</p>
    </div>
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search skills..."
      class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none w-full max-w-64"
    />
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
    </div>
  {:else if filtered.length === 0}
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
      <p class="text-gray-500">{searchQuery ? 'No matching skills' : 'No skills configured'}</p>
    </div>
  {:else}
    {#each Object.entries(bySource) as [source, items]}
      <div class="mb-6">
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
          <span class="h-2 w-2 rounded-full text-indigo-400" style="display:inline-block"></span>
          {source === 'user' ? 'User Skills' : source === 'project' ? 'Project Skills' : source}
        </h2>
        <div class="space-y-2">
          {#each items as skill}
            <div class="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden transition-colors hover:border-gray-700">
              <button
                on:click={() => { expandedSkill = expandedSkill === skill.name ? null : skill.name; }}
                class="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <svg class="h-4 w-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><use href="#icon-skills"/></svg>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-200">{skill.name}</span>
                    {#if skill.disableModelInvocation}
                      <span class="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">disabled</span>
                    {/if}
                  </div>
                  <p class="truncate text-xs text-gray-500 mt-0.5">{skill.description}</p>
                </div>
                <svg class="h-4 w-4 shrink-0 text-gray-600 transition-transform {expandedSkill === skill.name ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if expandedSkill === skill.name}
                <div class="border-t border-gray-800 px-5 py-4 space-y-3">
                  <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                    <div>
                      <span class="text-gray-600">Source:</span>
                      <span class="ml-1 text-gray-400">{skill.sourceInfo?.scope || 'unknown'}</span>
                    </div>
                    <div>
                      <span class="text-gray-600">Path:</span>
                      <span class="ml-1 text-gray-400 truncate max-w-xs inline-block align-bottom">{skill.filePath}</span>
                    </div>
                  </div>
                  {#if skill.content}
                    <div class="rounded-lg bg-gray-950 p-3 max-h-60 overflow-y-auto">
                      <pre class="text-xs text-gray-400 whitespace-pre-wrap">{skill.content}</pre>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>