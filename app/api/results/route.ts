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

    // First check if the job exists and is completed
    const { data: job, error: jobError } = await supabase
      .from("search_jobs")
      .select("id, status, what, location")
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    if (job.status !== "completed") {
      return NextResponse.json(
        { 
          error: "Results not ready yet",
          status: job.status 
        },
        { status: 202 }
      )
    }

    // Fetch the results
    const { data: results, error: resultsError } = await supabase
      .from("search_results")
      .select("*")
      .eq("job_id", jobId)
      .order("rating", { ascending: false })

    if (resultsError) {
      console.error("Error fetching results:", resultsError)
      return NextResponse.json(
        { error: "Failed to fetch results" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      jobId: job.id,
      what: job.what,
      where: job.location,
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        website: r.website,
        address: r.address,
        rating: parseFloat(r.rating),
        reviewCount: r.review_count,
        description: r.description,
        source: r.source,
      })),
    })
  } catch (error) {
    console.error("Results API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
