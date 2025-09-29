import { type NextRequest, NextResponse } from "next/server"
import { nftHolderLimiter, regularUserLimiter, extractWalletFromToken, isNFTHolder } from "@/lib/rate-limiter"

const API_TOKEN = process.env.OSINT_API_TOKEN
const SESSION_SECRET = process.env.OSINT_SESSION_SECRET

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  console.log("[v0] Search API called")

  try {
    console.log("[v0] API_TOKEN exists:", !!API_TOKEN)
    console.log("[v0] SESSION_SECRET exists:", !!SESSION_SECRET)

    if (!API_TOKEN) {
      console.log("[v0] OSINT_API_TOKEN not configured")
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
      console.log("[v0] Generating fallback session secret")
      // Generate a deterministic but secure fallback secret
      const encoder = new TextEncoder()
      const data = encoder.encode(`osint-hub-${process.env.VERCEL_URL || "localhost"}-fallback`)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      sessionSecret = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      console.log("[v0] Generated fallback session secret")
    }

    const authHeader = request.headers.get("authorization")
    console.log("[v0] Auth header exists:", !!authHeader)

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[v0] Missing or invalid authorization header")
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    console.log("[v0] Token length:", token.length)

    if (!token || !token.startsWith(sessionSecret)) {
      console.log("[v0] Invalid token format or session secret mismatch")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    let rateLimitResult

    if (isNFTHolder(token)) {
      const walletAddress = extractWalletFromToken(token)
      console.log("[v0] NFT holder detected, wallet:", walletAddress?.substring(0, 6) + "...")
      if (!walletAddress) {
        return NextResponse.json({ error: "Invalid NFT token format" }, { status: 401 })
      }
      rateLimitResult = nftHolderLimiter.checkLimit(walletAddress)
    } else {
      console.log("[v0] Regular user detected")
      rateLimitResult = regularUserLimiter.checkLimit(token)
    }

    console.log("[v0] Rate limit check:", rateLimitResult)

    if (!rateLimitResult.allowed) {
      const resetDate = new Date(rateLimitResult.resetTime)
      console.log("[v0] Rate limit exceeded, reset time:", resetDate.toISOString())
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
    console.log("[v0] Search query:", query, "limit:", limit, "lang:", lang)

    if (!query) {
      console.log("[v0] Missing search query")
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    const requestPayload = {
      token: API_TOKEN,
      request: query,
      limit,
      lang,
      type: "json",
    }

    console.log("[v0] Making request to OSINT API...")
    const apiResponse = await fetch("https://leakosintapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    })

    console.log("[v0] OSINT API response status:", apiResponse.status)

    if (!apiResponse.ok) {
      const errorMessage = `OSINT API returned status ${apiResponse.status}`
      console.log("[v0] OSINT API error:", errorMessage)
      throw new Error(errorMessage)
    }

    const data = await apiResponse.json()
    console.log("[v0] OSINT API response received, data keys:", Object.keys(data))

    if (data["Error code"]) {
      const errorMessage = `OSINT API Error: ${data["Error code"]}`
      console.log("[v0] OSINT API returned error:", errorMessage)

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

      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    console.log("[v0] Search completed successfully")
    const response = NextResponse.json(data)
    response.headers.set("X-RateLimit-Limit", isNFTHolder(token) ? "200" : "50")
    response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rateLimitResult.resetTime.toString())

    return response
  } catch (error: any) {
    console.log("[v0] Search API error:", error.message)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        details: "Failed to process search request",
        troubleshooting: "Check that OSINT_API_TOKEN is set in environment variables",
      },
      { status: 500 },
    )
  }
}
