const { GoogleGenAI, Type } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY
});

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const isTemporaryGeminiError = (error) => {
  const errorDetails = `${error?.status ?? ""} ${error?.code ?? ""} ${error?.message ?? ""}`.toUpperCase();
  return error?.status === 503 || error?.code === 503 ||
    errorDetails.includes("503") || errorDetails.includes("UNAVAILABLE");
};

// Native Gemini Type schema definition avoids wrapper issues with zod-to-json-schema
const interviewReportGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    matchScore: { type: Type.INTEGER },
    technicalQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          intention: { type: Type.STRING },
          answer: { type: Type.STRING }
        },
        required: ["question", "intention", "answer"]
      }
    },
    behavioralQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          intention: { type: Type.STRING },
          answer: { type: Type.STRING }
        },
        required: ["question", "intention", "answer"]
      }
    },
    skillGaps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          severity: { 
            type: Type.STRING, 
            enum: ["Low", "Medium", "High", "low", "medium", "high"] 
          }
        },
        required: ["skill", "severity"]
      }
    },
    preparationPlan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.INTEGER },
          focus: { type: Type.STRING },
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["day", "focus", "tasks"]
      }
    }
  },
  required: [
    "title",
    "matchScore",
    "technicalQuestions",
    "behavioralQuestions",
    "skillGaps",
    "preparationPlan"
  ]
};

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription
}) {
  const prompt = `
Generate a detailed interview preparation report for the candidate based on:
1. Candidate Resume
2. Self Description
3. Job Description

Requirements:
- Generate at least 5 technical questions with question, intention, and answer.
- Generate at least 4 behavioral questions with question, intention, and answer.
- Highlight skill gaps with skill and severity (Low, Medium, or High).
- Provide a structured day-by-day preparation plan.
- Extract the target job title from the job description and place it in "title".

Candidate Resume:
${resume}

Candidate Self Description:
${selfDescription}

Job Description:
${jobDescription}
`;

  let response;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: interviewReportGeminiSchema
        }
      });
      break;
    } catch (error) {
      if (!isTemporaryGeminiError(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(2000);
    }
  }

  const result = JSON.parse(response.text);

  // Normalize severity casing for database persistence
  if (Array.isArray(result.skillGaps)) {
    result.skillGaps = result.skillGaps.map(gap => ({
      ...gap,
      severity: gap.severity ? gap.severity.toLowerCase() : "medium"
    }));
  }

  return result;
}

module.exports = {
  generateInterviewReport
};