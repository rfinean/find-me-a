import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("jobId")

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: job, error } = await supabase
      .from("search_jobs")
      .select("id, status, what, location, created_at, completed_at, error_message")
      .eq("id", jobId)
      .single()

    if (error || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      what: job.what,
      where: job.location,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
    })
  } catch (error) {
    console.error("Status API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
