const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

// Invalid model names are skipped automatically
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

const isModelNotFound = (e) =>
    e.status === 404 ||
    e.code === 404 ||
    e.message?.includes("NOT_FOUND")

const isRetryable = (e) =>
    e.status === 503 ||
    e.status === 429 ||
    e.code === 503 ||
    e.code === 429 ||
    e.message?.includes("UNAVAILABLE") ||
    e.message?.includes("RESOURCE_EXHAUSTED") ||
    e instanceof SyntaxError ||
    e.name === "ZodError"

// ---------- Provider 1: Gemini ----------
async function generateWithGemini({
    prompt,
    schema,
    retries = 3,
    delay = 2000
}) {
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

                const result = JSON.parse(response.text)
                return schema.parse(result)

            } catch (error) {
                lastError = error

                if (isModelNotFound(error)) {
                    console.warn(
                        `[Gemini] ${model} not available, skipping.`
                    )
                    break
                }

                if (!isRetryable(error)) {
                    console.warn(
                        `[Gemini] ${model} failed (${error.status || error.code || error.name}), skipping.`
                    )
                    break
                }

                console.warn(
                    `[Gemini] ${model} attempt ${attempt}/${retries} failed (${error.status || error.code || error.name}).`
                )

                if (attempt < retries) {
                    await sleep(
                        delay * 2 ** (attempt - 1) +
                        Math.random() * 500
                    )
                }
            }
        }
    }

    throw lastError
}

