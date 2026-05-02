import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { resultId, message } = await request.json()

    if (!resultId || !message) {
      return NextResponse.json(
        { error: "Missing required fields: resultId and message" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the provider details
    const { data: provider, error: providerError } = await supabase
      .from("search_results")
      .select("*, search_jobs(what, location)")
      .eq("id", resultId)
      .single()

    if (providerError || !provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      )
    }

    // Get previous chat messages for context
    const { data: previousMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("result_id", resultId)
      .order("created_at", { ascending: true })
      .limit(10)

    // Save user message
    await supabase.from("chat_messages").insert({
      result_id: resultId,
      role: "user",
      content: message,
    })

    // Generate AI response (using OpenAI via Vercel AI Gateway)
    const systemPrompt = `You are a helpful assistant providing information about ${provider.name}, a ${provider.search_jobs?.what} provider in ${provider.search_jobs?.location}.

Provider details:
- Name: ${provider.name}
- Rating: ${provider.rating}/5 (${provider.review_count} reviews)
- Phone: ${provider.phone}
- Email: ${provider.email}
- Website: ${provider.website}
- Address: ${provider.address}
- Description: ${provider.description}
- Source: ${provider.source}

Help users understand if this provider is a good fit for their needs. Be helpful, concise, and honest. If you don't know something specific about the provider, say so.`

    const messages = [
      { role: "system", content: systemPrompt },
      ...(previousMessages || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ]

    // Call OpenAI through Vercel AI Gateway
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    })

    let assistantMessage: string

    if (!aiResponse.ok || !process.env.OPENAI_API_KEY) {
      // Fallback response if AI is not available
      assistantMessage = generateFallbackResponse(message, provider)
    } else {
      const aiData = await aiResponse.json()
      assistantMessage = aiData.choices[0]?.message?.content || generateFallbackResponse(message, provider)
    }

    // Save assistant message
    await supabase.from("chat_messages").insert({
      result_id: resultId,
      role: "assistant",
      content: assistantMessage,
    })

    return NextResponse.json({
      message: assistantMessage,
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function generateFallbackResponse(message: string, provider: any): string {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes("price") || lowerMessage.includes("cost") || lowerMessage.includes("rate")) {
    return `${provider.name} hasn't listed their exact pricing publicly. I'd recommend calling them at ${provider.phone} or emailing ${provider.email} for a free quote. Many providers in this area offer free estimates!`
  }

  if (lowerMessage.includes("available") || lowerMessage.includes("schedule") || lowerMessage.includes("book")) {
    return `For availability and scheduling, please contact ${provider.name} directly at ${provider.phone}. You can also check their website at ${provider.website} for online booking options.`
  }

  if (lowerMessage.includes("review") || lowerMessage.includes("rating") || lowerMessage.includes("good")) {
    return `${provider.name} has a ${provider.rating}/5 rating based on ${provider.review_count} reviews on ${provider.source}. That's a solid rating for a local provider! Would you like me to help you with anything else about them?`
  }

  if (lowerMessage.includes("contact") || lowerMessage.includes("reach") || lowerMessage.includes("call")) {
    return `You can reach ${provider.name} at:\n- Phone: ${provider.phone}\n- Email: ${provider.email}\n- Website: ${provider.website}\n- Address: ${provider.address}`
  }

  return `${provider.name} is a ${provider.rating}-star rated provider with ${provider.review_count} reviews. ${provider.description} Feel free to ask me about their pricing, availability, reviews, or contact information!`
}

// Get chat history
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const resultId = searchParams.get("resultId")

    if (!resultId) {
      return NextResponse.json(
        { error: "Missing resultId parameter" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("result_id", resultId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching chat history:", error)
      return NextResponse.json(
        { error: "Failed to fetch chat history" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      messages: messages || [],
    })
  } catch (error) {
    console.error("Chat history API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
