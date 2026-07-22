// teams.ts: acesso tipado às tabelas teams e team_members.
import { getDb } from './client'
import type { Team } from './types'

interface TeamRow {
  id: string
  name: string
  created_at: string
}

interface TeamMemberRow {
  id: string
  team_id: string
  employee_id: string
}

function toTeam(row: TeamRow, members: TeamMemberRow[]): Team {
  return {
    id: row.id,
    name: row.name,
    memberIds: members.filter((member) => member.team_id === row.id).map((member) => member.employee_id),
  }
}

export async function listTeams(): Promise<Team[]> {
  const db = await getDb()
  const [teamRows, memberRows] = await Promise.all([
    db.select<TeamRow[]>('SELECT * FROM teams ORDER BY name'),
    db.select<TeamMemberRow[]>('SELECT * FROM team_members'),
  ])
  return teamRows.map((row) => toTeam(row, memberRows))
}

export async function getTeam(id: string): Promise<Team | undefined> {
  const db = await getDb()
  const [teamRows, memberRows] = await Promise.all([
    db.select<TeamRow[]>('SELECT * FROM teams WHERE id = $1', [id]),
    db.select<TeamMemberRow[]>('SELECT * FROM team_members WHERE team_id = $1', [id]),
  ])
  const row = teamRows[0]
  return row ? toTeam(row, memberRows) : undefined
}
