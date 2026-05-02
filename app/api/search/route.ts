import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { what, where, email } = await request.json()

    if (!what || !where) {
      return NextResponse.json(
        { error: "Missing required fields: what and where" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Create a new search job
    const { data: job, error } = await supabase
      .from("search_jobs")
      .insert({
        what,
        location: where,
        email: email || null,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating search job:", error)
      return NextResponse.json(
        { error: "Failed to create search job" },
        { status: 500 }
      )
    }

    // Trigger the background search (in production, this would call Bright Data MCP)
    // For now, we'll process it immediately with mock data
    processSearchJob(job.id, what, where, email)

    return NextResponse.json({
      jobId: job.id,
      status: "pending",
      message: "Search started. Poll /api/status for updates.",
    })
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Background job processor (mock implementation)
async function processSearchJob(
  jobId: string,
  what: string,
  where: string,
  email: string | null
) {
  const supabase = await createClient()

  try {
    // Update status to processing
    await supabase
      .from("search_jobs")
      .update({ status: "processing" })
      .eq("id", jobId)

    // Simulate search delay (in production, this calls Bright Data MCP)
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Generate mock results based on the search query
    const mockResults = generateMockResults(what, where)

    // Insert results
    const { error: resultsError } = await supabase.from("search_results").insert(
      mockResults.map((result) => ({
        job_id: jobId,
        ...result,
      }))
    )

    if (resultsError) {
      throw resultsError
    }

    // Mark job as completed
    await supabase
      .from("search_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    // Send email notification if email was provided
    if (email) {
      await sendEmailNotification(email, what, where, jobId)
    }
  } catch (error) {
    console.error("Error processing search job:", error)
    await supabase
      .from("search_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", jobId)
  }
}

function generateMockResults(what: string, where: string) {
  const serviceTypes: Record<string, string[]> = {
    plumber: ["Plumbing", "Drain Cleaning", "Water Heater", "Pipe Repair"],
    electrician: ["Electrical", "Wiring", "Panel Upgrades", "Lighting"],
    cleaner: ["House Cleaning", "Deep Clean", "Move-out Clean", "Office Cleaning"],
    gardener: ["Landscaping", "Lawn Care", "Tree Trimming", "Garden Design"],
    painter: ["Interior Painting", "Exterior Painting", "Cabinet Refinishing"],
    default: ["General Services", "Handyman", "Repairs", "Maintenance"],
  }

  const category = Object.keys(serviceTypes).find((key) =>
    what.toLowerCase().includes(key)
  ) || "default"

  const services = serviceTypes[category]

  const names = [
    `${where} Pro ${what}`,
    `Elite ${what} Services`,
    `Quick ${what} Solutions`,
    `Trusted ${what} Experts`,
    `Local ${what} Co.`,
    `Premium ${what} Team`,
  ]

  return names.slice(0, 5).map((name, i) => ({
    name,
    phone: `(555) ${100 + i}${i}-${1000 + i * 111}`,
    email: `contact@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    website: `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    address: `${100 + i * 50} Main Street, ${where}`,
    rating: Math.round((4 + Math.random()) * 10) / 10,
    review_count: Math.floor(20 + Math.random() * 200),
    description: `Professional ${services[i % services.length].toLowerCase()} services in ${where}. Licensed, insured, and highly rated by local customers.`,
    source: ["Google", "Yelp", "Angi", "Thumbtack", "BBB"][i % 5],
  }))
}

async function sendEmailNotification(
  email: string,
  what: string,
  where: string,
  jobId: string
) {
  // Check if Resend API key is available
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY not set, skipping email notification")
    return
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Find Me A <noreply@resend.dev>",
        to: [email],
        subject: `Your ${what} search results are ready!`,
        html: `
          <h2>Good news!</h2>
          <p>We've found local ${what} providers in ${where} for you.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/catalog.html?jobId=${jobId}">View your results</a></p>
          <p>Thanks for using Find Me A!</p>
        `,
      }),
    })

    if (!response.ok) {
      console.error("Failed to send email:", await response.text())
    }
  } catch (error) {
    console.error("Email send error:", error)
  }
}
