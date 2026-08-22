import { createSlice } from "@reduxjs/toolkit";

export interface AuthRoute {
    id: number;
    name: string;
    path: string;
}

export interface AuthState {
    name: string | null;
    role: string | null;
    mail: string | null;
    phone: string | null;
    token: string | null;
    allowedRoutes: AuthRoute[] | null;
    unauthorized: boolean;
}

const defaultAuthState: AuthState = {
    name: null,
    role: null,
    mail: null,
    phone: null,
    token: null,
    allowedRoutes: null,
    unauthorized: false,
};

const savedAuth = sessionStorage.getItem("auth");

const initialState = savedAuth
    ? JSON.parse(savedAuth)
    : defaultAuthState;

const authSlice = createSlice({
    name: "auth",
    initialState,

    reducers: {
        login: (state, action) => {
            state.name = action.payload.name;
            state.role = action.payload.role;
            state.mail = action.payload.mail;
            state.phone = action.payload.phone;
            state.token = action.payload.token;
            state.allowedRoutes = null; // Set dynamically after login
            state.unauthorized = false;

            sessionStorage.setItem(
                "auth",
                JSON.stringify(state)
            );
        },

        logout: (state) => {
            state.name = null;
            state.role = null;
            state.mail = null;
            state.phone = null;
            state.token = null;
            state.allowedRoutes = null;
            state.unauthorized = false;

            sessionStorage.removeItem("auth");
        },

        setAllowedRoutes: (state, action) => {
            state.allowedRoutes = action.payload;

            sessionStorage.setItem(
                "auth",
                JSON.stringify(state)
            );
        },

        setUnauthorized: (state, action) => {
            state.unauthorized = action.payload;

            sessionStorage.setItem(
                "auth",
                JSON.stringify(state)
            );
        },

        clearUnauthorized: (state) => {
            state.unauthorized = false;

            sessionStorage.setItem(
                "auth",
                JSON.stringify(state)
            );
        }
    }
});

export const {
    login,
    logout,
    setAllowedRoutes,
    setUnauthorized,
    clearUnauthorized
} = authSlice.actions;

export default authSlice.reducer;