import { type NextRequest, NextResponse } from "next/server"
import { nftHolderLimiter, regularUserLimiter, extractWalletFromToken, isNFTHolder } from "@/lib/rate-limiter"

const API_TOKEN = process.env.OSINT_API_TOKEN
const SESSION_SECRET = process.env.OSINT_SESSION_SECRET

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    if (!API_TOKEN) {
      return NextResponse.json(
        {
          error: "OSINT API not configured",
          message:
            "The OSINT_API_TOKEN environment variable is not set. Please add it to your Vercel project settings.",
          details:
            "Go to Project Settings → Environment Variables and add OSINT_API_TOKEN with your API key from leakosintapi.com",
        },
        { status: 503 },
      )
    }

    let sessionSecret = SESSION_SECRET
    if (!sessionSecret) {
      const encoder = new TextEncoder()
      const data = encoder.encode(
        `osint-hub-${process.env.VERCEL_URL || "localhost"}-${process.env.VERCEL_GIT_COMMIT_SHA || "dev"}`,
      )
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      sessionSecret = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    }

    const authHeader = request.headers.get("authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const token = authHeader.substring(7)

    if (!token || !token.startsWith(sessionSecret)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    let rateLimitResult

    if (isNFTHolder(token)) {
      const walletAddress = extractWalletFromToken(token)
      if (!walletAddress) {
        return NextResponse.json({ error: "Invalid NFT token format" }, { status: 401 })
      }
      rateLimitResult = nftHolderLimiter.checkLimit(walletAddress)
    } else {
      rateLimitResult = regularUserLimiter.checkLimit(token)
    }

    if (!rateLimitResult.allowed) {
      const resetDate = new Date(rateLimitResult.resetTime)
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Limit resets at ${resetDate.toISOString()}`,
          resetTime: rateLimitResult.resetTime,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": isNFTHolder(token) ? "200" : "50",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          },
        },
      )
    }

    const body = await request.json()
    const { request: query, limit = 100, lang = "ru" } = body

    if (!query) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    const requestPayload = {
      token: API_TOKEN,
      request: query,
      limit,
      lang,
      type: "json",
    }

    const apiResponse = await fetch("https://leakosintapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    })

    if (!apiResponse.ok) {
      throw new Error(`OSINT API returned status ${apiResponse.status}`)
    }

    const data = await apiResponse.json()

    if (data["Error code"]) {
      if (data["Error code"] === "bad token") {
        return NextResponse.json(
          {
            error: "Invalid API Token",
            message:
              "The OSINT API token is invalid or expired. Please check your OSINT_API_TOKEN environment variable.",
          },
          { status: 401 },
        )
      }

      return NextResponse.json({ error: `OSINT API Error: ${data["Error code"]}` }, { status: 400 })
    }

    const response = NextResponse.json(data)
    response.headers.set("X-RateLimit-Limit", isNFTHolder(token) ? "200" : "50")
    response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rateLimitResult.resetTime.toString())

    return response
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Search request failed",
        message: "Unable to process search request. Please try again later.",
      },
      { status: 500 },
    )
  }
}
