export const maxDuration = 10

export async function POST() {
  return Response.json(
    { error: 'This endpoint is no longer available. Use /api/generate-avatar for avatar generation.' },
    { status: 410 },
  )
}
