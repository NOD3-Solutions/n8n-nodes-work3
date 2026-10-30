// Calls to the WORK³ REST API (https://work.nod3.se/docs/integrations/rest-api/) with the node's credentials.
import type {
  IDataObject,
  JsonObject,
  IExecuteFunctions,
  IHookFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  IWebhookFunctions,
} from 'n8n-workflow'
import { NodeApiError } from 'n8n-workflow'

type Context = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions

export async function work3Request(
  this: Context,
  method: IHttpRequestMethods,
  path: string,
  body?: IDataObject | FormData,
  qs?: IDataObject,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each endpoint answers its own shape
): Promise<any> {
  const credentials = await this.getCredentials('work3Api')
  const base = String(credentials.baseUrl || 'https://work.nod3.se').replace(/\/$/, '')
  const options: IHttpRequestOptions = {
    method,
    url: `${base}/api/v1/${path.replace(/^\//, '')}`,
    qs,
    json: !(body instanceof FormData),
  }
  if (body !== undefined) options.body = body
  try {
    return await this.helpers.httpRequestWithAuthentication.call(this, 'work3Api', options)
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject)
  }
}

// Every page of a list endpoint, up to limit items (0: all).
export async function work3All(this: IExecuteFunctions, path: string, qs: IDataObject, limit: number) {
  const out: IDataObject[] = []
  let cursor: string | null = null
  do {
    const page: { data: IDataObject[]; nextCursor: string | null } = await work3Request.call(this, 'GET', path, undefined, { ...qs, limit: 100, ...(cursor ? { cursor } : {}) })
    out.push(...(page.data as IDataObject[]))
    cursor = page.nextCursor ?? null
  } while (cursor && (limit === 0 || out.length < limit))
  return limit === 0 ? out : out.slice(0, limit)
}

// Choices for dropdowns, so people pick names instead of pasting ids.
export const loadOptions = {
  async getProjects(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { data } = await work3Request.call(this, 'GET', 'projects')
    return (data as { key: string; name: string; archived: boolean }[])
      .filter((p) => !p.archived)
      .map((p) => ({ name: `${p.name} (${p.key})`, value: p.key }))
  },
  async getStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { statuses } = await work3Request.call(this, 'GET', 'workflow')
    return (statuses as { id: string; name: string }[]).map((s) => ({ name: s.name, value: s.id }))
  },
  async getTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { types } = await work3Request.call(this, 'GET', 'workflow')
    return (types as { id: string; name: string }[]).map((s) => ({ name: s.name, value: s.id }))
  },
  async getPriorities(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { priorities } = await work3Request.call(this, 'GET', 'workflow')
    return [{ name: 'None', value: '' }, ...(priorities as { id: string; name: string }[]).map((s) => ({ name: s.name, value: s.id }))]
  },
  async getLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { labels } = await work3Request.call(this, 'GET', 'workflow')
    return (labels as { name: string }[]).map((l) => ({ name: l.name, value: l.name }))
  },
  async getMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    const { data } = await work3Request.call(this, 'GET', 'members')
    return [{ name: 'Nobody', value: '' }, ...(data as { id: string; name: string | null; email: string }[]).map((m) => ({ name: m.name ?? m.email, value: m.id }))]
  },
}
