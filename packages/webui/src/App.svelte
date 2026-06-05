<script>
  import SettingsPage from './lib/components/SettingsPage.svelte';
  import SkillsPage from './lib/components/SkillsPage.svelte';
  import ExtensionsPage from './lib/components/ExtensionsPage.svelte';
  import ModelsAuthPage from './lib/components/ModelsAuthPage.svelte';

  let activePage = 'settings';
  let sidebarOpen = false;

  const pages = [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'skills', label: 'Skills', icon: 'skills' },
    { id: 'extensions', label: 'Extensions', icon: 'extensions' },
    { id: 'models-auth', label: 'Models & Auth', icon: 'models' },
  ];

  function handleNav(id) {
    activePage = id;
    sidebarOpen = false;
  }

  function closeSidebar() {
    sidebarOpen = false;
  }
</script>

<!-- SVG icon definitions -->
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <symbol id="icon-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </symbol>
  <symbol id="icon-skills" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </symbol>
  <symbol id="icon-extensions" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </symbol>
  <symbol id="icon-models" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </symbol>
  <symbol id="icon-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </symbol>
  <symbol id="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </symbol>
</svg>

<div class="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
  <!-- Mobile overlay backdrop -->
  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
      on:click={closeSidebar}
      on:keydown={(e) => { if (e.key === 'Escape') closeSidebar(); }}
      role="button"
      tabindex="-1"
      aria-label="Close sidebar"
    ></div>
  {/if}

  <!-- Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 ease-in-out
           {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0"
  >
    <!-- Sidebar header -->
    <div class="flex h-14 items-center justify-between border-b border-gray-800 px-4">
      <div class="flex items-center gap-2">
        <svg class="h-6 w-6 text-indigo-400"><use href="#icon-models"/></svg>
        <span class="text-lg font-bold text-gray-100">Pi</span>
        <span class="text-xs font-medium tracking-wider text-gray-500 uppercase">Settings</span>
      </div>
      <!-- Close button (mobile only) -->
      <button
        on:click={closeSidebar}
        class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors lg:hidden"
        aria-label="Close menu"
      >
        <svg class="h-5 w-5"><use href="#icon-close"/></svg>
      </button>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 px-3 py-4 space-y-1">
      {#each pages as page}
        <button
          on:click={() => handleNav(page.id)}
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150
                 {activePage === page.id ? 'bg-indigo-500/15 text-indigo-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}"
        >
          <svg class="h-5 w-5 flex-shrink-0"><use href="#icon-{page.icon}"/></svg>
          <span>{page.label}</span>
        </button>
      {/each}
    </nav>

    <div class="border-t border-gray-800 px-4 py-3">
      <p class="text-xs text-gray-600">v0.78.0</p>
    </div>
  </aside>

  <!-- Main content -->
  <main class="lg:ml-60 flex-1 overflow-y-auto">
    <!-- Mobile top bar -->
    <div class="lg:hidden sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur px-3">
      <button
        on:click={() => { sidebarOpen = true; }}
        class="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        aria-label="Open menu"
      >
        <svg class="h-5 w-5"><use href="#icon-menu"/></svg>
      </button>
      <span class="text-sm font-semibold text-gray-200">{pages.find(p => p.id === activePage)?.label || 'Pi Settings'}</span>
    </div>

    <div class="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      {#if activePage === 'settings'}
        <SettingsPage />
      {:else if activePage === 'skills'}
        <SkillsPage />
      {:else if activePage === 'extensions'}
        <ExtensionsPage />
      {:else if activePage === 'models-auth'}
        <ModelsAuthPage />
      {/if}
    </div>
  </main>
</div>