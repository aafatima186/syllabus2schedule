import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { syllabusText, dailyHours, deadlineDate, customPrompt } = await req.json();

    if (!syllabusText || syllabusText.trim().length < 20) {
      return NextResponse.json(
        { error: 'Please provide valid syllabus text.' },
        { status: 400 }
      );
    }
    if (!deadlineDate) {
      return NextResponse.json(
        { error: 'Please provide a deadline date.' },
        { status: 400 }
      );
    }

    const selectedModel = 'openai/gpt-4o-mini';
    const todayStr = new Date().toISOString().split('T')[0];

    const response = await openai.chat.completions.create({
      model: selectedModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert academic advisor.

GROUND TRUTH DATES — treat these as fact, do not override them with anything inferred from the syllabus text or user preferences below:
- Today's date: ${todayStr}
- Final deadline: ${deadlineDate}

Analyze the lecture/syllabus content below and output strictly a JSON object with this exact structure:
{
  "courseName": "string",
  "summary": "string",
  "milestones": [{"id": "m1", "title": "string", "type": "Exam|Assignment", "dueDate": "YYYY-MM-DD", "weightage": "string"}],
  "studyPlan": [{"weekNumber": 1, "focusTopics": "string", "recommendedTasks": ["task1"]}]
}

STRICT RULES (these always take priority over user preferences below):
1. The study plan must span ONLY from ${todayStr} to ${deadlineDate}. Never generate more time periods than actually exist in that window.
   - If the window is 7 days or fewer, output a SINGLE studyPlan entry (weekNumber: 1) with a daily breakdown inside "recommendedTasks" (e.g. "Mon: ...", "Tue: ...").
   - If the window is longer, split into weekly chunks that fit exactly within it — do not pad with extra weeks.
2. Do NOT invent, assume, or add any exam/assignment/deadline not explicitly present in the provided lecture/syllabus content. If the only real deadline is the final one, output exactly one milestone using ${deadlineDate}.
3. All content in "milestones" and "studyPlan" must be derived from the provided lecture/syllabus text — do not fabricate topics not mentioned in it.
4. Tailor tasks for ${dailyHours || 2} study hours/day.

USER PREFERENCES (apply these on top of the rules above, but never let them change the dates or invent content not present in the source material):
${customPrompt && customPrompt.trim() ? customPrompt.trim() : 'None provided.'}`
        },
        {
          role: 'user',
          content: `Lecture/Syllabus Content:\n${syllabusText}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No output from OpenRouter model.');

    return NextResponse.json(JSON.parse(content));

  } catch (error: any) {
    console.error('OpenRouter API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate schedule.' },
      { status: 500 }
    );
  }
}