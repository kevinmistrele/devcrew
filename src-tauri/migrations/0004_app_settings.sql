-- Configurações globais do app — hoje só os tetos padrão de rodadas/custo aplicados a
-- toda tarefa nova (o usuário pode mudar em Configurações). Linha única, id fixo.
CREATE TABLE app_settings (
  id                    TEXT PRIMARY KEY,
  default_max_rounds    INTEGER NOT NULL DEFAULT 5,
  default_cost_cap_usd  REAL NOT NULL DEFAULT 2.0
);

INSERT INTO app_settings (id, default_max_rounds, default_cost_cap_usd) VALUES ('default', 5, 2.0);
