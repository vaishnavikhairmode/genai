import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import "../auth.form.scss";
import { useAuth } from '../hooks/useAuth';

const Login = () => {
    const { loading, handleLogin } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        try {
            const data = await handleLogin({ email, password });
            if (data?.token) {
                navigate('/');
            } else {
                setError("Login failed. Please try again.");
            }
        } catch (err) {
            setError(err?.response?.data?.message || "Invalid email or password.");
        }
    };

    if (loading) {
        return <main><h1>Loading.......</h1></main>;
    }

    return (
        <main>
            <div className="form-container">
                <h1>Login</h1>
                {error && <p className="error-message">{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            id="email"
                            name="email"
                            placeholder="Enter email address"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Enter password"
                            required
                        />
                    </div>
                    <button type="submit" className="button primary-button" disabled={loading}>
                        Login
                    </button>
                </form>
                <p>
                    Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </main>
    );
};

export default Login;