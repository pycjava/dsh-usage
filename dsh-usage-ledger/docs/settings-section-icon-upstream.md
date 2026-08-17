# Upstream proposal: `icon` option on `settings.section` registration

**Status:** local patch applied to the installed harness; proposed for upstream
`deepseek-ai/deepseek-harness`.

## Why

A `settings.section` registrant (like this plugin) currently cannot control the
glyph the settings nav shows for its section. The shell's `navIcon(id)` maps
only the shipped ids (`models`, `agent-presets`, `plugins`) and falls back to
the settings gear for everything else — so every third-party section renders a
gear. The icon choice is hardcoded in the shell, and a plugin has no channel to
replace it: the slot registry even drops unknown registration options.

The fix moves icon ownership from the shell to the registrant: `settings.section`
gains an optional `icon: ReactNode` registration option, rendered ahead of the
id map. This ships the glyph with the plugin (portable, survives DSH updates),
and any registrant — not just this plugin — can use it. Shells without the
feature ignore the unknown option gracefully (the registry whitelist drops it,
`e.options.icon` is `undefined`) and keep the gear fallback.

## Source changes (3 files)

All paths relative to the harness monorepo root.

### 1. `packages/client/ui-slots/src/index.ts` — persist `icon` in the entry options

`register()` builds the stored `entry.options` from a whitelist; unknown keys
are dropped. Add `icon` to the whitelist:

```ts
options: {
  ...(options.key !== void 0 ? { key: options.key } : {}),
  ...(options.id !== void 0 ? { id: options.id } : {}),
  ...(options.order !== void 0 ? { order: options.order } : {}),
  ...(options.label !== void 0 ? { label: options.label } : {}),
  ...(options.icon !== void 0 ? { icon: options.icon } : {}),   // ← new
  ...(options.priority !== void 0 ? { priority: options.priority } : {}),
},
```

### 2. `packages/client/ui-settings-general/src/client/SettingsRoot.tsx` — render the registrant's icon first

The nav rows projection passes `icon` through, and `navIcon` renders it ahead of
the id map:

```tsx
// rows projection (settings sections snapshot)
rows = ctx.slots.entries('settings.section').map((e) => ({
  id: e.options.id ?? '',
  order: e.options.order ?? 0,
  label: resolveSlotLabel(e.options.label) ?? '',
  icon: e.options.icon,                                        // ← new
})).sort((a, b) => a.order - b.order)

// nav glyph: registrant icon wins, then id map, then gear
function navIcon(row: SettingsSectionRow) {
  if (row.icon !== undefined) {
    return <span className={styles.navIcon}>{row.icon}</span> // ← new
  }
  const { id } = row
  if (id === 'models') return <IconDataOutline16 className={styles.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={styles.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={styles.navIcon} size={16} />
  return <IconSettingsOutline16 className={styles.navIcon} size={16} />
}

// call site: pass the whole row, not just the id
children: [navIcon(row), <span className={styles.navLabel}>{row.label}</span>]
```

`styles.navIcon` is the existing `flex: none` seat, so a registrant glyph keeps
the same nav layout without needing the shell's class names.

### 3. `packages/client/ui-settings/src/client/contract/slots.ts` — document the option

Add `icon` to the `settings.section` `registerOptions` so the invariant catalog
documents it:

```ts
{
  name: 'icon',
  requirement: 'optional',
  type: 'ReactNode',
  doc: 'Nav glyph for the settings rail. When supplied it renders as-is (the shell wraps it in the nav-icon seat); when absent the shell maps known ids to shipped glyphs and falls back to the gear. Ship one stable element (e.g. a module-level icon) so the shell\'s row snapshot keeps a stable reference.',
},
```

## Usage (registrant side)

```tsx
// module scope — one stable element
const NAV_ICON = createElement(UsageNavIcon, { size: 16 })

ctx.slots.inject('settings.section', () => ctx.slots.register(
  {
    name: 'settings.section',
    id: 'usage',
    order: 30,
    label: () => t('nav'),
    icon: NAV_ICON,   // ← line-chart glyph owned by the plugin
    locale: NS,
    inject: () => ({ query, localeId }),
  },
  UsageSection,
))
```

## Compatibility / fallback

- Old shell (no feature): the slots whitelist drops `icon` silently; the shell
  falls back to the gear for unknown ids. No error, no breakage.
- New shell: registrant icon renders first.

## Applying to a prebuilt (installed) app

On an installed app with no source checkout, the slots registry is **bundled
into the prebuilt shell asset** (`dsh-web-frontend/dist/assets/index-*.js`),
not the `dsh-client-ui-slots/lib/index.js` package file — editing the package
file alone has no effect. The same whitelist one-liner must be patched in the
minified bundle:

```js
// find:  ...r.label!==void 0?{label:r.label}:{},...r.priority!==void 0?{priority:r.priority}:{}
// insert icon between label and priority:
...r.label!==void 0?{label:r.label}:{},...r.icon!==void 0?{icon:r.icon}:{},...r.priority!==void 0?{priority:r.priority}:{}
```

Then cache-bust the asset (new content-hashed filename + index.html reference),
because the served shell keeps running the old bundle in memory until the page
reloads. This local patch is ephemeral (lost on app update); the upstream
source change is what makes the feature durable.
