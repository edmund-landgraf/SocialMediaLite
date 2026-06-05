import { Navigate, Route, Routes } from "react-router-dom";
import { FriendsPage } from "./pages/FriendsPage";
import { BlogPage } from "./pages/BlogPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { LoginPage } from "./pages/LoginPage";
import { MessagesPage } from "./pages/MessagesPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <div className="min-h-full bg-zinc-950">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/:username" element={<ProfilePage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}
