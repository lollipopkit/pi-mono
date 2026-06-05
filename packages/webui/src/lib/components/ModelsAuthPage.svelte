<script>
  import { getModels, getAuth, setAuthProvider, deleteAuthProvider } from '../api.js';

  let models = [];
  let auth = {};
  let loading = true;
  let tab = 'models';
  let editingProvider = null;
  let apiKeyInput = '';
  let saveMsg = '';

  $: modelsByProvider = models.reduce((acc, m) => {
    const provider = m.provider || 'unknown';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {});

  $: authProviders = Object.entries(auth).map(([name, cred]) => ({
    name,
    configured: !!(cred && cred.key),
    type: cred?.type || 'api_key',
    masked: cred?.key ? cred.key.slice(0, 4) + '...' + cred.key.slice(-4) : null,
  }));

  async function load() {
    loading = true;
    try {
      const [m, a] = await Promise.all([getModels(), getAuth()]);
      models = m.models || [];
      auth = a.auth || {};
    } catch (e) {
      models = [];
      auth = {};
    }
    loading = false;
  }

  load();

  async function saveApiKey(provider) {
    if (!apiKeyInput.trim()) return;
    try {
      await setAuthProvider(provider, { type: 'api_key', key: apiKeyInput.trim() });
      saveMsg = provider + ' key saved ✓';
      editingProvider = null;
      apiKeyInput = '';
      load();
    } catch (e) {
      saveMsg = 'Failed to save key';
    }
    setTimeout(() => { saveMsg = ''; }, 2000);
  }

  async function removeAuth(provider) {
    try {
      await deleteAuthProvider(provider);
      load();
    } catch (e) {}
  }
</script>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-100">Models & Auth</h1>
      <p class="text-sm text-gray-500 mt-1">Manage models and provider credentials</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex rounded-lg bg-gray-800 p-1">
        <button
          on:click={() => { tab = 'models'; }}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {tab === 'models' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}"
        >Models</button>
        <button
          on:click={() => { tab = 'auth'; }}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {tab === 'auth' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}"
        >Auth</button>
      </div>
      {#if saveMsg}
        <span class="text-sm text-green-400">{saveMsg}</span>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
    </div>
  {:else if tab === 'models'}
    {#if Object.keys(modelsByProvider).length === 0}
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
        <p class="text-gray-500">No models available</p>
      </div>
    {:else}
      {#each Object.entries(modelsByProvider) as [provider, providerModels]}
        <div class="mb-6">
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full text-indigo-400"></span>
            {provider}
          </h2>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each providerModels as model}
              <div class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-200">{model.name || model.id}</span>
                  {#if model.thinking}
                    <span class="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-400">thinking</span>
                  {/if}
                </div>
                {#if model.contextWindow}
                  <p class="text-[11px] text-gray-600 mt-1">Context: {model.contextWindow.toLocaleString()} tokens</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {:else}
    <div class="space-y-3">
      {#each authProviders as provider}
        <div class="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-200">{provider.name}</span>
              {#if provider.configured}
                <span class="flex items-center gap-1 text-[10px] text-green-500">
                  <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  configured
                </span>
              {:else}
                <span class="flex items-center gap-1 text-[10px] text-gray-600">
                  <span class="h-1.5 w-1.5 rounded-full bg-gray-600"></span>
                  not set
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if provider.configured}
                <span class="text-xs text-gray-600 font-mono">{provider.masked}</span>
                <button
                  on:click={() => removeAuth(provider.name)}
                  class="text-xs text-gray-600 hover:text-red-400 transition-colors"
                >Remove</button>
              {/if}
              <button
                on:click={() => { editingProvider = editingProvider === provider.name ? null : provider.name; apiKeyInput = ''; }}
                class="rounded-md bg-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >{provider.configured ? 'Edit' : 'Set Key'}</button>
            </div>
          </div>
          {#if editingProvider === provider.name}
            <div class="mt-3 flex gap-2">
              <input
                type="password"
                bind:value={apiKeyInput}
                placeholder="Enter API key..."
                class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                on:keydown={(e) => { if (e.key === 'Enter') saveApiKey(provider.name); }}
              />
              <button
                on:click={() => saveApiKey(provider.name)}
                class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
              >Save</button>
            </div>
          {/if}
        </div>
      {/each}

      {#if authProviders.length === 0}
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
          <p class="text-gray-500">No auth providers configured</p>
          <p class="text-xs text-gray-600 mt-2">Use pi CLI to configure providers first</p>
        </div>
      {/if}
    </div>
  {/if}
</div>