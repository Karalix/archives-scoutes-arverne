export default defineEventHandler(event => buildOpenApi(getRequestURL(event).origin))
