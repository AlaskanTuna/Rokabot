export interface FetchCall {
  url: string
  init: RequestInit
}

export function fakeFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** A fetch that settles only when its signal aborts, rejecting with the abort reason. */
export function hangingFetch() {
  return fakeFetch(
    ({ init }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
  )
}
