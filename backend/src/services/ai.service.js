const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

// Invalid names are skipped automatically
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

const isModelNotFound = (e) =>
    e.status === 404 || e.code === 404 || e.message?.includes("NOT_FOUND")

const isRetryable = (e) =>
    e.status === 503 || e.status === 429 || e.code === 503 || e.code === 429 ||
    e.message?.includes("UNAVAILABLE") || e.message?.includes("RESOURCE_EXHAUSTED") ||
    e instanceof SyntaxError ||      // model returned broken JSON
    e.name === "ZodError"            // model returned wrong shape

// ---------- Provider 1: Gemini ----------
async function generateWithGemini({ prompt, schema, retries = 3, delay = 2000 }) {
    let lastError

    for (const model of MODELS) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: zodToJsonSchema(schema),
                    },
                })
                return schema.parse(JSON.parse(response.text)) // parsed + validated
            } catch (error) {
                lastError = error

                if (isModelNotFound(error)) {
                    console.warn(`[Gemini] ${model} not available, skipping.`)
                    break
                }
                if (!isRetryable(error)) {
                    console.warn(`[Gemini] ${model} failed (${error.status || error.code}), skipping.`)
                    break
                }

                console.warn(`[Gemini] ${model} attempt ${attempt}/${retries} failed (${error.status || error.code || error.name}).`)
                if (attempt < retries) {
                    await sleep(delay * 2 ** (attempt - 1) + Math.random() * 500)
                }
            }
        }
    }

    throw lastError
}

// ---------- Provider 2: Groq (backup) ----------
async function generateWithGroq({ prompt, schema, retries = 3 }) {
    let lastError

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",

                    messages: [
                        {
                            role: "system",
                            content: `
You are an interview preparation assistant.

You MUST return ONLY one JSON object.

The JSON object MUST contain EXACTLY these top-level fields:

1. matchScore - number between 0 and 100
2. technicalQuestions - array of objects
3. behavioralQuestions - array of objects
4. skillGaps - array of objects
5. preparationPlan - array of objects
6. title - string

technicalQuestions objects MUST contain:
- question
- intention
- answer

behavioralQuestions objects MUST contain:
- question
- intention
- answer

skillGaps objects MUST contain:
- skill
- severity

severity MUST be exactly one of:
"low", "medium", "high"

preparationPlan objects MUST contain:
- day - number
- focus - string
- tasks - array of strings

Do NOT return:
candidate
resume
selfDescription
jobDescription
interviewReport
or any other top-level fields.

Do NOT return markdown.
Do NOT return explanations outside the JSON.
`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],

                    response_format: {
                        type: "json_object"
                    },

                    temperature: 0.2,
                    max_tokens: 6000
                }),
            })

            if (!res.ok) {
                const errorText = await res.text()
                const err = new Error(errorText)
                err.status = res.status
                throw err
            }

            const data = await res.json()

            const rawContent = data.choices[0].message.content

            console.log("========== GROQ RAW RESPONSE ==========")
            console.log(rawContent)
            console.log("========================================")

            const result = JSON.parse(rawContent)

            console.log("========== GROQ PARSED JSON ============")
            console.log(JSON.stringify(result, null, 2))
            console.log("========================================")

            return schema.parse(result)

        } catch (error) {
            lastError = error

            const retryable =
                error.status === 429 ||
                error.status >= 500 ||
                error instanceof SyntaxError ||
                error.name === "ZodError"

            if (!retryable) {
                throw error
            }

            console.warn(
                `[Groq] attempt ${attempt}/${retries} failed (${error.status || error.name}).`
            )

            if (attempt < retries) {
                await sleep(1500 * attempt)
            }
        }
    }

    throw lastError
}

// ---------- Orchestrator: always returns a parsed, validated object ----------
async function generateStructured({ prompt, schema }) {
    // Set FORCE_GROQ=true in .env to test Groq on its own
    if (process.env.FORCE_GROQ !== "true") {
        try {
            return await generateWithGemini({ prompt, schema })
        } catch (error) {
            console.warn(`[AI] Gemini failed (${error.status || error.code || error.name}).`)
            if (!process.env.GROQ_API_KEY) throw error
            console.warn("[AI] Falling back to Groq.")
        }
    }

    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not set")
    }
    return await generateWithGroq({ prompt, schema })
}

// ===============================
// SCHEMAS
// ===============================

const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job description"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The behavioral question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan"),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day")
    })).describe("A day-wise preparation plan for the candidate"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

const resumePdfSchema = z.object({
    html: z.string().describe("The full HTML content of the resume, convertible to PDF with puppeteer")
})

// ===============================
// SERVICE FUNCTIONS
// ===============================

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    const prompt = `Generate an interview report for a candidate with the following details:
Resume: ${resume || "Not provided"}
Self Description: ${selfDescription || "Not provided"}
Job Description: ${jobDescription}`

    return await generateStructured({ prompt, schema: interviewReportSchema })
}

async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    })

    try {
        const page = await browser.newPage()
        await page.setContent(htmlContent, { waitUntil: "networkidle0" })

        return await page.pdf({
            format: "A4",
            margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" }
        })
    } finally {
        await browser.close()
    }
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const prompt = `Generate a resume for a candidate with the following details:
Resume: ${resume || "Not provided"}
Self Description: ${selfDescription || "Not provided"}
Job Description: ${jobDescription}

The response should be a JSON object with a single field "html" containing the complete HTML of the resume, ready to convert to PDF with puppeteer.
Tailor the resume to the job description and highlight the candidate's strengths and relevant experience.
The HTML should be well-structured and visually clean, with simple, professional styling (inline CSS only, no external files or images).
The content should read like a real human-written resume, not AI-generated.
It must be ATS friendly and ideally 1-2 pages long. Only use facts present in the candidate's details; do not invent employers, degrees or numbers.`

    const { html } = await generateStructured({ prompt, schema: resumePdfSchema })
    return await generatePdfFromHtml(html)
}

module.exports = { generateInterviewReport, generateResumePdf }