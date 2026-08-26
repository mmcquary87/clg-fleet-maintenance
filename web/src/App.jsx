import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import LoginForm from "./components/LoginForm";
import SetPasswordForm from "./components/SetPasswordForm";
import Dashboard from "./Dashboard";
import "./App.css";

export default function App() {
  const { session, loading, authFlowType } = useAuth();
  const [passwordJustSet, setPasswordJustSet] = useState(false);

  if (loading) {
    return (
      <div className="app">
        <div className="loading"><Loader2 size={16} className="spin" /> Checking sign-in…</div>
      </div>
    );
  }

  const needsPasswordSetup = (authFlowType === "invite" || authFlowType === "recovery") && session && !passwordJustSet;

  if (needsPasswordSetup) {
    return (
      <div className="app">
        <SetPasswordForm onDone={() => setPasswordJustSet(true)} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <LoginForm />
      </div>
    );
  }

  return <Dashboard session={session} />;
}
