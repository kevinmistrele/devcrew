mod git;
mod github;
mod secrets;

use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "initial_schema",
      sql: include_str!("../migrations/0001_initial_schema.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "seed_demo_data",
      sql: include_str!("../migrations/0002_seed_demo_data.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "proposed_changes_content",
      sql: include_str!("../migrations/0003_proposed_changes_content.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "app_settings",
      sql: include_str!("../migrations/0004_app_settings.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "seed_showcase_data",
      sql: include_str!("../migrations/0005_seed_showcase_data.sql"),
      kind: MigrationKind::Up,
    },
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:devcrew.db", migrations())
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      git::git_clone_repo,
      git::git_connect_existing,
      git::git_list_dir,
      git::git_list_files_recursive,
      git::git_read_file,
      git::git_current_branch,
      git::git_create_task_branch,
      git::git_write_file,
      git::git_commit_files,
      git::git_push_branch,
      github::github_validate_token,
      github::github_create_pull_request,
      github::github_create_pull_request_review,
      secrets::secret_set,
      secrets::secret_get,
      secrets::secret_delete,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
