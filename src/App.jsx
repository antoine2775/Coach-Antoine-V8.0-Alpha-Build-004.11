import React, { useCallback, useEffect, useState } from "react";
import { Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import SplashScreen from "./components/SplashScreen";
import Home from "./pages/Home";
import Workout from "./pages/Workout";
import Progress from "./pages/Progress";
import Carnet from "./pages/Carnet";
import Coach from "./pages/Coach";
import Garage from "./pages/Garage";
import PresenceLab from "./pages/PresenceLab";
import Onboarding from "./pages/Onboarding";
import { UserProfileContext, UserProfileProvider, useUserProfile } from "./context/UserProfileContext";

export function AppRoutes({ soundEnabled, setSoundEnabled }) {
  const { onboarding, completionDestination, clearCompletionDestination } = useUserProfile();
  const location = useLocation();
  useEffect(() => {
    if (onboarding.status === "complete" && location.pathname !== "/onboarding") clearCompletionDestination?.();
  }, [onboarding.status, location.pathname, clearCompletionDestination]);
  if (onboarding.status !== "complete") {
    return <>
      {onboarding.status !== "loading" && location.pathname !== "/onboarding" &&
        <Navigate to="/onboarding" replace />}
      <Onboarding />
    </>;
  }
  return <Layout><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/seances" element={<Workout />} />
    <Route path="/progression" element={<Progress />} />
    <Route path="/carnet" element={<Carnet />} />
    <Route path="/coach" element={<Coach soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} />} />
    <Route path="/garage" element={<Garage />} />
    <Route path="/presence" element={<PresenceLab />} />
    <Route path="/onboarding" element={<Navigate to={completionDestination || "/"} replace />} />
  </Routes></Layout>;
}

export function AppShell() {
  const userProfile = useUserProfile();
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = useState(true);
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    try { return localStorage.getItem("coachAntoineSound") !== "off"; }
    catch { return false; }
  });
  const setSoundEnabled = (value) => {
    setSoundEnabledState(value);
    localStorage.setItem("coachAntoineSound", value ? "on" : "off");
  };
  const close = useCallback(() => setShowSplash(false), []);
  const openSplash = useCallback(() => {
    setShowSplash(true);
    // Préparer la destination après le splash, sans afficher Home à la sortie.
    navigate("/", { replace: true });
  }, [navigate]);
  if (showSplash) return <SplashScreen onDone={close} soundEnabled={soundEnabled} />;
  return <UserProfileContext.Provider value={{ ...userProfile, openSplash }}>
    <AppRoutes soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} />
  </UserProfileContext.Provider>;
}

export default function App() {
  return <UserProfileProvider><AppShell /></UserProfileProvider>;
}
