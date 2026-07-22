import { useEffect, useState } from 'react'
import { ChevronRight, File, Folder, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listRepoDir, type GitTreeEntry } from '@/core/git-service'

interface FileTreeProps {
  repoPath: string
}

export function FileTree({ repoPath }: FileTreeProps) {
  const [entries, setEntries] = useState<GitTreeEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    listRepoDir(repoPath)
      .then((result) => {
        if (!cancelled) setEntries(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [repoPath])

  if (error) return <p className="p-3 text-xs text-destructive">{error}</p>
  if (!entries) {
    return (
      <p className="flex items-center gap-1.5 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Carregando árvore…
      </p>
    )
  }
  if (entries.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">Repositório vazio.</p>
  }

  return (
    <div className="py-1 text-sm">
      {entries.map((entry) => (
        <FileTreeNode key={entry.path} repoPath={repoPath} entry={entry} depth={0} />
      ))}
    </div>
  )
}

function FileTreeNode({
  repoPath,
  entry,
  depth,
}: {
  repoPath: string
  entry: GitTreeEntry
  depth: number
}) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<GitTreeEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!entry.isDir) return
    if (!open && children === null) {
      setLoading(true)
      try {
        setChildren(await listRepoDir(repoPath, entry.path))
      } finally {
        setLoading(false)
      }
    }
    setOpen((prev) => !prev)
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-muted"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {entry.isDir ? (
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        {entry.isDir ? (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{entry.name}</span>
        {loading && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
      </button>

      {open && children?.map((child) => (
        <FileTreeNode key={child.path} repoPath={repoPath} entry={child} depth={depth + 1} />
      ))}
      {open && children?.length === 0 && (
        <p
          className="text-xs text-muted-foreground"
          style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
        >
          vazio
        </p>
      )}
    </div>
  )
}
