const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors") // 1. Import CORS

const app = express()

// 2. Add CORS middleware BEFORE routes
app.use(cors({
    origin: "http://localhost:5173", // Vite frontend URL
    credentials: true
}))

app.use(express.json())
app.use(cookieParser())

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")

/* using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)

module.exports = app