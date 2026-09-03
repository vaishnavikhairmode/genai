import { useContext } from "react"
import { AuthContext } from "../auth.context"
import { register } from "../services/auth.api"

export const useAuth = () => {
    const context = useContext(AuthContext)

    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider")
    }

    const handleRegister = async (credentials) => {
        context.setLoading(true)
        try {
            const data = await register(credentials)
            if (data?.token) {
                context.setToken(data.token)
                context.setUser(data?.user ?? null)
            }
            return data
        } finally {
            context.setLoading(false)
        }
    }

    return { ...context, handleRegister }
}