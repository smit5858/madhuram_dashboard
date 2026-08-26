# Madhuram Motors Dashboard

A full-stack dashboard for managing operations, users, customers, sales, products, stock, and notifications for Madhuram Motors.

## Project purpose

This repository contains both the application frontend and backend for a business dashboard used to manage:

- User accounts and permissions
- Courier tracking
- Customer information
- Product and stock records
- Sales and accounting views
- Notifications and dashboard events

## Tech stack

### Frontend
- Vite
- React 19
- TypeScript
- Redux Toolkit
- React Query
- React Router
- Formik
- Zod
- Axios
- Tailwind CSS

### Backend
- Node.js
- Express 5
- Sequelize ORM
- MySQL
- JWT authentication
- Socket.IO
- Winston logging

## Project structure

```text
.
├── README.md
├── .github/
│   └── copilot-instructions.md
├── backend/
│   ├── .env
│   ├── package.json
│   ├── server.js
│   ├── socket.js
│   ├── config/
│   ├── controllers/
│   ├── helper/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── seeders/
│   └── validation/
├── frontend/
│   ├── .env
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   └── public/
└── .gitignore
```

### Important directories

- `backend/` contains the Express API, Sequelize models, middleware, and route definitions.
- `backend/models/` defines the database schema and model associations.
- `backend/middlewares/` contains authentication and authorization enforcement.
- `backend/controllers/` contains request handlers for each feature area.
- `backend/routes/` defines protected route groups and endpoint wiring.
- `frontend/src/` contains the React app pages, services, routes, and Redux state.
- `frontend/src/pages/` holds feature pages such as dashboard, users, customers, sells, and couriers.
- `frontend/src/services/` contains the API client wrappers for each module.
- `frontend/src/store/` contains Redux slices, especially auth state and permissions.
- `frontend/src/validation/` contains Zod validation schemas.

## Getting started

### 1. Install dependencies

Backend:

```bash
cd backend
npm install
```

Frontend:

```bash
cd frontend
npm install
```

## Environment configuration

### Backend `.env`

The backend includes a `.env` file with database and JWT settings. The working configuration currently contains values such as:

```env
PORT=3000
DB_NAME=madhuram_motors_dashboard
DB_USER=root
DB_PASS=9998
DB_HOST=127.0.0.1
DB_PORT=3306

JWT_SECRET=your_access_secret
ACCESS_TOKEN_EXPIRY=1h
```

### Frontend `.env`

The frontend config currently includes:

```env
VITE_APP_BASE_URL=http://localhost:3000
```

Use the actual local database connection credentials for your environment before running the app.

## Running the app

### Backend

```bash
cd backend
npm run dev
```

This starts the Express API with nodemon.

### Frontend

```bash
cd frontend
npm run dev
```

This starts the Vite development server.

## Scripts

### Backend

From `backend/package.json`:

```bash
npm run dev    # start server in dev mode
npm start      # production start
npm test       # runs tests with Node's built-in test runner
```

### Frontend

From `frontend/package.json`:

```bash
npm run dev     # start Vite dev server
npm run build   # typecheck + production build
npm run lint    # run ESLint
npm run preview # preview built app
```

## Architecture overview

### Frontend architecture

The frontend is organized around route-based pages and shared infrastructure:

- `src/pages/` contains feature pages and modules
- `src/services/` wraps HTTP logic and API calls
- `src/store/` stores global Redux state
- `src/routes/` contains route guards and route registration
- `src/shared/components/` contains reusable UI primitives
- `src/validation/` contains Zod schemas
- `src/layout/` contains the shell, sidebar, and header

The app uses:
- Redux Toolkit for auth/session state
- React Query for async server state
- Formik for form state management
- Zod for validation
- axios via a shared HTTP wrapper for requests

### Backend architecture

The backend is organized by route/controller/model pattern:

