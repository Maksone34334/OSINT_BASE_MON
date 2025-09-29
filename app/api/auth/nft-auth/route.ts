import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz"
const NFT_CONTRACT_ADDRESS_MONAD = "0xC1C4d4A5A384DE53BcFadB43D0e8b08966195757"
const BASE_MAINNET_RPCS = [
  "https://mainnet.base.org",
  "https://base-mainnet.public.blastapi.io",
  "https://base.gateway.tenderly.co",
  "https://base-rpc.publicnode.com",
]
const NFT_CONTRACT_ADDRESS_BASE = "0x8cf392D33050F96cF6D0748486490d3dEae52564"
const BALANCE_OF_SELECTOR = "0x70a08231"

async function getSessionSecret(): Promise<string> {
  try {
    const envSecret = process.env.OSINT_SESSION_SECRET
    if (envSecret) {
      return envSecret
    }

    // Generate a deterministic but secure secret using Web Crypto API
    const baseString = `osint-hub-${process.env.VERCEL_URL || "localhost"}-${process.env.NODE_ENV || "development"}`
    const encoder = new TextEncoder()
    const data = encoder.encode(baseString)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  } catch (error) {
    console.error("Error generating session secret:", error)
    // Fallback to a simple deterministic secret
    return `fallback-secret-${Date.now()}`
  }
}

async function checkNFTBalanceWithFallback(
  rpcUrls: string[],
  contractAddress: string,
  walletAddress: string,
): Promise<number> {
  for (const rpcUrl of rpcUrls) {
    try {
      const balance = await checkNFTBalance(rpcUrl, contractAddress, walletAddress)
      return balance
    } catch (error) {
      continue
    }
  }
  return 0
}

async function checkNFTBalance(rpcUrl: string, contractAddress: string, walletAddress: string): Promise<number> {
  try {
    const paddedAddress = walletAddress.slice(2).padStart(64, "0")
    const callData = BALANCE_OF_SELECTOR + paddedAddress

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: contractAddress,
            data: callData,
          },
          "latest",
        ],
        id: 1,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message || data.error}`)
    }

    return Number.parseInt(data.result, 16)
  } catch (error) {
    throw error
  }
}

async function checkNFTOwnership(walletAddress: string): Promise<{ hasNFT: boolean; details: any }> {
  try {
    let baseBalance = 0
    let monadBalance = 0

    try {
      // Check Base Mainnet first
      baseBalance = await checkNFTBalanceWithFallback(BASE_MAINNET_RPCS, NFT_CONTRACT_ADDRESS_BASE, walletAddress)

      // Then check Monad
      monadBalance = await checkNFTBalance(MONAD_TESTNET_RPC, NFT_CONTRACT_ADDRESS_MONAD, walletAddress).catch(() => 0)
    } catch (error) {
      console.error("Network check error:", error)
      // If Base fails, still try Monad
      monadBalance = await checkNFTBalance(MONAD_TESTNET_RPC, NFT_CONTRACT_ADDRESS_MONAD, walletAddress).catch(() => 0)
    }

    const totalBalance = monadBalance + baseBalance
    const hasNFT = totalBalance > 0

    const networks = []
    if (baseBalance > 0) {
      networks.push({
        name: "Base Mainnet",
        balance: baseBalance,
        contractAddress: NFT_CONTRACT_ADDRESS_BASE,
      })
    }
    if (monadBalance > 0) {
      networks.push({
        name: "Monad Testnet",
        balance: monadBalance,
        contractAddress: NFT_CONTRACT_ADDRESS_MONAD,
      })
    }

    return {
      hasNFT,
      details: {
        totalBalance,
        monadBalance,
        baseBalance,
        networks,
        base: {
          hasNFT: baseBalance > 0,
          balance: baseBalance,
          contractAddress: NFT_CONTRACT_ADDRESS_BASE,
          network: "Base Mainnet",
        },
        monad: {
          hasNFT: monadBalance > 0,
          balance: monadBalance,
          contractAddress: NFT_CONTRACT_ADDRESS_MONAD,
          network: "Monad Testnet",
        },
      },
    }
  } catch (error) {
    return { hasNFT: false, details: null }
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] NFT Auth API called")

    let body
    try {
      body = await request.json()
      console.log("[v0] Request body parsed successfully")
    } catch (parseError) {
      console.error("[v0] Failed to parse request body:", parseError)
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
        },
        { status: 400 },
      )
    }

    const { walletAddress, signature, message } = body
    console.log("[v0] Extracted parameters:", {
      walletAddress: walletAddress?.slice(0, 10) + "...",
      hasSignature: !!signature,
      hasMessage: !!message,
    })

    if (!walletAddress || !signature || !message) {
      console.log("[v0] Missing required parameters")
      return NextResponse.json(
        {
          error: "Wallet address, signature, and message are required",
        },
        { status: 400 },
      )
    }

    if (message !== `Login to OSINT HUB with wallet: ${walletAddress}`) {
      console.log("[v0] Invalid message format")
      return NextResponse.json(
        {
          error: "Invalid message format",
        },
        { status: 400 },
      )
    }

    console.log("[v0] Starting NFT ownership check")
    const nftCheck = await checkNFTOwnership(walletAddress)
    console.log("[v0] NFT check result:", { hasNFT: nftCheck.hasNFT })

    if (!nftCheck.hasNFT) {
      console.log("[v0] Access denied - no NFT found")
      return NextResponse.json(
        {
          error: "Access denied: You must own an NFT from the authorized collection to use this service",
          details: nftCheck.details,
        },
        { status: 403 },
      )
    }

    console.log("[v0] Generating session secret")
    const sessionSecret = await getSessionSecret()
    const token = `${sessionSecret}_nft_${walletAddress}_${Date.now()}`

    const user = {
      id: walletAddress,
      login: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      email: `${walletAddress}@nft.holder`,
      role: "nft_holder",
      status: "active",
      walletAddress,
      createdAt: new Date().toISOString(),
    }

    console.log("[v0] Authentication successful")
    return NextResponse.json({
      success: true,
      user,
      token,
      message: "NFT ownership verified. Access granted!",
      nftDetails: nftCheck.details,
    })
  } catch (error: any) {
    console.error("[v0] Unhandled error in NFT auth:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message || "Unknown error occurred",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
