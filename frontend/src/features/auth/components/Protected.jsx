import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router-dom";
import React from 'react';

const Protected = ({ children }) => {
    const { loading, isLoggedIn } = useAuth();

    if (loading) {
        return <main><h1>Loading...</h1></main>;
    }

    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default Protected