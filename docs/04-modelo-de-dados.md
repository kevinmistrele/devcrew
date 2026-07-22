# 04 — Modelo de Dados

## Schema SQLite

```sql
-- Funcionários (agentes)
CREATE TABLE employees (
  id            TEXT PRIMARY KEY,          -- uuid
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,             -- orchestrator | dev | qa | documenter | architect
  avatar        TEXT,                      -- emoji ou caminho
  system_prompt TEXT NOT NULL,
  preferred_provider TEXT NOT NULL,        -- anthropic | openai
  fallback_provider  TEXT,                 -- anthropic | openai | null
  permission    TEXT NOT NULL DEFAULT 'read', -- read | write | commit
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Escopo: quais repos/pastas cada funcionário pode tocar
CREATE TABLE employee_scopes (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path_glob   TEXT DEFAULT '**'            -- ex: 'src/**'
);

-- Repositórios conectados
CREATE TABLE repos (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  local_path   TEXT NOT NULL,              -- caminho no disco
  remote_url   TEXT,
  default_branch TEXT DEFAULT 'main',
  connected_at TEXT NOT NULL
);

-- Projetos: repo + equipe designada
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  repo_id    TEXT NOT NULL REFERENCES repos(id),
  team_id    TEXT REFERENCES teams(id),
  origin     TEXT NOT NULL DEFAULT 'existing', -- new | existing
  created_at TEXT NOT NULL
);

-- Equipes: agrupam funcionários
CREATE TABLE teams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Vínculo funcionário ↔ equipe (um funcionário pode estar em várias equipes)
CREATE TABLE team_members (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE
);

-- Tarefas
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  employee_id   TEXT NOT NULL REFERENCES employees(id), -- responsável atual
  created_by    TEXT REFERENCES employees(id),          -- orquestrador que criou (se houver)
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
    -- pending | running | pr_open | changes_requested | qa_approved | awaiting_merge | done | paused | rejected
  branch        TEXT,                       -- branch isolada da tarefa
  pr_number     INTEGER,                    -- número do PR no GitHub
  pr_url        TEXT,
  round         INTEGER NOT NULL DEFAULT 0, -- rodadas Dev↔QA já ocorridas
  max_rounds    INTEGER DEFAULT 5,          -- teto de rodadas
  cost_cap_usd  REAL DEFAULT 2.0,           -- teto de custo
  cost_used_usd REAL DEFAULT 0,             -- custo acumulado
  paused_reason TEXT,                       -- por que pausou (rodadas | custo | erro)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Eventos do GitHub detectados por polling (para acionar o próximo agente)
CREATE TABLE task_events (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL, -- pr_opened | changes_requested | review_approved | pushed
  payload    TEXT,          -- JSON bruto relevante do evento
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Mensagens (histórico da conversa da tarefa)
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,                -- system | user | assistant
  content    TEXT NOT NULL,
  provider   TEXT,                         -- provedor que gerou (se assistant)
  tokens_in  INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Diffs propostos (mudanças aguardando aprovação)
CREATE TABLE proposed_changes (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  diff         TEXT NOT NULL,                -- diff unificado (exibição/histórico)
  old_content  TEXT,                         -- conteúdo original (NULL = arquivo novo)
  new_content  TEXT NOT NULL DEFAULT '',      -- conteúdo completo a escrever se aprovado
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at   TEXT NOT NULL
);

-- Uso por provedor (para o dashboard de custo)
CREATE TABLE usage (
  id         TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  task_id    TEXT REFERENCES tasks(id),
  tokens_in  INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd   REAL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

> As **API keys não ficam aqui** — vão no keychain do SO.

## Interfaces TypeScript

```ts
export type Role = 'orchestrator' | 'dev' | 'qa' | 'documenter' | 'architect';
export type Permission = 'read' | 'write' | 'commit';
export type ProviderId = 'anthropic' | 'openai';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
  systemPrompt: string;
  preferredProvider: ProviderId;
  fallbackProvider?: ProviderId;
  permission: Permission;
  scopes: EmployeeScope[];
}

export interface EmployeeScope {
  repoId: string;
  pathGlob: string; // ex: 'src/**'
}

export interface Repo {
  id: string;
  name: string;
  localPath: string;
  remoteUrl?: string;
  defaultBranch: string;
}

export interface Team {
  id: string;
  name: string;
  memberIds: string[]; // employees
}

export interface Project {
  id: string;
  name: string;
  repoId: string;
  teamId?: string;
  origin: 'new' | 'existing';
}

export type TaskStatus =
  | 'pending' | 'running' | 'pr_open' | 'changes_requested'
  | 'qa_approved' | 'awaiting_merge' | 'done' | 'paused' | 'rejected';

export interface Task {
  id: string;
  projectId: string;
  employeeId: string;      // responsável atual
  createdBy?: string;      // orquestrador que criou
  title: string;
  description?: string;
  status: TaskStatus;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  round: number;           // rodadas Dev↔QA já ocorridas
  maxRounds: number;       // teto de rodadas
  costCapUsd: number;      // teto de custo
  costUsedUsd: number;     // custo acumulado
  pausedReason?: 'rounds' | 'cost' | 'error';
  messages: Message[];
  changes: ProposedChange[];
}

export type TaskEventType =
  | 'pr_opened' | 'changes_requested' | 'review_approved' | 'pushed';

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  payload?: unknown;
  handled: boolean;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  provider?: ProviderId;
  tokensIn?: number;
  tokensOut?: number;
}

export interface ProposedChange {
  id: string;
  filePath: string;
  diff: string;             // diff unificado, para exibição/histórico
  oldContent: string | null; // null = arquivo novo
  newContent: string;        // conteúdo completo a escrever no disco se aprovado
  status: 'pending' | 'approved' | 'rejected';
}

// Contrato comum a todos os provedores de IA
export interface AIProvider {
  id: ProviderId;
  send(messages: Message[], systemPrompt: string): Promise<AIResponse>;
  isQuotaError(err: unknown): boolean;
}

export interface AIResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}
```

O contrato `AIProvider` é o que permite trocar de IA sem mexer no resto: `anthropic` e `openai` implementam a mesma interface, e o `ai-router` só chama `send()`.
