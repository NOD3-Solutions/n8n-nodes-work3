import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow'
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow'
import { loadOptions, work3All, work3Request } from './api'

const sorted = (list: INodeProperties[]) => list.sort((a, b) => a.displayName.localeCompare(b.displayName))

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } })

const projectPicker = (resource: string, operation: string[], description = 'The project, by name') => ({
  displayName: 'Project Name or ID',
  name: 'project',
  type: 'options' as const,
  typeOptions: { loadOptionsMethod: 'getProjects' },
  default: '',
  required: true,
  description: `${description}. Choose from the list, or specify a key using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.`,
  displayOptions: show(resource, operation),
})

const itemRef = (operation: string[], resource = 'item'): INodeProperties => ({
  displayName: 'Item Reference',
  name: 'ref',
  type: 'string',
  default: '',
  required: true,
  placeholder: 'WEB-12',
  description: 'The project key and number',
  displayOptions: show(resource, operation),
})

// Fields an item can be created or changed with.
const itemFields: INodeProperties[] = [
  { displayName: 'Assignee Name or ID', name: 'assigneeId', type: 'options', typeOptions: { loadOptionsMethod: 'getMembers' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
  { displayName: 'Description', name: 'description', type: 'string', typeOptions: { rows: 4 }, default: '' },
  { displayName: 'Due Date', name: 'dueDate', type: 'string', default: '', placeholder: 'YYYY-MM-DD' },
  { displayName: 'Parent Reference', name: 'parentRef', type: 'string', default: '', placeholder: 'WEB-3' },
  { displayName: 'Priority Name or ID', name: 'priorityId', type: 'options', typeOptions: { loadOptionsMethod: 'getPriorities' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
  { displayName: 'Status Name or ID', name: 'statusId', type: 'options', typeOptions: { loadOptionsMethod: 'getStatuses' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
  { displayName: 'Tag Names or IDs', name: 'labels', type: 'multiOptions', typeOptions: { loadOptionsMethod: 'getLabels' }, default: [], description: 'Replaces the tags; new names are created. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.' },
  { displayName: 'Type Name or ID', name: 'typeId', type: 'options', typeOptions: { loadOptionsMethod: 'getTypes' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
]

// Fields a project can be created or changed with.
const projectFields: INodeProperties[] = [
  { displayName: 'Client', name: 'client', type: 'string', default: '' },
  { displayName: 'Contact Email', name: 'contactEmail', type: 'string', placeholder: 'name@example.com', default: '' },
  { displayName: 'Contact Name', name: 'contactName', type: 'string', default: '' },
  { displayName: 'Description', name: 'description', type: 'string', typeOptions: { rows: 4 }, default: '' },
  { displayName: 'Due Date', name: 'dueDate', type: 'string', default: '', placeholder: 'YYYY-MM-DD' },
  { displayName: 'Lead Name or ID', name: 'leadId', type: 'options', typeOptions: { loadOptionsMethod: 'getMembers' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
  { displayName: 'Start Date', name: 'startDate', type: 'string', default: '', placeholder: 'YYYY-MM-DD' },
  { displayName: 'Tag Names or IDs', name: 'labels', type: 'multiOptions', typeOptions: { loadOptionsMethod: 'getLabels' }, default: [], description: 'Replaces the tags. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.' },
  { displayName: 'Value', name: 'valueAmount', type: 'number', default: 0 },
  { displayName: 'Value Currency', name: 'valueCurrency', type: 'string', default: 'SEK', placeholder: 'SEK' },
]

const properties: INodeProperties[] = [
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    noDataExpression: true,
    options: [
      { name: 'Chat Message', value: 'message' },
      { name: 'Comment', value: 'comment' },
      { name: 'File', value: 'file' },
      { name: 'Item', value: 'item' },
      { name: 'Project', value: 'project' },
    ],
    default: 'item',
  },

  // Item
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['item'] } },
    options: [
      { name: 'Archive', value: 'archive', action: 'Archive an item', description: 'Archive an item and its sub-items. They leave boards and lists and can be restored in WORK³.' },
      { name: 'Create', value: 'create', action: 'Create an item' },
      { name: 'Get', value: 'get', action: 'Get an item' },
      { name: 'Search', value: 'search', action: 'Find items' },
      { name: 'Update', value: 'update', action: 'Update an item' },
    ],
    default: 'create',
  },
  projectPicker('item', ['create'], 'The project the item goes in'),
  { displayName: 'Title', name: 'title', type: 'string', default: '', required: true, displayOptions: show('item', ['create']) },
  itemRef(['archive', 'get', 'update']),
  {
    displayName: 'Additional Fields',
    name: 'fields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: show('item', ['create']),
    options: itemFields,
  },
  {
    displayName: 'Update Fields',
    name: 'fields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: show('item', ['update']),
    options: sorted([
      ...itemFields,
      { displayName: 'Title', name: 'title', type: 'string', default: '' },
      { displayName: 'Archived', name: 'archived', type: 'boolean', default: false, description: 'Whether the item is archived. On archives it with its sub-items, off restores them.' },
      { displayName: 'Close Even if Waiting', name: 'force', type: 'boolean', default: false, description: 'Whether to close an item that still waits on others, where the workspace only warns' },
    ]),
  },
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    default: {},
    displayOptions: show('item', ['search']),
    options: [
      { displayName: 'Assignee Name or ID', name: 'assignee', type: 'options', typeOptions: { loadOptionsMethod: 'getMembers' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
      { displayName: 'Project Name or ID', name: 'project', type: 'options', typeOptions: { loadOptionsMethod: 'getProjects' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
      { displayName: 'Search Text', name: 'q', type: 'string', default: '', description: 'Every word must be in the title or description. A reference such as WEB-12 finds that item.' },
      { displayName: 'Status Name or ID', name: 'status', type: 'options', typeOptions: { loadOptionsMethod: 'getStatuses' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
      { displayName: 'Updated Since', name: 'updatedSince', type: 'dateTime', default: '' },
    ],
  },
  { displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, description: 'Whether to return all results or only up to a given limit', displayOptions: show('item', ['search']) },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    typeOptions: { minValue: 1 },
    default: 50,
    description: 'Max number of results to return',
    displayOptions: { show: { resource: ['item'], operation: ['search'], returnAll: [false] } },
  },

  // Project
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['project'] } },
    options: [
      { name: 'Archive', value: 'archive', action: 'Archive a project', description: 'Archive a project. It leaves lists and boards and can be restored in WORK³.' },
      { name: 'Create', value: 'create', action: 'Create a project' },
      { name: 'Get', value: 'get', action: 'Get a project' },
      { name: 'Get Many', value: 'getAll', action: 'Get many projects' },
      { name: 'Update', value: 'update', action: 'Update a project' },
    ],
    default: 'create',
  },
  { displayName: 'Name', name: 'name', type: 'string', default: '', required: true, displayOptions: show('project', ['create']) },
  projectPicker('project', ['archive', 'get', 'update']),
  {
    displayName: 'Additional Fields',
    name: 'fields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: show('project', ['create']),
    options: sorted([
      ...projectFields,
      { displayName: 'Key', name: 'key', type: 'string', default: '', placeholder: 'WEB', description: '2–10 letters or digits. Made from the name if left out.' },
      {
        displayName: 'Template',
        name: 'template',
        type: 'options',
        default: 'onboarding',
        options: [
          { name: 'Client Onboarding', value: 'onboarding' },
          { name: 'Integration Project', value: 'integration' },
        ],
      },
    ]),
  },
  {
    displayName: 'Update Fields',
    name: 'fields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: show('project', ['update']),
    options: sorted([
      ...projectFields,
      { displayName: 'Archived', name: 'archived', type: 'boolean', default: false },
      { displayName: 'Name', name: 'name', type: 'string', default: '' },
    ]),
  },
  {
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: show('project', ['getAll']),
    options: [{ displayName: 'Include Archived', name: 'archived', type: 'boolean', default: false, description: 'Whether to also return archived projects' }],
  },

  // Comment
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['comment'] } },
    options: [{ name: 'Create', value: 'create', action: 'Add a comment to an item' }],
    default: 'create',
  },
  itemRef(['create'], 'comment'),
  { displayName: 'Text', name: 'body', type: 'string', typeOptions: { rows: 4 }, default: '', required: true, displayOptions: show('comment', ['create']) },

  // Chat message
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['message'] } },
    options: [{ name: 'Send', value: 'send', action: 'Post in a project chat' }],
    default: 'send',
  },
  projectPicker('message', ['send'], 'The project whose chat gets the message'),
  { displayName: 'Text', name: 'body', type: 'string', typeOptions: { rows: 4 }, default: '', required: true, displayOptions: show('message', ['send']) },

  // File
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['file'] } },
    options: [{ name: 'Upload', value: 'upload', action: 'Upload a file' }],
    default: 'upload',
  },
  {
    displayName: 'Attach To',
    name: 'target',
    type: 'options',
    options: [
      { name: 'Item', value: 'item' },
      { name: 'Project', value: 'project' },
    ],
    default: 'item',
    displayOptions: show('file', ['upload']),
  },
  { ...itemRef(['upload'], 'file'), displayOptions: { show: { resource: ['file'], operation: ['upload'], target: ['item'] } } },
  { ...projectPicker('file', ['upload']), displayOptions: { show: { resource: ['file'], operation: ['upload'], target: ['project'] } } },
  {
    displayName: 'Input Binary Field',
    name: 'binaryPropertyName',
    type: 'string',
    default: 'data',
    required: true,
    hint: 'The name of the input binary field containing the file',
    displayOptions: show('file', ['upload']),
  },
]

