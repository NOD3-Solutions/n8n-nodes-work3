import type { IAuthenticateGeneric, Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow'

// An API key from WORK³ (Settings → Integrations → REST API). Triggers need a
// key whose role may manage integrations, and no project limit.
export class Work3Api implements ICredentialType {
  name = 'work3Api'
  displayName = 'WORK³ API'
  icon: Icon = { light: 'file:../icons/work3.svg', dark: 'file:../icons/work3.dark.svg' }
  documentationUrl = 'https://work.nod3.se/docs/integrations/automation/'
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Starts with w3_. Create it under Settings → Integrations → REST API.',
    },
    {
      displayName: 'Address',
      name: 'baseUrl',
      type: 'string',
      default: 'https://work.nod3.se',
      description: 'Where your WORK³ runs, without a path',
    },
  ]

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
  }

  test: ICredentialTestRequest = {
    request: { baseURL: '={{$credentials.baseUrl.replace(/[/]$/, "")}}/api/v1', url: '/me' },
  }
}
