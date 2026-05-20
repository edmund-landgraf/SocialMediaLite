import { Navigate, Route, Routes } from "react-router-dom";
import { FriendsPage } from "./pages/FriendsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <div className="min-h-full bg-zinc-950">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/:username" element={<ProfilePage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}