// ---------- Provider 2: Groq ----------
async function generateWithGroq({
    prompt,
    schema,
    retries = 3
}) {
    let lastError

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model:
                            process.env.GROQ_MODEL ||
                            "openai/gpt-oss-20b",

                        messages: [
                            {
                                role: "system",
                                content: `
You are an interview preparation assistant.

Return ONLY one valid JSON object.

The JSON object MUST contain EXACTLY these top-level fields:

1. matchScore
2. technicalQuestions
3. behavioralQuestions
4. skillGaps
5. preparationPlan
6. title

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

severity MUST be exactly:
"low"
"medium"
"high"

preparationPlan MUST contain EXACTLY 5 separate objects.

The day values MUST be:
1
2
3
4
5

Each preparationPlan object MUST contain:
- day
- focus
- tasks

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
                }
            )

            if (!res.ok) {
                const errorText = await res.text()
                const err = new Error(errorText)
                err.status = res.status
                throw err
            }

            const data = await res.json()
            const rawContent = data.choices[0].message.content

            const result = JSON.parse(rawContent)
            const validatedResult = schema.parse(result)

            console.log(
                "[Groq] Response received and validated successfully."
            )

            return validatedResult

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

// ---------- Orchestrator ----------
async function generateStructured({ prompt, schema }) {

    // Set FORCE_GROQ=true in .env to test Groq directly
    if (process.env.FORCE_GROQ !== "true") {
        try {
            return await generateWithGemini({
                prompt,
                schema
            })

        } catch (error) {
            console.warn(
                `[AI] Gemini failed (${error.status || error.code || error.name}).`
            )

            if (!process.env.GROQ_API_KEY) {
                throw error
            }

            console.warn("[AI] Falling back to Groq.")
        }
    }

    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not set")
    }

    return await generateWithGroq({
        prompt,
        schema
    })
}

// ===============================
// SCHEMAS
// ===============================

const interviewReportSchema = z.object({

    matchScore: z
        .number()
        .min(0)
        .max(100)
        .describe(
            "A score between 0 and 100 indicating how well the candidate's profile matches the job description"
        ),

    technicalQuestions: z
        .array(
            z.object({
                question: z
                    .string()
                    .describe(
                        "A technical question that can be asked in the interview"
                    ),

                intention: z
                    .string()
                    .describe(
                        "The intention of the interviewer behind asking this question"
                    ),

                answer: z
                    .string()
                    .describe(
                        "How the candidate should answer the question"
                    )
            })
        ),

    behavioralQuestions: z
        .array(
            z.object({
                question: z
                    .string()
                    .describe(
                        "A behavioral question that can be asked in the interview"
                    ),

                intention: z
                    .string()
                    .describe(
                        "The intention of the interviewer behind asking this question"
                    ),

                answer: z
                    .string()
                    .describe(
                        "How the candidate should answer the question"
                    )
            })
        ),

    skillGaps: z
        .array(
            z.object({
                skill: z
                    .string()
                    .describe(
                        "A skill required by the job but missing or insufficiently demonstrated by the candidate"
                    ),

                severity: z
                    .enum(["low", "medium", "high"])
                    .describe(
                        "The severity of the skill gap"
                    )
            })
        ),

    preparationPlan: z
        .array(
            z.object({
                day: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe(
                        "The preparation day number from 1 to 5"
                    ),

                focus: z
                    .string()
                    .describe(
                        "The main focus of the preparation day"
                    ),

                tasks: z
                    .array(z.string())
                    .describe(
                        "Specific tasks to complete on that day"
                    )
            })
        )
        .length(5)
        .describe(
            "Exactly 5 preparation days"
        ),

    title: z
        .string()
        .describe(
            "The title of the job for which the interview report is generated"
        )
})

const resumePdfSchema = z.object({
    html: z
        .string()
        .describe(
            "The full HTML content of the resume, convertible to PDF with Puppeteer"
        )
})

// ===============================
// SERVICE FUNCTIONS
// ===============================

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
You are an interview preparation assistant.

Your task is to analyze the candidate's resume, self-description, and target job description and generate a personalized interview preparation report.

==============================
IMPORTANT TRUTHFULNESS RULES
==============================

1. STRICTLY use only the information provided in the candidate details.

2. NEVER invent or assume:
- work experience
- responsibilities
- projects
- technologies used in a specific project
- bugs fixed
- technical decisions
- achievements
- internships
- employers
- numbers or metrics
- team interactions
- leadership experiences
- deadlines
- conflicts
- problems solved
- API endpoints
- database schemas
- implementation details

3. A technology, framework, library, tool, or skill mentioned in the resume DOES NOT prove that the candidate used every feature of that technology.

Examples:

- React Router does NOT prove protected routes were implemented.
- Axios does NOT prove a specific API endpoint or HTTP method was used.
- MongoDB/Mongoose does NOT prove a specific database schema was implemented.
- Passport.js does NOT prove role-based authorization was implemented.
- Git/GitHub does NOT prove pull requests, code reviews, or branching were used.
- Postman does NOT prove that the candidate personally tested specific API endpoints.
- React does NOT prove Redux, Context API, Zustand, or any specific state-management approach.

4. Only claim that the candidate implemented something if it is explicitly supported by the candidate's resume or self-description.

5. If a specific implementation detail is not provided, ask a conceptual question instead.

Example:

BAD:
"How did you implement protected routes in HireHelper?"

GOOD:
"How would you implement protected routes in a React application?"

6. Never convert a hypothetical or conceptual explanation into a claim about the candidate's past experience.

==============================
BEHAVIORAL QUESTION RULES
==============================

1. NEVER invent a specific incident, problem, conflict, achievement, bug, deadline, collaboration experience, leadership experience, or technical challenge.

2. Behavioral answers MUST be based on actual experiences explicitly mentioned in the candidate details.

3. Do NOT create fictional first-person stories.

4. Do NOT use statements such as:
"I implemented..."
"I solved..."
"I discovered..."
"I worked with..."
"I coordinated with..."
"I fixed..."
"I led..."

unless that exact experience is supported by the candidate information.

5. If the candidate details do not contain enough information for a behavioral question, provide a truthful framework.

Example:

"Use a real example from your internship or project. Explain the situation, your specific responsibility, the action you took, and the result."

Do NOT create the example for the candidate.

==============================
TECHNICAL QUESTION RULES
==============================

1. Technical questions should be relevant to:
- the candidate's demonstrated skills and projects
- the target job description

2. Prefer questions about technologies and projects explicitly mentioned in the candidate details.

3. If asking about a technology mentioned in the resume but the exact implementation is unknown, ask a conceptual question.

4. Do not invent:
- project architecture
- API endpoints
- database schemas
- authentication flows
- implementation details
- testing details
- deployment details

5. Technical answers should be useful for interview preparation while remaining truthful about the candidate's actual experience.

==============================
SKILL GAP RULES
==============================

1. Identify skills required by the job description that are missing or insufficiently demonstrated in the candidate details.

2. Do not mark a technology as a skill gap if the candidate already clearly demonstrates it.

3. Do not add random popular technologies that are not relevant to the job description.

==============================
MATCH SCORE
==============================

Give a score from 0 to 100 based only on the overlap between:

- skills demonstrated by the candidate
- projects and experience explicitly provided
- requirements in the target job description

==============================
PREPARATION PLAN
==============================

Generate EXACTLY 5 days.

Day numbers MUST be exactly:

1
2
3
4
5

Each day MUST be a separate object.

The preparationPlan MUST contain exactly 5 objects.

Each day MUST contain:
- one clear focus
- 2 to 4 specific tasks

Rules:
- No Day 0.
- No Day 6.
- No additional days.
- No duplicate day numbers.
- Do not put multiple day numbers inside one object.
- Do not repeat the same focus.
- Do not repeat the same tasks.
- Base the plan on the candidate's actual skill gaps and the target job description.
- Day 1 should cover the most important technical/core requirement.
- Days 2 to 4 should progressively cover relevant technical skills, coding, projects, and interview preparation.
- Day 5 should focus on revision, mock interview, and final preparation.
- Avoid generic tasks such as "study more" or "improve skills."

Required structure:

[
    {
        "day": 1,
        "focus": "...",
        "tasks": ["...", "..."]
    },
    {
        "day": 2,
        "focus": "...",
        "tasks": ["...", "..."]
    },
    {
        "day": 3,
        "focus": "...",
        "tasks": ["...", "..."]
    },
    {
        "day": 4,
        "focus": "...",
        "tasks": ["...", "..."]
    },
    {
        "day": 5,
        "focus": "...",
        "tasks": ["...", "..."]
    }
]

==============================
CANDIDATE RESUME
==============================

${resume || "Not provided"}

==============================
CANDIDATE SELF-DESCRIPTION
==============================

${selfDescription || "Not provided"}

==============================
TARGET JOB DESCRIPTION
==============================

${jobDescription || "Not provided"}

==============================
FINAL INSTRUCTION
==============================

Generate the interview report using ONLY the information provided above.

Be realistic and truthful.

Never invent candidate experiences.

Never turn a technology name into proof of a specific implementation.

Return the structured report according to the provided schema.
`

    return await generateStructured({
        prompt,
        schema: interviewReportSchema
    })
}

// ===============================
// PDF GENERATION
// ===============================

async function generatePdfFromHtml(htmlContent) {

    const browser = await puppeteer.launch({
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    })

    try {

        const page = await browser.newPage()

        await page.setContent(htmlContent, {
            waitUntil: "networkidle0"
        })

        return await page.pdf({
            format: "A4",
            margin: {
                top: "20mm",
                bottom: "20mm",
                left: "15mm",
                right: "15mm"
            }
        })

    } finally {
        await browser.close()
    }
}

// ===============================
// RESUME PDF GENERATION
// ===============================

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
Generate a professional ATS-friendly resume using ONLY the information provided below.

==============================
STRICT FACTUAL RULES
==============================

1. DO NOT invent or modify any candidate information.

2. Preserve exact factual values from the candidate details, including:
- candidate name
- email
- phone number
- CGPA
- college name
- degree
- dates
- internship name
- project names
- technologies
- URLs
- achievements

3. NEVER change a number or factual value.

For example:
If the candidate says 9.37 CGPA, do NOT change it to 9.44.

4. NEVER invent:
- employers
- degrees
- certifications
- achievements
- project features
- responsibilities
- metrics
- technologies
- links
- email addresses
- phone numbers

5. If information is not provided, omit it instead of inventing it.

6. Do not assume that a technology listed in the skills section was used in every project.

7. Only include project responsibilities explicitly supported by the candidate information.

8. Tailor the ordering and emphasis of existing information to the target job description, but NEVER change the underlying facts.

==============================
OUTPUT REQUIREMENTS
==============================

Return a JSON object with exactly one field:

"html"

The "html" field must contain the complete HTML of the resume.

Requirements:
- ATS friendly
- 1 to 2 pages ideally
- clean professional structure
- inline CSS only
- no external files
- no external images
- human-readable
- no markdown
- no explanations outside the JSON

==============================
CANDIDATE RESUME
==============================

${resume || "Not provided"}

==============================
CANDIDATE SELF-DESCRIPTION
==============================

${selfDescription || "Not provided"}

==============================
TARGET JOB DESCRIPTION
==============================

${jobDescription || "Not provided"}

==============================
FINAL INSTRUCTION
==============================

Create the resume using ONLY verified information above.

Do not invent, modify, or guess any candidate facts.
`

    const { html } = await generateStructured({
        prompt,
        schema: resumePdfSchema
    })

    return await generatePdfFromHtml(html)
}

// ===============================
// EXPORTS
// ===============================

module.exports = {
    generateInterviewReport,
    generateResumePdf
}