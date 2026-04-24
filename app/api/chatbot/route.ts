import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

const GEMINI_API_KEY = process.env.GOOGLE_GENAI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

interface DailyDataFile {
  date: string;
  districts: { [district: string]: number | null };
}

interface DistrictStats {
  district: string;
  totalRainfall: number;
  maxRainfall: number;
  maxDate: string;
  daysWithRain: number;
  availableData: { date: string; rainfall: number }[];
}

/**
 * Read all available realised rainfall data from Supabase and compute per-district stats
 */
async function buildRainfallContext(): Promise<{
  summary: string;
  districtStats: DistrictStats[];
  availableMonths: string[];
}> {
  const districtMap = new Map<string, DistrictStats>();
  const availableMonthsSet = new Set<string>();

  try {
    // Query all realised data from the last few years
    const { data, error } = await adminSupabase
      .from('master_data_files')
      .select('year, month, day, districts')
      .eq('type', 'realised')
      .is('lead_day', null)
      .order('year', { ascending: true })
      .order('month', { ascending: true })
      .order('day', { ascending: true });

    if (error) {
      console.error('Supabase chatbot context error:', error);
    } else if (data) {
      for (const row of data) {
        const monthKey = `${row.year}-${row.month}`;
        availableMonthsSet.add(monthKey);
        const dateStr = `${row.year}-${String(row.month).padStart(2,'0')}-${String(row.day).padStart(2,'0')}`;

        for (const [district, rainfall] of Object.entries(row.districts as Record<string, number | null>)) {
          if (rainfall === null || isNaN(rainfall as number)) continue;
          const upper = district.trim().toUpperCase();

          if (!districtMap.has(upper)) {
            districtMap.set(upper, {
              district: upper,
              totalRainfall: 0,
              maxRainfall: 0,
              maxDate: dateStr,
              daysWithRain: 0,
              availableData: [],
            });
          }
          const stats = districtMap.get(upper)!;
          stats.totalRainfall += rainfall as number;
          stats.daysWithRain += 1;
          stats.availableData.push({ date: dateStr, rainfall: rainfall as number });
          if ((rainfall as number) > stats.maxRainfall) {
            stats.maxRainfall = rainfall as number;
            stats.maxDate = dateStr;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error building chatbot context:', err);
  }

  const districtStats = Array.from(districtMap.values());
  const availableMonths = Array.from(availableMonthsSet);

  // Build concise summary text for the prompt
  const summaryLines = districtStats.map((d) =>
    `${d.district}: total=${d.totalRainfall.toFixed(1)}mm, max=${d.maxRainfall.toFixed(1)}mm on ${d.maxDate}, rain days=${d.daysWithRain}`
  );

  const summary = [
    `Available months: ${availableMonths.join(', ')}`,
    `Districts tracked: ${districtStats.length}`,
    '',
    'District rainfall summary:',
    ...summaryLines,
  ].join('\n');

  return { summary, districtStats, availableMonths };
}


/**
 * Build a detailed per-district daily dataset for fine-grained query answering
 */
function buildDetailedDistrictData(
  districtStats: DistrictStats[],
  question: string
): string {
  // Extract potential district/month mentions from the question for targeted context
  const q = question.toUpperCase();

  const relevantDistricts = districtStats.filter((d) => q.includes(d.district));

  // If specific districts mentioned, return their full daily data
  if (relevantDistricts.length > 0) {
    return relevantDistricts
      .map((d) => {
        const dailyRows = d.availableData
          .map((r) => `  ${r.date}: ${r.rainfall.toFixed(1)} mm`)
          .join('\n');
        return `${d.district} Daily Data:\n${dailyRows}`;
      })
      .join('\n\n');
  }

  // Otherwise return top 5 districts by total rainfall for context
  const top5 = [...districtStats]
    .sort((a, b) => b.totalRainfall - a.totalRainfall)
    .slice(0, 5);

  return top5
    .map((d) => {
      const dailyRows = d.availableData
        .map((r) => `  ${r.date}: ${r.rainfall.toFixed(1)} mm`)
        .join('\n');
      return `${d.district} Daily Data:\n${dailyRows}`;
    })
    .join('\n\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build data context from local files
    const { summary, districtStats, availableMonths } = await buildRainfallContext();
    const detailedData = buildDetailedDistrictData(districtStats, message);

    const systemContext = `You are an expert meteorological data analyst and climate scientist specializing in Maharashtra rainfall patterns. You have access to actual recorded rainfall data from the IMD (Indian Meteorological Department) Mumbai.

Your task: Answer the user's question about Maharashtra rainfall with TWO distinct sections:

**📊 Data-Based Answer**
Analyze the provided dataset and give specific figures, dates, districts, and calculations. Be precise with numbers from the data. If the data doesn't cover the exact query, say so clearly.

**🔬 Scientific Context**
Explain the meteorological science behind the observed patterns. Cover: monsoon dynamics, orographic effects, Arabian Sea moisture, Western Ghats influence, subdivision characteristics (Konkan, Marathwada, Vidarbha, North Maharashtra, Madhya Maharashtra), seasonal patterns, and relevant climate science.

Keep responses clear, informative, and useful for climate researchers. Format numbers with appropriate units (mm).`;

    const dataContext = `=== RAINFALL DATASET OVERVIEW ===
${summary}

=== DETAILED DAILY DATA (for specific districts relevant to this query) ===
${detailedData}

Available months in database: ${availableMonths.join(', ')}
Maharashtra districts covered: ${districtStats.map((d) => d.district).join(', ')}`;

    const userPrompt = `Dataset context:
${dataContext}

User question: ${message}

Please analyze the data and provide your response with the two sections: 📊 Data-Based Answer and 🔬 Scientific Context.`;

    // Call Gemini API
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemContext }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return NextResponse.json(
        { error: 'AI service unavailable', details: errorText },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const answer =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'I could not generate a response. Please try again.';

    // Generate smart suggestions based on the question
    const suggestions = generateSuggestions(message, districtStats);

    return NextResponse.json({ answer, suggestions });
  } catch (error: any) {
    console.error('Chatbot API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

function generateSuggestions(question: string, districtStats: DistrictStats[]): string[] {
  const q = question.toLowerCase();
  const topDistricts = [...districtStats]
    .sort((a, b) => b.totalRainfall - a.totalRainfall)
    .slice(0, 3)
    .map((d) => d.district);

  const suggestions: string[] = [];

  if (q.includes('highest') || q.includes('maximum') || q.includes('max')) {
    suggestions.push(`What was the lowest rainfall recorded in ${topDistricts[0] || 'Pune'}?`);
    suggestions.push('Which district had the most consistent rainfall?');
  } else if (q.includes('lowest') || q.includes('minimum') || q.includes('min')) {
    suggestions.push(`Which district had the highest total rainfall?`);
    suggestions.push('What was the average rainfall across all districts?');
  } else if (q.includes('compare') || q.includes('between')) {
    suggestions.push(`What caused high rainfall in ${topDistricts[0] || 'Konkan'}?`);
    suggestions.push('Which subdivision received the most rainfall overall?');
  } else if (q.includes('why') || q.includes('cause') || q.includes('explain')) {
    suggestions.push(`What was the highest single-day rainfall in the dataset?`);
    suggestions.push('Which district had the most rain days?');
  } else {
    suggestions.push(`Which district had the highest single-day rainfall?`);
    suggestions.push('Why does Konkan receive heavy rainfall?');
    suggestions.push('Compare rainfall between coastal and inland districts.');
  }

  return suggestions.slice(0, 2);
}
