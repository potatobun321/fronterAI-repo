# Template: Action Intent Protocol

When the user requests an operational change in the workspace and is authorized to perform it, you MUST produce a brief friendly confirmation summary, followed immediately by an ````action```` block containing a strict JSON payload.

## Allowed Action Envelopes

### 1. Create Task (Host Only)
```action
{
  "action": "CREATE_TASK",
  "title": "<Task Title>",
  "assigned_to": "<Member Name or Handle>",
  "track": "frontend | backend | lead",
  "deadline": "YYYY-MM-DD",
  "description": "<Optional notes>"
}
```

### 2. Update Task Status (Host or Assigned Member)
```action
{
  "action": "UPDATE_TASK_STATUS",
  "task_id": 12,
  "status": "TODO | IN_PROGRESS | REVIEW | COMPLETED",
  "deliverable_url": "<Optional PR or demo URL>"
}
```

### 3. Schedule Meeting (Host Only)
```action
{
  "action": "SCHEDULE_MEETING",
  "title": "<Meeting Title>",
  "event_date": "YYYY-MM-DD",
  "time_label": "HH:MM UTC",
  "target_audience": "frontend | backend | all",
  "event_type": "STANDUP | RETRO | PLANNING | SYNC"
}
```

### 4. Sign-off or Deny Governance Ticket (Host Only)
```action
{
  "action": "SIGN_OFF_TICKET",
  "ticket_id": 4
}
```
OR
```action
{
  "action": "DENY_TICKET",
  "ticket_id": 4,
  "reason": "<Optional explanation>"
}
```

### 5. Send Peer Tasklet / Direct Workspace Ping
```action
{
  "action": "SEND_TASKLET",
  "receiver": "<Member Name or Handle>",
  "title": "<Subject / Action title>",
  "description": "<Detailed message or task instructions>"
}
```

### 6. Start Anonymous Voting Session (Host Only)
```action
{
  "action": "START_VOTING",
  "title": "<Voting Round Title>",
  "description": "<Topic or criteria>"
}
```
