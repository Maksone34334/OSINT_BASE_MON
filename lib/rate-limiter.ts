// Rate limiter for NFT holders based on wallet addresses
interface RateLimitEntry {
  count: number
  resetTime: number
  walletAddress: string
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map()
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests = 100, windowMs: number = 60 * 60 * 1000) {
    // 100 requests per hour by default
    this.maxRequests = maxRequests
    this.windowMs = windowMs

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key)
      }
    }
  }

  public checkLimit(walletAddress: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now()
    const key = walletAddress.toLowerCase()

    let entry = this.limits.get(key)

    // If no entry exists or the window has expired, create/reset
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.windowMs,
        walletAddress: key,
      }
      this.limits.set(key, entry)
    }

    // Check if limit exceeded
    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      }
    }

    // Increment counter
    entry.count++
    this.limits.set(key, entry)

    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime,
    }
  }

  public getRemainingRequests(walletAddress: string): number {
    const key = walletAddress.toLowerCase()
    const entry = this.limits.get(key)

    if (!entry || Date.now() > entry.resetTime) {
      return this.maxRequests
    }

    return Math.max(0, this.maxRequests - entry.count)
  }

  public getStats(): { totalWallets: number; activeEntries: number } {
    this.cleanup()
    return {
      totalWallets: this.limits.size,
      activeEntries: this.limits.size,
    }
  }
}

// Create rate limiter instances for different user types
export const nftHolderLimiter = new RateLimiter(200, 60 * 60 * 1000) // 200 requests per hour for NFT holders
export const regularUserLimiter = new RateLimiter(50, 60 * 60 * 1000) // 50 requests per hour for regular users

// Helper function to extract wallet address from token
export function extractWalletFromToken(token: string): string | null {
  try {
    const parts = token.split("_")
    if (parts.length >= 3 && parts[1] === "nft") {
      return parts[2] // wallet address is the 3rd part
    }
    return null
  } catch {
    return null
  }
}

// Helper function to check if user is NFT holder based on token
export function isNFTHolder(token: string): boolean {
  return token.includes("_nft_")
}
