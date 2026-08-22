import { Toaster } from "react-hot-toast"
import AppRouting from "./routes/appRouting";
import { ThemeProvider } from "./shared/context/ThemeContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const App = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  });
  return (<>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            success: {
              duration: 3000,
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ff4b4b',
                secondary: '#fff',
              }
            }
          }}
        />
        <AppRouting />
      </ThemeProvider>
    </QueryClientProvider>
  </>
  )
}

export default App