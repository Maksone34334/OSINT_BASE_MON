interface SearchResultsProps {
  results: any
  isLoading: boolean
  error: string | null
}

export default function SearchResults({ results, isLoading, error }: SearchResultsProps) {
  const isDemoMode = results && (results as any).demo_mode === true

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-blue-400">Searching databases...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
        <h3 className="text-red-400 font-semibold mb-2">Search Error</h3>
        <p className="text-red-300">{error}</p>
      </div>
    )
  }

  if (!results || !results.List) {
    return null
  }

  const databases = Object.entries(results.List)

  return (
    <div className="space-y-4">
      {isDemoMode && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">⚠️</span>
            <h3 className="text-yellow-400 font-semibold">Demo Mode</h3>
          </div>
          <p className="text-yellow-300 mt-1">
            This is sample data. Configure OSINT_API_TOKEN environment variable for real search results.
          </p>
        </div>
      )}
    </div>
  )
}
