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

-- Repositórios conectados
CREATE TABLE repos (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  local_path   TEXT NOT NULL,              -- caminho no disco
  remote_url   TEXT,
  default_branch TEXT DEFAULT 'main',
  connected_at TEXT NOT NULL
);

-- Escopo: quais repos/pastas cada funcionário pode tocar
CREATE TABLE employee_scopes (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path_glob   TEXT DEFAULT '**'            -- ex: 'src/**'
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

-- Projetos: repo + equipe designada
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  repo_id    TEXT NOT NULL REFERENCES repos(id),
  team_id    TEXT REFERENCES teams(id),
  origin     TEXT NOT NULL DEFAULT 'existing', -- new | existing
  created_at TEXT NOT NULL
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
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  diff       TEXT NOT NULL,                -- diff unificado
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at TEXT NOT NULL
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
