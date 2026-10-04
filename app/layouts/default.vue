<script setup lang="ts">
const { data: site } = await useSite()
const { ask } = useUnlock()
const route = useRoute()
const toast = useToast()
const menu = ref(false)

async function lock() {
  await $fetch('/api/access/lock', { method: 'POST' })
  toast.add({ title: 'Archives récentes verrouillées sur cet appareil' })
  await refreshNuxtData()
}

watch(() => route.fullPath, () => { menu.value = false })

const links = [
  { label: 'Années', to: '/' },
  { label: 'Recherche', to: '/recherche' },
]
const isActive = (to: string) => to === '/' ? (route.path === '/' || route.path.startsWith('/annee')) : route.path.startsWith(to)
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-default text-default">
    <a href="#contenu" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-default focus:px-3 focus:py-2">Aller au contenu</a>
    <header class="border-b border-default">
      <div class="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-12 h-18 flex items-center gap-6">
        <NuxtLink to="/" class="flex items-center gap-3 min-w-0">
          <img v-if="site?.logoUrl" :src="site.logoUrl" alt="" class="h-7 w-7 object-contain grayscale">
          <span class="truncate text-[0.95rem] font-medium tracking-tight">{{ site?.name }}</span>
        </NuxtLink>
        <nav class="ml-auto hidden sm:flex items-center gap-8 text-sm" aria-label="Navigation principale">
          <NuxtLink
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            class="py-1 border-b transition-colors"
            :class="isActive(l.to) ? 'border-(--ui-border-accented)' : 'border-transparent text-muted hover:text-default'"
          >
            {{ l.label }}
          </NuxtLink>
          <button v-if="site?.family" class="text-muted hover:text-default" @click="lock">
            Verrouiller · {{ scoutYearLabel(site.family.maxYear) }}
          </button>
          <button v-else class="text-muted hover:text-default" @click="ask()">
            Archives récentes
          </button>
          <NuxtLink v-if="site?.admin" to="/admin" class="text-muted hover:text-default">
            Administration
          </NuxtLink>
          <UColorModeButton color="neutral" variant="link" size="sm" />
        </nav>
        <button class="ml-auto sm:hidden text-sm" :aria-expanded="menu" aria-controls="menu-mobile" @click="menu = !menu">
          {{ menu ? 'Fermer' : 'Menu' }}
        </button>
      </div>
      <nav v-if="menu" id="menu-mobile" class="sm:hidden border-t border-default px-4 py-6 flex flex-col gap-5 text-lg" aria-label="Navigation principale">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to">
          {{ l.label }}
        </NuxtLink>
        <button v-if="site?.family" class="text-left" @click="lock">
          Verrouiller les archives récentes
        </button>
        <button v-else class="text-left" @click="ask()">
          Archives récentes — mot de passe
        </button>
        <NuxtLink v-if="site?.admin" to="/admin">
          Administration
        </NuxtLink>
      </nav>
    </header>

    <main id="contenu" class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-default mt-24">
      <div class="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-12 py-10 grid gap-6 sm:grid-cols-2 text-sm">
        <p class="text-muted">
          {{ site?.name }}<br>
          Archives du groupe, classées par année scoute.
        </p>
        <nav class="flex flex-wrap sm:justify-end gap-x-6 gap-y-2" aria-label="Pied de page">
          <NuxtLink to="/mentions-legales" class="text-muted hover:text-default">Mentions légales</NuxtLink>
          <NuxtLink to="/confidentialite" class="text-muted hover:text-default">Confidentialité</NuxtLink>
          <a v-if="site?.contactEmail" :href="`mailto:${site.contactEmail}`" class="text-muted hover:text-default">Contact</a>
          <NuxtLink to="/admin" class="text-muted hover:text-default">Administration</NuxtLink>
        </nav>
      </div>
    </footer>

    <PublicUnlockModal />
  </div>
</template>
