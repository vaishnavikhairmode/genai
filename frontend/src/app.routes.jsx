import { createBrowserRouter, Navigate } from "react-router-dom";
import React, { useContext } from "react";
import Login from "./features/auth/pages/Login";
import Register from "./features/auth/pages/Register";
import Protected from "./features/auth/components/Protected";
import Home from "./features/interview/pages/Home";
import Interview from "./features/interview/pages/Interview";
import { AuthContext } from "./features/auth/auth.context";

// Wrapper to prevent logged-in users from seeing Login/Register
const GuestOnly = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <main className="loading-screen">
        <h1>Loading...</h1>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <GuestOnly>
        <Login />
      </GuestOnly>
    ),
  },
  {
    path: "/register",
    element: (
      <GuestOnly>
        <Register />
      </GuestOnly>
    ),
  },
  {
    path: "/",
    element: (
      <Protected>
        <Home />
      </Protected>
    ),
  },
  {
    path: "/interview/:interviewId",
    element: (
      <Protected>
        <Interview />
      </Protected>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);