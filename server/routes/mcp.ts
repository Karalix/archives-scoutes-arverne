import { z } from 'zod'
import type { H3Event } from 'h3'
import type { Actor, Scope } from '../utils/auth'

// I-11 : serveur MCP distant (transport Streamable HTTP, sans état) dans le même Worker,
// authentifié par le même jeton. Chaque outil appelle la couche métier de l'API REST.

const PROTOCOL = '2025-06-18'

interface Tool {
  name: string
  description: string
  scope: Scope
  input: z.ZodType
  run: (event: H3Event, actor: Actor, args: any) => Promise<unknown>
}

const docSummary = async (id: string) => {
  const { doc, yearStart } = await loadDocWithYear(id)
  return serializeAdminDoc(doc, yearStart, true)
}

const TOOLS: Tool[] = [
  {
    name: 'get_conventions',
    description: 'Branches, types d\'événements, années existantes, règle de nommage des fichiers et format vidéo attendu. À appeler en premier.',
    scope: 'read',
    input: z.object({}),
    async run() {
      const inst = await getInstance()
      const years = await db.select({ s: schema.year.startYear }).from(schema.year)
      return {
        branches: inst.branches,
        eventTypes: inst.eventTypes,
        years: years.map(y => y.s).sort(),
        currentScoutYear: scoutYearOf(new Date(), inst.switchMonth),
        namingRule: NAMING_RULE,
        video: { target: 'MP4 H.264 720p 1,5–2 Mbit/s, AAC 128k, faststart', ffmpeg: ffmpegCommand(), thumbnail: ffmpegThumbCommand() },
        limits: { partSize: PART_SIZE, directMax: DIRECT_MAX, batch: 100 },
      }
    },
  },
  {
    name: 'search_documents',
    description: 'Recherche plein texte et filtres (année, branche, statut, type).',
    scope: 'read',
    input: z.object({ q: z.string().optional(), year: z.number().int().optional(), branch: z.string().optional(), status: z.enum(['draft', 'published', 'trashed']).optional(), kind: zKind.optional(), externalId: z.string().optional(), limit: z.number().int().max(500).optional() }),
    async run(event, _actor, args) {
      const qs = new URLSearchParams(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
      return $fetch(`/api/v1/documents?${qs}`, { headers: { authorization: getHeader(event, 'authorization')! } })
    },
  },
  {
    name: 'get_document',
    description: 'Détail d\'un document.',
    scope: 'read',
    input: z.object({ id: z.string() }),
    run: async (_e, _a, args) => docSummary(args.id),
  },
  {
    name: 'upsert_year',
    description: 'Créer ou compléter une année scoute (startYear = année de début, 2019 pour 2019-2020).',
    scope: 'write',
    input: YearInput.extend({ dryRun: z.boolean().optional() }),
    run: (_e, actor, { dryRun, ...args }) => upsertYear(actor, args, dryRun),
  },
  {
    name: 'upsert_event',
    description: 'Créer ou compléter un événement d\'une année (retrouvé par titre).',
    scope: 'write',
    input: EventInputSchema.extend({ dryRun: z.boolean().optional() }),
    run: (_e, actor, { dryRun, ...args }) => upsertEvent(actor, args, dryRun),
  },
  {
    name: 'plan_import',
    description: 'Reçoit une liste de fichiers (chemin, taille, durée) et renvoie le classement proposé (année, événement, branche, titre) à faire valider par un humain. N\'écrit rien.',
    scope: 'read',
    input: PlanImportInput,
    run: (_e, _a, args) => planImport(args.files),
  },
  {
    name: 'create_documents',
    description: 'Crée (ou met à jour, par externalId) jusqu\'à 100 documents en brouillon. Utilisez externalId = chemin du fichier source pour qu\'une reprise ne crée aucun doublon.',
    scope: 'write',
    input: z.object({ documents: z.array(DocumentInputSchema).min(1).max(100), dryRun: z.boolean().optional() }),
    async run(_e, actor, args) {
      const results = []
      for (const [index, input] of args.documents.entries()) {
        try {
          const r = await upsertDocument(actor, { ...input, status: input.status ?? 'draft' }, { dryRun: args.dryRun })
          results.push({ index, ok: true, action: r.action, id: r.id, externalId: input.externalId ?? null })
        }
        catch (e: any) {
          results.push({ index, ok: false, externalId: input.externalId ?? null, error: e.data?.detail ?? e.message, hint: e.data?.hint })
        }
      }
      return { results }
    },
  },
  {
    name: 'request_upload',
    description: 'Prépare l\'envoi d\'un fichier et renvoie les URL signées (15 min) des parties de 50 Mo à envoyer avec curl -X PUT --data-binary. Les binaires ne transitent jamais par MCP.',
    scope: 'write',
    input: UploadCreateInput.extend({ uploadId: z.string().optional().describe('Pour reprendre un envoi : renvoie les URL des parties manquantes') }),
    async run(event, actor, args) {
      const origin = getRequestURL(event).origin
      const r = args.uploadId ? await describeUpload(await getUpload(args.uploadId), true) : await createUpload(event, actor, args)
      const withOrigin = (r.partUrls ?? []).map(p => ({ ...p, url: origin + p.url }))
      return {
        ...r,
        partUrls: withOrigin,
        howTo: `Pour chaque partie n (taille ${r.partSize} octets, la dernière plus courte) : dd if=FICHIER bs=${r.partSize} skip=$((n-1)) count=1 2>/dev/null | curl -sf -X PUT --data-binary @- "URL"`,
      }
    },
  },
  {
    name: 'complete_upload',
    description: 'Finalise un envoi, vérifie le type réel et la conformité vidéo (sinon renvoie la commande ffmpeg à exécuter).',
    scope: 'write',
    input: z.object({ uploadId: z.string(), duration: z.number().optional(), width: z.number().int().optional(), height: z.number().int().optional() }),
    async run(event, actor, { uploadId, ...meta }) {
      return completeUpload(event, actor, await getUpload(uploadId), meta)
    },
  },
  {
    name: 'update_documents',
    description: 'Met à jour les métadonnées de plusieurs documents (id requis pour chacun).',
    scope: 'write',
    input: z.object({ documents: z.array(DocumentInputSchema.extend({ id: z.string() })).min(1).max(100) }),
    async run(_e, actor, args) {
      const results = []
      for (const input of args.documents) {
        try {
          await upsertDocument(actor, input)
          results.push({ id: input.id, ok: true })
        }
        catch (e: any) { results.push({ id: input.id, ok: false, error: e.data?.detail ?? e.message }) }
      }
      return { results }
    },
  },
  {
    name: 'publish_documents',
    description: 'Passe des brouillons en publié. Exige un jeton de portée publish.',
    scope: 'publish',
    input: z.object({ ids: z.array(z.string()).min(1).max(500) }),
    run: (_e, actor, args) => publishDocuments(actor, args.ids, true),
  },
  {
    name: 'trash_documents',
    description: 'Met des documents à la corbeille (rétention 30 jours). Aucune suppression définitive n\'est possible par MCP.',
    scope: 'write',
    input: z.object({ ids: z.array(z.string()).min(1).max(100) }),
    run: (_e, actor, args) => trashDocuments(actor, args.ids),
  },
]

const PROMPTS = [
  {
    name: 'import_camp_folder',
    description: 'Déroulé recommandé pour importer un dossier de camp (I-14).',
    arguments: [{ name: 'folder', description: 'Chemin du dossier local à importer', required: true }],
    text: (folder: string) => `Tu importes le dossier « ${folder} » dans les archives du groupe scout. Déroulé obligatoire :
1. get_conventions : lis les branches, types d'événements, années et la règle de nommage.
2. Liste les fichiers du dossier (chemin, taille ; durée des vidéos avec ffprobe -v error -show_entries format=duration -of csv=p=0).
3. plan_import avec cette liste ; présente le plan à l'humain sous forme de tableau et ATTENDS sa validation explicite.
4. upsert_year pour les années manquantes, upsert_event si besoin.
5. Vidéos marquées needsEncoding : exécute la commande ffmpeg fournie, puis génère une vignette (ffmpeg -ss <10 % de la durée> -frames:v 1).
6. create_documents en brouillon, avec externalId = chemin du fichier source (une relance ne crée aucun doublon).
7. Pour chaque fichier : request_upload, envoie chaque partie avec curl -X PUT --data-binary, puis complete_upload. Envoie aussi la vignette (variant thumb).
8. Donne à l'humain le lien /admin/documents?status=draft pour relecture ; ne publie (publish_documents) que s'il le demande et si le jeton le permet.`,
  },
]

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}
function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id, error: { code, message, data } }
}

