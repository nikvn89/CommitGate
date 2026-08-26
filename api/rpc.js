const TARGET = 'https://studio.genlayer.com/api'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const upstream = await fetch(TARGET, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (error) {
    console.error('[commitgate-rpc]', error)
    res.status(502).json({ error: 'StudioNet RPC proxy failed' })
  }
}
