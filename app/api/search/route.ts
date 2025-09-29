import { type NextRequest, NextResponse } from "next/server"
import { nftHolderLimiter, regularUserLimiter, extractWalletFromToken, isNFTHolder } from "@/lib/rate-limiter"

// Получаем API токен из переменных окружения
const API_TOKEN = process.env.OSINT_API_TOKEN

export async function POST(request: NextRequest) {
  try {
    if (!API_TOKEN) {
      console.log("⚠️ OSINT_API_TOKEN not configured, running in demo mode")

      // Check authorization even in demo mode
      const authHeader = request.headers.get("authorization")
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Authorization required" }, { status: 401 })
      }

      const token = authHeader.substring(7)
      const sessionSecret = process.env.OSINT_SESSION_SECRET || "default-secret"
      if (!token || !token.startsWith(sessionSecret)) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 })
      }

      const body = await request.json()
      const { request: query } = body

      // Return demo data
      const demoData = {
        List: {
          demo_database_1: {
            Data: [
              {
                email: "demo@example.com",
                username: "demo_user",
                password: "demo_password_hash",
                phone: "+1234567890",
                name: "Demo User",
              },
            ],
            Private: false,
            Size: 1,
          },
          demo_database_2: {
            Data: [
              {
                email: "test@demo.com",
                login: "test_user",
                hash: "demo_hash_value",
              },
            ],
            Private: false,
            Size: 1,
          },
        },
        demo_mode: true,
        message: "This is demo data. Configure OSINT_API_TOKEN environment variable for real results.",
      }

      console.log(`🎭 Demo search for: "${query}" - returning sample data`)

      return NextResponse.json(demoData, {
        headers: {
          "X-Demo-Mode": "true",
          "X-RateLimit-Limit": "50",
          "X-RateLimit-Remaining": "49",
          "X-RateLimit-Reset": Date.now().toString(),
        },
      })
    }

    // Check authorization
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Verify user token (проверяем что токен содержит наш секрет)
    const sessionSecret = process.env.OSINT_SESSION_SECRET || "default-secret"
    if (!token || !token.startsWith(sessionSecret)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    let rateLimitResult

    if (isNFTHolder(token)) {
      // NFT holder - higher limits
      const walletAddress = extractWalletFromToken(token)
      if (!walletAddress) {
        return NextResponse.json({ error: "Invalid NFT token format" }, { status: 401 })
      }

      rateLimitResult = nftHolderLimiter.checkLimit(walletAddress)
      console.log(
        `🔒 Rate limit check for NFT holder ${walletAddress}: ${rateLimitResult.remaining} requests remaining`,
      )
    } else {
      // Regular user - lower limits, use token as identifier
      rateLimitResult = regularUserLimiter.checkLimit(token)
      console.log(`🔒 Rate limit check for regular user: ${rateLimitResult.remaining} requests remaining`)
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

    console.log(`🔍 Search request: "${query}" (limit: ${limit}, lang: ${lang})`)

    console.log("[v0] API_TOKEN configured:", !!API_TOKEN)
    console.log("[v0] API_TOKEN length:", API_TOKEN?.length || 0)

    const requestPayload = {
      token: API_TOKEN,
      request: query,
      limit,
      lang,
      type: "json",
    }

    console.log("[v0] Request payload:", JSON.stringify(requestPayload, null, 2))

    // Make request to OSINT API
    const apiResponse = await fetch("https://leakosintapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    })

    console.log("[v0] API Response status:", apiResponse.status)
    console.log("[v0] API Response headers:", Object.fromEntries(apiResponse.headers.entries()))

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      console.log("[v0] API Error response body:", errorText)
      const errorMessage = `OSINT API returned status ${apiResponse.status}`
      console.error(`❌ API Error: ${errorMessage}`)
      throw new Error(errorMessage)
    }

    const data = await apiResponse.json()
    console.log("[v0] API Response data:", JSON.stringify(data, null, 2))

    // Check for API errors in response
    if (data["Error code"]) {
      const errorMessage = `OSINT API Error: ${data["Error code"]}`
      console.error(`❌ API Response Error: ${errorMessage}`)

      if (data["Error code"] === "bad token") {
        return NextResponse.json(
          {
            error: "Invalid API Token",
            message: "The OSINT API token is invalid or expired. Please check your API configuration.",
            details: "Contact your administrator to update the OSINT_API_TOKEN environment variable.",
          },
          { status: 401 },
        )
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Log successful response
    const resultCount = Object.keys(data.List || {}).length
    console.log(`✅ Search successful: Found ${resultCount} database results`)

    const response = NextResponse.json(data)
    response.headers.set("X-RateLimit-Limit", isNFTHolder(token) ? "200" : "50")
    response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rateLimitResult.resetTime.toString())

    return response
  } catch (error: any) {
    console.error("Search API Error:", error)

    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        details: "Failed to process search request",
      },
      { status: 500 },
    )
  }
}
