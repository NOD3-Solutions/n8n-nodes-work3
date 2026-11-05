import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow'
import { NodeConnectionTypes } from 'n8n-workflow'
import { loadOptions, work3Request } from './api'

// Each trigger listens to one WORK³ webhook event; some narrow it further.
const triggers: Record<string, { name: string; event: string; description: string }> = {
  itemCreated: { name: 'Item Created', event: 'item.created', description: 'A new item' },
  itemUpdated: { name: 'Item Changed', event: 'item.updated', description: 'Any change to an item, optionally only some fields, a project or an assignee' },
  itemDone: { name: 'Item Done', event: 'item.updated', description: 'An item moved to a done status' },
  itemDueSoon: { name: 'Item Due Tomorrow', event: 'item.due_soon', description: 'Once, the day before an open item is due' },
  commentCreated: { name: 'Comment Added', event: 'comment.created', description: 'A new comment on an item' },
  projectCreated: { name: 'Project Created', event: 'project.created', description: 'A new project' },
  projectUpdated: { name: 'Project Changed', event: 'project.updated', description: 'Any change to a project' },
  projectArchived: { name: 'Project Archived', event: 'project.updated', description: 'A project was archived' },
}

// Signed deliveries older than this are refused, so a captured one cannot be replayed later.
const MAX_AGE_SECONDS = 300

export function verify(secret: string, header: string, raw: string, now = Date.now()) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header)
  if (!m) return false
  const t = Number(m[1])
  if (Math.abs(now / 1000 - t) > MAX_AGE_SECONDS) return false
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'))
  const got = Buffer.from(m[2]!)
  return want.length === got.length && timingSafeEqual(want, got)
}

export class Work3Trigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WORK³ Trigger',
    name: 'work3Trigger',
    icon: { light: 'file:../../icons/work3.svg', dark: 'file:../../icons/work3.dark.svg' },
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["trigger"]}}',
    description: 'Starts the workflow when something happens in WORK³',
    defaults: { name: 'WORK³ Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'work3Api', required: true }],
    webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
    properties: [
      {
        displayName: 'Trigger On',
        name: 'trigger',
        type: 'options',
        noDataExpression: true,
        required: true,
        default: 'itemCreated',
        options: Object.entries(triggers).map(([value, t]) => ({ name: t.name, value, description: t.description })),
      },
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        displayOptions: { show: { trigger: ['itemCreated', 'itemUpdated', 'itemDone', 'itemDueSoon', 'commentCreated'] } },
        options: [
          {
            displayName: 'Project Names or IDs',
            name: 'projects',
            type: 'multiOptions',
            typeOptions: { loadOptionsMethod: 'getProjects' },
            default: [],
            description: 'Only items in these projects. Choose from the list, or specify keys using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
          {
            displayName: 'Assignee Names or IDs',
            name: 'assignees',
            type: 'multiOptions',
            typeOptions: { loadOptionsMethod: 'getMembers' },
            default: [],
            description: 'Only items assigned to these people. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
          {
            displayName: 'Changed Fields',
            name: 'fields',
            type: 'multiOptions',
            default: [],
            description: 'Item Changed only: start only when one of these changed',
            options: [
              { name: 'Archived or Restored', value: 'archived' },
              { name: 'Assignee', value: 'assigneeId' },
              { name: 'Description', value: 'description' },
              { name: 'Due Date', value: 'dueDate' },
              { name: 'Parent', value: 'parentId' },
              { name: 'Priority', value: 'priorityId' },
              { name: 'Status', value: 'statusId' },
              { name: 'Title', value: 'title' },
              { name: 'Type', value: 'typeId' },
            ],
          },
          {
            displayName: 'Status Names or IDs',
            name: 'statuses',
            type: 'multiOptions',
            typeOptions: { loadOptionsMethod: 'getStatuses' },
            default: [],
            description: 'Only items now in these statuses. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
        ],
      },
    ],
  }

  methods = { loadOptions }

  // n8n calls these when the workflow is turned on or off. The webhook
  // belongs to the API key, so revoking the key stops it as well.
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (!data.webhookId) return false
        const { data: hooks } = await work3Request.call(this, 'GET', 'webhooks')
        const url = this.getNodeWebhookUrl('default')
        const event = triggers[this.getNodeParameter('trigger') as string]!.event
        const found = (hooks as { id: string; url: string; events: string[] }[]).find((h) => h.id === data.webhookId)
        if (found && found.url === url && found.events.includes(event)) return true
        delete data.webhookId
        delete data.secret
        return false
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const url = this.getNodeWebhookUrl('default')
        const trigger = this.getNodeParameter('trigger') as string
        const created = await work3Request.call(this, 'POST', 'webhooks', {
          url,
          events: [triggers[trigger]!.event],
          description: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 200),
        })
        const data = this.getWorkflowStaticData('node')
        data.webhookId = created.id
        data.secret = created.secret
        return true
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (data.webhookId) {
          try {
            await work3Request.call(this, 'DELETE', `webhooks/${data.webhookId}`)
          } catch (error) {
            // Already gone, for example because the key was revoked: nothing left to remove.
            this.logger.debug('WORK³ webhook was already removed', { error: (error as Error).message })
          }
        }
        delete data.webhookId
        delete data.secret
        return true
      },
    },
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject()
    const secret = this.getWorkflowStaticData('node').secret as string | undefined
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? ''
    const header = String(req.headers['work3-signature'] ?? '')
    if (!secret || !raw || !verify(secret, header, raw)) {
      this.getResponseObject().status(401).send('invalid signature')
      return { noWebhookResponse: true }
    }
    const body = JSON.parse(raw) as IDataObject & { type: string; data: IDataObject }
    if (body.type === 'webhook.test' || !matches(this, body)) return { webhookResponse: 'ignored' }
    return { workflowData: [this.helpers.returnJsonArray(body)] }
  }
}

// Whether a delivery is one this trigger asked for, after its filters.
function matches(fn: IWebhookFunctions, body: { type: string; data: IDataObject }) {
  const trigger = fn.getNodeParameter('trigger') as string
  if (triggers[trigger]?.event !== body.type) return false
  const filters = fn.getNodeParameter('filters', {}) as { projects?: string[]; assignees?: string[]; fields?: string[]; statuses?: string[] }
  const item = body.data.item as { project?: string; assigneeId?: string | null; statusId?: string; statusCategory?: string } | undefined
  const changes = (body.data.changes ?? {}) as IDataObject
  if (trigger === 'itemDone' && !(changes.statusId && item?.statusCategory === 'done')) return false
  if (trigger === 'projectArchived' && changes.archived !== true) return false
  if (item) {
    if (filters.projects?.length && !filters.projects.map((p) => p.toUpperCase()).includes(String(item.project))) return false
    if (filters.assignees?.length && !filters.assignees.includes(String(item.assigneeId))) return false
    if (filters.statuses?.length && !filters.statuses.includes(String(item.statusId))) return false
  }
  if (trigger === 'itemUpdated' && filters.fields?.length && !filters.fields.some((f) => f in changes)) return false
  return true
}
