import { NextResponse } from 'next/server';
import openai from '@/app/lib/openai';

interface AIResponse {
  isLLM: boolean;
  percentage: number;
  reasoning: string;
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input: Text is required' },
        { status: 400 }
      );
    }

    const SYSTEM_PROMPT = `You are an expert AI text detector that MUST identify if text is AI-generated. Your default assumption should be that text is AI-generated unless proven otherwise.

Key indicators of AI text:
1. Perfect paragraph structure and transitions
2. Comprehensive coverage of multiple aspects
3. Balanced and neutral tone
4. Lack of unique personal experiences
5. Consistent writing style throughout
6. Generic examples or descriptions
7. Perfect grammar and punctuation
8. Common LLM phrases and structures
9. Even pacing and consistent detail level
10. Formal or academic tone even in casual topics

Rate text heavily on these factors. Be extremely sensitive to AI patterns - if in doubt, classify as AI-generated.

IMPORTANT: Format your response EXACTLY as this JSON:
{
  "isLLM": boolean,
  "percentage": number,
  "reasoning": string
}

Do not include any other text or explanation outside of this JSON object.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: 'No response from OpenAI' },
        { status: 500 }
      );
    }

    let parsed: AIResponse;
    try {
      parsed = JSON.parse(content) as AIResponse;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON response from AI' },
        { status: 500 }
      );
    }

    if (
      typeof parsed.isLLM !== 'boolean' ||
      typeof parsed.percentage !== 'number' ||
      typeof parsed.reasoning !== 'string' ||
      parsed.percentage < 0 ||
      parsed.percentage > 100
    ) {
      return NextResponse.json(
        { error: 'Invalid response format from AI' },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


