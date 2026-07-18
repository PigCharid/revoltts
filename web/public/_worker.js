const TTS_UPSTREAM_URL = "http://workspace.featurize.cn:18438/ttsform"

async function proxyTts(request) {
  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("origin")
  headers.delete("referer")

  try {
    const upstream = await fetch(TTS_UPSTREAM_URL, {
      method: "POST",
      headers,
      body: request.body,
      redirect: "follow",
    })
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set("Cache-Control", "no-store")

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : "TTS upstream is unavailable",
      },
      { status: 502 }
    )
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === "/api/ttsform") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        })
      }
      return proxyTts(request)
    }

    return env.ASSETS.fetch(request)
  },
}
