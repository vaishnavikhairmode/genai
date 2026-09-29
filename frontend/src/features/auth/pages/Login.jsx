import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import "../auth.form.scss";
import { useAuth } from '../hooks/useAuth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = () => {
    const { handleLogin } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [error, setError] = useState("");
    const [showRegister, setShowRegister] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });

    const validate = () => {
        const errors = { email: "", password: "" };

        if (!email.trim()) {
            errors.email = "Please enter your email address.";
        } else if (!EMAIL_REGEX.test(email.trim())) {
            errors.email = "Please enter a valid email address.";
        }

        if (!password) {
            errors.password = "Please enter your password.";
        }

        setFieldErrors(errors);
        return !errors.email && !errors.password;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setShowRegister(false);

        if (!validate()) return;

        setSubmitting(true);
        try {
            const data = await handleLogin({ email: email.trim(), password });
            if (data?.token) {
                navigate('/');
            } else {
                setError("Login failed. Check your email and password, or register if you don't have an account.");
                setShowRegister(true);
            }
        } catch (err) {
            const status = err?.response?.status;
            const message = err?.response?.data?.message || "";

            if (!err?.response) {
                setError("Can't reach the server. Check your internet connection and try again.");
            } else if (status === 404 || /not found|not registered|no user|no account|does not exist/i.test(message)) {
                setError("No account found with this email.");
                setShowRegister(true);
            } else if (status === 401 || status === 400 || /password|invalid|incorrect|credentials/i.test(message)) {
                setError("Incorrect email or password. Please try again.");
                setShowRegister(true);
            } else {
                setError(message || "Something went wrong. Please try again.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const clearErrors = () => {
        if (error) { setError(""); setShowRegister(false); }
    };

    const onEmailChange = (e) => {
        setEmail(e.target.value);
        if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
        clearErrors();
    };

    const onPasswordChange = (e) => {
        setPassword(e.target.value);
        if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: "" }));
        clearErrors();
    };

    return (
        <main className="auth-page">
            <div className="form-container">
                <div className="form-header">
                    <h1>Welcome back</h1>
                    <p>Log in to continue preparing for your interviews.</p>
                </div>

                {error && (
                    <div className="error-message" role="alert">
                        <span>{error}</span>
                        {showRegister && (
                            <>
                                {" "}New here? <Link to="/register">Please register first</Link>.
                            </>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    <div className={`input-group ${fieldErrors.email ? 'has-error' : ''}`}>
                        <label htmlFor="email">Email</label>
                        <input
                            value={email}
                            onChange={onEmailChange}
                            type="email"
                            id="email"
                            name="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                        />
                        {fieldErrors.email && (
                            <span className="field-error">{fieldErrors.email}</span>
                        )}
                    </div>

                    <div className={`input-group ${fieldErrors.password ? 'has-error' : ''}`}>
                        <label htmlFor="password">Password</label>
                        <div className="password-wrap">
                            <input
                                value={password}
                                onChange={onPasswordChange}
                                type={showPassword ? "text" : "password"}
                                id="password"
                                name="password"
                                placeholder="Enter your password"
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword((s) => !s)}
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                        {fieldErrors.password && (
                            <span className="field-error">{fieldErrors.password}</span>
                        )}
                    </div>

                    <button type="submit" className="button primary-button" disabled={submitting}>
                        {submitting ? <><span className="spinner" /> Logging in...</> : "Login"}
                    </button>
                </form>

                <p className="form-footer">
                    Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </main>
    );
};

export default Login;