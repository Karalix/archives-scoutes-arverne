import { z } from 'zod'

// I-04 : contrat OpenAPI 3.1 généré depuis les schémas Zod
export function buildOpenApi(origin: string) {
  const js = (s: z.ZodType) => z.toJSONSchema(s, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' })
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
  const body = (name: string) => ({ required: true, content: { 'application/json': { schema: ref(name) } } })
  const ok = (description = 'Succès') => ({ description, content: { 'application/json': { schema: { type: 'object' } } } })
  const errors = {
    401: { $ref: '#/components/responses/Problem' },
    403: { $ref: '#/components/responses/Problem' },
    422: { $ref: '#/components/responses/Problem' },
  }
  const dryRun = { name: 'dryRun', in: 'query', schema: { type: 'boolean' }, description: 'Renvoie ce qui serait créé, sans rien écrire (I-08)' }
  const idem = { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' }, description: 'Rejoue la réponse d\'une création déjà faite (I-07)' }
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Archives de groupe scout — API v1',
      version: useRuntimeConfig().public.version,
      description: [
        'API d\'intégration (REST) partagée avec l\'admin et le serveur MCP (/mcp).',
        'Authentification : `Authorization: Bearer <jeton>` (Administration → Jetons d\'API).',
        'Tout ce qu\'un jeton crée arrive en brouillon, sauf portée `publish`.',
        'Les réglages sensibles (pivot, mots de passe annuels, admins, jetons) ne sont jamais accessibles par jeton.',
        'Fichiers : `PUT /api/v1/documents/{id}/files/{variant}` jusqu\'à 50 Mo ; au-delà `POST /api/uploads` (parties de 50 Mo).',
        `Convention de nommage : ${NAMING_RULE}`,
      ].join('\n\n'),
    },
    servers: [{ url: origin }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      responses: {
        Problem: { description: 'Erreur RFC 9457', content: { 'application/problem+json': { schema: ref('Problem') } } },
      },
      schemas: {
        Problem: {
          type: 'object',
          properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, hint: { type: 'string', description: 'Action à entreprendre' } },
        },
        YearInput: js(YearInput),
        EventInput: js(EventInputSchema),
        DocumentInput: js(DocumentInputSchema),
        BatchInput: js(BatchInput),
        IdsInput: js(IdsInput),
        UploadCreateInput: js(UploadCreateInput),
        FileMetaInput: js(FileMetaInput),
        PlanImportInput: js(PlanImportInput),
      },
    },
    paths: {
      '/api/v1/settings': { get: { summary: 'Taxonomie : branches, types d\'événements, années, règle de nommage, cible vidéo', responses: { 200: ok(), ...errors } } },
      '/api/v1/years': {
        get: { summary: 'Lister les années', responses: { 200: ok() } },
        post: { summary: 'Créer ou compléter une année', parameters: [dryRun, idem], requestBody: body('YearInput'), responses: { 200: ok(), 201: ok('Créée'), ...errors } },
      },
      '/api/v1/years/{startYear}': {
        patch: { summary: 'Modifier une année', parameters: [{ name: 'startYear', in: 'path', required: true, schema: { type: 'integer' } }, dryRun], requestBody: body('YearInput'), responses: { 200: ok(), ...errors } },
        delete: { summary: 'Supprimer une année vide (portée publish)', parameters: [{ name: 'startYear', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok(), ...errors } },
      },
      '/api/v1/events': {
        get: { summary: 'Lister les événements', parameters: [{ name: 'year', in: 'query', schema: { type: 'integer' } }], responses: { 200: ok() } },
        post: { summary: 'Créer ou compléter un événement (retrouvé par titre dans l\'année)', parameters: [dryRun, idem], requestBody: body('EventInput'), responses: { 200: ok(), 201: ok('Créé'), ...errors } },
      },
      '/api/v1/events/{id}': {
        patch: { summary: 'Modifier un événement', parameters: [idParam, dryRun], requestBody: body('EventInput'), responses: { 200: ok(), ...errors } },
        delete: { summary: 'Supprimer un événement (ses documents restent dans l\'année)', parameters: [idParam], responses: { 200: ok(), ...errors } },
      },
      '/api/v1/documents': {
        get: {
          summary: 'Rechercher des documents (plein texte et filtres)',
          parameters: ['q', 'year', 'kind', 'branch', 'status', 'place', 'eventId', 'externalId', 'limit'].map(name => ({ name, in: 'query', schema: { type: name === 'year' || name === 'limit' ? 'integer' : 'string' } })),
          responses: { 200: ok() },
        },
        post: { summary: 'Créer un document (brouillon) — idempotent par externalId', parameters: [dryRun, idem], requestBody: body('DocumentInput'), responses: { 200: ok('Mis à jour'), 201: ok('Créé'), ...errors } },
      },
      '/api/v1/documents/{id}': {
        get: { summary: 'Détail d\'un document', parameters: [idParam], responses: { 200: ok(), 404: { $ref: '#/components/responses/Problem' } } },
        patch: { summary: 'Modifier les métadonnées', parameters: [idParam, dryRun], requestBody: body('DocumentInput'), responses: { 200: ok(), ...errors } },
        delete: { summary: 'Mettre à la corbeille (rétention 30 jours)', parameters: [idParam], responses: { 200: ok(), ...errors } },
      },
      '/api/v1/documents/{id}/restore': { post: { summary: 'Restaurer depuis la corbeille', parameters: [idParam], responses: { 200: ok(), ...errors } } },
      '/api/v1/documents/{id}/files/{variant}': {
        put: {
          summary: 'Envoi direct d\'un fichier (≤ 50 Mo)',
          parameters: [idParam, { name: 'variant', in: 'path', required: true, schema: { enum: ['main', 'thumb', 'captions', 'original'] } },
            { name: 'filename', in: 'query', schema: { type: 'string' } }, { name: 'duration', in: 'query', schema: { type: 'number' } }],
          requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          responses: { 200: ok(), 413: { $ref: '#/components/responses/Problem' }, 415: { $ref: '#/components/responses/Problem' }, 422: { $ref: '#/components/responses/Problem' } },
        },
      },
      '/api/v1/documents:batch': { post: { summary: 'Créer ou mettre à jour jusqu\'à 100 documents, réponse ligne par ligne', parameters: [dryRun, idem], requestBody: body('BatchInput'), responses: { 200: ok(), ...errors } } },
      '/api/v1/documents:publish': { post: { summary: 'Publier des brouillons (portée publish)', requestBody: body('IdsInput'), responses: { 200: ok(), ...errors } } },
      '/api/v1/documents:unpublish': { post: { summary: 'Repasser en brouillon (portée publish)', requestBody: body('IdsInput'), responses: { 200: ok(), ...errors } } },
      '/api/v1/documents:trash': { post: { summary: 'Mettre à la corbeille en lot', requestBody: body('IdsInput'), responses: { 200: ok(), ...errors } } },
      '/api/v1/tags': { get: { summary: 'Mots-clés', responses: { 200: ok() } } },
      '/api/v1/plan-import': { post: { summary: 'Proposer un classement à partir de chemins de fichiers (ne crée rien)', requestBody: body('PlanImportInput'), responses: { 200: ok() } } },
      '/api/uploads': { post: { summary: 'Créer un téléversement multipart (parties de 50 Mo), renvoie les URL signées des parties', requestBody: body('UploadCreateInput'), responses: { 201: ok(), ...errors } } },
      '/api/uploads/{id}': {
        get: { summary: 'État et parties manquantes (reprise)', parameters: [idParam], responses: { 200: ok() } },
        delete: { summary: 'Annuler', parameters: [idParam], responses: { 200: ok() } },
      },
      '/api/uploads/{id}/parts/{n}': {
        put: {
          summary: 'Envoyer une partie (session, jeton, ou URL signée)',
          parameters: [idParam, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          responses: { 200: ok() },
        },
      },
      '/api/uploads/{id}/complete': { post: { summary: 'Finaliser, vérifier le type et la conformité vidéo', parameters: [idParam], requestBody: body('FileMetaInput'), responses: { 200: ok(), 409: { $ref: '#/components/responses/Problem' }, 422: { $ref: '#/components/responses/Problem' } } } },
    },
  }
}