- `routes/` mounts endpoints
- `controllers/` handle request logic
- `middlewares/` handles auth and RBAC
- `models/` defines Sequelize models and associations
- `config/` contains DB configuration
- `helper/` contains logger and token utilities

## Authentication and session handling

Authentication is handled with JWT bearer tokens.

- The backend reads the `Authorization: Bearer <token>` header in `backend/middlewares/authenticate.js`.
- The user is loaded from the database and checked against `tokenInvalidatedAt` for session invalidation.
- The frontend injects the token into requests via `frontend/src/services/http-service.ts`.
- Auth state is stored in Redux and `sessionStorage` under the `auth` key.
- Refresh-token handling is implemented in the shared HTTP client.

## Authorization / RBAC

Authorization is database-driven through Role, Route, and Permission records.

Current implementation pattern:

- `authenticate` verifies the user token.
- `authorize(routePath, action)` checks the route and required permission.
- Admin role bypasses route-level permission checks.
- Non-admin users are granted access from the `permissions` table.

The permission structure includes:
- `canRead`
- `canCreate`
- `canUpdate`
- `canDelete`

The frontend loads the full permission matrix after login and uses it to control page access and UI visibility. The backend remains the security boundary.

## API conventions

The API uses a JSON response envelope with a consistent format.

Success response shape:

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

Error response shape:

```json
{
  "success": false,
  "message": "Something went wrong"
}
```

Common patterns in the codebase:
- Use query parameters for filters and pagination.
- Return paginated list data with `meta`.
- Use auth headers for protected endpoints.
- Keep backend validation and permission enforcement server-side.

## Database and ORM

The backend uses Sequelize with MySQL.

Database setup is configured in:

- `backend/config/db.js`

Model associations are centralized in:

- `backend/models/index.js`

Common patterns in the codebase include:
- `User.belongsTo(Role)`
- `Route.hasMany(Permission)`
- `Product.hasOne(Stock)`
- `Sale.hasMany(SaleItem)`

The app also keeps route and permission metadata synchronized during server startup.

## Forms and validation

The frontend follows the project’s actual conventions:

- Formik is used for form state and submit handling.
- Zod is used for validation schemas.
- Shared form input patterns are implemented in `frontend/src/shared/components/formik-fields/FormikInput.tsx`.
- Validation schemas live under `frontend/src/validation/`.

Examples:
- `frontend/src/validation/login.validation.ts`
- `frontend/src/validation/user.validation.ts`

## Important development conventions

- Reuse existing services, hooks, component patterns, and validation schemas before adding new ones.
- Keep changes scoped to the requested feature.
- Do not add new dependencies without a concrete reason.
- Follow the existing folder structure and naming conventions.
- Do not rely on frontend-only hiding of sensitive actions; backend authorization is required.
- Use the shared api client through `frontend/src/services/http-service.ts` instead of ad hoc axios calls.
- Use server-side pagination and consume pagination metadata from API responses.
- Handle loading, empty, and error states consistently in pages and tables.

## Users module expectations

The app includes a Users module with the following expected permissions:

### Admin
- List users
- View users
- Create users
- Update users
- Delete/deactivate users

### Non-admin
- List users
- View users

Backend authorization must enforce these rules. The frontend must also respect these permissions for actions and visibility.

The implementation in `frontend/src/pages/users/Users.tsx` follows the project conventions:
- server-side pagination
- Formik filters
- Zod validation
- responsive table layout
- loading / empty / error states
- permission-aware actions

## Testing and verification

The repo includes backend and frontend scripts, but the actual testing coverage should be added/updated for the behavior being changed.

Recommended workflow after implementation:

```bash
cd frontend
npm run lint
npm run build

cd ../backend
npm test
```

Do not claim tests pass unless they were actually run.

## Summary

This project is a multi-module business dashboard with a React + TypeScript frontend and a Node.js + Sequelize backend. It emphasizes route-based permissions, JWT auth, consistent API contracts, server-side pagination, and reusable frontend patterns built around Formik, Zod, Redux, and React Query.
