import { execFile } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetForgejoRepoRefCache } from '../forgejo/repository-ref'
import { _resetGiteaRepoRefCache } from '../gitea/repository-ref'
import { getHostedReviewForBranch } from './hosted-review'

const execFileAsync = promisify(execFile)
const OLD_ENV = process.env

type SeenRequest = {
  pathname: string
  search: string
  authorization: string | undefined
}

function sendJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

describe('Forgejo hosted review integration', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, ORCA_FORGEJO_TOKEN: 'local-forgejo-token' }
    delete process.env.ORCA_FORGEJO_API_BASE_URL
    delete process.env.ORCA_GITEA_TOKEN
    delete process.env.ORCA_GITEA_API_BASE_URL
    _resetForgejoRepoRefCache()
    _resetGiteaRepoRefCache()
  })

  afterEach(() => {
    process.env = OLD_ENV
    _resetForgejoRepoRefCache()
    _resetGiteaRepoRefCache()
  })

  it('resolves a Forgejo PR through real git remote parsing and HTTP API calls', async () => {
    const seen: SeenRequest[] = []
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      seen.push({
        pathname: url.pathname,
        search: url.search,
        authorization: req.headers.authorization
      })

      if (url.pathname === '/api/v1/repos/team/repo/pulls') {
        sendJson(res, [
          {
            number: 19,
            title: 'Local Forgejo branch',
            state: 'open',
            html_url: 'http://forgejo.localhost/team/repo/pulls/19',
            updated_at: '2026-05-15T00:00:00Z',
            mergeable: true,
            head: { ref: 'feature/forgejo', label: 'team:feature/forgejo', sha: 'def456' }
          }
        ])
        return
      }

      if (url.pathname === '/api/v1/repos/team/repo/commits/def456/status') {
        sendJson(res, { state: 'pending' })
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'not found' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    const repoPath = await mkdtemp(join(tmpdir(), 'orca-forgejo-review-'))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('expected TCP server address')
      }
      process.env.ORCA_FORGEJO_API_BASE_URL = `http://127.0.0.1:${address.port}`

      await execFileAsync('git', ['init'], { cwd: repoPath })
      await execFileAsync(
        'git',
        ['remote', 'add', 'origin', 'https://git.example.com/team/repo.git'],
        {
          cwd: repoPath
        }
      )

      await expect(
        getHostedReviewForBranch({ repoPath, branch: 'refs/heads/feature/forgejo' })
      ).resolves.toEqual({
        provider: 'forgejo',
        number: 19,
        title: 'Local Forgejo branch',
        state: 'open',
        url: 'http://forgejo.localhost/team/repo/pulls/19',
        status: 'pending',
        updatedAt: '2026-05-15T00:00:00Z',
        mergeable: 'MERGEABLE',
        headSha: 'def456'
      })

      expect(seen.map((request) => request.pathname)).toEqual([
        '/api/v1/repos/team/repo/pulls',
        '/api/v1/repos/team/repo/commits/def456/status'
      ])
      expect(seen.every((request) => request.authorization === 'token local-forgejo-token')).toBe(
        true
      )
      expect(new URLSearchParams(seen[0].search).get('state')).toBe('all')
    } finally {
      await rm(repoPath, { recursive: true, force: true })
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
