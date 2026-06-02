export async function GET() {
  return Response.json(
    { error: 'This endpoint is no longer available. Use /api/job-status for avatar job polling.' },
    { status: 410 },
  )
}
