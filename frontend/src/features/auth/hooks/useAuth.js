import { useContext } from "react"
import { AuthContext } from "../auth.context"
import { register, login } from "../services/auth.api"

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

    // No global loading flag here: the Login page tracks its own loading state,
    // so the page is never unmounted (which would clear the form).
    const handleLogin = async (credentials) => {
        const data = await login(credentials)
        if (data?.token) {
            context.setToken(data.token)
            context.setUser(data?.user ?? null)
        }
        return data
    }

    return { ...context, handleRegister, handleLogin }
}