// Drops fields left empty in the form; "none" choices become null.
function clean(fields: IDataObject, nullable: string[]) {
  const out: IDataObject = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === '' && nullable.includes(k)) out[k] = null
    else if (v !== '' && v !== undefined) out[k] = v
  }
  return out
}

export class Work3 implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WORK³',
    name: 'work3',
    icon: { light: 'file:../../icons/work3.svg', dark: 'file:../../icons/work3.dark.svg' },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Create and change items, projects, comments, chat messages and files in WORK³',
    defaults: { name: 'WORK³' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'work3Api', required: true }],
    properties,
  }

  methods = { loadOptions }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const out: INodeExecutionData[] = []
    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter('resource', i) as string
        const operation = this.getNodeParameter('operation', i) as string
        const result = await run.call(this, resource, operation, i)
        for (const row of Array.isArray(result) ? result : [result]) out.push({ json: row, pairedItem: { item: i } })
      } catch (error) {
        if (!this.continueOnFail()) throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i })
        out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } })
      }
    }
    return [out]
  }
}

async function run(this: IExecuteFunctions, resource: string, operation: string, i: number): Promise<IDataObject | IDataObject[]> {
  const param = <T>(name: string, fallback?: T) => this.getNodeParameter(name, i, fallback) as T
  const ref = () => encodeURIComponent(param<string>('ref').trim().toUpperCase())
  const key = () => encodeURIComponent(param<string>('project').trim().toUpperCase())

  if (resource === 'item') {
    if (operation === 'create') {
      const fields = clean(param<IDataObject>('fields', {}), [])
      return work3Request.call(this, 'POST', 'items', { project: param<string>('project'), title: param<string>('title'), ...fields })
    }
    if (operation === 'get') return work3Request.call(this, 'GET', `items/${ref()}`)
    // Automations archive items, never delete them: archived items keep their history and can be restored.
    if (operation === 'archive') return work3Request.call(this, 'PATCH', `items/${ref()}`, { archived: true })
    if (operation === 'update') {
      const fields = clean(param<IDataObject>('fields', {}), ['assigneeId', 'priorityId', 'dueDate', 'parentRef'])
      return work3Request.call(this, 'PATCH', `items/${ref()}`, fields)
    }
    if (operation === 'search') {
      const filters = clean(param<IDataObject>('filters', {}), [])
      const returnAll = param<boolean>('returnAll', false)
      return work3All.call(this, 'items', filters, returnAll ? 0 : param<number>('limit', 50))
    }
  }

  if (resource === 'project') {
    if (operation === 'create') {
      const fields = clean(param<IDataObject>('fields', {}), [])
      return work3Request.call(this, 'POST', 'projects', { name: param<string>('name'), ...fields })
    }
    if (operation === 'get') return work3Request.call(this, 'GET', `projects/${key()}`)
    if (operation === 'archive') return work3Request.call(this, 'PATCH', `projects/${key()}`, { archived: true })
    if (operation === 'update') {
      const fields = clean(param<IDataObject>('fields', {}), ['leadId', 'client', 'contactName', 'contactEmail', 'startDate', 'dueDate'])
      return work3Request.call(this, 'PATCH', `projects/${key()}`, fields)
    }
    if (operation === 'getAll') {
      const { data } = await work3Request.call(this, 'GET', 'projects')
      return param<IDataObject>('options', {}).archived ? data : (data as IDataObject[]).filter((p) => !p.archived)
    }
  }

  if (resource === 'comment' && operation === 'create')
    return work3Request.call(this, 'POST', `items/${ref()}/comments`, { body: param<string>('body') })

  if (resource === 'message' && operation === 'send')
    return work3Request.call(this, 'POST', `projects/${key()}/messages`, { body: param<string>('body') })

  if (resource === 'file' && operation === 'upload') {
    const field = param<string>('binaryPropertyName')
    const binary = this.helpers.assertBinaryData(i, field)
    const data = await this.helpers.getBinaryDataBuffer(i, field)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(data)], { type: binary.mimeType }), binary.fileName ?? 'file')
    const path = param<string>('target') === 'item' ? `items/${ref()}/files` : `projects/${key()}/files`
    return work3Request.call(this, 'POST', path, form)
  }

  throw new NodeOperationError(this.getNode(), `Unknown operation ${resource}.${operation}`, { itemIndex: i })
}
