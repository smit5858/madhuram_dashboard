export const Routing = {
    Error: `*`,
    Login: `/`,
    Dashboard: `/dashboard`,
    Couriers: `/couriers`,
    Customers: `/customers`,
    Sells: `/sells`,
    Users: `/users`,
    Products: `/products`,
    Stock: `/stock`,
    AccountSells: `/account/sells`,
    AccountExpense: `/account/expense`,
    AccountDebited: `/account/debited`,
    Forbidden: `/forbidden`
};

export const RouteTitles: Record<string, string> = {
    [Routing.Login]: "Login",
    [Routing.Dashboard]: "Dashboard",
    [Routing.Couriers]: "Couriers",
    [Routing.Customers]: "Customers",
    [Routing.Sells]: "Sells",
    [Routing.Users]: "Users",
    [Routing.Products]: "Products",
    [Routing.Stock]: "Stock",
    [Routing.AccountSells]: "Account Sells",
    [Routing.AccountExpense]: "Account Expense",
    [Routing.AccountDebited]: "Account Debited",
    [Routing.Forbidden]: "Forbidden",
};