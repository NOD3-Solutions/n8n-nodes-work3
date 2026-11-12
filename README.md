# @nod3solutions/n8n-nodes-work3

[WORK³](https://work.nod3.se) nodes for [n8n](https://n8n.io).

- **WORK³**: create, update and archive items, create, update and archive projects, add comments, post in a project chat, upload files, get and search items and projects. Projects, statuses, types, priorities, people and tags are picked from lists.
- **WORK³ Trigger**: starts a workflow when an item is created, changed, done or due tomorrow, when someone comments, or when a project is created, changed or archived. Item triggers can be limited to projects, people and statuses.

## Install

In n8n: **Settings → Community nodes → Install**, and enter `@nod3solutions/n8n-nodes-work3`.

## Credentials

Create an API key in WORK³ under **Settings → Integrations → REST API** and add a **WORK³ API** credential with it. The address is `https://work.nod3.se` unless you run WORK³ elsewhere.

Triggers need a key whose role may connect integrations and that is not limited to some projects. Actions work with any key that may write.

## Usage

### Create an item (action)

Add a **WORK³** node and choose **Resource: Item**, **Operation: Create**.

| Field | Example |
| --- | --- |
| Project Name or ID | Website (`WEB`), picked from the list |
| Title | `Update the pricing page` |
| Additional Fields → Assignee Name or ID | Anna Svensson, picked from the list |
| Additional Fields → Due Date | `2026-11-30` |
| Additional Fields → Tag Names or IDs | Design |

The node returns the new item:

```json
{
  "id": "6f1c2a7e-0b1d-4c55-9a3e-2f0d5c8b9a11",
  "ref": "WEB-12",
  "project": "WEB",
  "projectName": "Website",
  "title": "Update the pricing page",
  "description": "",
  "type": "Task",
  "status": "To do",
  "statusCategory": "todo",
  "priority": null,
  "assignee": "Anna Svensson",
  "dueDate": "2026-11-30",
  "labels": ["Design"],
  "archived": false,
  "url": "https://work.nod3.se/w/acme/items/WEB-12",
  "createdAt": "2026-11-12T09:30:00.000Z",
  "updatedAt": "2026-11-12T09:30:00.000Z"
}
```

The output also has the IDs next to each name (`typeId`, `statusId`, `priorityId`, `assigneeId`). Use `ref` (here `WEB-12`) in later nodes to get, update, comment on or archive the item.

### Run a workflow when an item is done (trigger)

Add a **WORK³ Trigger** node, choose **Trigger On: Item Done**, and under **Filters → Project Names or IDs** pick **Website**. Activate the workflow. From then on it runs each time an item in that project moves to a done status, and the output is the event:

```json
{
  "id": "evt_01JCQ4…",
  "type": "item.updated",
  "createdAt": "2026-11-12T14:05:00.000Z",
  "actorName": "Anna Svensson",
  "data": {
    "item": { "ref": "WEB-12", "title": "Update the pricing page", "status": "Done", "statusCategory": "done", "url": "https://work.nod3.se/w/acme/items/WEB-12" },
    "changes": { "statusId": { "from": "…", "to": "…", "fromName": "In progress", "toName": "Done" } }
  }
}
```

`data.item` has the same fields as in the action above. A typical next step is a Slack or email node that posts `{{ $json.data.item.ref }} {{ $json.data.item.title }} is done: {{ $json.data.item.url }}`.

## Security

- The trigger registers its own webhook in WORK³ when the workflow is activated and removes it when it is deactivated. The webhook belongs to the API key: revoking the key stops and removes it.
- Every delivery is signed with HMAC-SHA256. The trigger checks the signature in constant time and refuses deliveries older than 5 minutes before the workflow runs.
- Releases are built and published from this repository by GitHub Actions with npm provenance.

Report security issues to privacy@nod3.se, not in public issues.

## Docs

https://work.nod3.se/docs/integrations/automation/

## Develop

```
npm install
npm run lint
npm run build
npm run dev
```

`npm run dev` starts a local n8n with the node loaded.

## License

MIT
