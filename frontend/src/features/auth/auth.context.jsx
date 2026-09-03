import { createContext, useState, useEffect } from "react";
import { getMe, login, logout, setStoredToken, getStoredToken } from "./services/auth.api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(getStoredToken());
    const [loading, setLoading] = useState(true);

    const isLoggedIn = Boolean(token && user);

    const saveToken = (nextToken) => {
        setStoredToken(nextToken);
        setToken(nextToken || "");
    };

    const handleLogin = async (credentials) => {
        setLoading(true);
        try {
            const data = await login(credentials);
            if (data?.token) {
                saveToken(data.token);
                setUser(data?.user ?? null);
            }
            return data;
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        try {
            await logout();
        } finally {
            setUser(null);
            saveToken("");
            setLoading(false);
        }
    };

    useEffect(() => {
        let mounted = true;

        const getAndSetUser = async () => {
            if (!token) {
                if (mounted) {
                    setUser(null);
                    setLoading(false);
                }
                return;
            }

            try {
                const data = await getMe();
                if (mounted) {
                    setUser(data?.user ?? null);
                }
            } catch (err) {
                if (mounted) {
                    setUser(null);
                    saveToken("");
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        getAndSetUser();

        return () => {
            mounted = false;
        };
    }, [token]);

    return (
        <AuthContext.Provider value={{ 
            user, 
            setUser, 
            token, 
            setToken: saveToken, 
            isLoggedIn, 
            loading, 
            setLoading,
            handleLogin,
            handleLogout
        }}>
            {children}
        </AuthContext.Provider>
    );
};