<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const { user, can, logout } = useAdmin()
const { data: site } = await useSite()
const route = useRoute()
const open = ref(false)

const { data: dash } = await useFetch<{ openReports: number }>('/api/admin/dashboard', { key: 'admin-dashboard', lazy: true })

watch(() => route.fullPath, () => { open.value = false })

const links = computed<NavigationMenuItem[][]>(() => {
  const main: (NavigationMenuItem & { min?: AdminRole })[] = [
    { label: 'Tableau de bord', icon: 'i-lucide-layout-dashboard', to: '/admin', exact: true },
    { label: 'Années', icon: 'i-lucide-calendar-range', to: '/admin/annees' },
    { label: 'Documents', icon: 'i-lucide-files', to: '/admin/documents' },
    { label: 'Téléverser', icon: 'i-lucide-upload', to: '/admin/televerser' },
    {
      label: 'Signalements', icon: 'i-lucide-flag', to: '/admin/signalements', min: 'editor',
      badge: dash.value?.openReports ? { label: String(dash.value.openReports), color: 'error', variant: 'solid' } : undefined,
    },
    { label: 'Mots de passe', icon: 'i-lucide-key-round', to: '/admin/mots-de-passe', min: 'editor' },
    { label: 'Paramètres', icon: 'i-lucide-settings', to: '/admin/parametres', min: 'editor' },
    { label: 'Administrateurs', icon: 'i-lucide-users', to: '/admin/administrateurs', min: 'owner' },
    { label: 'Jetons d\'API', icon: 'i-lucide-plug', to: '/admin/jetons' },
    { label: 'Journal', icon: 'i-lucide-scroll-text', to: '/admin/journal', min: 'editor' },
    { label: 'Corbeille', icon: 'i-lucide-trash-2', to: '/admin/corbeille', min: 'editor' },
    { label: 'Export & sauvegardes', icon: 'i-lucide-archive', to: '/admin/export', min: 'owner' },
  ]
  return [
    main.filter(l => !l.min || can(l.min)).map(({ min: _m, ...l }) => l),
    [{ label: 'Voir le site', icon: 'i-lucide-external-link', to: '/', target: '_blank' }],
  ]
})

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.name ?? '', description: user.value ? ROLE_LABELS[user.value.role] : '' }],
  [{ label: 'Mes passkeys', icon: 'i-lucide-fingerprint', to: '/admin/passkeys' }],
  [{ label: 'Déconnexion', icon: 'i-lucide-log-out', color: 'error', onSelect: () => { logout() } }],
])
</script>

<template>
  <UDashboardGroup unit="rem" storage-key="admin-dashboard">
    <UDashboardSidebar
      id="admin"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/admin" class="flex min-w-0 items-center gap-2 text-sm tracking-[0.15em] uppercase">
          <img v-if="site?.logoUrl" :src="site.logoUrl" alt="" class="size-7 shrink-0 object-contain">
          <UIcon v-else name="i-lucide-tent-tree" class="size-7 shrink-0 text-primary" />
          <span v-if="!collapsed" class="truncate">{{ site?.name ?? 'Archives' }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="links[0]" orientation="vertical" tooltip />
        <UNavigationMenu :collapsed="collapsed" :items="links[1]" orientation="vertical" tooltip class="mt-auto" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ align: 'center', collisionPadding: 12 }" class="w-full">
          <UButton
            :avatar="{ alt: user?.name ?? '?' }"
            :label="collapsed ? undefined : user?.name"
            :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="data-[state=open]:bg-elevated"
            aria-label="Menu du compte"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
    <AdminConfirmHost />
  </UDashboardGroup>
</template>
