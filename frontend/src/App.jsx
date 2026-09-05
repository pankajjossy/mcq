import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import TeacherBuildMcq from "./pages/TeacherBuildMcq.jsx";
import TeacherBuildShort from "./pages/TeacherBuildShort.jsx";
import LiveResults from "./pages/LiveResults.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";
import TakeTest from "./pages/TakeTest.jsx";
import TakeShortTest from "./pages/TakeShortTest.jsx";
import Wall from "./pages/Wall.jsx";
import Admin from "./pages/Admin.jsx";
import PrincipalDashboard from "./pages/PrincipalDashboard.jsx";
import ApiStatsFooter from "./components/ApiStatsFooter.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/principal" element={<PrincipalDashboard />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/build" element={<TeacherBuildMcq />} />
        <Route path="/teacher/build/:id" element={<TeacherBuildMcq />} />
        <Route path="/teacher/build-short" element={<TeacherBuildShort />} />
        <Route path="/teacher/build-short/:id" element={<TeacherBuildShort />} />
        <Route path="/teacher/live/:id" element={<LiveResults kind="mcq" />} />
        <Route path="/teacher/live-short/:id" element={<LiveResults kind="short" />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/test/:id" element={<TakeTest />} />
        <Route path="/student/short/:id" element={<TakeShortTest />} />
        <Route path="/wall/:teacherId" element={<Wall />} />
      </Routes>
      <ApiStatsFooter />
    </div>
  );
}
