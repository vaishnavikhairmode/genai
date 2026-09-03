import axios from "axios";

const TOKEN_KEY = "auth_token";

const api = axios.create({
    baseURL: "http://localhost:3000",
    withCredentials: true
});

export function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

api.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export async function register({ username, email, password }) {
    try {
        // FIXED: Added /auth prefix
        const response = await api.post("/api/auth/register", { username, email, password });
        const token = response.data?.token;
        if (token) {
            setStoredToken(token);
        }
        return response.data;
    } catch (err) {
        console.log(err);
        throw err;
    }
}

export async function login({ email, password }) {
    try {
        // FIXED: Added /auth prefix
        const response = await api.post("/api/auth/login", { email, password });
        const token = response.data?.token;
        if (token) {
            setStoredToken(token);
        }
        return response.data;
    } catch (err) {
        console.log(err);
        throw err;
    }
}

export async function logout() {
    try {
        // FIXED: Added /auth prefix
        const response = await api.get("/api/auth/logout");
        setStoredToken("");
        return response.data;
    } catch (err) {
        setStoredToken("");
        throw err;
    }
}

export async function getMe() {
    try {
        // FIXED: Added /auth prefix
        const response = await api.get("/api/auth/get-me");
        return response.data;
    } catch (err) {
        console.log(err);
        throw err;
    }
}