import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { transcript, categories, title, duration } = await req.json()

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      // Fallback: generate a simple caption without AI
      const hashtags = (categories || []).map((c: string) => `#${c.replace(/_/g, '')}`).join(' ')
      return NextResponse.json({
        caption: `${transcript?.slice(0, 200) || title}\n\n${hashtags} #gaming #clips`,
      })
    }

    const prompt = `Generate a short, engaging social media caption for a ${Math.round(duration || 30)}s gaming clip.

Context:
- Title: ${title || 'Gaming Clip'}
- Transcript: "${transcript?.slice(0, 500) || 'N/A'}"
- Categories: ${(categories || []).join(', ')}

Rules:
- Keep it under 280 characters (Twitter-friendly)
- Include 3-5 relevant hashtags
- Make it attention-grabbing but not cringe
- No emojis overload (1-2 max)
- Gaming/content creator tone
- Don't use "check out" or "watch this"

Return ONLY the caption text, nothing else.`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 200,
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('[caption] Groq error:', err)
      // Fallback
      const hashtags = (categories || []).map((c: string) => `#${c.replace(/_/g, '')}`).join(' ')
      return NextResponse.json({
        caption: `${transcript?.slice(0, 200) || title}\n\n${hashtags} #gaming #clips`,
      })
    }

    const data = await groqRes.json()
    const caption = data.choices?.[0]?.message?.content?.trim() || `${title} #gaming`

    return NextResponse.json({ caption })
  } catch (err) {
    console.error('[caption] Error:', err)
    return NextResponse.json({ error: 'Caption generation failed' }, { status: 500 })
  }
}
