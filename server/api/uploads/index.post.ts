// T-04 : création d'un téléversement multipart (parties de 50 Mo)
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const body = await readValid(event, UploadCreateInput)
  setResponseStatus(event, 201)
  return createUpload(event, actor, body)
})
