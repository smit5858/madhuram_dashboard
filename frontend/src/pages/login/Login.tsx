import { Field, Form, Formik } from 'formik';
import { useMutation } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { useMemo } from 'react';
import toast from 'react-hot-toast';
import LOGO from "@/assets/logo.jpg";

import authService from '../../services/auth.service';
import permissionService from '../../services/permission.service';
import FormikInput from '../../shared/components/formik-fields/FormikInput';

import { loginSchema, type LoginFormValues } from '@/validation/login.validation';
import { useNavigate } from 'react-router-dom';
import { login, setPermissions } from '@/store/slices/authSlice';

const Login = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const { mutate: loginMutation, isPending: loginLoading } = useMutation({
        mutationFn: (values: { email: string; password: string }) =>
            authService.loginService({
                email: values.email,
                password: values.password,
            }),

        onSuccess: async (response: any) => {
            const data = response.data || response;
            const user = data.user || {};
            const token = data.accessToken || data.token;

            // 1. Store user identity + token in Redux
            dispatch(
                login({
                    name: user.name,
                    role: user.roleName,
                    mail: user.email,
                    phone: user.phone || null,
                    token: token,
                    allowedCity: user.allowedCity || null,
                })
            );

            // 2. Call Permission API ONCE — load ALL permissions for this user's role
            try {
                const permRes = await permissionService.getAllPermissionsService();
                const allPermissions = permRes.data?.permissions || [];

                // Store permissions globally — sidebar and all pages use this stored state
                dispatch(setPermissions(allPermissions));
            } catch (permErr) {
                console.error("Failed to load permissions after login", permErr);
                toast.error("Could not load permissions. Some features may be restricted.");
            }

            // 3. Navigate — sidebar already built from stored permissions
            navigate('/dashboard');
        },

        onError: (err: any) => {
            toast.error(err?.response?.data?.message || err?.message || 'Login failed');
        },
    });

    const initialValues = useMemo<LoginFormValues>(
        () => ({
            email: '',
            password: '',
        }),
        []
    );

    const validate = (values: LoginFormValues) => {
        const result = loginSchema.safeParse(values);

        if (result.success) {
            return {};
        }

        return result.error.issues.reduce(
            (errors, issue) => {
                const field = issue.path[0] as keyof LoginFormValues;
                if (!errors[field]) {
                    errors[field] = issue.message;
                }
                return errors;
            },
            {} as Partial<Record<keyof LoginFormValues, string>>
        );
    };

    return (
        <div className="min-h-screen bg-[#f3f6ff] flex items-center justify-center px-4">

            <div className="w-full max-w-115 rounded-[20px] bg-white px-7.5 py-10 shadow-[0_18px_45px_rgba(30,50,90,0.12)]">

                {/* Logo */}
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full overflow-hidden">
                    <img src={LOGO} alt="Madhuram Motors" className='h-full w-full object-cover' />
                </div>

                {/* Heading */}
                <h1 className="text-center text-[25px] font-bold leading-tight text-black">
                    Welcome Back
                </h1>

                <p className="mt-2 mb-7 text-center text-[15px] text-black">
                    Login to continue
                </p>

                <Formik
                    initialValues={initialValues}
                    validate={validate}
                    onSubmit={(values) => {
                        loginMutation(values);
                    }}
                >
                    {({ dirty, isValid }) => (
                        <Form className="flex flex-col gap-5">

                            {/* Email */}
                            <Field
                                name="email"
                                type="email"
                                label="Email"
                                placeholder="Enter your email"
                                component={FormikInput}
                            />

                            {/* Password */}
                            <Field
                                name="password"
                                type="password"
                                label="Password"
                                placeholder="Enter your password"
                                showPasswordToggle
                                component={FormikInput}
                            />

                            {/* Login */}
                            <button
                                type="submit"
                                disabled={
                                    !dirty ||
                                    !isValid ||
                                    loginLoading
                                }
                                className="
                                    mt-2
                                    h-12.25
                                    w-full
                                    rounded-full
                                    bg-[#3d6fe0]
                                    text-base
                                    font-normal
                                    text-white
                                    transition
                                    hover:bg-[#3162d2]
                                    disabled:cursor-not-allowed
                                    disabled:bg-[#aebee2]
                                "
                            >
                                {loginLoading
                                    ? 'Logging in...'
                                    : 'Login'}
                            </button>

                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default Login;