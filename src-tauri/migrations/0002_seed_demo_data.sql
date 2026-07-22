-- Seed opcional com dados fictícios para desenvolvimento/demo.
-- Remova esta migração (e a entrada correspondente em lib.rs) se não quiser dados de exemplo.

INSERT INTO repos (id, name, local_path, remote_url, default_branch, connected_at) VALUES
  ('repo-portfolio', 'portfolio', 'C:\Users\demo\repos\portfolio', 'https://github.com/demo/portfolio', 'main', '2026-01-01T00:00:00Z');

INSERT INTO employees (id, name, role, avatar, system_prompt, preferred_provider, fallback_provider, permission, created_at, updated_at) VALUES
  ('emp-dev-ana', 'Ana', 'dev', '🛠️', 'Você é a Dev do time. Implementa as tarefas descritas com código limpo e testado.', 'anthropic', 'openai', 'write', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('emp-qa-bruno', 'Bruno', 'qa', '🧪', 'Você é o QA do time. Revisa PRs e pede mudanças até o código convergir.', 'anthropic', 'openai', 'read', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT INTO teams (id, name, created_at) VALUES
  ('team-core', 'Core Team', '2026-01-01T00:00:00Z');

INSERT INTO team_members (id, team_id, employee_id) VALUES
  ('tm-ana', 'team-core', 'emp-dev-ana'),
  ('tm-bruno', 'team-core', 'emp-qa-bruno');

INSERT INTO projects (id, name, repo_id, team_id, origin, created_at) VALUES
  ('proj-portfolio', 'Portfolio', 'repo-portfolio', 'team-core', 'existing', '2026-01-01T00:00:00Z');