async function handle(event: H3Event, actor: Actor, msg: any) {
  const { id, method, params } = msg ?? {}
  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: 'archives-scoutes', version: useRuntimeConfig().public.version },
        instructions: 'Archives d\'un groupe scout. Commencez par get_conventions. Tout ce que vous créez arrive en brouillon ; un humain valide le plan avant import (prompt import_camp_folder).',
      })
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.filter(t => actor.scopes.includes(t.scope)).map(t => ({
          name: t.name,
          description: `${t.description} (portée ${t.scope})`,
          inputSchema: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }),
        })),
      })
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params?.name)
      if (!tool) return rpcError(id, -32602, `Outil inconnu : ${params?.name}`)
      if (!actor.scopes.includes(tool.scope)) {
        return rpcResult(id, { isError: true, content: [{ type: 'text', text: `Portée « ${tool.scope} » requise pour ${tool.name}.` }] })
      }
      const parsed = tool.input.safeParse(params?.arguments ?? {})
      if (!parsed.success) {
        return rpcResult(id, { isError: true, content: [{ type: 'text', text: `Arguments invalides : ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join(' ; ')}` }] })
      }
      try {
        const out = await tool.run(event, actor, parsed.data)
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: Array.isArray(out) ? { items: out } : out })
      }
      catch (e: any) {
        const detail = e.data?.detail ?? e.message
        return rpcResult(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: detail, hint: e.data?.hint, ffmpeg: e.data?.ffmpeg, problems: e.data?.problems }, null, 2) }] })
      }
    }
    case 'prompts/list':
      return rpcResult(id, { prompts: PROMPTS.map(({ text: _t, ...p }) => p) })
    case 'prompts/get': {
      const p = PROMPTS.find(x => x.name === params?.name)
      if (!p) return rpcError(id, -32602, 'Prompt inconnu')
      return rpcResult(id, { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text(params?.arguments?.folder ?? '.') } }] })
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] })
    default:
      return id === undefined ? null : rpcError(id, -32601, `Méthode inconnue : ${method}`)
  }
}

export default defineEventHandler(async (event) => {
  if (event.method === 'GET') {
    // Pas de flux SSE côté serveur (mode sans état)
    setResponseStatus(event, 405)
    setHeader(event, 'Allow', 'POST')
    return { error: 'Utilisez POST (Streamable HTTP, sans état)' }
  }
  if (event.method === 'DELETE') return null
  if (event.method !== 'POST') throw problem(405, 'Méthode non autorisée')
  const actor = await getTokenActor(event)
  if (!actor) {
    setHeader(event, 'WWW-Authenticate', 'Bearer realm="archives-scoutes"')
    throw problem(401, 'Jeton d\'API requis (Authorization: Bearer …)', { hint: 'Créez un jeton dans Administration → Jetons d\'API.' })
  }
  const body = await readBody(event)
  setHeader(event, 'Content-Type', 'application/json')
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(m => handle(event, actor, m)))).filter(Boolean)
    if (!out.length) { setResponseStatus(event, 202); return '' }
    return out
  }
  const out = await handle(event, actor, body)
  if (!out) { setResponseStatus(event, 202); return '' }
  return out
})
